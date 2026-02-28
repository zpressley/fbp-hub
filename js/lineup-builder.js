/**
 * FBP Hub – lineup-builder.js
 * Synchronized horizontal scroll across all rows
 * Format: Header Row | Player Rows (POS | Dropdown | Stats)
 * 
 * FIXES:
 * - Farm players can be assigned to lineup positions
 * - wireEvents only called once (no accumulating listeners)
 * - Correct camelCase field names (atBats, homeRuns, etc.)
 * - Bench shows appropriate stats for batters vs pitchers
 */

(function () {
  'use strict';

  const BATTER_SLOTS = [
    { id: 'C',    label: 'C' },
    { id: '1B',   label: '1B' },
    { id: '2B',   label: '2B' },
    { id: 'SS',   label: 'SS' },
    { id: '3B',   label: '3B' },
    { id: 'CF',   label: 'CF' },
    { id: 'OF1',  label: 'OF' },
    { id: 'OF2',  label: 'OF' },
    { id: 'UTIL', label: 'UTIL' },
  ];

  const PITCHER_SLOTS = [
    { id: 'SP',  label: 'SP' },
    { id: 'RP',  label: 'RP' },
    { id: 'P1',  label: 'P' },
    { id: 'P2',  label: 'P' },
    { id: 'P3',  label: 'P' },
    { id: 'P4',  label: 'P' },
  ];

  const POSITION_RULES = {
    'C': ['C'], '1B': ['1B'], '2B': ['2B'], 'SS': ['SS'], '3B': ['3B'],
    'CF': ['CF'], 'OF': ['OF', 'CF'], 'UTIL': '__batter__',
    'SP': ['SP'], 'RP': ['RP'], 'P': ['SP', 'RP', 'P'],
  };

  const PITCHER_POSITIONS = new Set(['SP', 'RP', 'P']);

  let _statsByUpid = {};
  let _selectedSeason = 2025;
  let _assignments = {};
  let _teamPlayers = [];

  // ── Load stats ─────────────────────────────────────────────────
  async function loadStats() {
    try {
      const base = window.FBPHub?.config?.dataPath || './data/';
      const r = await fetch(base + 'player_stats.json', { cache: 'no-store' });
      if (!r.ok) return;
      const allStats = await r.json();

      _statsByUpid = {};
      for (const entry of allStats) {
        if (entry.level !== 'MLB') continue;
        const id = String(entry.upid || '');
        if (!id) continue;
        if (!_statsByUpid[id]) _statsByUpid[id] = {};
        _statsByUpid[id][entry.season] = { ...(_statsByUpid[id][entry.season] || {}), ...entry };
      }
    } catch (e) {
      console.warn('Could not load player_stats.json:', e);
    }
  }

  function getStats(upid) {
    return (_statsByUpid[String(upid)] || {})[_selectedSeason] || null;
  }

  function loadTeamPlayers(team) {
    if (!team) { _teamPlayers = []; return; }
    const players = window.FBPHub?.data?.players || [];
    _teamPlayers = players.filter(p =>
      p.FBP_Team === team.abbreviation || p.manager === team.name
    ).filter(p => p.player_type === 'MLB' || p.player_type === 'Farm');
  }

  // ── Position helpers ───────────────────────────────────────────
  function getPositions(player) {
    return String(player.position || '').split(',').map(p => p.trim()).filter(Boolean);
  }

  function isPitcher(player) {
    const pos = getPositions(player);
    return pos.length > 0 && pos.every(p => PITCHER_POSITIONS.has(p));
  }

  function playerFitsSlot(player, slotLabel) {
    const eligible = POSITION_RULES[slotLabel];
    if (eligible === '__batter__') return !isPitcher(player);
    const pos = getPositions(player);
    return eligible.some(e => pos.includes(e));
  }

  // ── Persistence ────────────────────────────────────────────────
  function saveAssignments(teamAbbr) {
    const data = {
      assignments: _assignments,
      season: _selectedSeason,
      updated: new Date().toISOString(),
    };

    // Save to localStorage immediately (fast)
    try {
      localStorage.setItem(`roster_slots_${teamAbbr}`, JSON.stringify(data));
    } catch {}

    showSaveIndicator();

    // Save to backend (async, no await)
    saveToBackend(data);
  }

  async function saveToBackend(data) {
    const token = window.authManager?.getSession?.()?.token;
    const apiBase = window.AUTH_CONFIG?.workerUrl || '';
    if (!token || !apiBase) return;

    try {
      await fetch(`${apiBase}/api/roster`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ roster: data }),
      });
    } catch (e) {
      console.warn('Backend roster save failed (localStorage still saved):', e);
    }
  }

  function showSaveIndicator() {
    const indicator = document.getElementById('lbSaveIndicator');
    if (!indicator) return;
    indicator.style.opacity = '1';
    setTimeout(() => {
      indicator.style.opacity = '0';
    }, 2000);
  }

  async function loadAssignments(teamAbbr) {
    // Try backend first (authoritative source)
    const loaded = await loadFromBackend();
    if (loaded) return;

    // Fallback to localStorage
    try {
      const raw = localStorage.getItem(`roster_slots_${teamAbbr}`);
      if (!raw) return;
      const data = JSON.parse(raw);
      _assignments = data.assignments || {};
      if (data.season) _selectedSeason = data.season;
    } catch {}
  }

  async function loadFromBackend() {
    const token = window.authManager?.getSession?.()?.token;
    const apiBase = window.AUTH_CONFIG?.workerUrl || '';
    if (!token || !apiBase) return false;

    try {
      const r = await fetch(`${apiBase}/api/roster`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!r.ok) return false;

      const data = await r.json();
      if (data.roster) {
        _assignments = data.roster.assignments || {};
        if (data.roster.season) _selectedSeason = data.roster.season;

        // Sync backend data to localStorage
        const team = window.authManager?.getTeam?.();
        if (team) {
          try {
            localStorage.setItem(`roster_slots_${team.abbreviation}`, JSON.stringify(data.roster));
          } catch {}
        }
        return true;
      }
    } catch (e) {
      console.warn('Backend roster load failed, using localStorage:', e);
    }
    return false;
  }

  // ── Helpers ────────────────────────────────────────────────────
  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtRate(v) {
    if (v == null || v === '') return '.000';
    const n = Number(v);
    if (isNaN(n)) return String(v);
    const s = n.toFixed(3);
    return (n >= 0 && n < 1) ? s.replace(/^0/, '') : s;
  }

  function contractClass(str) {
    const s = str.toUpperCase().replace(/\s+/g, '');
    if (s.includes('VC')) return 'vc';
    if (s.includes('FC') || s.startsWith('F')) return 'fc';
    if (s === 'R' || s.startsWith('R-') || s.includes('TCR')) return 'rookie';
    return 'tc';
  }

  // ── Render ─────────────────────────────────────────────────────
  function render(team) {
    if (!team) return '<div class="lb-empty">No team found</div>';

    const assignedUpids = new Set(Object.values(_assignments).filter(Boolean));
    const keepers = _teamPlayers.filter(p => p.player_type === 'MLB');
    const prospects = _teamPlayers.filter(p => p.player_type === 'Farm');

    const batters = [];
    const pitchers = [];

    for (const slot of BATTER_SLOTS) {
      const upid = _assignments[slot.id];
      const player = upid ? _teamPlayers.find(p => String(p.upid) === upid) : null;
      batters.push({ slot, player });
    }

    for (const slot of PITCHER_SLOTS) {
      const upid = _assignments[slot.id];
      const player = upid ? _teamPlayers.find(p => String(p.upid) === upid) : null;
      pitchers.push({ slot, player });
    }

    const bench = keepers.filter(p => !assignedUpids.has(String(p.upid || '')));

    let html = '<div class="lb-container">';
    html += renderSeasonPicker();
    const allAssigned = [...Object.values(_assignments).filter(Boolean)];
    html += renderBattersSection(batters, allAssigned);
    html += renderPitchersSection(pitchers, allAssigned);
    html += renderBenchSection(bench);
    if (prospects.length > 0) html += renderFarmSystem(prospects);
    html += '</div>';

    return html;
  }

  function renderSeasonPicker() {
    const c24 = _selectedSeason === 2024 ? ' active' : '';
    const c25 = _selectedSeason === 2025 ? ' active' : '';
    const c26 = _selectedSeason === 2026 ? ' active' : '';
    return `<div class="lb-season-picker">
      <span class="lb-season-label">MLB Stats</span>
      <button class="lb-season-btn${c24}" data-season="2024">2024</button>
      <button class="lb-season-btn${c25}" data-season="2025">2025</button>
      <button class="lb-season-btn${c26}" data-season="2026">2026</button>
      <span class="lb-save-indicator" id="lbSaveIndicator" style="opacity:0;color:#22c55e;font-size:0.8rem;margin-left:12px;transition:opacity 0.3s ease;">
        <i class="fas fa-check-circle"></i> Saved
      </span>
    </div>`;
  }

  // ── Batters section ────────────────────────────────────────────
  function renderBattersSection(batters, allAssigned) {

    let html = '<div class="lb-section-hdr"><i class="fas fa-baseball-ball"></i> Batters</div>';
    html += '<div class="lb-scroll-container" data-section="batters">';
    
    // Header row
    html += '<div class="lb-header-row">';
    html += '<div class="lb-hdr-pos">POS</div>';
    html += '<div class="lb-hdr-player">PLAYER</div>';
    html += '<div class="lb-hdr-stats">';
    html += '<span class="lb-hdr-stat lb-hdr-wide">H/AB</span>';
    html += '<span class="lb-hdr-stat">R</span>';
    html += '<span class="lb-hdr-stat">H</span>';
    html += '<span class="lb-hdr-stat">HR</span>';
    html += '<span class="lb-hdr-stat">RBI</span>';
    html += '<span class="lb-hdr-stat">SB</span>';
    html += '<span class="lb-hdr-stat">BB</span>';
    html += '<span class="lb-hdr-stat">K</span>';
    html += '<span class="lb-hdr-stat">TB</span>';
    html += '<span class="lb-hdr-stat">AVG</span>';
    html += '<span class="lb-hdr-stat">OPS</span>';
    html += '</div>';
    html += '</div>';

    // Player rows
    for (const { slot, player } of batters) {
      html += renderBatterRow(slot, player, allAssigned);
    }

    html += '</div>'; // lb-scroll-container
    return html;
  }

  function renderBatterRow(slot, player, allAssigned) {
    const stats = player ? getStats(player.upid) : null;

    let html = '<div class="lb-player-row">';
    html += `<div class="lb-row-pos">${esc(slot.label)}</div>`;
    
    html += '<div class="lb-row-player">';
    html += `<select class="lb-player-select" data-slot="${esc(slot.id)}">`;
    html += renderPlayerOptions(slot.label, player, allAssigned);
    html += '</select>';
    if (player) {
      html += renderPlayerMeta(player);
    }
    html += '</div>';
    
    html += '<div class="lb-row-stats">';
    if (stats) {
      html += `<span class="lb-sv lb-sv-wide">${stats.hits || 0}/${stats.atBats || 0}</span>`;
      html += `<span class="lb-sv">${stats.runs || 0}</span>`;
      html += `<span class="lb-sv">${stats.hits || 0}</span>`;
      html += `<span class="lb-sv${(stats.homeRuns||0) >= 15 ? ' hot':''}">${stats.homeRuns || 0}</span>`;
      html += `<span class="lb-sv${(stats.rbi||0) >= 50 ? ' hot':''}">${stats.rbi || 0}</span>`;
      html += `<span class="lb-sv">${stats.stolenBases || 0}</span>`;
      html += `<span class="lb-sv">${stats.baseOnBalls || 0}</span>`;
      html += `<span class="lb-sv">${stats.strikeOuts || 0}</span>`;
      html += `<span class="lb-sv">${stats.totalBases || 0}</span>`;
      html += `<span class="lb-sv">${fmtRate(stats.avg)}</span>`;
      html += `<span class="lb-sv">${fmtRate(stats.ops)}</span>`;
    } else {
      html += '<span class="lb-sv lb-sv-wide dim">-</span>' + '<span class="lb-sv dim">-</span>'.repeat(10);
    }
    html += '</div>';
    
    html += '</div>';
    return html;
  }

  // ── Pitchers section
  function renderPitchersSection(pitchers, allAssigned) {

    let html = '<div class="lb-section-hdr lb-section-pitch"><i class="fas fa-baseball"></i> Pitchers</div>';
    html += '<div class="lb-scroll-container" data-section="pitchers">';
    
    // Header row
    html += '<div class="lb-header-row">';
    html += '<div class="lb-hdr-pos">POS</div>';
    html += '<div class="lb-hdr-player">PLAYER</div>';
    html += '<div class="lb-hdr-stats">';
    html += '<span class="lb-hdr-stat">APP</span>';
    html += '<span class="lb-hdr-stat">IP</span>';
    html += '<span class="lb-hdr-stat">ER</span>';
    html += '<span class="lb-hdr-stat">HR</span>';
    html += '<span class="lb-hdr-stat">K</span>';
    html += '<span class="lb-hdr-stat">BB</span>';
    html += '<span class="lb-hdr-stat">ERA</span>';
    html += '<span class="lb-hdr-stat">K/9</span>';
    html += '<span class="lb-hdr-stat">H/9</span>';
    html += '<span class="lb-hdr-stat">BB/9</span>';
    html += '<span class="lb-hdr-stat">QS</span>';
    html += '</div>';
    html += '</div>';

    for (const { slot, player } of pitchers) {
      html += renderPitcherRow(slot, player, allAssigned);
    }

    html += '</div>';
    return html;
  }

  function renderPitcherRow(slot, player, allAssigned) {
    const stats = player ? getStats(player.upid) : null;

    let html = '<div class="lb-player-row">';
    html += `<div class="lb-row-pos">${esc(slot.label)}</div>`;
    
    html += '<div class="lb-row-player">';
    html += `<select class="lb-player-select" data-slot="${esc(slot.id)}">`;
    html += renderPlayerOptions(slot.label, player, allAssigned);
    html += '</select>';
    if (player) {
      html += renderPlayerMeta(player);
    }
    html += '</div>';
    
    html += '<div class="lb-row-stats">';
    if (stats) {
      const ip = stats.inningsPitched || '0.0';
      const k = stats.strikeOuts || 0;
      const era = stats.era != null ? String(stats.era) : '-.--';
      const ipNum = parseFloat(ip) || 0;
      const h = stats.hits || 0;
      const bb = stats.baseOnBalls || stats.bb || 0;
      
      const k9 = ipNum > 0 ? ((k / ipNum) * 9).toFixed(1) : '-.--';
      const h9 = ipNum > 0 ? ((h / ipNum) * 9).toFixed(1) : '-.--';
      const bb9 = ipNum > 0 ? ((bb / ipNum) * 9).toFixed(1) : '-.--';
      
      html += `<span class="lb-sv">${stats.gamesPlayed || 0}</span>`;
      html += `<span class="lb-sv">${ip}</span>`;
      html += `<span class="lb-sv">${stats.earnedRuns || 0}</span>`;
      html += `<span class="lb-sv">${stats.homeRuns || 0}</span>`;
      html += `<span class="lb-sv${k >= 80 ? ' hot':''}">${k}</span>`;
      html += `<span class="lb-sv">${bb}</span>`;
      html += `<span class="lb-sv${parseFloat(era) > 0 && parseFloat(era) < 3 ? ' hot':''}">${era}</span>`;
      html += `<span class="lb-sv">${k9}</span>`;
      html += `<span class="lb-sv">${h9}</span>`;
      html += `<span class="lb-sv">${bb9}</span>`;
      html += `<span class="lb-sv">${stats.qualityStarts || stats.qs || 0}</span>`;
    } else {
      html += '<span class="lb-sv dim">-</span>'.repeat(11);
    }
    html += '</div>';
    
    html += '</div>';
    return html;
  }

  // ── Bench section ───────────────────────────────────────────────
  function renderBenchSection(benchPlayers) {
    if (!benchPlayers || benchPlayers.length === 0) {
      return '<div class="lb-section-hdr lb-section-bench"><i class="fas fa-chair"></i> Bench</div><div class="lb-empty-bench">All players assigned to positions</div>';
    }

    const benchBatters  = benchPlayers.filter(p => !isPitcher(p));
    const benchPitchers = benchPlayers.filter(p => isPitcher(p));

    let html = '<div class="lb-section-hdr lb-section-bench"><i class="fas fa-chair"></i> Bench</div>';

    if (benchBatters.length) {
      html += '<div class="lb-scroll-container" data-section="bench-bat">';
      html += '<div class="lb-header-row">';
      html += '<div class="lb-hdr-pos">POS</div>';
      html += '<div class="lb-hdr-player">PLAYER</div>';
      html += '<div class="lb-hdr-stats">';
      html += '<span class="lb-hdr-stat lb-hdr-wide">H/AB</span><span class="lb-hdr-stat">R</span><span class="lb-hdr-stat">H</span>';
      html += '<span class="lb-hdr-stat">HR</span><span class="lb-hdr-stat">RBI</span><span class="lb-hdr-stat">SB</span>';
      html += '<span class="lb-hdr-stat">BB</span><span class="lb-hdr-stat">K</span><span class="lb-hdr-stat">TB</span>';
      html += '<span class="lb-hdr-stat">AVG</span><span class="lb-hdr-stat">OPS</span>';
      html += '</div></div>';
      for (const p of benchBatters) html += renderBenchPlayerRow(p, true);
      html += '</div>';
    }

    if (benchPitchers.length) {
      html += '<div class="lb-scroll-container" data-section="bench-pitch">';
      html += '<div class="lb-header-row">';
      html += '<div class="lb-hdr-pos">POS</div>';
      html += '<div class="lb-hdr-player">PLAYER</div>';
      html += '<div class="lb-hdr-stats">';
      html += '<span class="lb-hdr-stat">APP</span><span class="lb-hdr-stat">IP</span><span class="lb-hdr-stat">ER</span>';
      html += '<span class="lb-hdr-stat">HR</span><span class="lb-hdr-stat">K</span><span class="lb-hdr-stat">BB</span>';
      html += '<span class="lb-hdr-stat">ERA</span><span class="lb-hdr-stat">K/9</span><span class="lb-hdr-stat">H/9</span>';
      html += '<span class="lb-hdr-stat">BB/9</span><span class="lb-hdr-stat">QS</span>';
      html += '</div></div>';
      for (const p of benchPitchers) html += renderBenchPlayerRow(p, false);
      html += '</div>';
    }

    return html;
  }

  function renderBenchPlayerRow(player, isBatter) {
    const stats = getStats(player.upid);

    let html = '<div class="lb-player-row lb-row-bench">';
    html += '<div class="lb-row-pos lb-pos-bench">BN</div>';
    html += '<div class="lb-row-player">';
    html += `<div class="lb-bench-name">${esc(player.name)}</div>`;
    html += renderPlayerMeta(player, true);
    html += '</div>';

    html += '<div class="lb-row-stats">';
    if (stats) {
      if (isBatter) {
        html += `<span class="lb-sv lb-sv-wide">${stats.hits || 0}/${stats.atBats || 0}</span>`;
        html += `<span class="lb-sv">${stats.runs || 0}</span>`;
        html += `<span class="lb-sv">${stats.hits || 0}</span>`;
        html += `<span class="lb-sv${(stats.homeRuns||0) >= 15 ? ' hot':''}">${stats.homeRuns || 0}</span>`;
        html += `<span class="lb-sv${(stats.rbi||0) >= 50 ? ' hot':''}">${stats.rbi || 0}</span>`;
        html += `<span class="lb-sv">${stats.stolenBases || 0}</span>`;
        html += `<span class="lb-sv">${stats.baseOnBalls || 0}</span>`;
        html += `<span class="lb-sv">${stats.strikeOuts || 0}</span>`;
        html += `<span class="lb-sv">${stats.totalBases || 0}</span>`;
        html += `<span class="lb-sv">${fmtRate(stats.avg)}</span>`;
        html += `<span class="lb-sv">${fmtRate(stats.ops)}</span>`;
      } else {
        const ip = stats.inningsPitched || '0.0';
        const k = stats.strikeOuts || 0;
        const era = stats.era != null ? String(stats.era) : '-.--';
        const ipNum = parseFloat(ip) || 0;
        const h = stats.hits || 0;
        const bb = stats.baseOnBalls || stats.bb || 0;
        const k9 = ipNum > 0 ? ((k / ipNum) * 9).toFixed(1) : '-.--';
        const h9 = ipNum > 0 ? ((h / ipNum) * 9).toFixed(1) : '-.--';
        const bb9 = ipNum > 0 ? ((bb / ipNum) * 9).toFixed(1) : '-.--';
        html += `<span class="lb-sv">${stats.gamesPlayed || 0}</span>`;
        html += `<span class="lb-sv">${ip}</span>`;
        html += `<span class="lb-sv">${stats.earnedRuns || 0}</span>`;
        html += `<span class="lb-sv">${stats.homeRuns || 0}</span>`;
        html += `<span class="lb-sv${k >= 80 ? ' hot':''}">${k}</span>`;
        html += `<span class="lb-sv">${bb}</span>`;
        html += `<span class="lb-sv${parseFloat(era) > 0 && parseFloat(era) < 3 ? ' hot':''}">${era}</span>`;
        html += `<span class="lb-sv">${k9}</span>`;
        html += `<span class="lb-sv">${h9}</span>`;
        html += `<span class="lb-sv">${bb9}</span>`;
        html += `<span class="lb-sv">${stats.qualityStarts || stats.qs || 0}</span>`;
      }
    } else {
      html += '<span class="lb-sv dim">-</span>'.repeat(11);
    }
    html += '</div>';
    html += '</div>';
    return html;
  }

  function renderPlayerMeta(player, showPos = false) {
    const contract = player.years_simple || '';
    const cls = contract ? contractClass(contract) : '';
    const posInfo = showPos ? `${esc(player.position || '')} · ` : '';
    
    let html = '<div class="lb-player-meta">';
    if (contract) html += `<span class="lb-inline-contract ${cls}">${esc(contract)}</span>`;

    // Show prospect contract type badge (BC/PC/DC) instead of farm emoji
    if (player.player_type === 'Farm' && player.contract_type) {
      const ct = (player.contract_type || '').toLowerCase();
      let prospectLabel = '', prospectCls = '';
      if (ct.includes('blue chip'))   { prospectLabel = 'BC'; prospectCls = 'bc'; }
      else if (ct.includes('purchased'))  { prospectLabel = 'PC'; prospectCls = 'pc'; }
      else if (ct.includes('development')){ prospectLabel = 'DC'; prospectCls = 'dc'; }
      if (prospectLabel) html += `<span class="lb-inline-contract ${prospectCls}">${prospectLabel}</span>`;
    }

    html += `<span class="lb-inline-team">${posInfo}${esc(player.team || '')}</span>`;
    html += '</div>';
    return html;
  }

  // ── Player dropdown options (INCLUDES farm players) ────────────
  function renderPlayerOptions(slotLabel, selectedPlayer, assignedUpids) {
    const selectedUpid = selectedPlayer ? String(selectedPlayer.upid) : '';
    const assigned = new Set(assignedUpids);

    // FIX: Include both MLB and Farm players
    const eligible = _teamPlayers.filter(p => {
      const upid = String(p.upid || '');
      if (!upid) return false;
      if (upid === selectedUpid) return true;
      if (assigned.has(upid)) return false;
      // Allow both MLB and Farm players in lineup
      return playerFitsSlot(p, slotLabel);
    }).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    let html = '<option value="">Empty</option>';
    for (const p of eligible) {
      const sel = String(p.upid) === selectedUpid ? ' selected' : '';
      html += `<option value="${esc(String(p.upid))}"${sel}>${esc(p.name)}</option>`;
    }
    return html;
  }

  // ── Farm system ────────────────────────────────────────────────
  function renderFarmSystem(prospects) {
    const groups = {
      bc: prospects.filter(p => (p.contract_type || '').toLowerCase().includes('blue chip')),
      pc: prospects.filter(p => (p.contract_type || '').toLowerCase().includes('purchased')),
      dc: prospects.filter(p => (p.contract_type || '').toLowerCase().includes('development')),
    };

    let html = '<div class="lb-section-hdr lb-section-farm"><i class="fas fa-seedling"></i> Farm System</div>';
    html += '<div class="lb-farm-groups">';

    for (const [type, list] of Object.entries(groups)) {
      if (list.length === 0) continue;
      html += `<div class="lb-farm-group">`;
      html += `  <div class="lb-farm-hdr ${type}">${type.toUpperCase()} <span class="lb-farm-count">(${list.length})</span></div>`;
      html += `  <div class="lb-farm-players">`;
      for (const p of list) {
        html += `<div class="lb-farm-row">`;
        html += `  <span class="lb-farm-pos">${esc(p.position || '')}</span>`;
        html += `  <span class="lb-farm-name">${esc(p.name)}</span>`;
        html += `  <span class="lb-farm-org">${esc(p.team || '')}</span>`;
        if (p.pipeline_rank) html += `  <span class="lb-farm-rank">${esc(p.pipeline_rank)}</span>`;
        html += `</div>`;
      }
      html += `  </div></div>`;
    }

    html += '</div>';
    return html;
  }

  // ── Synchronized scrolling ─────────────────────────────────────
  function setupSyncScroll(container) {
    if (!container) return;

    const sections = container.querySelectorAll('.lb-scroll-container');
    
    sections.forEach(section => {
      const header = section.querySelector('.lb-hdr-stats');
      const rows = section.querySelectorAll('.lb-row-stats');
      
      if (!header || !rows.length) return;

      // Sync header with rows
      header.addEventListener('scroll', () => {
        rows.forEach(row => { row.scrollLeft = header.scrollLeft; });
      });

      // Sync rows with header and each other
      rows.forEach(row => {
        row.addEventListener('scroll', () => {
          header.scrollLeft = row.scrollLeft;
          rows.forEach(r => { if (r !== row) r.scrollLeft = row.scrollLeft; });
        });
      });
    });
  }

  // ── Event wiring (CALLED ONLY ONCE) ────────────────────────────
  function wireEvents(container, team) {
    if (!container) return;

    container.addEventListener('change', e => {
      const sel = e.target.closest('.lb-player-select');
      if (!sel) return;
      const slotId = sel.dataset.slot;
      const upid = sel.value;
      
      if (upid) {
        _assignments[slotId] = upid;
      } else {
        delete _assignments[slotId];
      }
      
      saveAssignments(team.abbreviation);
      reRender(container, team);
    });

    container.addEventListener('click', e => {
      const btn = e.target.closest('.lb-season-btn');
      if (!btn) return;
      const season = parseInt(btn.dataset.season);
      if (season && season !== _selectedSeason) {
        _selectedSeason = season;
        saveAssignments(team.abbreviation);
        reRender(container, team);
      }
    });

    // Setup synchronized scrolling
    setupSyncScroll(container);
  }

  function reRender(container, team) {
    if (!container || !team) return;
    container.innerHTML = render(team);
    // Don't re-call wireEvents - listeners persist on container
    setupSyncScroll(container);
  }

  async function init() {
    await loadStats();
    const team = window.authManager?.getTeam?.();
    if (!team) return;
    loadTeamPlayers(team);
    loadAssignments(team.abbreviation);
  }

  window.LineupBuilder = {
    init: init,
    render: function (team) { return team ? render(team) : null; },
    wireEvents: wireEvents,
    reload: function () {
      const team = window.authManager?.getTeam?.();
      if (!team) return;
      const el = document.getElementById('rosterPreview');
      if (el) reRender(el, team);
    },
  };

  window.initLineupBuilder = init;
  window.renderAdvancedLineup = function (team) {
    return window.LineupBuilder.render(team);
  };

})();
