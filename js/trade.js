/**
 * FBP Hub - Trade Portal (2026)
 *
 * Notes:
 * - Web trade payload uses directed transfers (from_team -> to_team).
 * - Calling manager identity is derived in the Cloudflare Worker and injected
 *   to the bot API as X-Manager-Team (clients cannot spoof teams).
 */

const TRADE_PREFILL_KEY = 'fbp_trade_prefill_v1';

let TRADE_STATE = {
  userTeam: null,
  teamCount: 2,
  teams: {
    team1: null, // user's team
    team2: null,
    team3: null,
  },
  transfers: [], // {type:'player', upid, from_team, to_team} | {type:'draft_pick', draft:'keeper', round, pick, from_team, to_team} | {type:'wizbucks', amount, from_team, to_team}
  currentToTeamKey: null,
  currentFromTeam: null,
  currentInboxTrade: null,
};

let MANAGERS_CONFIG = null; // loaded from config/managers.json
let PLAYER_PICKER_ROSTER = [];
let PLAYER_PICKER_SELECTED = new Set();

let DRAFT_ORDER_2026 = null;
let KEEPER_PICKS = [];
let PICK_PICKER_PICKS = [];
let PICK_PICKER_SELECTED = new Set();

function teamKeyToAbbr(teamKey) {
  return TRADE_STATE.teams[teamKey] || null;
}

function activeTeamKeys() {
  return TRADE_STATE.teamCount === 3 ? ['team1', 'team2', 'team3'] : ['team1', 'team2'];
}

function waitForHubReady() {
  if (window.FBPHub?.cache?.lastUpdate) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    if (window.FBPHub?.on) {
      FBPHub.on('ready', resolve);
    } else {
      resolve();
    }
  });
}

async function loadManagersConfig() {
  if (MANAGERS_CONFIG) return MANAGERS_CONFIG;

  try {
    let resp = await fetch('./config/managers.json');
    if (!resp.ok && window.FBPHub?.config?.githubRaw) {
      resp = await fetch(`${FBPHub.config.githubRaw.replace('/data/', '/config/')}managers.json`);
    }
    if (!resp.ok) throw new Error('Failed to load config/managers.json');
    MANAGERS_CONFIG = await resp.json();
  } catch (e) {
    console.warn('Trade Portal: managers config unavailable; falling back to auth.js mapping only', e);
    MANAGERS_CONFIG = { teams: {} };
  }
  return MANAGERS_CONFIG;
}

async function loadDraftOrder2026() {
  if (DRAFT_ORDER_2026) return DRAFT_ORDER_2026;

  try {
    let resp = await fetch('./data/draft_order_2026.json', { cache: 'no-store' });
    if (!resp.ok && window.FBPHub?.config?.githubRaw) {
      resp = await fetch(`${FBPHub.config.githubRaw}draft_order_2026.json`, { cache: 'no-store' });
    }
    if (!resp.ok) throw new Error('Failed to load data/draft_order_2026.json');

    const json = await resp.json();
    DRAFT_ORDER_2026 = Array.isArray(json) ? json : [];
    KEEPER_PICKS = DRAFT_ORDER_2026.filter((p) => p && p.draft === 'keeper');
  } catch (e) {
    console.warn('Trade Portal: draft_order_2026.json unavailable; pick trading disabled until data is synced', e);
    DRAFT_ORDER_2026 = [];
    KEEPER_PICKS = [];
  }

  return DRAFT_ORDER_2026;
}

function getTeamName(teamAbbr) {
  const meta = MANAGERS_CONFIG?.teams?.[teamAbbr];
  return meta?.name || teamAbbr;
}

function getWizbucksBalance(teamAbbr) {
  const wiz = window.FBPHub?.data?.wizbucks || {};
  const name = getTeamName(teamAbbr);
  if (Object.prototype.hasOwnProperty.call(wiz, name)) return wiz[name];
  if (Object.prototype.hasOwnProperty.call(wiz, teamAbbr)) return wiz[teamAbbr];
  return 0;
}

function getTeamOptions(exclude = []) {
  const excludeSet = new Set(exclude.map((t) => String(t).toUpperCase()));

  const teamsObj = MANAGERS_CONFIG?.teams || {};
  const abbrs = Object.keys(teamsObj).map((t) => String(t).toUpperCase());

  // fallback: if config is empty, derive from auth.js mapping
  const fallbackMapping = (typeof MANAGER_MAPPING !== 'undefined') ? MANAGER_MAPPING : (window.MANAGER_MAPPING || {});
  const effective = abbrs.length ? abbrs : Array.from(new Set(Object.values(fallbackMapping)));

  return effective
    .filter((abbr) => abbr && !excludeSet.has(abbr))
    .sort()
    .map((abbr) => ({ abbr, name: getTeamName(abbr) }));
}

function resetTradeStateButKeepTeams() {
  TRADE_STATE.transfers = [];
  TRADE_STATE.currentToTeamKey = null;
  TRADE_STATE.currentFromTeam = null;
}

function clearTrade() {
  TRADE_STATE.teams.team2 = null;
  TRADE_STATE.teams.team3 = null;
  TRADE_STATE.teamCount = 2;
  resetTradeStateButKeepTeams();

  const team2Select = document.getElementById('team2Select');
  if (team2Select) team2Select.value = '';
  const team3Select = document.getElementById('team3Select');
  if (team3Select) team3Select.value = '';

  setTeamCount(2);
  displayTradeBuilder();
  showToast('Trade cleared', 'success');
}

function setTeamCount(count) {
  TRADE_STATE.teamCount = count;

  // toggle UI
  document.querySelectorAll('.team-count-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.count === String(count));
  });

  const team3Column = document.getElementById('team3Column');
  if (team3Column) team3Column.style.display = count === 3 ? 'block' : 'none';

  const grid = document.getElementById('tradeBuilderGrid');
  if (grid) {
    grid.classList.remove('two-team', 'three-team');
    grid.classList.add(count === 2 ? 'two-team' : 'three-team');
  }

  // if switching back to 2-team, drop team3 + any transfers involving team3
  if (count === 2) {
    const team3 = TRADE_STATE.teams.team3;
    TRADE_STATE.teams.team3 = null;
    if (team3) {
      TRADE_STATE.transfers = TRADE_STATE.transfers.filter((t) => t.from_team !== team3 && t.to_team !== team3);
    }

    const team3Select = document.getElementById('team3Select');
    if (team3Select) team3Select.value = '';
  }

  displayTradeBuilder();
}

function populateTeamSelectors() {
  const userAbbr = TRADE_STATE.userTeam?.abbreviation;

  const options = getTeamOptions([userAbbr]).map((t) => {
    return `<option value=\"${t.abbr}\">${t.abbr} - ${t.name}</option>`;
  }).join('');

  const team2Select = document.getElementById('team2Select');
  if (team2Select) team2Select.innerHTML = '<option value=\"\">Select Team...</option>' + options;

  const team3Select = document.getElementById('team3Select');
  if (team3Select) team3Select.innerHTML = '<option value=\"\">Select Team...</option>' + options;
}

function setTeamSelectionDirect(teamKey, abbr) {
  const normalized = (abbr || '').toUpperCase();
  const selectEl = document.getElementById(`${teamKey}Select`);
  if (selectEl) {
    selectEl.value = normalized;
  }

  TRADE_STATE.teams[teamKey] = normalized || null;

  const addPlayerBtn = document.getElementById(`${teamKey}AddPlayer`);
  const addPickBtn = document.getElementById(`${teamKey}AddPick`);
  const addWBBtn = document.getElementById(`${teamKey}AddWB`);
  if (addPlayerBtn) addPlayerBtn.disabled = !TRADE_STATE.teams[teamKey];
  if (addPickBtn) addPickBtn.disabled = !TRADE_STATE.teams[teamKey];
  if (addWBBtn) addWBBtn.disabled = !TRADE_STATE.teams[teamKey];
}

function applyTradePrefillFromStorage() {
  if (!TRADE_STATE.userTeam?.abbreviation) return;

  let raw = null;
  try {
    raw = localStorage.getItem(TRADE_PREFILL_KEY);
  } catch (e) {
    return;
  }

  if (!raw) return;

  let prefill = null;
  try {
    prefill = JSON.parse(raw);
  } catch (e) {
    localStorage.removeItem(TRADE_PREFILL_KEY);
    return;
  }

  // Always clear so a broken prefill doesn't keep reapplying
  localStorage.removeItem(TRADE_PREFILL_KEY);

  const user = TRADE_STATE.userTeam.abbreviation.toUpperCase();
  let teams = Array.isArray(prefill?.teams) ? prefill.teams.map((t) => String(t || '').toUpperCase()).filter(Boolean) : [];
  const transfers = Array.isArray(prefill?.transfers) ? prefill.transfers : [];

  // Normalize to [USER, other...] and max 3 teams
  teams = [user, ...teams.filter((t) => t !== user)];
  teams = Array.from(new Set(teams)).slice(0, 3);

  if (teams.length < 2 || transfers.length < 1) {
    return;
  }

  // Set count first (this will hide/show the 3rd column)
  setTeamCount(teams.length === 3 ? 3 : 2);

  // Directly set team2/team3 selections
  setTeamSelectionDirect('team2', teams[1]);
  if (teams.length === 3) {
    setTeamSelectionDirect('team3', teams[2]);
  }

  // Apply transfers + filter to selected teams
  const activeTeams = activeTeamKeys().map((k) => teamKeyToAbbr(k)).filter(Boolean);
  TRADE_STATE.transfers = transfers
    .map((t) => ({
      ...t,
      type: t.type,
      upid: t.upid ? String(t.upid) : undefined,
      amount: (t.amount !== undefined && t.amount !== null) ? parseInt(t.amount, 10) : undefined,
      draft: t.draft,
      round: (t.round !== undefined && t.round !== null) ? parseInt(t.round, 10) : undefined,
      pick: (t.pick !== undefined && t.pick !== null) ? parseInt(t.pick, 10) : undefined,
      from_team: t.from_team ? String(t.from_team).toUpperCase() : undefined,
      to_team: t.to_team ? String(t.to_team).toUpperCase() : undefined,
    }))
    .filter((t) => t && t.type && t.from_team && t.to_team && activeTeams.includes(t.from_team) && activeTeams.includes(t.to_team));

  displayTradeBuilder();
  showToast('Added player to trade. Review and submit when ready.', 'success');
}

function handleTeamSelect(teamKey) {
  const el = document.getElementById(`${teamKey}Select`);
  if (!el) return;

  const value = String(el.value || '').toUpperCase();
  TRADE_STATE.teams[teamKey] = value || null;

  // prevent duplicates
  const chosen = activeTeamKeys().map((k) => teamKeyToAbbr(k)).filter(Boolean);
  if (new Set(chosen).size !== chosen.length) {
    TRADE_STATE.teams[teamKey] = null;
    el.value = '';
    showToast('Team already selected', 'error');
    return;
  }

  // enable buttons
  const addPlayerBtn = document.getElementById(`${teamKey}AddPlayer`);
  const addPickBtn = document.getElementById(`${teamKey}AddPick`);
  const addWBBtn = document.getElementById(`${teamKey}AddWB`);
  if (addPlayerBtn) addPlayerBtn.disabled = !TRADE_STATE.teams[teamKey];
  if (addPickBtn) addPickBtn.disabled = !TRADE_STATE.teams[teamKey];
  if (addWBBtn) addWBBtn.disabled = !TRADE_STATE.teams[teamKey];

  // remove transfers for unselected teams
  const teams = activeTeamKeys().map((k) => teamKeyToAbbr(k)).filter(Boolean);
  TRADE_STATE.transfers = TRADE_STATE.transfers.filter((t) => teams.includes(t.from_team) && teams.includes(t.to_team));

  displayTradeBuilder();
}

function updateSubmitButton() {
  const teams = activeTeamKeys().map((k) => teamKeyToAbbr(k));
  const hasTeam2 = !!TRADE_STATE.teams.team2;
  const hasTeam3 = TRADE_STATE.teamCount === 2 ? true : !!TRADE_STATE.teams.team3;
  const hasTransfers = TRADE_STATE.transfers.length > 0;

  const canSubmit = !!teams[0] && hasTeam2 && hasTeam3 && hasTransfers;
  const btn = document.getElementById('submitTradeBtn');
  if (btn) btn.disabled = !canSubmit;
}

function contractTagForPlayer(p) {
  const type = String(p?.player_type || '').toLowerCase();
  if (type === 'farm') {
    const raw = String(p?.contract_type || 'Development Cont.').toLowerCase();
    if (raw.includes('blue') && raw.includes('chip')) return 'BC';
    if (raw.includes('purchased')) return 'PC';
    return 'DC';
  }
  return p?.years_simple || 'N/A';
}

function formatPlayerLabel(p) {
  return `${p.position || 'N/A'} ${p.name} [${p.team || 'FA'}] [${contractTagForPlayer(p)}]`;
}

function formatTransferLabel(t) {
  if (t.type === 'player') {
    const p = FBPHub.data.players.find((x) => String(x.upid) === String(t.upid));
    return p ? formatPlayerLabel(p) : `UPID ${t.upid}`;
  }
  if (t.type === 'draft_pick') {
    const r = parseInt(t.round, 10);
    const k = parseInt(t.pick, 10);
    return `Keeper Pick R${r} P${k} → ${t.to_team} (from ${t.from_team})`;
  }
  if (t.type === 'wizbucks') {
    return `$${t.amount} WB → ${t.to_team} (from ${t.from_team})`;
  }
  return '';
}

function renderTransferItem(t, idx, showRemove = true) {
  if (t.type === 'player') {
    const p = FBPHub.data.players.find((x) => String(x.upid) === String(t.upid));
    const label = p ? formatPlayerLabel(p) : `UPID ${t.upid}`;
    return `
      <div class="trade-asset-card">
        ${p ? createPlayerAvatarHTML(p, 36) : ''}
        <div class="trade-asset-info">
          <div class="trade-asset-name">${label}</div>
          <div class="trade-asset-meta"><span>from ${t.from_team}</span></div>
        </div>
        ${showRemove ? `<button class="btn-remove-asset" onclick="removeTransfer(${idx})"><i class="fas fa-times"></i></button>` : ''}
      </div>
    `;
  }

  if (t.type === 'draft_pick') {
    const r = parseInt(t.round, 10);
    const k = parseInt(t.pick, 10);
    return `
      <div class="trade-asset-card">
        <div class="trade-asset-info">
          <div class="trade-asset-name">Keeper Pick R${r} P${k}</div>
          <div class="trade-asset-meta"><span>from ${t.from_team}</span></div>
        </div>
        ${showRemove ? `<button class="btn-remove-asset" onclick="removeTransfer(${idx})"><i class="fas fa-times"></i></button>` : ''}
      </div>
    `;
  }

  if (t.type === 'wizbucks') {
    return `
      <div class="trade-asset-card">
        <div class="trade-asset-wb">$${t.amount} WB <span style="color: var(--text-gray);">from ${t.from_team}</span></div>
        ${showRemove ? `<button class="btn-remove-asset" onclick="removeTransfer(${idx})"><i class="fas fa-times"></i></button>` : ''}
      </div>
    `;
  }

  return '';
}

function removeTransfer(idx) {
  TRADE_STATE.transfers.splice(idx, 1);
  displayTradeBuilder();
}

function transfersForToTeam(teamAbbr) {
  return TRADE_STATE.transfers.filter((t) => t.to_team === teamAbbr);
}

function displayTradeBuilder() {
  for (const teamKey of ['team1', 'team2', 'team3']) {
    const abbr = teamKeyToAbbr(teamKey);
    const list = document.getElementById(`${teamKey}ReceiveList`);
    if (!list) continue;

    if (!abbr) {
      list.innerHTML = '<div class="empty-trade-list">Select team first...</div>';
      continue;
    }

    const items = TRADE_STATE.transfers
      .map((t, idx) => ({ t, idx }))
      .filter(({ t }) => t.to_team === abbr);

    if (items.length === 0) {
      list.innerHTML = '<div class="empty-trade-list">Add players, picks, or WizBucks...</div>';
      continue;
    }

    list.innerHTML = items.map(({ t, idx }) => renderTransferItem(t, idx, true)).join('');
  }

  updateSubmitButton();
}

function getFromTeamOptionsFor(toTeamAbbr) {
  const teams = activeTeamKeys().map((k) => teamKeyToAbbr(k)).filter(Boolean);
  return teams.filter((abbr) => abbr !== toTeamAbbr);
}

function showPlayerPicker(toTeamKey) {
  const toTeamAbbr = teamKeyToAbbr(toTeamKey);
  if (!toTeamAbbr) {
    showToast('Select team first', 'error');
    return;
  }

  TRADE_STATE.currentToTeamKey = toTeamKey;
  PLAYER_PICKER_SELECTED = new Set();

  const fromOptions = getFromTeamOptionsFor(toTeamAbbr);
  if (!fromOptions.length) {
    showToast('Select another team first', 'error');
    return;
  }

  const fromSelect = document.getElementById('playerPickerFromTeam');
  if (!fromSelect) return;

  fromSelect.innerHTML = fromOptions.map((abbr) => `<option value="${abbr}">${abbr} - ${getTeamName(abbr)}</option>`).join('');

  // default from-team
  TRADE_STATE.currentFromTeam = fromOptions[0] || null;
  fromSelect.value = TRADE_STATE.currentFromTeam || '';

  loadPlayerPickerRoster();

  document.getElementById('playerPickerModal').classList.add('active');
  document.getElementById('playerPickerSearch').value = '';
  document.getElementById('playerPickerTypeFilter').value = 'all';
  document.getElementById('playerPickerPosFilter').value = 'all';
  displayPlayerPickerResults();
  document.getElementById('playerPickerSearch').oninput = filterPlayerPicker;
}

function onPlayerPickerFromTeamChange() {
  const el = document.getElementById('playerPickerFromTeam');
  TRADE_STATE.currentFromTeam = el ? String(el.value || '').toUpperCase() : null;
  PLAYER_PICKER_SELECTED = new Set();
  loadPlayerPickerRoster();
  filterPlayerPicker();
  updatePlayerPickerAddButton();
}

function loadPlayerPickerRoster() {
  const fromTeam = TRADE_STATE.currentFromTeam;
  if (!fromTeam) {
    PLAYER_PICKER_ROSTER = [];
    return;
  }

  PLAYER_PICKER_ROSTER = (FBPHub.data.players || []).filter((p) => {
    const owner = String(p.FBP_Team || '').toUpperCase();
    return owner === fromTeam;
  });
}

function closePlayerPicker() {
  document.getElementById('playerPickerModal').classList.remove('active');
  PLAYER_PICKER_SELECTED = new Set();
  updatePlayerPickerAddButton();
}

function filterPlayerPicker() {
  const query = (document.getElementById('playerPickerSearch').value || '').toLowerCase();
  const typeFilter = document.getElementById('playerPickerTypeFilter').value;
  const posFilter = document.getElementById('playerPickerPosFilter').value;

  let filtered = PLAYER_PICKER_ROSTER;

  if (query) {
    filtered = filtered.filter((p) =>
      String(p.name || '').toLowerCase().includes(query) ||
      String(p.team || '').toLowerCase().includes(query)
    );
  }

  if (typeFilter !== 'all') {
    filtered = filtered.filter((p) => p.player_type === typeFilter);
  }

  if (posFilter !== 'all') {
    filtered = filtered.filter((p) => String(p.position || '').split(',').includes(posFilter));
  }

  displayPlayerPickerResults(filtered);
}

function displayPlayerPickerResults(players = PLAYER_PICKER_ROSTER) {
  const container = document.getElementById('playerPickerResults');
  if (!container) return;

  if (!players.length) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-search"></i><p>No players found</p></div>';
    updatePlayerPickerAddButton();
    return;
  }

  container.innerHTML = players.map((p) => {
    const upid = String(p.upid);
    const alreadyInTrade = TRADE_STATE.transfers.some((t) => t.type === 'player' && String(t.upid) === upid);
    const isChecked = PLAYER_PICKER_SELECTED.has(upid);
    const contract = contractTagForPlayer(p);

    return `
      <div class="player-result-card" onclick="selectPlayer('${upid}')">
        <div class="player-result-select">
          <input
            type="checkbox"
            class="player-select-checkbox"
            data-upid="${upid}"
            ${alreadyInTrade ? 'disabled' : ''}
            ${isChecked ? 'checked' : ''}
            onclick="togglePlayerSelection(event, '${upid}')"
          />
        </div>
        ${createPlayerAvatarHTML(p, 36)}
        <div class="player-result-info">
          <div class="player-result-name">${p.name}</div>
          <div class="player-result-meta">
            <span>${p.position || 'N/A'}</span>
            <span>${p.team || 'FA'}</span>
            <span>${contract}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  updatePlayerPickerAddButton();
}

function togglePlayerSelection(evt, upid) {
  try { evt.stopPropagation(); } catch (e) {}
  const key = String(upid);

  // Don't allow selecting players already in trade.
  if (TRADE_STATE.transfers.some((t) => t.type === 'player' && String(t.upid) === key)) {
    return;
  }

  if (PLAYER_PICKER_SELECTED.has(key)) {
    PLAYER_PICKER_SELECTED.delete(key);
  } else {
    PLAYER_PICKER_SELECTED.add(key);
  }

  updatePlayerPickerAddButton();
}

function updatePlayerPickerAddButton() {
  const btn = document.getElementById('playerPickerAddSelectedBtn');
  if (!btn) return;

  const count = PLAYER_PICKER_SELECTED.size;
  btn.disabled = count === 0;
  btn.innerHTML = `<i class="fas fa-check"></i> Add Selected${count ? ` (${count})` : ''}`;
}

function confirmSelectedPlayers() {
  const toTeamAbbr = teamKeyToAbbr(TRADE_STATE.currentToTeamKey);
  const fromTeam = TRADE_STATE.currentFromTeam;

  if (!toTeamAbbr || !fromTeam) {
    showToast('Missing from/to team', 'error');
    return;
  }

  const selected = Array.from(PLAYER_PICKER_SELECTED);
  if (!selected.length) {
    showToast('No players selected', 'warning');
    return;
  }

  let added = 0;
  for (const upid of selected) {
    if (TRADE_STATE.transfers.some((t) => t.type === 'player' && String(t.upid) === String(upid))) {
      continue;
    }
    TRADE_STATE.transfers.push({
      type: 'player',
      upid: String(upid),
      from_team: fromTeam,
      to_team: toTeamAbbr,
    });
    added += 1;
  }

  PLAYER_PICKER_SELECTED = new Set();
  closePlayerPicker();
  displayTradeBuilder();
  showToast(added ? `Added ${added} player${added === 1 ? '' : 's'}` : 'No players added', added ? 'success' : 'warning');
}

function selectPlayer(upid) {
  // Row click toggles selection for multi-add.
  const key = String(upid);

  // Don't allow selecting players already in trade.
  if (TRADE_STATE.transfers.some((t) => t.type === 'player' && String(t.upid) === key)) {
    showToast('Player already included in this trade', 'warning');
    return;
  }

  if (PLAYER_PICKER_SELECTED.has(key)) {
    PLAYER_PICKER_SELECTED.delete(key);
  } else {
    PLAYER_PICKER_SELECTED.add(key);
  }

  // Keep checkbox UI in sync without re-rendering the list.
  const cb = document.querySelector(`input.player-select-checkbox[data-upid="${key}"]`);
  if (cb && !cb.disabled) {
    cb.checked = PLAYER_PICKER_SELECTED.has(key);
  }

  updatePlayerPickerAddButton();
}

function pickKey(round, pick) {
  return `${parseInt(round, 10)}:${parseInt(pick, 10)}`;
}

function loadPickPickerPicks() {
  const fromTeam = TRADE_STATE.currentFromTeam;
  if (!fromTeam) {
    PICK_PICKER_PICKS = [];
    return;
  }

  const upper = String(fromTeam).toUpperCase();
  PICK_PICKER_PICKS = (KEEPER_PICKS || [])
    .filter((p) => p && String(p.current_owner || '').toUpperCase() === upper)
    .filter((p) => {
      const r = parseInt(p.round, 10);
      return r >= 1 && r <= 15;
    })
    .filter((p) => !p.taxed_out)
    .filter((p) => !p.result)
    .sort((a, b) => (parseInt(a.round, 10) - parseInt(b.round, 10)) || (parseInt(a.pick, 10) - parseInt(b.pick, 10)));
}

function showPickPicker(toTeamKey) {
  const toTeamAbbr = teamKeyToAbbr(toTeamKey);
  if (!toTeamAbbr) {
    showToast('Select team first', 'error');
    return;
  }

  if (!Array.isArray(KEEPER_PICKS) || KEEPER_PICKS.length === 0) {
    showToast('Draft pick data not available yet. Sync draft_order_2026.json and refresh.', 'error');
    return;
  }

  TRADE_STATE.currentToTeamKey = toTeamKey;
  PICK_PICKER_SELECTED = new Set();

  const fromOptions = getFromTeamOptionsFor(toTeamAbbr);
  if (!fromOptions.length) {
    showToast('Select another team first', 'error');
    return;
  }

  const fromSelect = document.getElementById('pickPickerFromTeam');
  if (!fromSelect) return;

  fromSelect.innerHTML = fromOptions.map((abbr) => `<option value="${abbr}">${abbr} - ${getTeamName(abbr)}</option>`).join('');

  // default from-team
  TRADE_STATE.currentFromTeam = fromOptions[0] || null;
  fromSelect.value = TRADE_STATE.currentFromTeam || '';

  loadPickPickerPicks();

  document.getElementById('pickPickerModal').classList.add('active');
  document.getElementById('pickPickerSearch').value = '';
  document.getElementById('pickPickerRoundFilter').value = 'all';
  document.getElementById('pickPickerBuyinFilter').value = 'all';
  displayPickPickerResults();
  document.getElementById('pickPickerSearch').oninput = filterPickPicker;
}

function onPickPickerFromTeamChange() {
  const el = document.getElementById('pickPickerFromTeam');
  TRADE_STATE.currentFromTeam = el ? String(el.value || '').toUpperCase() : null;
  PICK_PICKER_SELECTED = new Set();
  loadPickPickerPicks();
  filterPickPicker();
  updatePickPickerAddButton();
}

function closePickPicker() {
  document.getElementById('pickPickerModal').classList.remove('active');
  PICK_PICKER_SELECTED = new Set();
  updatePickPickerAddButton();
}

function filterPickPicker() {
  const query = (document.getElementById('pickPickerSearch').value || '').toLowerCase().trim();
  const roundFilter = document.getElementById('pickPickerRoundFilter').value;
  const buyinFilter = document.getElementById('pickPickerBuyinFilter').value;

  let filtered = PICK_PICKER_PICKS;

  if (query) {
    filtered = filtered.filter((p) => {
      const r = parseInt(p.round, 10);
      const k = parseInt(p.pick, 10);
      const key = `r${r} p${k}`;
      return key.includes(query) || String(r).includes(query) || String(k).includes(query);
    });
  }

  if (roundFilter !== 'all') {
    filtered = filtered.filter((p) => parseInt(p.round, 10) === parseInt(roundFilter, 10));
  }

  if (buyinFilter !== 'all') {
    filtered = filtered.filter((p) => {
      const r = parseInt(p.round, 10);
      const purchased = !!p.buyin_purchased;
      const required = !!p.buyin_required;

      if (buyinFilter === 'needs_buyin') return r <= 3 && required && !purchased;
      if (buyinFilter === 'buyin_purchased') return r <= 3 && required && purchased;
      if (buyinFilter === 'no_buyin') return r > 3 || !required;
      return true;
    });
  }

  displayPickPickerResults(filtered);
}

function displayPickPickerResults(picks = PICK_PICKER_PICKS) {
  const container = document.getElementById('pickPickerResults');
  if (!container) return;

  if (!picks.length) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-search"></i><p>No picks found</p></div>';
    updatePickPickerAddButton();
    return;
  }

  container.innerHTML = picks.map((p) => {
    const r = parseInt(p.round, 10);
    const k = parseInt(p.pick, 10);
    const key = pickKey(r, k);

    const alreadyInTrade = TRADE_STATE.transfers.some((t) => t.type === 'draft_pick' && parseInt(t.round, 10) === r && parseInt(t.pick, 10) === k);
    const isChecked = PICK_PICKER_SELECTED.has(key);

    const required = !!p.buyin_required;
    const purchased = !!p.buyin_purchased;
    const cost = p.buyin_cost;

    let buyinTag = `<span class="pick-tag no-buyin">No Buy-In</span>`;
    if (r <= 3 && required && !purchased) buyinTag = `<span class="pick-tag buyin-needed">Needs Buy-In ($${cost})</span>`;
    if (r <= 3 && required && purchased) buyinTag = `<span class="pick-tag buyin-purchased">Buy-In Purchased</span>`;

    const traded = !!p.traded || String(p.original_owner || '').toUpperCase() !== String(p.current_owner || '').toUpperCase();
    const tradedTag = traded ? `<span class="pick-tag traded">Traded</span>` : '';

    return `
      <div class="pick-result-card ${alreadyInTrade ? 'disabled' : ''}" onclick="selectPick(${r}, ${k})">
        <div class="pick-result-select">
          <input
            type="checkbox"
            class="pick-select-checkbox"
            data-pickkey="${key}"
            ${alreadyInTrade ? 'disabled' : ''}
            ${isChecked ? 'checked' : ''}
            onclick="togglePickSelection(event, ${r}, ${k})"
          />
        </div>
        <div class="pick-result-info">
          <div class="pick-result-name">Keeper Pick R${r} P${k}</div>
          <div class="pick-result-meta">
            ${buyinTag}
            ${tradedTag}
          </div>
        </div>
      </div>
    `;
  }).join('');

  updatePickPickerAddButton();
}

function togglePickSelection(evt, round, pick) {
  try { evt.stopPropagation(); } catch (e) {}

  const key = pickKey(round, pick);
  if (TRADE_STATE.transfers.some((t) => t.type === 'draft_pick' && pickKey(t.round, t.pick) === key)) {
    return;
  }

  if (PICK_PICKER_SELECTED.has(key)) {
    PICK_PICKER_SELECTED.delete(key);
  } else {
    PICK_PICKER_SELECTED.add(key);
  }

  updatePickPickerAddButton();
}

function updatePickPickerAddButton() {
  const btn = document.getElementById('pickPickerAddSelectedBtn');
  if (!btn) return;

  const count = PICK_PICKER_SELECTED.size;
  btn.disabled = count === 0;
  btn.innerHTML = `<i class="fas fa-check"></i> Add Selected${count ? ` (${count})` : ''}`;
}

function confirmSelectedPicks() {
  const toTeamAbbr = teamKeyToAbbr(TRADE_STATE.currentToTeamKey);
  const fromTeam = TRADE_STATE.currentFromTeam;

  if (!toTeamAbbr || !fromTeam) {
    showToast('Missing from/to team', 'error');
    return;
  }

  const selected = Array.from(PICK_PICKER_SELECTED);
  if (!selected.length) {
    showToast('No picks selected', 'warning');
    return;
  }

  let added = 0;
  for (const key of selected) {
    const parts = String(key).split(':');
    const r = parseInt(parts[0], 10);
    const k = parseInt(parts[1], 10);

    if (TRADE_STATE.transfers.some((t) => t.type === 'draft_pick' && parseInt(t.round, 10) === r && parseInt(t.pick, 10) === k)) {
      continue;
    }

    TRADE_STATE.transfers.push({
      type: 'draft_pick',
      draft: 'keeper',
      round: r,
      pick: k,
      from_team: fromTeam,
      to_team: toTeamAbbr,
    });

    added += 1;
  }

  PICK_PICKER_SELECTED = new Set();
  closePickPicker();
  displayTradeBuilder();
  showToast(added ? `Added ${added} pick${added === 1 ? '' : 's'}` : 'No picks added', added ? 'success' : 'warning');
}

function selectPick(round, pick) {
  const key = pickKey(round, pick);

  if (TRADE_STATE.transfers.some((t) => t.type === 'draft_pick' && pickKey(t.round, t.pick) === key)) {
    showToast('Pick already included in this trade', 'warning');
    return;
  }

  if (PICK_PICKER_SELECTED.has(key)) {
    PICK_PICKER_SELECTED.delete(key);
  } else {
    PICK_PICKER_SELECTED.add(key);
  }

  const cb = document.querySelector(`input.pick-select-checkbox[data-pickkey="${key}"]`);
  if (cb && !cb.disabled) {
    cb.checked = PICK_PICKER_SELECTED.has(key);
  }

  updatePickPickerAddButton();
}

function showWBPicker(toTeamKey) {
  const toTeamAbbr = teamKeyToAbbr(toTeamKey);
  if (!toTeamAbbr) {
    showToast('Select team first', 'error');
    return;
  }

  TRADE_STATE.currentToTeamKey = toTeamKey;

  const fromOptions = getFromTeamOptionsFor(toTeamAbbr);
  if (!fromOptions.length) {
    showToast('Select another team first', 'error');
    return;
  }

  const fromSelect = document.getElementById('wbFromTeam');
  if (!fromSelect) return;

  fromSelect.innerHTML = fromOptions.map((abbr) => `<option value="${abbr}">${abbr} - ${getTeamName(abbr)}</option>`).join('');
  TRADE_STATE.currentFromTeam = fromOptions[0] || null;
  fromSelect.value = TRADE_STATE.currentFromTeam || '';

  onWBFromTeamChange();

  document.getElementById('wbAmount').value = '';
  document.getElementById('wbPickerModal').classList.add('active');
}

function onWBFromTeamChange() {
  const fromSelect = document.getElementById('wbFromTeam');
  TRADE_STATE.currentFromTeam = fromSelect ? String(fromSelect.value || '').toUpperCase() : null;

  const fromTeam = TRADE_STATE.currentFromTeam;
  const available = fromTeam ? getWizbucksBalance(fromTeam) : 0;

  const availableEl = document.getElementById('wbPickerAvailable');
  if (availableEl) availableEl.textContent = `$${available}`;

  const amountEl = document.getElementById('wbAmount');
  if (amountEl) amountEl.max = available;
}

function closeWBPicker() {
  document.getElementById('wbPickerModal').classList.remove('active');
}

function confirmWB() {
  const amount = parseInt(document.getElementById('wbAmount').value, 10);
  const toTeamAbbr = teamKeyToAbbr(TRADE_STATE.currentToTeamKey);
  const fromTeam = TRADE_STATE.currentFromTeam;

  if (!toTeamAbbr || !fromTeam) {
    showToast('Missing from/to team', 'error');
    return;
  }

  if (!amount || amount < 5) {
    showToast('Minimum $5', 'error');
    return;
  }

  if (amount % 5 !== 0) {
    showToast('Must be $5 increments', 'error');
    return;
  }

  const available = getWizbucksBalance(fromTeam);
  if (amount > available) {
    showToast('Exceeds available balance', 'error');
    return;
  }

  TRADE_STATE.transfers.push({
    type: 'wizbucks',
    amount,
    from_team: fromTeam,
    to_team: toTeamAbbr,
  });

  closeWBPicker();
  displayTradeBuilder();
  showToast('WizBucks added', 'success');
}

function buildPreviewReceives() {
  const receives = {};
  const teams = activeTeamKeys().map((k) => teamKeyToAbbr(k)).filter(Boolean);

  teams.forEach((t) => { receives[t] = []; });

  TRADE_STATE.transfers.forEach((t) => {
    if (!receives[t.to_team]) receives[t.to_team] = [];

    if (t.type === 'player') {
      const p = FBPHub.data.players.find((x) => String(x.upid) === String(t.upid));
      receives[t.to_team].push(p ? formatPlayerLabel(p) : `UPID ${t.upid}`);
    } else if (t.type === 'draft_pick') {
      receives[t.to_team].push(`Keeper Pick R${parseInt(t.round, 10)} P${parseInt(t.pick, 10)} via ${t.from_team}`);
    } else if (t.type === 'wizbucks') {
      receives[t.to_team].push(`$${t.amount} WB via ${t.from_team}`);
    }
  });

  return receives;
}

function previewTrade() {
  const teams = activeTeamKeys().map((k) => teamKeyToAbbr(k)).filter(Boolean);
  const receives = buildPreviewReceives();

  const previewHTML = teams.map((abbr) => {
    const lines = receives[abbr] || [];
    return `
      <div class="trade-preview-column">
        <h4>${abbr} - ${getTeamName(abbr)}</h4>
        <div class="trade-preview-section get">
          <h5><i class="fas fa-arrow-left"></i> RECEIVE</h5>
          <ul>
            ${lines.length ? lines.map((l) => `<li>${l}</li>`).join('') : '<li style="color: var(--text-gray)">Nothing</li>'}
          </ul>
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('tradePreviewGrid').innerHTML = previewHTML;

  const recipients = teams
    .filter((t) => t !== TRADE_STATE.userTeam.abbreviation)
    .map((t) => getTeamName(t))
    .join(' and ');
  document.getElementById('previewRecipients').textContent = recipients;

  document.getElementById('tradePreviewModal').classList.add('active');
}

function closePreview() {
  document.getElementById('tradePreviewModal').classList.remove('active');
}

async function submitTrade() {
  const btn = document.getElementById('confirmSubmitBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

  let didSend = false;

  try {
    const teams = activeTeamKeys().map((k) => teamKeyToAbbr(k)).filter(Boolean);

    const payload = {
      teams,
      transfers: TRADE_STATE.transfers.map((t) => {
        if (t.type === 'player') {
          return { type: 'player', upid: t.upid, from_team: t.from_team, to_team: t.to_team };
        }
        if (t.type === 'draft_pick') {
          return {
            type: 'draft_pick',
            draft: 'keeper',
            round: parseInt(t.round, 10),
            pick: parseInt(t.pick, 10),
            from_team: t.from_team,
            to_team: t.to_team,
          };
        }
        return { type: 'wizbucks', amount: t.amount, from_team: t.from_team, to_team: t.to_team };
      }),
    };

    const session = authManager.getSession();
    const resp = await fetch(`${AUTH_CONFIG.workerUrl}/api/trade/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(data.detail || data.error || 'Trade submission failed');
    }

    didSend = true;

    // Close immediately on success (some browsers can fail to repaint if we wait
    // for downstream UI updates).
    closePreview();

    showToast('✅ Trade sent! Check Discord for the approval thread.', 'success');

    resetTradeStateButKeepTeams();
    displayTradeBuilder();

    await loadTradeQueue();
  } catch (e) {
    console.error('Trade submit failed', e);
    showToast(`Submission failed: ${e.message}`, 'error');
  } finally {
    // Safety: ensure preview is not left open after a successful send.
    if (didSend) {
      try { closePreview(); } catch (e) {}
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send';
  }
}

// ==============================
// INBOX / QUEUE / HISTORY
// ==============================

async function loadTradeQueue() {
  try {
    const session = authManager.getSession();
    const resp = await fetch(`${AUTH_CONFIG.workerUrl}/api/trade/queue`, {
      headers: { 'Authorization': `Bearer ${session.token}` },
    });

    if (!resp.ok) throw new Error('Failed to load trade queue');
    const data = await resp.json();

    const trades = data.trades || [];
    displayTradeQueue(trades);

    document.getElementById('sentTradesCount').textContent = `${trades.length}/12`;
    document.getElementById('queueCountBadge').textContent = `${trades.length}/12`;
  } catch (e) {
    console.error('Error loading queue', e);
    document.getElementById('tradeQueueList').innerHTML = `
      <div class="empty-state">
        <i class="fas fa-exclamation-triangle"></i>
        <p>Error loading offers</p>
      </div>
    `;
  }
}

function displayTradeQueue(trades) {
  const container = document.getElementById('tradeQueueList');

  if (!trades.length) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-paper-plane"></i>
        <p>No active offers</p>
      </div>
    `;
    return;
  }

  container.innerHTML = trades.map((trade) => {
    const expires = new Date(trade.expires_at);
    const daysLeft = Math.ceil((expires - new Date()) / (1000 * 60 * 60 * 24));
    const threadUrl = trade.discord?.thread_url || trade.discord_thread_url;

    return `
      <div class="trade-card">
        <div class="trade-card-header">
          <div class="trade-card-title">
            ${trade.trade_id} • ${trade.teams.join(' ↔ ')}
          </div>
          <div class="trade-card-meta">
            <span><i class="fas fa-clock"></i> ${formatShortDate(trade.created_at)}</span>
            <span class="trade-card-status ${trade.status}">${trade.status}</span>
          </div>
        </div>
        <div class="trade-card-body">
          ${renderReceivesBlocks(trade.receives || {})}
        </div>
        <div class="trade-card-footer">
          <span style="color: ${daysLeft <= 3 ? '#f44336' : 'var(--text-gray)'}">
            <i class="fas fa-hourglass-half"></i> Expires in ${daysLeft} days
          </span>
          <div class="trade-card-actions">
            ${threadUrl ? `
              <a href="${threadUrl}" target="_blank" class="btn-secondary btn-sm">
                <i class="fab fa-discord"></i> View in Discord
              </a>
            ` : ''}
            <button class="btn-danger btn-sm" onclick="withdrawTrade('${trade.trade_id}')">
              <i class="fas fa-trash"></i> Withdraw
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderReceivesBlocks(receives) {
  const teams = Object.keys(receives);
  return teams.map((abbr) => {
    const lines = receives[abbr] || [];
    return `
      <div class="trade-card-team">
        <h4>${abbr} receives:</h4>
        <ul>
          ${lines.length ? lines.map((l) => `<li>${l}</li>`).join('') : '<li style="color: var(--text-gray)">Nothing</li>'}
        </ul>
      </div>
    `;
  }).join('');
}

async function withdrawTrade(tradeId) {
  if (!confirm('Are you sure you want to withdraw this trade?')) return;

  try {
    const session = authManager.getSession();
    const resp = await fetch(`${AUTH_CONFIG.workerUrl}/api/trade/withdraw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.token}`,
      },
      body: JSON.stringify({ trade_id: tradeId }),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.detail || 'Failed to withdraw trade');

    showToast('Trade withdrawn', 'success');
    await loadTradeQueue();
  } catch (e) {
    console.error('Withdraw error', e);
    showToast(e.message || 'Failed to withdraw trade', 'error');
  }
}

async function loadTradeInbox() {
  try {
    const session = authManager.getSession();
    const resp = await fetch(`${AUTH_CONFIG.workerUrl}/api/trade/inbox`, {
      headers: { 'Authorization': `Bearer ${session.token}` },
    });
    if (!resp.ok) throw new Error('Failed to load inbox');

    const data = await resp.json();
    const trades = data.trades || [];

    displayTradeInbox(trades);

    const count = trades.length;
    document.getElementById('inboxCountBadge').textContent = `${count} offer${count !== 1 ? 's' : ''}`;

    if (count > 0) {
      document.getElementById('inboxCount').textContent = count;
      document.getElementById('tradeInboxAlert').style.display = 'flex';
    } else {
      document.getElementById('tradeInboxAlert').style.display = 'none';
    }
  } catch (e) {
    console.error('Inbox error', e);
    document.getElementById('tradeInboxList').innerHTML = `
      <div class="empty-state">
        <i class="fas fa-exclamation-triangle"></i>
        <p>Error loading trade offers</p>
      </div>
    `;
  }
}

function displayTradeInbox(trades) {
  const container = document.getElementById('tradeInboxList');

  if (!trades.length) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-inbox"></i>
        <p>No pending trade offers</p>
      </div>
    `;
    return;
  }

  container.innerHTML = trades.map((trade) => {
    const fromTeam = trade.initiator_team || trade.from_team || '---';
    const expires = new Date(trade.expires_at);
    const daysLeft = Math.ceil((expires - new Date()) / (1000 * 60 * 60 * 24));

    const myTeam = TRADE_STATE.userTeam.abbreviation;
    const myReceives = (trade.receives && trade.receives[myTeam]) ? trade.receives[myTeam] : [];

    const transfers = trade.transfers || [];
    const youSend = transfers.filter((t) => String(t?.from_team || '').toUpperCase() === myTeam);
    const sendLines = youSend.map((t) => formatTransferLabel(t)).filter(Boolean);

    return `
      <div class="trade-card">
        <div class="trade-card-header">
          <div class="trade-card-title">From: ${fromTeam} - ${getTeamName(fromTeam)}</div>
          <div class="trade-card-meta">
            <span><i class="fas fa-clock"></i> ${formatShortDate(trade.created_at)}</span>
            <span style="color: ${daysLeft <= 3 ? '#f44336' : 'var(--text-gray)'}">
              <i class="fas fa-hourglass-half"></i> ${daysLeft}d left
            </span>
          </div>
        </div>
        <div class="trade-card-body">
          <div class="trade-card-team">
            <h4>You receive (preview):</h4>
            <ul>
              ${myReceives.length ? myReceives.map((l) => `<li>${l}</li>`).join('') : '<li style="color: var(--text-gray)">Nothing</li>'}
            </ul>
          </div>
          <div class="trade-card-team">
            <h4>You send (preview):</h4>
            <ul>
              ${sendLines.length ? sendLines.map((l) => `<li>${l}</li>`).join('') : '<li style="color: var(--text-gray)">Nothing</li>'}
            </ul>
          </div>
        </div>
        <div class="trade-card-actions">
          <button class="btn-secondary btn-sm" onclick="viewInboxTrade('${trade.trade_id}')"><i class="fas fa-eye"></i> Review</button>
        </div>
      </div>
    `;
  }).join('');
}

async function viewInboxTrade(tradeId) {
  try {
    const session = authManager.getSession();
    const resp = await fetch(`${AUTH_CONFIG.workerUrl}/api/trade/inbox/${tradeId}`, {
      headers: { 'Authorization': `Bearer ${session.token}` },
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.detail || 'Failed to load trade details');

    TRADE_STATE.currentInboxTrade = data;

    document.getElementById('inboxTradeFrom').textContent = `From: ${(data.initiator_team || '---')} - ${getTeamName(data.initiator_team || '---')}`;
    document.getElementById('inboxTradeTime').textContent = formatShortDate(data.created_at);

    const expires = new Date(data.expires_at);
    document.getElementById('inboxTradeExpires').textContent = `Expires: ${expires.toLocaleDateString()}`;

    // Build preview
    const teams = data.teams || [];
    const receives = data.receives || {};

    const previewHTML = teams.map((abbr) => {
      const lines = receives[abbr] || [];
      return `
        <div class="trade-preview-column">
          <h4>${abbr} - ${getTeamName(abbr)}</h4>
          <div class="trade-preview-section get">
            <h5><i class="fas fa-arrow-left"></i> RECEIVE</h5>
            <ul>
              ${lines.length ? lines.map((l) => `<li>${l}</li>`).join('') : '<li style="color: var(--text-gray)">Nothing</li>'}
            </ul>
          </div>
        </div>
      `;
    }).join('');

    document.getElementById('inboxTradePreview').innerHTML = previewHTML;
    document.getElementById('inboxTradeModal').classList.add('active');
  } catch (e) {
    console.error('View inbox trade failed', e);
    showToast(e.message || 'Failed to load trade details', 'error');
  }
}

function closeInboxTradeModal() {
  document.getElementById('inboxTradeModal').classList.remove('active');
  TRADE_STATE.currentInboxTrade = null;
}

function quickAcceptTrade(tradeId) {
  viewInboxTrade(tradeId).then(() => acceptInboxTrade());
}

function acceptInboxTrade() {
  if (!TRADE_STATE.currentInboxTrade) return;

  const trade = TRADE_STATE.currentInboxTrade;
  const myTeam = TRADE_STATE.userTeam.abbreviation;

  const transfers = trade.transfers || [];
  const youReceive = transfers.filter((t) => String(t.to_team || '').toUpperCase() === myTeam);
  const youSend = transfers.filter((t) => String(t.from_team || '').toUpperCase() === myTeam);

  const receiveLines = youReceive.map((t) => formatTransferLabel(t)).filter(Boolean);
  const sendLines = youSend.map((t) => formatTransferLabel(t)).filter(Boolean);

  document.getElementById('acceptConfirmSummary').innerHTML = `
    <div class="trade-preview-section get">
      <h5>You will receive:</h5>
      <ul>
        ${receiveLines.length ? receiveLines.map((l) => `<li>${l}</li>`).join('') : '<li style="color: var(--text-gray)">Nothing</li>'}
      </ul>
    </div>
    <div class="trade-preview-section give">
      <h5>You will send:</h5>
      <ul>
        ${sendLines.length ? sendLines.map((l) => `<li>${l}</li>`).join('') : '<li style="color: var(--text-gray)">Nothing</li>'}
      </ul>
    </div>
  `;

  document.getElementById('inboxTradeModal').classList.remove('active');
  document.getElementById('acceptConfirmModal').classList.add('active');
}

function closeAcceptConfirm() {
  document.getElementById('acceptConfirmModal').classList.remove('active');
}

async function confirmAcceptTrade() {
  const btn = document.getElementById('confirmAcceptBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Accepting...';

  try {
    const session = authManager.getSession();
    const resp = await fetch(`${AUTH_CONFIG.workerUrl}/api/trade/accept`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.token}`,
      },
      body: JSON.stringify({ trade_id: TRADE_STATE.currentInboxTrade.trade_id }),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.detail || 'Failed to accept trade');

    closeAcceptConfirm();
    showToast('✅ Acceptance recorded. Check Discord thread for status.', 'success');

    await loadTradeInbox();
    await loadTradeQueue();
  } catch (e) {
    console.error('Accept failed', e);
    showToast(e.message || 'Failed to accept trade', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-check"></i> Confirm Accept';
  }
}

function quickRejectTrade(tradeId) {
  viewInboxTrade(tradeId).then(() => rejectInboxTrade());
}

function rejectInboxTrade() {
  document.getElementById('inboxTradeModal').classList.remove('active');
  document.getElementById('rejectReason').value = '';
  document.getElementById('rejectReasonModal').classList.add('active');
}

function closeRejectModal() {
  document.getElementById('rejectReasonModal').classList.remove('active');
}

async function confirmRejectTrade() {
  const reason = String(document.getElementById('rejectReason').value || '').trim();
  if (!reason) {
    showToast('Please provide a reason', 'error');
    return;
  }

  const btn = document.getElementById('confirmRejectBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Rejecting...';

  try {
    const session = authManager.getSession();
    const resp = await fetch(`${AUTH_CONFIG.workerUrl}/api/trade/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.token}`,
      },
      body: JSON.stringify({ trade_id: TRADE_STATE.currentInboxTrade.trade_id, reason }),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.detail || 'Failed to reject trade');

    closeRejectModal();
    showToast('Trade rejected', 'success');

    await loadTradeInbox();
    await loadTradeQueue();
  } catch (e) {
    console.error('Reject failed', e);
    showToast(e.message || 'Failed to reject trade', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-ban"></i> Confirm Reject';
  }
}

async function loadTradeHistory() {
  const container = document.getElementById('tradeHistoryList');

  try {
    const session = authManager.getSession();
    const resp = await fetch(`${AUTH_CONFIG.workerUrl}/api/trade/history`, {
      headers: { 'Authorization': `Bearer ${session.token}` },
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.detail || 'Failed to load history');

    const trades = data.trades || [];
    displayTradeHistory(trades);
  } catch (e) {
    console.error('History load failed', e);
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-exclamation-triangle"></i>
        <p>Error loading trade history</p>
      </div>
    `;
  }
}

function displayTradeHistory(trades) {
  const container = document.getElementById('tradeHistoryList');

  if (!trades.length) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-history"></i>
        <p>No trade history</p>
      </div>
    `;
    return;
  }

  container.innerHTML = trades.map((trade) => {
    return `
      <div class="trade-card">
        <div class="trade-card-header">
          <div class="trade-card-title">${trade.trade_id} • ${trade.teams.join(' ↔ ')}</div>
          <div class="trade-card-meta">
            <span><i class="fas fa-calendar"></i> ${formatShortDate(trade.processed_at || trade.created_at)}</span>
            <span class="trade-card-status ${trade.status}">${trade.status}</span>
          </div>
        </div>
        <div class="trade-card-body">
          ${renderReceivesBlocks(trade.receives || {})}
        </div>
        ${trade.rejection_reason ? `
          <div class="trade-card-footer">
            <span style="color: #f44336;"><i class="fas fa-ban"></i> Rejected: ${trade.rejection_reason}</span>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

function scrollToInbox() {
  document.getElementById('tradeInboxSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function formatShortDate(dateStr) {
  if (!dateStr) return 'Unknown';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
    <span>${message}</span>
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function closePlayerPanel() {
  const panel = document.getElementById('playerDetailPanel');
  if (panel) panel.classList.remove('active');
}

async function loadTradeData() {
  // processing windows (constitution)
  const now = new Date();
  const day = now.getDay();

  let nextProcessing = 'Tuesday';
  if (day === 0 || day === 1) nextProcessing = 'Tuesday';
  else if (day >= 2 && day <= 3) nextProcessing = 'Thursday';
  else nextProcessing = 'Sunday';

  document.getElementById('nextProcessing').textContent = nextProcessing;

  // wb
  const abbr = TRADE_STATE.userTeam.abbreviation;
  const wb = getWizbucksBalance(abbr);
  document.getElementById('yourWB').textContent = `$${wb}`;

  // trade window (display-only; server enforces)
  document.getElementById('tradeWindow').textContent = 'OPEN';
}

async function initTradePage() {
  console.log('🔄 Initializing trade portal...');

  if (!authManager.isAuthenticated()) {
    document.getElementById('authRequired').style.display = 'flex';
    return;
  }

  await loadManagersConfig();
  await waitForHubReady();
  await loadDraftOrder2026();

  TRADE_STATE.userTeam = authManager.getTeam();
  TRADE_STATE.teams.team1 = TRADE_STATE.userTeam.abbreviation;

  document.getElementById('tradeContent').style.display = 'block';
  document.getElementById('team1Badge').textContent = TRADE_STATE.userTeam.abbreviation;

  populateTeamSelectors();
  applyTradePrefillFromStorage();

  await Promise.all([
    loadTradeData(),
    loadTradeInbox(),
    loadTradeQueue(),
    loadTradeHistory(),
  ]);

  displayTradeBuilder();

  setInterval(async () => {
    await loadTradeInbox();
    await loadTradeQueue();
  }, 30000);
}

// Expose functions used by inline onclick handlers
window.initTradePage = initTradePage;
window.setTeamCount = setTeamCount;
window.handleTeamSelect = handleTeamSelect;
window.showPlayerPicker = showPlayerPicker;
window.closePlayerPicker = closePlayerPicker;
window.filterPlayerPicker = filterPlayerPicker;
window.selectPlayer = selectPlayer;
window.togglePlayerSelection = togglePlayerSelection;
window.confirmSelectedPlayers = confirmSelectedPlayers;
window.onPlayerPickerFromTeamChange = onPlayerPickerFromTeamChange;
window.showPickPicker = showPickPicker;
window.closePickPicker = closePickPicker;
window.filterPickPicker = filterPickPicker;
window.selectPick = selectPick;
window.togglePickSelection = togglePickSelection;
window.confirmSelectedPicks = confirmSelectedPicks;
window.onPickPickerFromTeamChange = onPickPickerFromTeamChange;
window.showWBPicker = showWBPicker;
window.closeWBPicker = closeWBPicker;
window.confirmWB = confirmWB;
window.onWBFromTeamChange = onWBFromTeamChange;
window.removeTransfer = removeTransfer;
window.clearTrade = clearTrade;
window.previewTrade = previewTrade;
window.closePreview = closePreview;
window.submitTrade = submitTrade;
window.scrollToInbox = scrollToInbox;
window.loadTradeHistory = loadTradeHistory;
window.withdrawTrade = withdrawTrade;
window.viewInboxTrade = viewInboxTrade;
window.closeInboxTradeModal = closeInboxTradeModal;
window.quickAcceptTrade = quickAcceptTrade;
window.acceptInboxTrade = acceptInboxTrade;
window.confirmAcceptTrade = confirmAcceptTrade;
window.closeAcceptConfirm = closeAcceptConfirm;
window.quickRejectTrade = quickRejectTrade;
window.rejectInboxTrade = rejectInboxTrade;
window.confirmRejectTrade = confirmRejectTrade;
window.closeRejectModal = closeRejectModal;
window.closePlayerPanel = closePlayerPanel;

