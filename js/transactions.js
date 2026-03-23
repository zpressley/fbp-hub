/**
 * FBP Hub – Transactions Feed Engine  v4
 * ----------------------------------------
 * Data sources (all in data/):
 *   trades.json                – approved trades (object keyed by trade_id)
 *   wizbucks_transactions.json – WB ledger (array)
 *   player_log.json            – player changes (array)
 *   draft_order_2026.json      – draft results (array) — prospect picks with result.player
 *
 * Changes in v4:
 *   - Discord thread links REMOVED (trades are private)
 *   - Draft picks loaded from draft_order_2026.json
 *   - Team badge colors pre-computed from team_colors.json (no runtime fetch needed)
 *   - Font sizes increased across all rendered elements
 */

// ─── Fallback hardcoded team map ──────────────────────────────────────────────
const FALLBACK_NAME_TO_ABBR = {
  'Whiz Kids':            'WIZ',
  'Btwn2Jackies':         'B2J',
  'Country Fried Lamb':   'CFL',
  'Hammers':              'HAM',
  'Rick Vaughn':          'RV',
  'The Damn Yankees':     'DMN',
  'La Flama Blanca':      'LFB',
  'Jepordizers!':         'JEP',
  'The Bluke Blokes':     'TBB',
  'Andromedans':          'DRO',
  'not much of a donkey': 'SAD',
  'Weekend Warriors':     'WAR',
};

const KNOWN_ABBRS = new Set(['WIZ','B2J','CFL','HAM','RV','DMN','LFB','JEP','TBB','DRO','SAD','WAR']);

let _nameToAbbr = { ...FALLBACK_NAME_TO_ABBR };

async function loadManagersConfig() {
  try {
    const base = (window.FBPHub?.config?.dataPath || './data/').replace('/data/', '/');
    let r = await fetch(`${base}config/managers.json`);
    if (!r.ok) r = await fetch('./config/managers.json');
    if (!r.ok) return;
    const cfg = await r.json();
    const map = {};
    for (const [abbr, meta] of Object.entries(cfg.teams || {})) {
      if (meta?.name) map[meta.name] = abbr;
    }
    if (Object.keys(map).length) _nameToAbbr = map;
  } catch { /* keep fallback */ }
}

/**
 * Load team_colors.json and cache it in _teamColorData.
 * Clears the badge color memoization cache so updated colors take effect.
 */
async function loadTeamColors() {
  try {
    const base = window.FBPHub?.config?.dataPath || './data/';
    const r = await fetch(base + 'team_colors.json', { cache: 'no-store' });
    if (!r.ok) return;
    const data = await r.json();
    if (data && typeof data === 'object') {
      _teamColorData = data;
      _badgeColorCache = {}; // clear memoization so new colors apply
    }
  } catch { /* keep fallback red */ }
}

function toAbbr(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  if (KNOWN_ABBRS.has(s.toUpperCase())) return s.toUpperCase();
  return _nameToAbbr[s] || s;
}

// ─── Team badge colors ────────────────────────────────────────────────────────
// Runtime color cache populated from team_colors.json.
// Managers can change their colors via settings.html — this always reflects
// the latest team_colors.json so badges update without a code deploy.
let _teamColorData = {};
let _badgeColorCache = {};  // memoize computed badge colors

/**
 * Relative luminance (WCAG 2.1)
 */
function _lum(hex) {
  hex = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG contrast ratio against #1e1e1e card background.
 */
function _contrast(hex) {
  const bg = 0.0118; // luminance of #1e1e1e
  const fg = _lum(hex);
  return fg > bg ? (fg + 0.05) / (bg + 0.05) : (bg + 0.05) / (fg + 0.05);
}

/**
 * Pick the most readable color from a team's palette for use on dark cards.
 * Walks primary → secondary → accent1 → accent2 → accent3, returns the
 * first with contrast ≥ 3.5. Falls back to whichever has the highest contrast.
 */
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

  // Fallback: highest contrast available
  return candidates.reduce((best, c) => _contrast(c) > _contrast(best) ? c : best, candidates[0]);
}

// ─── Team badge HTML ──────────────────────────────────────────────────────────
/**
 * Render a team badge <span> dynamically colored from team_colors.json.
 * Uses memoized result so contrast math only runs once per team per page load.
 * Falls back to FBP red (#EF3E42) for teams not in team_colors.json.
 */
function teamBadgeHTML(abbr) {
  if (!_badgeColorCache[abbr]) {
    const teamColors = _teamColorData[abbr];
    const color = teamColors ? _pickBadgeColor(teamColors) : '#EF3E42';
    _badgeColorCache[abbr] = color;
  }
  const color = _badgeColorCache[abbr];
  return `<span class="txn-team-badge" style="color:${color};background:${color}24;border-color:${color}4D">${abbr}</span>`;
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────
async function fetchJSON(path) {
  try {
    const base = window.FBPHub?.config?.dataPath || './data/';
    let r = await fetch(base + path);
    if (!r.ok && window.FBPHub?.config?.githubRaw)
      r = await fetch(window.FBPHub.config.githubRaw + path);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// ─── Contract helpers ─────────────────────────────────────────────────────────
function contractClass(str) {
  if (!str) return '';
  const s = str.toUpperCase().replace(/[\s\-]/g, '');
  if (s.startsWith('BC') || s.includes('BLUECHIP'))    return 'bc';
  if (s.startsWith('PC') || s.includes('PURCHASED'))   return 'pc';
  if (s.startsWith('DC') || s.includes('DEVELOPMENT')) return 'dc';
  if (s.startsWith('FC') || s.includes('FRANCHISE'))   return 'fc';
  if (s.startsWith('VC') || s.includes('VETERAN'))     return 'vc';
  if (s.startsWith('TC') || s.includes('TEAM'))        return 'tc';
  return '';
}

function contractBadgeHTML(contract, years) {
  const label = (years || contract || '').trim();
  if (!label) return '';
  const cls = contractClass(years || contract || '');
  return `<span class="txn-contract contract-${cls}">${label}</span>`;
}

// ─── Parse "SP Name [MLB] [VC 1]" line ───────────────────────────────────────
function parsePlayerLine(line) {
  if (!line || typeof line !== 'string')
    return { raw: line || '', name: line || '', pos: '', mlb: '', contract: '' };
  const t = line.trim();
  if (/^\$\d+\s*WB/i.test(t)) {
    const match = t.match(/^\$(\d+)/);
    const amount = match ? parseInt(match[1], 10) : 0;
    return { raw: t, isWB: true, amount };
  }
  const m = t.match(/^(\S+)\s+(.+?)\s*\[([^\]]*)\](?:\s*\[([^\]]*)\])?/);
  if (m) return { raw: t, pos: m[1], name: m[2].trim(), mlb: m[3], contract: m[4] || '', isWB: false };
  return { raw: t, name: t, pos: '', mlb: '', contract: '', isWB: false };
}

// ─── Round type label ─────────────────────────────────────────────────────────
function roundTypeLabel(round_type, draft) {
  if (draft === 'prospect') {
    if (round_type === 'fypd') return 'FYPD';
    if (round_type === 'dc')   return 'DC';
    return 'Prospect';
  }
  return 'Keeper';
}

// ─── MAIN LOADER ──────────────────────────────────────────────────────────────
export async function loadTransactionFeed() {
  await Promise.all([loadManagersConfig(), loadTeamColors()]);

  const [tradesRaw, wbRaw, logRaw, draftRaw] = await Promise.all([
    fetchJSON('trades.json'),
    fetchJSON('wizbucks_transactions.json'),
    fetchJSON('player_log.json'),
    fetchJSON('draft_order_2026.json'),
  ]);

  const events = [];

  // ── 1. TRADES ─────────────────────────────────────────────────────────────
  // Discord thread links intentionally excluded (trades are private)
  if (tradesRaw && typeof tradesRaw === 'object') {
    const tradeList = Array.isArray(tradesRaw) ? tradesRaw : Object.values(tradesRaw);
    for (const t of tradeList) {
      if ((t.status || '').toLowerCase() !== 'approved') continue;
      const teams = (t.teams || []).map(toAbbr);
      const teamAssets = {};
      for (const [rawTeam, lines] of Object.entries(t.receives || {})) {
        teamAssets[toAbbr(rawTeam)] = (lines || []).map(parsePlayerLine);
      }
      events.push({
        id:        t.trade_id || `trade-${t.created_at}`,
        type:      'trade',
        timestamp: t.processed_at || t.manager_approved_at || t.created_at || '',
        teams,
        teamAssets,
        tradeId:   t.trade_id,
      });
    }
  }

  // ── 2. WIZBUCKS LEDGER ────────────────────────────────────────────────────
  // Track which player_log entries belong to PAD/KAP grouped cards so we
  // can suppress individual contract/drop cards for those entries.
  const padSubmissionTeams = new Set();  // teams that have a PAD submission card
  const kapSubmissionTeams = new Set();
  const auctionWeeks = {};  // week_start → grouped auction card

  if (Array.isArray(wbRaw)) {
    const BUCKET_MS = 10000;
    const allotmentBuckets = {};

    for (const txn of wbRaw) {
      const tt   = (txn.transaction_type || '').toLowerCase();
      const ts   = txn.timestamp || '';
      const team = toAbbr(txn.team);

      // ── Allotments: group into league-wide cards ──────────────────────────
      if (tt === 'pad_allotment' || tt === 'kap_allotment') {
        const kind   = tt.startsWith('pad') ? 'PAD' : 'KAP';
        const bucket = Math.floor(new Date(ts).getTime() / BUCKET_MS);
        const key    = `${kind}_${bucket}`;
        if (!allotmentBuckets[key]) allotmentBuckets[key] = { teams: {}, type: kind, ts };
        allotmentBuckets[key].teams[team] = txn.balance_after;
        continue;
      }

      // Rollovers / rewards folded into allotment cards
      if (['pad_optional_rollover','kap_rollover',
           'pad_finish_reward','kap_finish_reward'].includes(tt)) continue;

      // Trade WB shown inside trade card
      if (tt === 'trade_wizbucks_debit' || tt === 'trade_wizbucks_credit') continue;

      // ── PAD submission — grouped card with player breakdown ───────────────
      // PAD_spend from the WB ledger is the anchor; we cross-reference
      // player_log for BC/PC/DC/Drop players in section 3.
      if (tt === 'pad_spend') {
        padSubmissionTeams.add(team);
        events.push({
          id:         txn.txn_id || `pad-${ts}-${team}`,
          type:       'pad',
          timestamp:  ts,
          team,
          wbSpent:    Math.abs(txn.amount),
          wbRemaining: txn.balance_after,
          // Player lists populated in section 3 after player_log is processed
          bc: [], pc: [], dc: [], dropped: [],
          dcSlots: 0, bcSlots: 0,
        });
        continue;
      }

      // ── KAP submission — self-contained summary card ──────────────────────
      // KAP_submission transaction has full metadata from kap_processor.py
      if (tt === 'kap_submission') {
        kapSubmissionTeams.add(team);
        const meta = txn.metadata || {};
        events.push({
          id:            txn.id || txn.txn_id || `kap-${ts}-${team}`,
          type:          'kap',
          timestamp:     ts,
          team,
          keeperCount:   meta.keeper_count   || 0,
          keeperSalary:  meta.keeper_salary  || 0,
          ratCost:       meta.rat_cost       || 0,
          buyinCost:     meta.buyin_cost     || 0,
          taxableSpend:  meta.taxable_spend  || 0,
          taxedRounds:   meta.taxed_rounds   || [],
          wbSpent:       Math.abs(txn.amount),
          wbRemaining:   txn.balance_after,
          // Player lists populated in section 3 after player_log is processed
          keepers: [], released: [],
        });
        continue;
      }

      // ── KAP spend (older format without metadata) ─────────────────────────
      if (tt === 'kap_spend') {
        events.push({
          id:          txn.txn_id || `wb-${ts}-${team}`,
          type:        'wizbucks',
          subtype:     'spend',
          timestamp:   ts,
          team,
          amount:      txn.amount,
          newBalance:  txn.balance_after,
          description: txn.description || '',
          installment: 'KAP',
        });
        continue;
      }

      // ── Buy-in purchase ───────────────────────────────────────────────────
      if (tt === 'buyin_purchase') {
        events.push({
          id:         txn.txn_id || `buyin-${ts}-${team}`,
          type:       'buyin',
          timestamp:  ts,
          team,
          round:      txn.metadata?.round,
          pick:       txn.metadata?.pick,
          cost:       Math.abs(txn.amount),
          newBalance: txn.balance_after,
          tradeId:    txn.metadata?.trade_id || null,
        });
        continue;
      }

      // ── Auction winner — group per week ──────────────────────────────────
      if (tt === 'auction_winner') {
        const weekStart = txn.metadata?.week_start || '';
        const key = weekStart || ts.slice(0, 10);
        if (!auctionWeeks[key]) {
          auctionWeeks[key] = {
            id:        `auction-${key}`,
            type:      'auction',
            timestamp: ts,
            weekStart: weekStart,
            winners:   [],
          };
        }
        auctionWeeks[key].winners.push({
          team,
          amount:  Math.abs(txn.amount),
          name:    txn.related_player?.name || txn.description || '',
          balance: txn.balance_after,
        });
        continue;
      }

      // ── Admin / manual adjustments ────────────────────────────────────────
      if (tt === 'admin_adjustment' || tt === 'manual_adjustment_refund') {
        events.push({
          id:          txn.txn_id || `wb-adj-${ts}-${team}`,
          type:        'wizbucks',
          subtype:     'adjustment',
          timestamp:   ts,
          team,
          amount:      txn.amount,
          newBalance:  txn.balance_after,
          description: txn.description || (txn.related_player?.name ? `Re: ${txn.related_player.name}` : 'Admin Adjustment'),
          installment: 'admin',
        });
        continue;
      }
    }

    // Emit grouped auction cards
    for (const auc of Object.values(auctionWeeks)) {
      events.push(auc);
    }

    for (const bucket of Object.values(allotmentBuckets)) {
      events.push({
        id:          `${bucket.type.toLowerCase()}-allotment-${bucket.ts}`,
        type:        'wizbucks',
        subtype:     'allotment',
        timestamp:   bucket.ts,
        label:       `${bucket.type} Allotment`,
        installment: bucket.type,
        allTeams:    bucket.teams,
        amount:      0,
      });
    }
  }

  // ── 3. PLAYER LOG ─────────────────────────────────────────────────────────
  const SKIP_LOG = new Set(['Admin','DataFix','Merge','Refund','Reset','Roster','Trade']);

  // Build a set of upids covered by draft_order_2026.json to avoid duplicates.
  const draftPickUpids = new Set();
  if (Array.isArray(draftRaw)) {
    for (const p of draftRaw) {
      if (p.result?.upid) draftPickUpids.add(String(p.result.upid));
    }
  }

  // Find PAD / KAP event objects so we can populate their player lists below
  const padEventByTeam = {};
  const kapEventByTeam = {};
  for (const ev of events) {
    if (ev.type === 'pad') padEventByTeam[ev.team] = ev;
    if (ev.type === 'kap') kapEventByTeam[ev.team] = ev;
  }

  if (Array.isArray(logRaw)) {
    for (const e of logRaw) {
      const ut    = e.update_type || '';
      const evtSrc = (e.event || '').toUpperCase();
      const team   = toAbbr(e.owner);

      if (SKIP_LOG.has(ut)) continue;

      // ── Auction player entries → fold into auction card ────────────────
      if (ut === 'Auction') {
        // Suppressed — the auction card from WB ledger already shows winners
        continue;
      }

      // ── PAD player entries → fold into the PAD submission card ───────────
      // Identify by event field containing "PAD" (e.g. "26 PAD")
      const isPadEntry = evtSrc.includes('PAD') &&
        (ut === 'Purchase' || ut === 'Blue Chip' || ut === 'Drop');

      if (isPadEntry && padSubmissionTeams.has(team)) {
        const padEv = padEventByTeam[team];
        if (padEv) {
          const player = { name: e.player_name || '?', pos: e.pos || '', mlbTeam: e.team || '' };
          if (ut === 'Blue Chip')         padEv.bc.push(player);
          else if (ut === 'Purchase')     padEv.pc.push(player);  // PC or DC — differentiated by contract
          else if (ut === 'Drop')         padEv.dropped.push(player);

          // Differentiate PC vs DC by contract field
          if (ut === 'Purchase') {
            const contract = (e.contract || '').toLowerCase();
            if (contract.includes('development') || contract === 'dc') {
              padEv.dc.push(padEv.pc.pop()); // move from pc to dc
            }
          }
        }
        continue; // suppress individual card
      }

      // ── KAP player entries → fold into KAP card ────────────────────────
      const isKapEntry = (ut === 'KAP_Keeper' || ut === 'KAP_Release');
      if (isKapEntry && kapSubmissionTeams.has(team)) {
        const kapEv = kapEventByTeam[team];
        if (kapEv) {
          const player = { name: e.player_name || '?', pos: e.pos || '', mlbTeam: e.team || '', years: e.years || '', contract: e.contract || '' };
          if (ut === 'KAP_Keeper')  kapEv.keepers.push(player);
          if (ut === 'KAP_Release') kapEv.released.push(player);
        }
        continue;
      }

      const base = {
        id:         e.id || `log-${e.timestamp}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp:  e.timestamp || '',
        playerName: e.player_name || '?',
        pos:        e.pos || '',
        mlbTeam:    e.team || '',
        manager:    team,
        event:      e.event || '',
      };

      if (ut === 'Graduate') {
        events.push({ ...base, type: 'graduation', fromContract: e.contract || 'PC', toContract: 'TC R' });
        continue;
      }

      if (ut === 'Purchase' || ut === 'Blue Chip') {
        const labelMap = { 'Blue Chip': 'Blue Chip Assigned', 'Purchase': 'Purchase' };
        events.push({ ...base, type: 'contract', contract: e.contract || '', years: e.years || '', event: e.event || labelMap[ut] || ut });
        continue;
      }

      if (ut === 'Draft' || ut === 'draft_pick') {
        const upid = String(e.upid || '');
        if (upid && draftPickUpids.has(upid)) continue;
        const labelMap = { 'draft_pick': 'Draft Pick', 'Draft': 'Draft' };
        events.push({ ...base, type: 'contract', contract: e.contract || '', years: e.years || '', event: e.event || labelMap[ut] || ut });
        continue;
      }

      if (ut === 'Drop') {
        events.push({ ...base, type: 'drop' });
        continue;
      }
    }
  }

  // ── 4. DRAFT PICKS from draft_order_2026.json ─────────────────────────────
  if (Array.isArray(draftRaw)) {
    for (const p of draftRaw) {
      if (!p._comment && p.result?.player && p.result?.timestamp) {
        const typeLabel = roundTypeLabel(p.round_type, p.draft);
        const draftLabel = p.draft === 'prospect' ? 'Prospect Draft' : 'Keeper Draft';
        events.push({
          id:         `draft-${p.draft}-r${p.round}-p${p.pick}-${p.team}`,
          type:       'draft',
          timestamp:  p.result.timestamp,
          playerName: p.result.player,
          upid:       p.result.upid,
          team:       toAbbr(p.team),
          round:      p.round,
          pick:       p.pick,
          roundType:  typeLabel,
          draftLabel,
          contract:   p.round_type === 'fypd' ? 'BC' : 'DC',
          draft:      p.draft,
          pickIndex:  p.result.pick_index,
        });
      }
    }
  }

  events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return events;
}

// ─── COUNT HELPER ─────────────────────────────────────────────────────────────
export function countByType(events) {
  const counts = { all: events.length, trade: 0, wizbucks: 0, buyin: 0, graduation: 0, contract: 0, drop: 0, draft: 0, pad: 0, kap: 0, auction: 0 };
  for (const e of events) if (e.type in counts) counts[e.type]++;
  return counts;
}

// ─── RENDER ENGINE ────────────────────────────────────────────────────────────
export function renderFeedHTML(events, { limit = 100, filter = 'all', compact = false } = {}) {
  const list  = filter === 'all' ? events : events.filter(e => e.type === filter);
  const shown = list.slice(0, limit);

  if (!shown.length) {
    return `<div class="txn-empty"><i class="fas fa-exchange-alt"></i><p>No transactions found</p></div>`;
  }

  const byDate = {};
  for (const ev of shown) {
    const key = dateKey(ev.timestamp);
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(ev);
  }

  let html = '';
  for (const [date, group] of Object.entries(byDate)) {
    if (!compact) html += `<div class="txn-date-label"><span>${date}</span></div>`;
    for (const ev of group) html += renderCard(ev, compact);
  }
  return html;
}

function renderCard(ev, compact) {
  const c = compact ? ' txn-compact' : '';
  switch (ev.type) {
    case 'trade':      return renderTrade(ev, c);
    case 'wizbucks':   return renderWizBucks(ev, c);
    case 'buyin':      return renderBuyin(ev, c);
    case 'graduation': return renderGraduation(ev, c);
    case 'contract':   return renderContract(ev, c);
    case 'drop':       return renderDrop(ev, c);
    case 'draft':      return renderDraft(ev, c);
    case 'pad':        return renderPAD(ev, c);
    case 'kap':        return renderKAP(ev, c);
    case 'auction':    return renderAuction(ev, c);
    default:           return '';
  }
}

// ─── Trade ────────────────────────────────────────────────────────────────────
// Note: Discord thread URL intentionally excluded from render
function renderTrade(ev, c) {
  const sides = (ev.teams || []).map(abbr => {
    const assets = ev.teamAssets?.[abbr] || [];
    const items  = assets.map(p => {
      if (p.isWB) return `<li class="txn-asset-wb"><i class="fas fa-coins"></i> $${p.amount} WB</li>`;
      return `<li>
        ${p.pos  ? `<span class="txn-pos">${p.pos}</span>` : ''}
        <span class="txn-player-name">${p.name}</span>
        ${p.mlb  ? `<span class="txn-mlb">[${p.mlb}]</span>` : ''}
        ${contractBadgeHTML(p.contract, p.contract)}
      </li>`;
    }).join('');
    return `<div class="txn-trade-side">
      <div class="txn-trade-side-label">
        ${teamBadgeHTML(abbr)}
        <span class="txn-receives-text">RECEIVES</span>
      </div>
      <ul class="txn-asset-list">${items || '<li class="txn-empty-side">Nothing</li>'}</ul>
    </div>`;
  });

  let body = '';
  for (let i = 0; i < sides.length; i++) {
    body += sides[i];
    if (i < sides.length - 1)
      body += `<div class="txn-trade-arrow"><i class="fas fa-exchange-alt"></i></div>`;
  }

  // Only show trade ID — no thread link (private)
  const metaRow = ev.tradeId
    ? `<div class="txn-meta-row"><span class="txn-id">ID: ${ev.tradeId}</span></div>`
    : '';

  return `<div class="txn-card txn-trade${c}">
    <div class="txn-card-header">
      <div class="txn-header-left">
        <span class="txn-icon-wrap trade"><i class="fas fa-exchange-alt"></i></span>
        <div>
          <span class="txn-type-label">Trade Approved</span>
          <span class="txn-headline">${(ev.teams || []).map(teamBadgeHTML).join(' ↔ ')}</span>
        </div>
      </div>
      <span class="txn-time">${timeStr(ev.timestamp)}</span>
    </div>
    <div class="txn-trade-body">${body}</div>
    ${metaRow}
  </div>`;
}

// ─── WizBucks ─────────────────────────────────────────────────────────────────
function renderWizBucks(ev, c) {
  if (ev.subtype === 'allotment') {
    const rows = ev.allTeams
      ? Object.entries(ev.allTeams).map(([abbr, bal]) =>
          `<div class="txn-wb-team">${teamBadgeHTML(abbr)}<span class="txn-wb-balance">$${bal}</span></div>`
        ).join('')
      : '';
    return `<div class="txn-card txn-wizbucks${c}">
      <div class="txn-card-header">
        <div class="txn-header-left">
          <span class="txn-icon-wrap wb"><i class="fas fa-coins"></i></span>
          <div>
            <span class="txn-type-label">${ev.installment} Allotment</span>
            <span class="txn-headline">${ev.label}</span>
          </div>
        </div>
        <span class="txn-time">${timeStr(ev.timestamp)}</span>
      </div>
      ${rows ? `<div class="txn-wb-grid">${rows}</div>` : ''}
    </div>`;
  }

  const delta = ev.amount || 0;
  const sign  = delta >= 0 ? '+' : '';
  const cls   = delta >= 0 ? 'pos' : 'neg';
  const label = ev.subtype === 'spend' ? 'WB Spend' : 'WB Adjustment';

  return `<div class="txn-card txn-wizbucks${c}">
    <div class="txn-card-header">
      <div class="txn-header-left">
        <span class="txn-icon-wrap wb"><i class="fas fa-coins"></i></span>
        <div>
          <span class="txn-type-label">${label}</span>
          <span class="txn-headline">
            ${teamBadgeHTML(ev.team)}
            &nbsp;<span class="txn-wb-delta ${cls}">${sign}$${Math.abs(delta)}</span>
          </span>
        </div>
      </div>
      <span class="txn-time">${timeStr(ev.timestamp)}</span>
    </div>
    ${ev.description ? `<p class="txn-wb-desc">${ev.description}</p>` : ''}
  </div>`;
}

// ─── Buy-In ───────────────────────────────────────────────────────────────────
function renderBuyin(ev, c) {
  return `<div class="txn-card txn-buyin${c}">
    <div class="txn-card-header">
      <div class="txn-header-left">
        <span class="txn-icon-wrap buyin"><i class="fas fa-ticket-alt"></i></span>
        <div>
          <span class="txn-type-label">Round Buy-In</span>
          <span class="txn-headline">
            ${teamBadgeHTML(ev.team)}
            &nbsp;Round ${ev.round}${ev.pick ? ` · Pick ${ev.pick}` : ''}
          </span>
        </div>
      </div>
      <span class="txn-time">${timeStr(ev.timestamp)}</span>
    </div>
    <p class="txn-wb-desc">
      <span class="txn-wb-delta neg">-$${ev.cost} WB</span>${ev.tradeId ? ` · ${ev.tradeId}` : ''}
    </p>
  </div>`;
}

// ─── Graduation ───────────────────────────────────────────────────────────────
function renderGraduation(ev, c) {
  return `<div class="txn-card txn-graduation${c}">
    <div class="txn-card-header">
      <div class="txn-header-left">
        <span class="txn-icon-wrap grad"><i class="fas fa-graduation-cap"></i></span>
        <div>
          <span class="txn-type-label">Prospect Graduated</span>
          <span class="txn-headline">${ev.playerName}</span>
        </div>
      </div>
      <span class="txn-time">${timeStr(ev.timestamp)}</span>
    </div>
    <div class="txn-graduation-detail">
      ${ev.manager ? teamBadgeHTML(ev.manager) : ''}
      ${ev.pos     ? `<span class="txn-pos">${ev.pos}</span>` : ''}
      ${ev.mlbTeam ? `<span class="txn-mlb">[${ev.mlbTeam}]</span>` : ''}
      <span class="txn-contract contract-${contractClass(ev.fromContract)}">${ev.fromContract || 'PC'}</span>
      <i class="fas fa-arrow-right txn-grad-arrow"></i>
      <span class="txn-contract contract-tc">${ev.toContract || 'TC R'}</span>
    </div>
  </div>`;
}

// ─── Contract ─────────────────────────────────────────────────────────────────
function renderContract(ev, c) {
  return `<div class="txn-card txn-contract-event${c}">
    <div class="txn-card-header">
      <div class="txn-header-left">
        <span class="txn-icon-wrap contract"><i class="fas fa-file-contract"></i></span>
        <div>
          <span class="txn-type-label">${ev.event || 'Contract'}</span>
          <span class="txn-headline">${ev.playerName}</span>
        </div>
      </div>
      <span class="txn-time">${timeStr(ev.timestamp)}</span>
    </div>
    <div class="txn-graduation-detail">
      ${ev.manager ? teamBadgeHTML(ev.manager) : ''}
      ${ev.pos     ? `<span class="txn-pos">${ev.pos}</span>` : ''}
      ${ev.mlbTeam ? `<span class="txn-mlb">[${ev.mlbTeam}]</span>` : ''}
      ${contractBadgeHTML(ev.contract, ev.years || ev.contract)}
    </div>
  </div>`;
}

// ─── Drop ─────────────────────────────────────────────────────────────────────
function renderDrop(ev, c) {
  return `<div class="txn-card txn-drop${c}">
    <div class="txn-card-header">
      <div class="txn-header-left">
        <span class="txn-icon-wrap drop"><i class="fas fa-minus-circle"></i></span>
        <div>
          <span class="txn-type-label">Player Dropped</span>
          <span class="txn-headline">${ev.playerName}</span>
        </div>
      </div>
      <span class="txn-time">${timeStr(ev.timestamp)}</span>
    </div>
    <div class="txn-graduation-detail">
      ${ev.manager ? teamBadgeHTML(ev.manager) : ''}
      ${ev.pos     ? `<span class="txn-pos">${ev.pos}</span>` : ''}
      ${ev.mlbTeam ? `<span class="txn-mlb">[${ev.mlbTeam}]</span>` : ''}
      <span class="txn-released-label">→ Released</span>
    </div>
  </div>`;
}

// ─── Draft Pick ───────────────────────────────────────────────────────────────
function renderDraft(ev, c) {
  const badge = contractBadgeHTML(ev.contract, ev.contract);
  return `<div class="txn-card txn-draft-event${c}">
    <div class="txn-card-header">
      <div class="txn-header-left">
        <span class="txn-icon-wrap draft-pick"><i class="fas fa-list-ol"></i></span>
        <div>
          <span class="txn-type-label">${ev.draftLabel} · ${ev.roundType}</span>
          <span class="txn-headline">${ev.playerName}</span>
        </div>
      </div>
      <span class="txn-time">${timeStr(ev.timestamp)}</span>
    </div>
    <div class="txn-graduation-detail">
      ${teamBadgeHTML(ev.team)}
      <span class="txn-draft-slot">Rd ${ev.round}, Pick ${ev.pick}</span>
      ${badge}
    </div>
  </div>`;
}

// ─── PAD Submission ──────────────────────────────────────────────────────────
// Mirrors the Discord embed from pad_processor.py:
//   Blue Chip Prospects / Purchased Players (PC) / Development Contracts (DC)
//   Dropped Prospects / WB Spent
function renderPAD(ev, c) {
  const rows = [];

  if (ev.bc?.length) {
    rows.push(`<div class="txn-pad-section">
      <span class="txn-pad-section-label bc">Blue Chip</span>
      <ul class="txn-pad-player-list">${ev.bc.map(p =>
        `<li><span class="txn-pos">${p.pos}</span> <span class="txn-player-name">${p.name}</span>${p.mlbTeam ? ` <span class="txn-mlb">[${p.mlbTeam}]</span>` : ''}</li>`
      ).join('')}</ul>
    </div>`);
  }

  if (ev.pc?.length) {
    rows.push(`<div class="txn-pad-section">
      <span class="txn-pad-section-label pc">Purchased (PC)</span>
      <ul class="txn-pad-player-list">${ev.pc.map(p =>
        `<li><span class="txn-pos">${p.pos}</span> <span class="txn-player-name">${p.name}</span>${p.mlbTeam ? ` <span class="txn-mlb">[${p.mlbTeam}]</span>` : ''}</li>`
      ).join('')}</ul>
    </div>`);
  }

  if (ev.dc?.length) {
    rows.push(`<div class="txn-pad-section">
      <span class="txn-pad-section-label dc">Development (DC)</span>
      <ul class="txn-pad-player-list">${ev.dc.map(p =>
        `<li><span class="txn-pos">${p.pos}</span> <span class="txn-player-name">${p.name}</span>${p.mlbTeam ? ` <span class="txn-mlb">[${p.mlbTeam}]</span>` : ''}</li>`
      ).join('')}</ul>
    </div>`);
  }

  if (ev.dropped?.length) {
    rows.push(`<div class="txn-pad-section">
      <span class="txn-pad-section-label dropped">Dropped</span>
      <ul class="txn-pad-player-list dropped-list">${ev.dropped.map(p =>
        `<li><span class="txn-player-name">${p.name}</span></li>`
      ).join('')}</ul>
    </div>`);
  }

  const slots = [];
  if (ev.bcSlots) slots.push(`${ev.bcSlots} BC slot${ev.bcSlots > 1 ? 's' : ''}`);
  if (ev.dcSlots) slots.push(`${ev.dcSlots} DC slot${ev.dcSlots > 1 ? 's' : ''}`);

  const footer = `<div class="txn-pad-footer">
    ${slots.length ? `<span class="txn-pad-slots">${slots.join(' · ')}</span>` : ''}
    <span class="txn-wb-delta neg">-$${ev.wbSpent} WB</span>
    <span class="txn-pad-remaining">$${ev.wbRemaining} remaining</span>
  </div>`;

  return `<div class="txn-card txn-pad${c}">
    <div class="txn-card-header">
      <div class="txn-header-left">
        <span class="txn-icon-wrap pad"><i class="fas fa-seedling"></i></span>
        <div>
          <span class="txn-type-label">PAD Submission</span>
          <span class="txn-headline">${teamBadgeHTML(ev.team)}</span>
        </div>
      </div>
      <span class="txn-time">${timeStr(ev.timestamp)}</span>
    </div>
    ${rows.length ? `<div class="txn-pad-body">${rows.join('')}</div>` : ''}
    ${footer}
  </div>`;
}

// ─── KAP Submission ───────────────────────────────────────────────────────────
// Mirrors the Discord embed from kap_processor.py:
//   Keepers Selected / Keeper Salaries / RaT (if any) / Buy-Ins (if any)
//   Taxable Spend / Draft Pick Tax / WB spent + remaining
function renderKAP(ev, c) {
  const stats = [];

  stats.push(`<div class="txn-kap-stat">
    <span class="txn-kap-label">Keepers</span>
    <span class="txn-kap-value">${ev.keeperCount}</span>
  </div>`);

  stats.push(`<div class="txn-kap-stat">
    <span class="txn-kap-label">Salaries</span>
    <span class="txn-kap-value">$${ev.keeperSalary}</span>
  </div>`);

  if (ev.ratCost > 0) {
    stats.push(`<div class="txn-kap-stat">
      <span class="txn-kap-label">RaT</span>
      <span class="txn-kap-value txn-kap-free">$${ev.ratCost} <span class="txn-kap-tag">tax-free</span></span>
    </div>`);
  }

  if (ev.buyinCost > 0) {
    stats.push(`<div class="txn-kap-stat">
      <span class="txn-kap-label">Buy-Ins</span>
      <span class="txn-kap-value">$${ev.buyinCost}</span>
    </div>`);
  }

  stats.push(`<div class="txn-kap-stat">
    <span class="txn-kap-label">Taxable</span>
    <span class="txn-kap-value">$${ev.taxableSpend}</span>
  </div>`);

  const taxLine = ev.taxedRounds?.length
    ? `Rounds ${ev.taxedRounds.join(', ')}`
    : 'None';

  stats.push(`<div class="txn-kap-stat txn-kap-tax">
    <span class="txn-kap-label">Pick Tax</span>
    <span class="txn-kap-value ${ev.taxedRounds?.length ? 'txn-kap-taxed' : 'txn-kap-safe'}">${taxLine}</span>
  </div>`);

  // Player lists (populated from player_log entries)
  const playerSections = [];

  if (ev.keepers?.length) {
    playerSections.push(`<div class="txn-pad-section">
      <span class="txn-pad-section-label kap-keeper">Keepers</span>
      <ul class="txn-pad-player-list">${ev.keepers.map(p =>
        `<li>${p.pos ? `<span class="txn-pos">${p.pos}</span>` : ''} <span class="txn-player-name">${p.name}</span>${p.mlbTeam ? ` <span class="txn-mlb">[${p.mlbTeam}]</span>` : ''} ${contractBadgeHTML(p.contract, p.years || p.contract)}</li>`
      ).join('')}</ul>
    </div>`);
  }

  if (ev.released?.length) {
    playerSections.push(`<div class="txn-pad-section">
      <span class="txn-pad-section-label dropped">Released</span>
      <ul class="txn-pad-player-list dropped-list">${ev.released.map(p =>
        `<li>${p.pos ? `<span class="txn-pos">${p.pos}</span>` : ''} <span class="txn-player-name">${p.name}</span>${p.mlbTeam ? ` <span class="txn-mlb">[${p.mlbTeam}]</span>` : ''}</li>`
      ).join('')}</ul>
    </div>`);
  }

  const footer = `<div class="txn-pad-footer">
    <span class="txn-wb-delta neg">-$${ev.wbSpent} WB</span>
    <span class="txn-pad-remaining">$${ev.wbRemaining} remaining</span>
  </div>`;

  return `<div class="txn-card txn-kap${c}">
    <div class="txn-card-header">
      <div class="txn-header-left">
        <span class="txn-icon-wrap kap"><i class="fas fa-file-signature"></i></span>
        <div>
          <span class="txn-type-label">KAP Submission</span>
          <span class="txn-headline">${teamBadgeHTML(ev.team)}</span>
        </div>
      </div>
      <span class="txn-time">${timeStr(ev.timestamp)}</span>
    </div>
    <div class="txn-kap-grid">${stats.join('')}</div>
    ${playerSections.length ? `<div class="txn-pad-body">${playerSections.join('')}</div>` : ''}
    ${footer}
  </div>`;
}

// ─── Auction Results ────────────────────────────────────────────────────────────
function renderAuction(ev, c) {
  const rows = (ev.winners || []).map(w =>
    `<div class="txn-auction-row">
      ${teamBadgeHTML(w.team)}
      <span class="txn-player-name">${w.name}</span>
      <span class="txn-wb-delta neg">-$${w.amount} WB</span>
    </div>`
  ).join('');

  const total = (ev.winners || []).reduce((s, w) => s + w.amount, 0);
  const weekLabel = ev.weekStart ? `Week of ${ev.weekStart}` : 'Weekly Results';

  return `<div class="txn-card txn-auction${c}">
    <div class="txn-card-header">
      <div class="txn-header-left">
        <span class="txn-icon-wrap auction"><i class="fas fa-gavel"></i></span>
        <div>
          <span class="txn-type-label">Prospect Auction</span>
          <span class="txn-headline">${weekLabel} · ${ev.winners?.length || 0} winner${ev.winners?.length !== 1 ? 's' : ''}</span>
        </div>
      </div>
      <span class="txn-time">${timeStr(ev.timestamp)}</span>
    </div>
    <div class="txn-auction-body">${rows || '<p style="color:rgba(170,170,170,.4);padding:8px;">No winners</p>'}</div>
    <div class="txn-pad-footer">
      <span class="txn-wb-delta neg">-$${total} WB total</span>
    </div>
  </div>`;
}

// ─── Date / time helpers ──────────────────────────────────────────────────────────
function dateKey(ts) {
  if (!ts) return 'Unknown Date';
  try {
    const d = new Date(ts), now = new Date();
    const diff = (now - d) / 86400000;
    if (diff < 1) return 'Today';
    if (diff < 2) return 'Yesterday';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return String(ts).slice(0, 10); }
}

function timeStr(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch { return ''; }
}
