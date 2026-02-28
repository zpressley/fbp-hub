/**
 * FBP Hub – dashboard-tabs.js
 * FIXED VERSION - All bugs from sanity check resolved
 * 
 * FIXES:
 * - Transaction filter: Store ALL events, filter in renderTxnFeed()
 * - wireEvents() called after render in loadRosterPanel()
 * - Quick Actions use flex wrap (not grid)
 */

(function () {
  'use strict';

  const BOARD_CIPHER_SHIFT = 7;
  const NOTES_MAX = 500;

  let _team = null;
  let _tab = 0;
  let _draftType = 'keeper';
  let _board = [];
  let _avail = [];
  let _txnEvents = [];
  let _txnFilter = 'my-team';

  let _touchStartX = 0;
  let _touchStartY = 0;

  // ── Cipher helpers ─────────────────────────────────────────────
  function encodeUpid(upid) {
    return String(upid).split('').map(ch => {
      const d = parseInt(ch);
      return isNaN(d) ? ch : String((d + BOARD_CIPHER_SHIFT) % 10);
    }).join('');
  }

  function decodeUpid(enc) {
    return String(enc).split('').map(ch => {
      const d = parseInt(ch);
      return isNaN(d) ? ch : String((d - BOARD_CIPHER_SHIFT + 10) % 10);
    }).join('');
  }

  // ── Fetch helper ───────────────────────────────────────────────
  async function fetchJ(path) {
    try {
      const base = window.FBPHub?.config?.dataPath || './data/';
      const r = await fetch(base + path, { cache: 'no-store' });
      return r.ok ? await r.json() : null;
    } catch { return null; }
  }

  function apiBase() {
    return window.FBPHub?.config?.apiBase || window.AUTH_CONFIG?.workerUrl || '';
  }

  function authToken() {
    return window.authManager?.getSession?.()?.token || null;
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Notes encryption ───────────────────────────────────────────
  function _notesKey() {
    const id = window.authManager?.getUser?.()?.id || 'anon';
    const abbr = _team?.abbreviation || 'x';
    let h = 5381;
    for (const c of `${id}${abbr}fbp2026`) { h = ((h << 5) + h) ^ c.charCodeAt(0); }
    return Math.abs(h) & 0xff;
  }

  function encodeNotes(text) {
    const k = _notesKey();
    return btoa([...text].map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ (k + i) % 256)).join(''));
  }

  function decodeNotes(encoded) {
    try {
      const k = _notesKey();
      const raw = atob(encoded);
      return [...raw].map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ (k + i) % 256)).join('');
    } catch { return ''; }
  }

  // ── WizBucks helper ────────────────────────────────────────────
  function getWBBalance(abbr) {
    const wiz  = window.FBPHub?.data?.wizbucks || {};
    const meta = window.FBPHub?.data?.managers?.teams?.[abbr];
    const name = meta?.name;
    return Number(wiz[abbr] ?? (name && wiz[name]) ?? 0);
  }

  // ── Tab navigation ─────────────────────────────────────────────
  function goTab(index) {
    const tabs   = document.querySelectorAll('.dash-tab');
    const panels = document.getElementById('dashPanels');
    if (!panels) return;

    _tab = index;
    tabs.forEach((t, i) => t.classList.toggle('active', i === index));
    panels.style.transform = `translateX(-${index * 100}%)`;

    loadPanelContent(index);
    requestAnimationFrame(updatePanelHeight);
  }

  function updatePanelHeight() {
    const outer = document.getElementById('dashPanelsOuter');
    const panel = document.getElementById(`dashPanel${_tab}`);
    if (outer && panel) {
      outer.style.height = panel.scrollHeight + 'px';
    }
  }

  function setupTabs() {
    document.querySelectorAll('.dash-tab').forEach((btn, i) => {
      btn.addEventListener('click', () => goTab(i));
    });

    const outer = document.getElementById('dashPanelsOuter');
    if (!outer) return;

    let _touchTarget = null;

    outer.addEventListener('touchstart', e => {
      _touchStartX = e.touches[0].clientX;
      _touchStartY = e.touches[0].clientY;
      _touchTarget = e.target;
    }, { passive: true });

    outer.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - _touchStartX;
      const dy = e.changedTouches[0].clientY - _touchStartY;
      
      // Ignore swipe if user is scrolling within specific containers
      const inScrollArea = _touchTarget?.closest(
        '.lb-scroll-container, .lb-bench-grid, .lb-farm-list, .lb-farm-groups, ' +
        '.auc-grid-wrapper, .dash-txn-feed, #dashMyBids, #dashAllBids, ' +
        '.dash-board-split, .dash-targets-list, .dash-avail-list'
      );
      if (inScrollArea) return;
      
      if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx)) return;
      const tabs = document.querySelectorAll('.dash-tab');
      if (dx < 0 && _tab < tabs.length - 1) goTab(_tab + 1);
      if (dx > 0 && _tab > 0) goTab(_tab - 1);
    }, { passive: true });
  }

  // ── Panel loading ──────────────────────────────────────────────
  const _loaded = new Set();

  function loadPanelContent(index) {
    if (_loaded.has(index)) return;
    _loaded.add(index);

    switch (index) {
      case 0: loadRosterPanel();    break;
      case 1: loadAuctionPanel();   break;
      case 2: loadTxnPanel();       break;
      case 3: loadBoardPanel();     break;
    }
  }

  // PANEL 0: Roster (FIX: Call wireEvents after render)
  async function loadRosterPanel() {
    const preview = document.getElementById('rosterPreview');
    if (!preview) return;

    setHTML(preview, '<div class="dash-loading"><div class="spinner"></div><span>Loading lineup…</span></div>');

    if (typeof window.LineupBuilder?.init === 'function') {
      await window.LineupBuilder.init();
      const html = window.LineupBuilder.render(_team);
      if (html) {
        setHTML(preview, html);
        // FIX: Wire events after rendering
        if (typeof window.LineupBuilder.wireEvents === 'function') {
          window.LineupBuilder.wireEvents(preview, _team);
        }
      } else {
        setHTML(preview, '<div class="dash-empty"><i class="fas fa-exclamation-circle"></i>Could not load roster</div>');
      }
    } else {
      setHTML(preview, '<div class="dash-empty"><i class="fas fa-exclamation-circle"></i>Roster builder not available</div>');
    }
    requestAnimationFrame(updatePanelHeight);
  }

  // PANEL 1: Auction
  async function loadAuctionPanel() {
    const abbr = _team?.abbreviation;
    const [auc, _wbData] = await Promise.all([
      fetchJ('auction_current.json'),
      fetchJ('wizbucks.json'),
    ]);

    const banner  = document.getElementById('dashAucPhaseBanner');
    const titleEl = document.getElementById('dashAucPhaseTitle');
    const subEl   = document.getElementById('dashAucPhaseSub');
    const phase   = auc?.phase || 'off_week';

    const cfgs = {
      ob_window:  { cls:'phase-ob',    title:'🟢 OB Window Open',       sub:'Mon 3pm – Tue EOD ET · Min $10' },
      cb_window:  { cls:'phase-cb',    title:'🟡 Challenge Bid Window',  sub:'Wed – Fri 9pm ET · Min high +$5' },
      ob_final:   { cls:'phase-match', title:'🟣 Match / Forfeit Window', sub:'Saturday · OB managers decide' },
      processing: { cls:'phase-proc',  title:'🔵 Processing Results',    sub:'Sunday · Transactions page will update' },
      off_week:   { cls:'phase-off',   title:'No Auction This Week',     sub:'Opens Monday 3pm ET' },
    };
    const cfg = cfgs[phase] || cfgs.off_week;

    if (banner) banner.className = 'auc-phase-banner ' + cfg.cls;
    if (titleEl) titleEl.textContent = cfg.title;
    if (subEl)   subEl.textContent   = cfg.sub;

    const balance   = abbr ? getWBBalance(abbr) : 0;
    const bids      = auc?.bids || [];
    const committed = abbr ? bids
      .filter(b => String(b.team).toUpperCase() === abbr.toUpperCase() && b.committed)
      .reduce((s, b) => s + (Number(b.amount) || 0), 0) : 0;

    setText('dashAucWBTotal',     `$${balance}`);
    setText('dashAucWBCommitted', `$${committed}`);
    setText('dashAucWBAvailable', `$${Math.max(0, balance - committed)}`);

    const myBidsEl = document.getElementById('dashMyBids');
    const myBids   = abbr ? bids.filter(b => String(b.team).toUpperCase() === abbr.toUpperCase()) : [];

    if (!myBids.length) {
      setHTML(myBidsEl, '<div class="dash-empty"><i class="fas fa-gavel"></i>No bids this week</div>');
    } else {
      setHTML(myBidsEl, myBids.map(b => {
        const typeCls = b.bid_type === 'OB' ? 'ob' : 'cb';
        const name = _resolveProspectName(b.prospect_id);
        return `<div class="dash-bid-row">
          <span class="dash-bid-name">${esc(name)}</span>
          <span class="dash-bid-type ${typeCls}">${esc(b.bid_type)}</span>
          <span class="dash-bid-amount">$${b.amount}</span>
        </div>`;
      }).join(''));
    }

    const allBidsEl = document.getElementById('dashAllBids');
    const activeProspects = [...new Set(
      bids.filter(b => b.bid_type === 'OB').map(b => String(b.prospect_id))
    )];

    if (phase === 'off_week' || !activeProspects.length) {
      setHTML(allBidsEl, '<div class="dash-empty"><i class="fas fa-moon"></i>No active auction</div>');
    } else {
      setHTML(allBidsEl, activeProspects.map(pid => {
        const highest = bids
          .filter(b => String(b.prospect_id) === pid)
          .reduce((h, b) => (!h || Number(b.amount) > Number(h.amount)) ? b : h, null);
        const name = _resolveProspectName(pid);
        const isMyWin = abbr && highest?.team?.toUpperCase() === abbr.toUpperCase();
        return `<div class="dash-bid-row">
          <span class="dash-bid-name">${esc(name)}</span>
          <span class="dash-bid-type ${highest?.bid_type === 'OB' ? 'ob' : 'cb'}">${esc(highest?.team || '')}</span>
          <span class="dash-bid-amount ${isMyWin ? 'dash-bid-win' : ''}">$${highest?.amount || 0}</span>
        </div>`;
      }).join(''));
    }
  }

  function _resolveProspectName(upid) {
    const players = window.FBPHub?.data?.players || [];
    const p = players.find(pl => String(pl.upid || '') === String(upid));
    return p?.name || String(upid);
  }

  // PANEL 2: Transactions (FIX: Store all events, filter on render)
  async function loadTxnPanel() {
    const feedEl = document.getElementById('dashTxnFeed');
    if (!feedEl) return;

    let attempts = 0;
    while (!window._dashLoadTxn && attempts < 30) {
      await new Promise(r => setTimeout(r, 100));
      attempts++;
    }

    if (!window._dashLoadTxn) {
      setHTML(feedEl, '<div class="dash-empty"><i class="fas fa-exclamation-circle"></i>Transactions unavailable</div>');
      return;
    }

    setHTML(feedEl, '<div class="dash-loading"><div class="spinner"></div><span>Loading…</span></div>');

    try {
      // FIX: Store ALL events, let renderTxnFeed() handle filtering
      _txnEvents = await window._dashLoadTxn();
      renderTxnFeed();
    } catch (e) {
      setHTML(feedEl, '<div class="dash-empty"><i class="fas fa-exclamation-circle"></i>Could not load transactions</div>');
    }
    requestAnimationFrame(updatePanelHeight);
  }

  function renderTxnFeed() {
    const feedEl = document.getElementById('dashTxnFeed');
    if (!feedEl || !window._dashRenderFeed) return;
    
    const abbr = _team?.abbreviation;
    let filtered = _txnEvents;
    
    if (_txnFilter === 'my-team' && abbr) {
      filtered = _txnEvents.filter(ev => {
        if (ev.team === abbr || ev.manager === abbr) return true;
        if (ev.teams?.includes(abbr)) return true;
        if (ev.allTeams && abbr in ev.allTeams) return true;
        return false;
      });
    }
    
    setHTML(feedEl, window._dashRenderFeed(filtered, { limit: 40 }));
  }

  function setupTxnFilters() {
    const bar = document.getElementById('dashTxnFilters');
    if (!bar) return;

    bar.addEventListener('click', e => {
      const chip = e.target.closest('.dash-txn-chip');
      if (!chip) return;
      bar.querySelectorAll('.dash-txn-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      _txnFilter = chip.dataset.filter || 'all';
      if (_loaded.has(2)) renderTxnFeed();
    });
  }

  // PANEL 3: Draft Board
  async function loadBoardPanel() {
    await loadBoardFromServer();
    loadAvailPlayers();
    renderBoardPanel();
  }

  async function loadBoardFromServer() {
    const abbr = _team?.abbreviation;
    const base = apiBase();
    if (!base || !abbr) {
      _loadBoardFromLS();
      return;
    }

    try {
      const r = await fetch(`${base}/api/draft/boards/${abbr}`, { cache: 'no-store' });
      if (r.ok) {
        const data = await r.json();
        const players = window.FBPHub?.data?.players || [];
        _board = (data.board || []).map((enc, i) => {
          const realUpid = decodeUpid(enc);
          const pl = players.find(p => String(p.upid || '') === realUpid) || {};
          return { rank: i + 1, name: pl.name || realUpid, pos: pl.position || '', upid: realUpid };
        });
        return;
      }
    } catch {}

    _loadBoardFromLS();
  }

  function _loadBoardFromLS() {
    const abbr = _team?.abbreviation || '';
    try {
      const saved = localStorage.getItem(`draft_board_${abbr}`);
      if (saved) {
        const data = JSON.parse(saved);
        const players = window.FBPHub?.data?.players || [];
        _board = (data.targets || []).map((t, i) => {
          const realUpid = decodeUpid(t.upid || '');
          const pl = players.find(p => String(p.upid || '') === realUpid) || {};
          return {
            rank: i + 1,
            name: t.player_name || pl.name || realUpid,
            pos: t.position || pl.position || '',
            upid: realUpid,
          };
        });
      }
    } catch {}
  }

  function loadAvailPlayers() {
    const players = window.FBPHub?.data?.players || [];
    const onBoard = new Set(_board.map(b => b.upid));

    if (_draftType === 'keeper') {
      _avail = players.filter(p =>
        p.player_type === 'MLB' &&
        !p.FBP_Team && !p.manager &&
        !onBoard.has(String(p.upid || ''))
      );
    } else {
      _avail = players.filter(p =>
        p.player_type === 'Farm' &&
        !(p.manager || '').trim() && !(p.FBP_Team || '').trim() &&
        !(p.contract_type || '').trim() &&
        !onBoard.has(String(p.upid || ''))
      );
    }
  }

  function renderBoardPanel() {
    const targetsEl = document.getElementById('dashBoardTargets');
    const availEl   = document.getElementById('dashBoardAvail');
    const countEl   = document.getElementById('dashBoardCount');
    const acountEl  = document.getElementById('dashAvailCount');

    if (countEl) countEl.textContent = _board.length;

    if (targetsEl) {
      if (!_board.length) {
        setHTML(targetsEl, '<div class="dash-empty"><i class="fas fa-clipboard-list"></i>Add players to your board</div>');
      } else {
        setHTML(targetsEl, _board.map(p => `
          <div class="dash-board-item" data-upid="${esc(p.upid)}">
            <span class="dash-board-rank">${p.rank}</span>
            <span class="dash-board-name">${esc(p.name)}</span>
            <span class="dash-board-pos">${esc(p.pos)}</span>
            <button class="dash-avail-add dash-board-remove" title="Remove" data-upid="${esc(p.upid)}">
              <i class="fas fa-times"></i>
            </button>
          </div>
        `).join(''));

        targetsEl.querySelectorAll('.dash-board-remove').forEach(btn => {
          btn.addEventListener('click', e => {
            e.stopPropagation();
            removeBoardItem(btn.dataset.upid);
          });
        });
      }
    }

    const search = (document.getElementById('dashBoardSearch')?.value || '').toLowerCase();
    let displayed = _avail.filter(p => !search || (p.name || '').toLowerCase().includes(search));
    if (acountEl) acountEl.textContent = displayed.length;

    if (availEl) {
      if (!displayed.length) {
        setHTML(availEl, '<div class="dash-empty"><i class="fas fa-search"></i>No players found</div>');
      } else {
        setHTML(availEl, displayed.slice(0, 60).map(p => `
          <div class="dash-avail-item">
            <button class="dash-avail-add" title="Add to board" data-upid="${esc(String(p.upid || ''))}">
              <i class="fas fa-plus"></i>
            </button>
            <span class="dash-board-name">${esc(p.name || '')}</span>
            <span class="dash-board-pos">${esc(p.position || '')}</span>
          </div>
        `).join(''));

        availEl.querySelectorAll('.dash-avail-add').forEach(btn => {
          btn.addEventListener('click', () => addBoardItem(btn.dataset.upid));
        });
      }
    }
  }

  function addBoardItem(upid) {
    if (_board.some(b => b.upid === upid)) return;
    const players = window.FBPHub?.data?.players || [];
    const pl = players.find(p => String(p.upid || '') === upid) || {};
    _board.push({ rank: _board.length + 1, name: pl.name || upid, pos: pl.position || '', upid });
    _board.forEach((b, i) => { b.rank = i + 1; });
    loadAvailPlayers();
    renderBoardPanel();
    persistBoardLS();
  }

  function removeBoardItem(upid) {
    _board = _board.filter(b => b.upid !== upid);
    _board.forEach((b, i) => { b.rank = i + 1; });
    loadAvailPlayers();
    renderBoardPanel();
    persistBoardLS();
  }

  function persistBoardLS() {
    const abbr = _team?.abbreviation || '';
    try {
      localStorage.setItem(`draft_board_${abbr}`, JSON.stringify({
        team: abbr,
        draft_id: `fbp_${_draftType}_draft_2026`,
        last_updated: new Date().toISOString(),
        targets: _board.map(b => ({
          rank: b.rank, player_name: b.name, position: b.pos,
          upid: encodeUpid(b.upid),
        })),
        watch_list: [],
      }));
    } catch {}
  }

  async function saveBoard() {
    const btn = document.getElementById('dashBoardSaveBtn');
    const orig = btn?.innerHTML || '';
    if (btn) btn.textContent = 'Saved!';

    persistBoardLS();

    const abbr = _team?.abbreviation;
    const base = apiBase();
    const token = authToken();
    if (base && abbr && token) {
      try {
        await fetch(`${base}/api/draft/boards/${abbr}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            team: abbr,
            board: _board.map(b => encodeUpid(b.upid)),
          }),
        });
      } catch {}
    }

    setTimeout(() => { if (btn) btn.innerHTML = orig; }, 2000);
  }

  function setupBoardControls() {
    const saveBtn    = document.getElementById('dashBoardSaveBtn');
    const searchEl   = document.getElementById('dashBoardSearch');
    const typeToggle = document.getElementById('dashBoardTypeToggle');

    if (saveBtn) saveBtn.addEventListener('click', saveBoard);

    if (searchEl) {
      searchEl.addEventListener('input', () => {
        if (_loaded.has(3)) renderBoardPanel();
      });
    }

    if (typeToggle) {
      typeToggle.addEventListener('click', async e => {
        const btn = e.target.closest('.dash-board-type-btn');
        if (!btn) return;
        typeToggle.querySelectorAll('.dash-board-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _draftType = btn.dataset.type || 'keeper';
        await loadBoardFromServer();
        loadAvailPlayers();
        renderBoardPanel();
      });
    }
  }

  // ── Quick Actions (flex wrap buttons) ─────────────────
  async function renderQuickActions() {
    const grid = document.getElementById('dashQAGrid');
    const gridBottom = document.getElementById('dashQAGridBottom');
    const section = document.getElementById('dashQASection');
    const sectionBottom = document.getElementById('dashQABottomSection');
    if (!grid) return;

    if (section) section.style.display = 'block';
    if (sectionBottom) sectionBottom.style.display = 'block';

    let showPad = false;
    let showKap = false;
    
    try {
      const base = window.FBPHub?.config?.dataPath || './data/';
      const r = await fetch(base + 'season_dates.json').catch(() => null);
      if (r?.ok) {
        const dates = await r.json();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (dates.prospect_draft) {
          const prospectDraft = new Date(dates.prospect_draft + 'T00:00:00');
          showPad = today < prospectDraft;
        }

        if (dates.keeper_draft) {
          const keeperDraft = new Date(dates.keeper_draft + 'T00:00:00');
          showKap = today < keeperDraft;
        }
      }
    } catch {}

    if (showPad || showKap) {
      const badge = document.getElementById('dashPreseasonBadge');
      if (badge) badge.style.display = 'inline-block';
    }

    const actions = [];
    
    if (showPad) actions.push({ href: 'pad.html', icon: 'fa-seedling', label: 'PAD' });
    if (showKap) actions.push({ href: 'kap.html', icon: 'fa-file-signature', label: 'KAP' });
    
    actions.push({ href: 'team-builder.html', icon: 'fa-drafting-compass', label: 'Team Builder' });
    actions.push({ action: 'purchase', icon: 'fa-file-contract', label: 'Purchase Contracts' });
    actions.push({ href: 'trade-portal.html', icon: 'fa-handshake', label: 'Trade Portal' });
    
    if (window.authManager?.isAdmin?.()) {
      actions.push({ href: 'admin.html', icon: 'fa-shield-alt', label: 'Admin' });
    }
    
    actions.push({ href: 'settings.html', icon: 'fa-cog', label: 'Settings' });

    const tilesHTML = actions.map(a => {
      if (a.action === 'purchase') {
        return `<button class="dash-qa-tile" data-action="purchase" type="button">
          <i class="fas ${a.icon}"></i>${esc(a.label)}
        </button>`;
      }
      return `<a class="dash-qa-tile" href="${esc(a.href || '#')}">
        <i class="fas ${a.icon}"></i>${esc(a.label)}
      </a>`;
    }).join('');

    grid.innerHTML = tilesHTML;
    if (gridBottom) gridBottom.innerHTML = tilesHTML;

    [grid, gridBottom].filter(Boolean).forEach(g => {
      g.querySelectorAll('[data-action="purchase"]').forEach(btn => {
        btn.addEventListener('click', () => {
          if (typeof window.showContractPurchaseModal === 'function') {
            window.showContractPurchaseModal();
          }
        });
      });
    });
  }

  // ── Manager Notes ──────────────────────────────────────────────
  function setupNotes() {
    const ta      = document.getElementById('dashNotesTextarea');
    const countEl = document.getElementById('dashNotesCount');
    const saveBtn = document.getElementById('dashNotesSaveBtn');
    if (!ta) return;

    const lsKey = `fbp_notes_${_team?.abbreviation || 'anon'}`;

    // Load from localStorage immediately (fast), then overwrite from API
    try {
      const enc = localStorage.getItem(lsKey);
      if (enc) ta.value = decodeNotes(enc);
    } catch {}

    const updateCount = () => {
      if (countEl) countEl.textContent = `${ta.value.length}/${NOTES_MAX}`;
    };
    updateCount();
    ta.addEventListener('input', updateCount);

    // Fetch from backend (overwrites localStorage value if available)
    const token = authToken();
    const base = apiBase();
    if (token && base) {
      fetch(`${base}/api/notes`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (d && typeof d.notes === 'string') {
            ta.value = d.notes;
            updateCount();
            // Sync backend value into localStorage
            try { localStorage.setItem(lsKey, encodeNotes(d.notes)); } catch {}
          }
        })
        .catch(() => {});
    }

    const doSave = () => {
      const text = ta.value;
      // Always save to localStorage
      try { localStorage.setItem(lsKey, encodeNotes(text)); } catch {}

      // Save to backend
      const tk = authToken();
      const b = apiBase();
      if (tk && b) {
        fetch(`${b}/api/notes`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tk}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ notes: text }),
        })
          .then(r => {
            if (r.ok && typeof window.showToast === 'function') window.showToast('Notes saved', 'success');
            if (!r.ok && typeof window.showToast === 'function') window.showToast('Save failed – stored locally', 'warning');
          })
          .catch(() => {
            if (typeof window.showToast === 'function') window.showToast('Offline – saved locally', 'warning');
          });
      } else {
        if (typeof window.showToast === 'function') window.showToast('Notes saved locally', 'success');
      }
    };

    if (saveBtn) saveBtn.addEventListener('click', doSave);
    ta.addEventListener('blur', doSave);
  }

  // ── Team header ────────────────────────────────────────────────
  async function updateTeamHeader() {
    const abbr = _team?.abbreviation;
    const nameEl = document.getElementById('dashTeamName');
    const metaEl = document.getElementById('dashTeamMeta');
    const recEl  = document.getElementById('dashMatchupRec');
    const vsEl   = document.getElementById('dashMatchupVs');

    if (nameEl) nameEl.textContent = _team?.name || _team?.abbreviation || '—';
    const wb = getWBBalance(abbr);
    const wbStr = wb !== 0 ? ` · WB: $${wb}` : '';
    if (metaEl) metaEl.textContent = `${abbr || ''} · FBP 2026${wbStr}`;

    try {
      const standings = await fetchJ('standings.json');
      if (standings?.standings) {
        const entry = standings.standings.find(s => String(s.team).toUpperCase() === (abbr || '').toUpperCase());
        if (entry && recEl) recEl.textContent = entry.record || '—';
      }
      if (standings?.matchups?.length && vsEl) {
        const matchup = standings.matchups.find(m => m.includes(abbr || ''));
        if (matchup) vsEl.textContent = matchup;
      }
    } catch {}
  }

  // ── Utility ────────────────────────────────────────────────────
  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function setHTML(el, html) {
    if (el) el.innerHTML = html;
  }

  // ── Init ───────────────────────────────────────────────────────
  async function init() {
    _team = window.authManager?.getTeam?.() || null;

    if (typeof window.applyDashboardTeamTheme === 'function') {
      window.applyDashboardTeamTheme(_team);
    }

    await updateTeamHeader();

    setupTabs();
    setupTxnFilters();
    setupBoardControls();
    setupNotes();

    renderQuickActions();

    loadPanelContent(0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(init, 100);
    });
  } else {
    setTimeout(init, 100);
  }

  window._dashTabs = { goTab, saveBoard, _board: () => _board };

})();
