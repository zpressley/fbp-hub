/**
 * FBP Hub – Auction Portal  v3
 * ─────────────────────────────────────────────────────────────────────────────
 * Constitution Art 5 Sec 4 enforced on the frontend:
 *
 *   OB  • Mon 3pm – Tue EOD  · min $10  · 1 per team per week
 *        · OBs win ALL tiebreaks
 *   CB  • Wed – Fri 9pm  · min current high + $5  · 1 per team per prospect per day
 *   Match/Forfeit  • Saturday only, OB manager only
 *   Processing     • Sunday — read-only results view
 *
 * UPID is the canonical prospect identifier stored in bids.
 * Player names are resolved from combined_players.json for display only.
 *
 * Column order derived from standings.json rank (worst → best).
 * Left = highest rank number = worst record = highest CB tiebreak priority.
 */

(function () {
  'use strict';

  const DATA = window.FBPHub?.config?.dataPath || './data/';
  const API  = window.AUTH_CONFIG?.workerUrl   || '';

  // ── State ──────────────────────────────────────────────────────────────────
  let _state    = null;
  let _players  = [];     // unowned Farm prospects (full records)
  let _byUpid   = {};     // UPID → player record (for name/position resolution)
  let _wizbucks = {};
  let _myTeam   = null;
  let _phase    = 'off_week';
  let _priority = [];     // column order derived from standings (worst → best)
  let _modal    = { prospectId: null, prospectName: null };
  let _tick     = null;
  let _teamColorData = {};     // loaded from team_colors.json
  let _badgeColorCache = {};   // memoized computed badge colors

  // ── Fetch helpers ────────────────────────────────────────────────────────────
  async function fetchJSON(path) {
    try {
      const r = await fetch(path, { cache: 'no-store' });
      return r.ok ? await r.json() : null;
    } catch { return null; }
  }

  async function loadTeamColors() {
    try {
      const r = await fetch(`${DATA}team_colors.json`, { cache: 'no-store' });
      if (!r.ok) return;
      const data = await r.json();
      if (data && typeof data === 'object') {
        _teamColorData = data;
        _badgeColorCache = {}; // clear memoization
      }
    } catch { /* keep fallback */ }
  }

  function _lum(hex) {
    hex = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map(i => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function _contrast(hex) {
    const bg = 0.0118; // luminance of #1e1e1e
    const fg = _lum(hex);
    return fg > bg ? (fg + 0.05) / (bg + 0.05) : (bg + 0.05) / (fg + 0.05);
  }

  function _pickBadgeColor(teamColors) {
    const candidates = [
      teamColors.primary,
      teamColors.secondary,
      teamColors.accent1,
      teamColors.accent2,
      teamColors.accent3,
    ].filter(Boolean);
    const readable = candidates.find(c => _contrast(c) >= 3.5);
    if (readable) return readable;
    return candidates.reduce((best, c) => _contrast(c) > _contrast(best) ? c : best, candidates[0]);
  }

  async function loadAll() {
    await loadTeamColors();
    const [auc, players, wb] = await Promise.all([
      fetchJSON(`${DATA}auction_current.json`),
      fetchJSON(`${DATA}combined_players.json`),
      fetchJSON(`${DATA}wizbucks.json`),
    ]);

    _state    = auc     || { phase: 'off_week', bids: [] };
    _phase    = _state.phase || 'off_week';
    _wizbucks = wb      || {};

    // Derive priority order from standings (worst rank → best = highest CB tiebreak priority)
    const standings = window.FBPHub?.data?.standings?.standings;
    if (Array.isArray(standings) && standings.length) {
      _priority = [...standings]
        .sort((a, b) => b.rank - a.rank)
        .map(t => t.manager);
    } else {
      _priority = [];
    }

    // Build UPID lookup from ALL players (for resolving bid prospect_ids)
    const allPlayers = Array.isArray(players) ? players : [];
    _byUpid = {};
    for (const p of allPlayers) {
      if (p.upid) _byUpid[String(p.upid)] = p;
    }

    // Eligible prospects: Farm type, unowned
    _players = allPlayers.filter(p =>
      p.player_type === 'Farm' && !p.FBP_Team && !p.manager
    );

    _myTeam = getMyTeam();
  }

  /** Resolve a UPID to a display name. Falls back to the raw pid string. */
  function resolveName(pid) {
    const p = _byUpid[String(pid)];
    return p ? p.name : String(pid);
  }

  /** Resolve a UPID to position string, or empty. */
  function resolvePos(pid) {
    const p = _byUpid[String(pid)];
    return p?.position || '';
  }

  function getMyTeam() {
    try {
      if (typeof authManager !== 'undefined' && authManager.isAuthenticated?.())
        return authManager.getTeam?.()?.abbreviation || null;
    } catch { /* guest */ }
    return null;
  }

  // ── WizBucks ───────────────────────────────────────────────────────────────
  function getBalance(abbr) {
    if (!abbr) return 0;
    const wiz  = _wizbucks;
    const meta = (window.FBPHub?.data?.managers?.teams || {})[abbr];
    const name = meta?.name;
    return Number(wiz[abbr] ?? (name && wiz[name]) ?? 0);
  }

  function computeCommitted(abbr, bids) {
    bids = bids || (_state?.bids || []);
    const pids = getActiveProspectIds(bids);
    return pids.reduce((sum, pid) => {
      const w = computeWinner(pid, bids);
      return w?.team === abbr ? sum + w.amount : sum;
    }, 0);
  }

  // ── Bid logic ──────────────────────────────────────────────────────────────
  function getActiveProspectIds(bids) {
    const seen = new Set(), out = [];
    for (const b of bids) {
      if (b.bid_type === 'OB') {
        const pid = String(b.prospect_id);
        if (!seen.has(pid)) { seen.add(pid); out.push(pid); }
      }
    }
    return out;
  }

  /**
   * Winning bid per prospect.
   * 1. Highest amount.
   * 2. Tie → OB beats CB.
   * 3. Tie OB vs OB → earliest timestamp.
   * 4. Tie CB vs CB → leftmost in _priority (worst record = higher priority).
   */
  function computeWinner(prospectId, bids) {
    const pid  = String(prospectId);
    const mine = bids.filter(b => String(b.prospect_id) === pid);
    if (!mine.length) return null;

    const byTeam = {};
    for (const b of mine) {
      const amt = Number(b.amount) || 0;
      if (!byTeam[b.team] || amt > Number(byTeam[b.team].amount)) byTeam[b.team] = b;
    }

    const maxAmt = Math.max(...Object.values(byTeam).map(b => Number(b.amount)));
    const tied   = Object.values(byTeam).filter(b => Number(b.amount) === maxAmt);

    if (tied.length === 1) return { team: tied[0].team, amount: maxAmt, type: tied[0].bid_type };

    const obs = tied.filter(b => b.bid_type === 'OB');
    if (obs.length === 1) return { team: obs[0].team, amount: maxAmt, type: 'OB' };
    if (obs.length > 1) {
      obs.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
      return { team: obs[0].team, amount: maxAmt, type: 'OB' };
    }

    const cols = _priority;
    for (const t of cols) {
      if (tied.some(b => b.team === t)) return { team: t, amount: maxAmt, type: 'CB' };
    }
    return { team: tied[0].team, amount: maxAmt, type: 'CB' };
  }

  function getTeamBid(prospectId, teamAbbr, bids) {
    const pid  = String(prospectId);
    return bids.filter(b => String(b.prospect_id) === pid && b.team === teamAbbr)
               .reduce((best, b) => !best || Number(b.amount) > Number(best.amount) ? b : best, null);
  }

  function getOB(prospectId, bids) {
    return bids.find(b => String(b.prospect_id) === String(prospectId) && b.bid_type === 'OB') || null;
  }

  function alreadyCBToday(team, prospectId, bids) {
    const pid   = String(prospectId);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    return bids.some(b =>
      b.team === team && String(b.prospect_id) === pid &&
      b.bid_type === 'CB' && (b.timestamp || '').slice(0, 10) === today
    );
  }

  /** Friday spoiler-bid check: on Friday ET, team must have a prior CB on this prospect. */
  function isFridaySpoiler(team, prospectId, bids) {
    const dow = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'long' }).format(new Date());
    if (dow !== 'Friday') return false;
    const pid = String(prospectId);
    return !bids.some(b => b.team === team && String(b.prospect_id) === pid && b.bid_type === 'CB');
  }

  // ── Phase rendering ────────────────────────────────────────────────────────
  function renderPhase() {
    const banner  = document.getElementById('phaseBanner');
    const iconEl  = document.getElementById('phaseIcon');
    const titleEl = document.getElementById('phaseTitle');
    const subEl   = document.getElementById('phaseSub');
    if (!banner) return;

    const cfgs = {
      ob_window:  { cls:'phase-ob',    icon:'fas fa-circle-dot', title:'\u{1F7E2} Originating Bid Window Open',    sub:'Mon 3pm \u2013 Tue EOD ET \u00B7 Min $10 \u00B7 1 OB per team per week' },
      cb_window:  { cls:'phase-cb',    icon:'fas fa-swords',     title:'\u{1F7E1} Challenge Bid Window Open',       sub:'Wed \u2013 Fri 9pm ET \u00B7 Min current high +$5 \u00B7 1 CB per prospect per day' },
      ob_final:   { cls:'phase-match', icon:'fas fa-handshake',  title:'\u{1F7E3} Match / Forfeit Window',          sub:'Saturday \u00B7 OB managers: match the high challenge bid or forfeit' },
      processing: { cls:'phase-proc',  icon:'fas fa-gears',      title:'\u{1F535} Processing Results',              sub:'Sunday \u00B7 Results being finalized \u00B7 Transactions page will update' },
      off_week:   { cls:'phase-off',   icon:'fas fa-moon',       title:'No Auction This Week',               sub:'Portal opens Monday at 3pm ET during the regular season' },
    };
    const cfg = cfgs[_phase] || cfgs.off_week;
    banner.className  = 'auc-phase-banner ' + cfg.cls;
    if (iconEl)  iconEl.innerHTML    = `<i class="${cfg.icon}"></i>`;
    if (titleEl) titleEl.textContent = cfg.title;
    if (subEl)   subEl.textContent   = cfg.sub;
  }

  // ── WB bar ─────────────────────────────────────────────────────────────────
  function renderWBBar() {
    const bar = document.getElementById('wbBar');
    if (!bar) return;
    bar.style.display = 'flex';

    const loginPrompt = document.getElementById('wbLoginPrompt');
    if (_myTeam) {
      if (loginPrompt) loginPrompt.style.display = 'none';
      const bids      = _state?.bids || [];
      const balance   = getBalance(_myTeam);
      const committed = computeCommitted(_myTeam, bids);
      const available = Math.max(0, balance - committed);
      setText('wbTeamLabel', _myTeam);
      setText('wbTotal',     `$${balance}`);
      setText('wbCommitted', `$${committed}`);
      setText('wbAvailable', `$${available}`);
    } else {
      if (loginPrompt) loginPrompt.style.display = '';
      ['wbTeamLabel','wbTotal','wbCommitted','wbAvailable'].forEach(id => setText(id, '\u2014'));
    }
  }

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  // ── Main grid ──────────────────────────────────────────────────────────────
  function renderGrid() {
    const wrapper = document.getElementById('auctionGridWrapper');
    const loading = document.getElementById('auctionLoading');
    if (loading) loading.style.display = 'none';
    if (!wrapper) return;

    const bids        = _state?.bids || [];
    const prospectIds = getActiveProspectIds(bids);
    const cols        = _priority;

    if (_phase === 'off_week') {
      wrapper.innerHTML = `<div class="auc-off-week"><i class="fas fa-moon"></i><p>No auction this week. Check back Monday at 3pm ET.</p></div>`;
      return;
    }

    if (_phase === 'processing') {
      renderProcessingView(wrapper, bids, prospectIds);
      return;
    }

    // Header
    let hdr = `<th class="th-rank">#</th><th class="th-team">Team</th><th class="th-balance">WB Bal</th><th class="th-spend">Committed</th><th class="th-claim">Prospect</th><th class="th-time">OB Time</th>`;
    cols.forEach((abbr, i) => {
      hdr += `<th class="th-bid"><div class="th-team-badge"><span class="th-team-abbr" style="${badgeStyle(abbr)}">${abbr}</span><span class="th-priority">P${i+1}</span></div></th>`;
    });
    hdr += `<th class="th-bid" style="min-width:90px;color:rgba(170,170,170,.25);font-size:.58rem;letter-spacing:.5px;">SAT</th>`;

    // Body — prospect_id (UPID) is the key; names resolved for display
    let body = '';
    for (const pid of prospectIds) {
      const ob      = getOB(pid, bids);
      const winner  = computeWinner(pid, bids);
      const obTeam  = ob?.team || '';
      const obRank  = cols.indexOf(obTeam) + 1;
      const obBal   = getBalance(obTeam);
      const obCom   = computeCommitted(obTeam, bids);
      const name    = resolveName(pid);
      const pos     = resolvePos(pid);
      const posStr  = pos ? `<span class="prospect-pos">${esc(pos)}</span>` : '';
      const time    = ob?.timestamp ? fmtTime(ob.timestamp) : '\u2013';
      const isMyRow = obTeam === _myTeam;

      body += `<tr class="${isMyRow ? 'my-row' : ''}">
        <td class="td-rank">${obRank || '\u2013'}</td>
        <td class="td-team">${esc(obTeam)}</td>
        <td class="td-balance">$${obBal}</td>
        <td class="td-spend">$${obCom}</td>
        <td class="td-claim">${posStr}<span class="prospect-name">${esc(name)}</span></td>
        <td class="td-time">${time}</td>`;

      for (const team of cols) {
        const bid      = getTeamBid(pid, team, bids);
        const isWinner = winner?.team === team;
        const isMyBid  = team === _myTeam && !!bid;
        const canClick = team === _myTeam && canBidOnProspect(pid, bids);

        let cls = 'auc-bid-cell' + (isWinner ? ' winning' : isMyBid ? ' my-bid' : '') + (canClick ? ' clickable' : '');
        const content = bid
          ? `<span class="auc-bid-amount">$${bid.amount}</span><span class="auc-bid-marker">${bid.bid_type}</span>`
          : `<span class="auc-bid-empty">\u2013</span>`;

        body += `<td class="${cls}" data-pid="${esc(pid)}" data-team="${esc(team)}">${content}</td>`;
      }

      // Saturday match/forfeit
      if (_phase === 'ob_final' && obTeam === _myTeam) {
        const highCB = winner && winner.team !== obTeam ? winner : null;
        body += highCB
          ? `<td class="auc-match-cell"><button class="auc-match-btn" data-pid="${esc(pid)}" data-action="match">\u2705 Match $${highCB.amount}</button><button class="auc-forfeit-btn" data-pid="${esc(pid)}" data-action="forfeit">\u274C Forfeit</button></td>`
          : `<td><span style="color:rgba(170,170,170,.25);font-size:.7rem;">No challengers</span></td>`;
      } else {
        body += `<td></td>`;
      }

      body += `</tr>`;
    }

    // New OB row — uses UPID as option value, displays name
    const myHasOB = bids.some(b => b.team === _myTeam && b.bid_type === 'OB');
    let newRow = '';
    if (_phase === 'ob_window' && _myTeam && !myHasOB) {
      const activeUpids = new Set(prospectIds);
      const opts = _players
        .filter(p => p.upid && !activeUpids.has(String(p.upid)))
        .map(p => `<option value="${esc(String(p.upid))}">${esc(p.name)}${p.position ? ` (${p.position})` : ''}</option>`)
        .join('');
      const emptyCols = cols.map(() => '<td></td>').join('');
      newRow = `<tr class="auc-new-prospect-row">
        <td></td><td class="td-team">${esc(_myTeam)}</td><td></td><td></td>
        <td class="td-claim">
          <select class="auc-prospect-select" id="newProspectSelect">
            <option value="">\u2014 Select prospect \u2014</option>${opts}
          </select>
        </td>
        <td></td>${emptyCols.slice(0,-4)}
        <td colspan="4" style="text-align:right;padding-right:10px;">
          <button class="auc-add-ob-btn" id="placeNewOB"><i class="fas fa-gavel"></i> Place OB</button>
        </td>
        <td></td>
      </tr>`;
    }

    // Footer totals
    let foot = `<td></td><td colspan="3" style="text-align:right;font-size:.68rem;color:rgba(170,170,170,.3);text-transform:uppercase;letter-spacing:.5px;">Challenge Totals</td><td></td><td></td>`;
    for (const team of cols) {
      const total = prospectIds.reduce((s, pid) => {
        const w = computeWinner(pid, bids);
        return w?.team === team ? s + w.amount : s;
      }, 0);
      const cls = 'td-total' + (total > 0 ? ' has-total' : '') + (team === _myTeam ? ' my-bid' : '');
      foot += `<td class="${cls}">${total > 0 ? '$' + total : '$0'}</td>`;
    }
    foot += `<td></td>`;

    wrapper.innerHTML = `
      <div class="auc-scroll-hint"><i class="fas fa-arrows-left-right"></i> Scroll to see all teams</div>
      <table class="auc-table">
        <thead><tr>${hdr}</tr></thead>
        <tbody>${body}${newRow}</tbody>
        <tfoot><tr>${foot}</tr></tfoot>
      </table>`;

    // Events — pass UPID as pid, resolve name for display
    wrapper.querySelectorAll('.auc-bid-cell.clickable').forEach(cell => {
      cell.addEventListener('click', () => openBidModal(cell.dataset.pid, resolveName(cell.dataset.pid), 'CB'));
    });
    document.getElementById('placeNewOB')?.addEventListener('click', () => {
      const upid = document.getElementById('newProspectSelect')?.value;
      if (!upid) { document.getElementById('newProspectSelect')?.focus(); return; }
      openBidModal(upid, resolveName(upid), 'OB');
    });
    wrapper.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => handleMatchForfeit(btn.dataset.pid, btn.dataset.action));
    });
  }

  function renderProcessingView(wrapper, bids, prospectIds) {
    let rows = prospectIds.map(pid => {
      const w = computeWinner(pid, bids);
      const name = resolveName(pid);
      return `<tr>
        <td class="td-claim"><span class="prospect-name">${esc(name)}</span></td>
        <td class="td-team" style="color:${w ? '#22c55e' : 'rgba(170,170,170,.3)'}">${w ? esc(w.team) : '\u2013'}</td>
        <td class="td-balance">${w ? '$' + w.amount : '\u2013'}</td>
      </tr>`;
    }).join('');
    wrapper.innerHTML = `
      <div style="padding:6px 0 4px;font-family:var(--font-title);font-size:.72rem;color:rgba(170,170,170,.35);letter-spacing:.5px;text-transform:uppercase;">Processing \u2014 Results will appear in Transactions</div>
      <table class="auc-table" style="min-width:280px;">
        <thead><tr><th class="th-claim">Prospect</th><th class="th-team">Winner</th><th class="th-balance">Amount</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="3" style="color:rgba(170,170,170,.3);text-align:center;padding:30px;">No bids this week</td></tr>'}</tbody>
      </table>`;
  }

  // ── Can bid on prospect? ───────────────────────────────────────────────────
  function canBidOnProspect(prospectId, bids) {
    if (!_myTeam) return false;
    const ob = getOB(prospectId, bids);
    if (!ob || ob.team === _myTeam) return false;
    if (_phase === 'cb_window') {
      if (alreadyCBToday(_myTeam, prospectId, bids)) return false;
      if (isFridaySpoiler(_myTeam, prospectId, bids)) return false;
      return true;
    }
    return false;
  }

  // ── Bid modal ──────────────────────────────────────────────────────────────
  function openBidModal(prospectId, prospectName, defaultType) {
    if (!_myTeam) { window.location.href = 'login.html'; return; }
    _modal = { prospectId: String(prospectId), prospectName };

    const bids  = _state?.bids || [];
    const ob    = getOB(prospectId, bids);
    const myOB  = bids.find(b => b.team === _myTeam && b.bid_type === 'OB');

    const allowOB = _phase === 'ob_window' && !myOB && !ob;
    const allowCB = _phase === 'cb_window'
                    && ob && ob.team !== _myTeam
                    && !alreadyCBToday(_myTeam, prospectId, bids)
                    && !isFridaySpoiler(_myTeam, prospectId, bids);

    if (!allowOB && !allowCB) {
      const reason = _phase === 'ob_window' && myOB ? 'You already placed your OB this week.'
        : isFridaySpoiler(_myTeam, prospectId, bids) ? 'Friday bids require a prior CB on this prospect earlier in the week.'
        : alreadyCBToday(_myTeam, prospectId, bids) ? 'You already challenged this prospect today.'
        : ob?.team === _myTeam ? "You can't challenge your own OB."
        : 'No bid action available right now.';
      alert(reason);
      return;
    }

    const activeType = defaultType === 'OB' && allowOB ? 'OB'
                     : defaultType === 'CB' && allowCB ? 'CB'
                     : allowOB ? 'OB' : 'CB';

    const btnOB = document.getElementById('typeOB');
    const btnCB = document.getElementById('typeCB');
    if (btnOB) { btnOB.disabled = !allowOB; btnOB.classList.toggle('active', activeType === 'OB'); }
    if (btnCB) { btnCB.disabled = !allowCB; btnCB.classList.toggle('active', activeType === 'CB'); }

    setText('bidModalProspect', prospectName);
    refreshModalInfo(prospectId, activeType, bids);

    const errEl = document.getElementById('bidModalError');
    if (errEl) errEl.style.display = 'none';
    document.getElementById('bidModal').style.display = 'flex';
    document.getElementById('bidAmount')?.focus();
  }

  function refreshModalInfo(prospectId, bidType, bids) {
    const winner  = computeWinner(prospectId, bids);
    const ob      = getOB(prospectId, bids);
    const myBid   = getTeamBid(prospectId, _myTeam, bids);
    const amtEl   = document.getElementById('bidAmount');
    const hintEl  = document.getElementById('bidAmountHint');
    const infoEl  = document.getElementById('bidModalInfo');

    let minAmt = 10, info = '';

    if (bidType === 'OB') {
      minAmt = 10;
      info = 'Originating bid \u00B7 $10 minimum \u00B7 \u26A0\uFE0F Committed bids cannot be removed.';
    } else {
      const high = winner?.amount ?? (ob ? Number(ob.amount) : 10);
      minAmt = high + 5;
      info = `Current high: $${high} \u00B7 Minimum raise: $5 \u2192 bid at least $${minAmt}`;
      if (myBid) info += ` \u00B7 Your current bid: $${myBid.amount}`;
      info += ' \u00B7 \u26A0\uFE0F Committed bids cannot be removed.';
    }

    const available = _myTeam ? Math.max(0, getBalance(_myTeam) - computeCommitted(_myTeam, bids)) : 0;
    const maxAmt = Math.max(minAmt, Math.floor(available / 5) * 5);

    if (hintEl)  hintEl.textContent  = `$5 increments \u00B7 min $${minAmt} \u00B7 max $${maxAmt}`;
    if (infoEl)  infoEl.textContent  = info;
    if (amtEl) {
      amtEl.min   = minAmt;
      amtEl.max   = maxAmt;
      amtEl.value = Math.min(maxAmt, Math.ceil(Math.max(minAmt, Number(amtEl.value) || minAmt) / 5) * 5);
    }
  }

  // ── Submit — sends UPID as prospect_id ─────────────────────────────────────
  async function submitBid() {
    const btn    = document.getElementById('bidSubmitBtn');
    const errEl  = document.getElementById('bidModalError');
    const amtEl  = document.getElementById('bidAmount');
    const btnOB  = document.getElementById('typeOB');

    const bidType = btnOB?.classList.contains('active') ? 'OB' : 'CB';
    const amount  = Math.round(Number(amtEl?.value || 0));
    if (errEl) errEl.style.display = 'none';

    if (!amount || amount <= 0 || amount % 5 !== 0)
      return showErr(errEl, 'Amount must be a positive multiple of $5.');

    const bids      = _state?.bids || [];
    const available = getBalance(_myTeam) - computeCommitted(_myTeam, bids);
    if (amount > available)
      return showErr(errEl, `Insufficient WizBucks. You have $${Math.max(0, available)} available.`);

    const session = typeof authManager !== 'undefined' ? authManager.getSession?.() : null;
    const token   = session?.token;
    if (!token) { window.location.href = 'login.html'; return; }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting\u2026';

    try {
      const res = await fetch(`${API}/api/auction/bid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ team: _myTeam, prospect_id: _modal.prospectId, amount, bid_type: bidType }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || body.error || `HTTP ${res.status}`);
      }
      document.getElementById('bidModal').style.display = 'none';
      if (typeof window.showToast === 'function')
        window.showToast(`\u2705 ${bidType} of $${amount} placed on ${_modal.prospectName}`);
      await refresh();
    } catch (err) {
      showErr(errEl, String(err.message || err));
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-gavel"></i> Submit Bid';
    }
  }

  // ── Match / Forfeit ────────────────────────────────────────────────────────
  async function handleMatchForfeit(prospectId, action) {
    if (!_myTeam) return;
    const name = resolveName(prospectId);
    const label = action === 'match' ? 'MATCH' : 'FORFEIT';
    if (!confirm(`Confirm ${label} for ${name}?\nThis cannot be undone.`)) return;

    const session = typeof authManager !== 'undefined' ? authManager.getSession?.() : null;
    const token   = session?.token;
    if (!token) { window.location.href = 'login.html'; return; }

    try {
      const res = await fetch(`${API}/api/auction/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ team: _myTeam, prospect_id: prospectId, decision: action, source: 'web' }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || body.error || `HTTP ${res.status}`);
      }
      if (typeof window.showToast === 'function')
        window.showToast(action === 'match' ? `\u2705 Matched bid for ${name}` : `\u274C Forfeited ${name}`);
      await refresh();
    } catch (err) {
      alert('Error: ' + (err.message || err));
    }
  }

  // ── Refresh ────────────────────────────────────────────────────────────────
  async function refresh() {
    await loadAll();
    renderPhase();
    renderWBBar();
    renderGrid();
  }

  // ── Utils ──────────────────────────────────────────────────────────────────
  // No hardcoded fallback — priority is always derived from standings at load time

  function badgeStyle(abbr) {
    if (!_badgeColorCache[abbr]) {
      const teamColors = _teamColorData[abbr];
      const color = teamColors ? _pickBadgeColor(teamColors) : '#EF3E42';
      _badgeColorCache[abbr] = color;
    }
    const c = _badgeColorCache[abbr];
    return `color:${c};background:${c}24;border-color:${c}4D`;
  }

  function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function fmtTime(ts) {
    try {
      return new Date(ts).toLocaleString('en-US', {
        timeZone: 'America/New_York', month:'numeric', day:'numeric',
        hour:'numeric', minute:'2-digit', hour12: true,
      });
    } catch { return String(ts).slice(0,16); }
  }

  function showErr(el, msg) {
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  window.initAuctionPage = async function initAuctionPage() {
    await refresh();

    if (_tick) clearInterval(_tick);
    _tick = setInterval(refresh, 30000);

    document.getElementById('bidModalClose')?.addEventListener('click', () => {
      document.getElementById('bidModal').style.display = 'none';
    });
    document.getElementById('bidModal')?.addEventListener('click', e => {
      if (e.target.id === 'bidModal') document.getElementById('bidModal').style.display = 'none';
    });
    document.getElementById('bidSubmitBtn')?.addEventListener('click', submitBid);

    document.getElementById('bidModal')?.addEventListener('click', e => {
      const btn = e.target.closest('.auc-type-btn');
      if (!btn || btn.disabled) return;
      document.querySelectorAll('.auc-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      refreshModalInfo(_modal.prospectId, btn.dataset.type, _state?.bids || []);
    });

    document.getElementById('bidModal')?.addEventListener('click', e => {
      const btn = e.target.closest('.auc-amt-btn');
      if (!btn) return;
      const input = document.getElementById('bidAmount');
      const min   = Number(input.min) || 10;
      const max = Number(input.max) || 9999;
      let val = Math.round(((Number(input.value) || min) + Number(btn.dataset.delta)) / 5) * 5;
      input.value = Math.min(max, Math.max(min, val));
    });
  };

})();
