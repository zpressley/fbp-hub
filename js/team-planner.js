/* ════════════════════════════════════════════════════════════════════════
   FBP TEAM PLANNER — Core Logic
   Replaces Team Builder. Open planner: pick any team, add any real player,
   pick, or prospect from anywhere in the league (not just what that team
   currently owns), see the $ and draft-pick-tax impact live.
   ════════════════════════════════════════════════════════════════════════ */

// ── Canonical contract/tax tables (match kap.js / fbp-trade-bot exactly) ───
const KEEPER_SALARIES = {
    'TC-R': 5, 'TC-BC-1': 5, 'TC-BC-2': 5,
    'TC-1': 15, 'TC-2': 25,
    'VC-1': 35, 'VC-2': 55,
    'FC-1': 85, 'FC-2+': 125
};
const IL_DISCOUNTS = { TC: 10, VC: 15, FC: 35 };
const RAT_REDUCTION = { 'FC-1': 'VC-2', 'FC-2+': 'VC-2', 'VC-2': 'VC-1', 'VC-1': null };
const TAX_BRACKETS = [
    { min: 421, max: 435, rounds: [4, 5, 6, 7, 8] },
    { min: 401, max: 420, rounds: [5, 6, 7] },
    { min: 376, max: 400, rounds: [6, 7, 8] },
    { min: 351, max: 375, rounds: [7, 8, 9] },
    { min: 326, max: 350, rounds: [8, 9, 10] },
    { min: 0, max: 325, rounds: [] }
];
const BUYIN_COSTS = { 1: 55, 2: 35, 3: 10 };
const PROSPECT_COSTS = { DC: 5, PC: 10, BC: 20 };
const MAX_TAXABLE_SPEND = 435;

// ── State ────────────────────────────────────────────────────────────────
let TP_STATE = {
    team: null,
    mode: 'kap', // 'kap' | 'pad'
    keepers: [],    // {upid,name,pos,team,contract,il,rat,dropped,added,fromTeam}
    prospects: [],  // {upid,name,pos,team,tier,dropped,added,fromTeam}
    picks: [],      // {round,pick,originalOwner,currentOwner,buyinRequired,buyinPurchased,buyinCost,buyinChecked,added}
    wbAdjust: 0,
    dcSlots: 0,
    bcSlots: 0,
    draftOrder: null,
    picker: { kind: null, selected: new Set() } // kind: 'keeper' | 'prospect' | 'pick'
};

// ── Contract normalization (data has mixed "TC 1" / "TC-1" / "FC 2" forms) ─
function normalizeContract(raw) {
    if (!raw) return null;
    let s = String(raw).trim().toUpperCase().replace(/\s+/g, '-').replace(/-+/g, '-');
    if (s === 'FC-2') s = 'FC-2+';
    if (KEEPER_SALARIES[s] !== undefined) return s;
    return null;
}

function prospectTierFor(p) {
    const ct = String(p.contract_type || '').toLowerCase();
    if (ct.includes('blue') && ct.includes('chip')) return 'BC';
    if (ct.includes('purchased')) return 'PC';
    if (ct.includes('development')) return 'DC';
    return 'DC';
}

function tierGroup(tier) { return tier.split('-')[0]; }
function effectiveTier(k) { return k.rat ? RAT_REDUCTION[k.contract] : k.contract; }

function playerCost(k) {
    if (k.dropped) return 0;
    const t = effectiveTier(k);
    let cost = KEEPER_SALARIES[t] || 0;
    if (k.il) cost -= IL_DISCOUNTS[tierGroup(k.contract)] || 0;
    return Math.max(0, cost);
}

function canILTag(k) {
    if (k.dropped) return false;
    if (k.contract === 'TC-R' || k.contract.startsWith('TC-BC')) return false;
    return true;
}

function canRaT(k) {
    if (k.dropped) return false;
    if (k.rat) return true;
    const target = RAT_REDUCTION[k.contract];
    return target !== undefined && target !== null;
}

function getBracket(spend) {
    for (const b of TAX_BRACKETS) { if (spend >= b.min && spend <= b.max) return b; }
    return { min: 0, max: 325, rounds: [] };
}

function badgeClass(tier) {
    if (!tier) return 'ct-tc';
    if (tier.startsWith('TC-BC')) return 'ct-bc';
    if (tier.startsWith('TC')) return 'ct-tc';
    if (tier.startsWith('VC')) return 'ct-vc';
    if (tier.startsWith('FC')) return 'ct-fc';
    if (tier === 'BC') return 'ct-bc';
    if (tier === 'PC') return 'ct-pc';
    if (tier === 'DC') return 'ct-dc';
    return 'ct-tc';
}

// ── Data loading ─────────────────────────────────────────────────────────
function waitForHubReady() {
    if (window.FBPHub?.cache?.lastUpdate) return Promise.resolve();
    return new Promise((resolve) => {
        if (window.FBPHub?.on) FBPHub.on('ready', resolve);
        else resolve();
    });
}

async function loadDraftOrder() {
    if (TP_STATE.draftOrder) return TP_STATE.draftOrder;
    try {
        let resp = await fetch('./data/draft_order_2026.json', { cache: 'no-store' });
        if (!resp.ok && window.FBPHub?.config?.githubRaw) {
            resp = await fetch(`${FBPHub.config.githubRaw}draft_order_2026.json`, { cache: 'no-store' });
        }
        if (!resp.ok) throw new Error('failed to load draft_order_2026.json');
        const json = await resp.json();
        TP_STATE.draftOrder = Array.isArray(json) ? json : [];
    } catch (e) {
        console.warn('Team Planner: draft_order_2026.json unavailable; pick features disabled', e);
        TP_STATE.draftOrder = [];
    }
    return TP_STATE.draftOrder;
}

function getTeamName(abbr) {
    const meta = FBPHub.data.managers?.teams?.[abbr];
    return meta?.name || abbr;
}

function getTeamOptions() {
    const teams = FBPHub.data.managers?.teams || {};
    return Object.keys(teams).sort().map(abbr => ({ abbr, name: teams[abbr].name || abbr }));
}

function getWizbucksBalance(abbr) {
    const wiz = FBPHub.data.wizbucks || {};
    const name = getTeamName(abbr);
    if (Object.prototype.hasOwnProperty.call(wiz, name)) return wiz[name];
    if (Object.prototype.hasOwnProperty.call(wiz, abbr)) return wiz[abbr];
    return 0;
}

function getPadAllotment(abbr) {
    const meta = FBPHub.data.managers?.teams?.[abbr];
    const alloc = meta?.wizbucks?.['2026']?.allotments?.PAD;
    return alloc ? { total: alloc.total, base: alloc.base, bonus: alloc.bonus, bracket: meta.wizbucks['2026'].meta?.finishBracket } : null;
}

async function loadTeamPlan(abbr) {
    TP_STATE.team = abbr;
    TP_STATE.keepers = [];
    TP_STATE.prospects = [];

    const players = FBPHub.data.players || [];
    const teamName = getTeamName(abbr);
    const teamPlayers = players.filter(p => p.FBP_Team === abbr || p.manager === abbr || p.manager === teamName);

    teamPlayers.forEach(p => {
        if (p.player_type === 'MLB') {
            const contract = normalizeContract(p.years_simple);
            if (!contract) return;
            TP_STATE.keepers.push({
                upid: String(p.upid || ''), name: p.name, pos: p.position || '?', team: p.team || '',
                contract, il: false, rat: false, dropped: false, added: false, fromTeam: null
            });
        } else if (p.player_type === 'Farm') {
            TP_STATE.prospects.push({
                upid: String(p.upid || ''), name: p.name, pos: p.position || '?', team: p.team || '',
                tier: prospectTierFor(p), dropped: false, added: false, fromTeam: null
            });
        }
    });

    TP_STATE.keepers.sort((a, b) => (KEEPER_SALARIES[b.contract] || 0) - (KEEPER_SALARIES[a.contract] || 0));

    const order = await loadDraftOrder();
    TP_STATE.picks = order
        .filter(p => p && p.draft === 'keeper' && p.current_owner === abbr)
        .map(p => ({
            round: p.round, pick: p.pick, originalOwner: p.original_owner, currentOwner: p.current_owner,
            buyinRequired: !!p.buyin_required, buyinPurchased: !!p.buyin_purchased, buyinCost: p.buyin_cost || 0,
            buyinChecked: !!p.buyin_purchased, added: false
        }))
        .sort((a, b) => a.round - b.round);
}

// ── Rendering ────────────────────────────────────────────────────────────
function renderAll() {
    renderKeepers();
    renderProspects();
    renderPicks();
    renderSummary();
    renderPad();
}

function renderKeepers() {
    const tbody = document.getElementById('keeperBody');
    if (!tbody) return;
    if (!TP_STATE.keepers.length) {
        tbody.innerHTML = `<tr class="empty-row"><td colspan="8">No keeper-contract players yet — select a team, or use "Add real player" to start building a plan from scratch.</td></tr>`;
    } else {
        tbody.innerHTML = TP_STATE.keepers.map(k => {
            const eff = effectiveTier(k);
            const il = canILTag(k), rat = canRaT(k);
            return `<tr class="${k.dropped ? 'dropped' : ''}${k.added ? ' added' : ''}">
                <td><span class="td-pos">${k.pos}</span></td>
                <td class="td-name">${k.name}${k.added ? ' <span class="badge b-new">NEW</span>' : ''}
                    ${k.fromTeam ? `<span class="from-tag">via ${k.fromTeam}</span>` : ''}</td>
                <td>${k.team || ''}</td>
                <td><span class="badge ${badgeClass(eff)}">${eff}</span>${k.rat ? ' <span class="badge ct-fc" style="border-color:var(--red)">RaT</span>' : ''}</td>
                <td class="cost">$${playerCost(k)}</td>
                <td class="c"><button class="tool-btn ${k.il ? 'on' : ''}" ${il ? '' : 'disabled'} onclick="toggleIL('${k.upid}')" title="IL Tag">IL</button></td>
                <td class="c"><button class="tool-btn ${k.rat ? 'on rat' : ''}" ${rat ? '' : 'disabled'} onclick="toggleRat('${k.upid}')" title="Reduce a Tier">RaT</button></td>
                <td class="c">${k.dropped
                    ? `<span class="link-x" onclick="toggleDrop('${k.upid}')" title="Undo"><i class="fas fa-rotate-left"></i></span>`
                    : `<span class="link-x" onclick="toggleDrop('${k.upid}')" title="Drop"><i class="fas fa-xmark"></i></span>`}</td>
            </tr>`;
        }).join('');
    }
    const count = document.getElementById('keeperCount');
    if (count) count.textContent = TP_STATE.keepers.filter(k => !k.dropped).length;
}

function renderProspects() {
    const tbody = document.getElementById('prospectBody');
    if (!tbody) return;
    if (!TP_STATE.prospects.length) {
        tbody.innerHTML = `<tr class="empty-row"><td colspan="6">No farm-system players yet.</td></tr>`;
    } else {
        tbody.innerHTML = TP_STATE.prospects.map(p => `
            <tr class="${p.dropped ? 'dropped' : ''}${p.added ? ' added' : ''}">
                <td><span class="td-pos">${p.pos}</span></td>
                <td class="td-name">${p.name}${p.added ? ' <span class="badge b-new">NEW</span>' : ''}
                    ${p.fromTeam ? `<span class="from-tag">via ${p.fromTeam}</span>` : ''}</td>
                <td>${p.team || ''}</td>
                <td><span class="badge ${badgeClass(p.tier)}">${p.tier}</span></td>
                <td class="cost">$${p.dropped ? 0 : PROSPECT_COSTS[p.tier]}</td>
                <td class="c">${p.dropped
                    ? `<span class="link-x" onclick="toggleProspectDrop('${p.upid}')" title="Undo"><i class="fas fa-rotate-left"></i></span>`
                    : `<span class="link-x" onclick="toggleProspectDrop('${p.upid}')" title="Drop"><i class="fas fa-xmark"></i></span>`}</td>
            </tr>`).join('');
    }
    const count = document.getElementById('prospectCount');
    if (count) count.textContent = TP_STATE.prospects.filter(p => !p.dropped).length;
}

function renderPicks() {
    const grid = document.getElementById('picksGrid');
    if (!grid) return;
    if (!TP_STATE.picks.length) {
        grid.innerHTML = `<div class="empty-row">No keeper-draft picks on file for this team yet.</div>`;
        return;
    }
    const bracket = getBracket(computeTaxable());
    grid.innerHTML = TP_STATE.picks.map((pk, i) => {
        const taxed = bracket.rounds.includes(pk.round);
        let buyinHtml = '';
        if (pk.buyinRequired && !pk.buyinPurchased) {
            buyinHtml = `<label><input type="checkbox" ${pk.buyinChecked ? 'checked' : ''} onchange="togglePickBuyin(${i})"> Buy in ($${pk.buyinCost})</label>`;
        } else if (pk.buyinRequired && pk.buyinPurchased) {
            buyinHtml = `<div class="from-tag" style="color:var(--success)">Bought in</div>`;
        }
        return `<div class="pick-chip ${taxed ? 'taxed' : ''} ${pk.added ? 'new' : ''}">
            ${taxed ? '<div class="taxflag">TAXED</div>' : ''}
            <div class="rd">RD${pk.round}<span class="from-tag"> · P${pk.pick}</span></div>
            <div class="from-tag">${pk.originalOwner && pk.originalOwner !== TP_STATE.team ? 'via ' + pk.originalOwner : 'original'}${pk.added ? ' · NEW' : ''}</div>
            ${buyinHtml}
            ${pk.added ? `<span class="link-x" onclick="removeAddedPick(${i})" title="Remove"><i class="fas fa-xmark"></i></span>` : ''}
        </div>`;
    }).join('');
}

function computeTaxable() {
    const salary = TP_STATE.keepers.reduce((s, k) => s + playerCost(k), 0);
    const buyin = TP_STATE.picks.reduce((s, pk) => s + ((pk.buyinRequired && !pk.buyinPurchased && pk.buyinChecked) ? pk.buyinCost : 0), 0);
    return salary + buyin;
}
function computeTaxFree() { return TP_STATE.keepers.filter(k => k.rat && !k.dropped).length * 75; }

function renderSummary() {
    const taxable = computeTaxable();
    const taxfree = computeTaxFree();
    const total = taxable + taxfree + TP_STATE.wbAdjust;
    setText('sumTaxable', '$' + taxable);
    setText('sumTaxfree', '$' + taxfree);
    setText('sumTotal', '$' + total);
    setText('wbAdjustDisplay', (TP_STATE.wbAdjust >= 0 ? '$' : '-$') + Math.abs(TP_STATE.wbAdjust));

    const card = document.getElementById('bracketCard');
    const val = document.getElementById('sumBracket');
    if (card && val) {
        card.classList.remove('warn', 'danger', 'ok');
        if (taxable > MAX_TAXABLE_SPEND) {
            val.textContent = 'Over max ($435)';
            card.classList.add('danger');
        } else {
            const b = getBracket(taxable);
            if (!b.rounds.length) { val.textContent = 'None'; card.classList.add('ok'); }
            else { val.textContent = 'RD ' + b.rounds[0] + '–' + b.rounds[b.rounds.length - 1]; card.classList.add('warn'); }
        }
    }
    const wb = getWizbucksBalance(TP_STATE.team);
    setText('sumWbBalance', '$' + wb);
    renderPicks();
}

function renderPad() {
    const prospectSpend = TP_STATE.prospects.reduce((s, p) => s + (p.dropped ? 0 : PROSPECT_COSTS[p.tier]), 0);
    const slotSpend = TP_STATE.dcSlots * 5 + TP_STATE.bcSlots * 20;
    const total = prospectSpend + slotSpend;
    const balance = getWizbucksBalance(TP_STATE.team);
    const remaining = balance - total;
    const rollover = Math.min(30, Math.max(0, remaining));

    setText('dcSlotCount', TP_STATE.dcSlots);
    setText('bcSlotCount', TP_STATE.bcSlots);
    setText('padSpend', '$' + total);
    setText('padRemaining', '$' + remaining);
    setText('padRollover', '$' + rollover);
    setText('padBalance', '$' + balance);

    const alloc = getPadAllotment(TP_STATE.team);
    setText('padAllotmentNote', alloc ? `base $${alloc.base}${alloc.bonus ? ` +$${alloc.bonus} bonus` : ''} · ${alloc.bracket || ''} bracket` : '');

    const fill = document.getElementById('padBarFill');
    if (fill) {
        fill.style.width = Math.min(100, balance > 0 ? (total / balance) * 100 : 100) + '%';
        fill.classList.toggle('over', total > balance);
    }
    const status = document.getElementById('padStatus');
    if (status) {
        status.textContent = total > balance ? `Over budget by $${total - balance} — drop a prospect or slot to fit.` : 'Within budget.';
        status.style.color = total > balance ? 'var(--red)' : 'var(--dimmer)';
    }
}

function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }

// ── Mutations: keepers ───────────────────────────────────────────────────
function toggleIL(upid) {
    const k = TP_STATE.keepers.find(x => x.upid === upid);
    if (!k || !canILTag(k)) return;
    const grp = tierGroup(k.contract);
    TP_STATE.keepers.forEach(x => { if (x.upid !== upid && tierGroup(x.contract) === grp) x.il = false; });
    k.il = !k.il;
    renderAll();
}
function toggleRat(upid) {
    const k = TP_STATE.keepers.find(x => x.upid === upid);
    if (!k || !canRaT(k)) return;
    k.rat = !k.rat;
    renderAll();
}
function toggleDrop(upid) {
    const k = TP_STATE.keepers.find(x => x.upid === upid);
    if (!k) return;
    if (k.added) { TP_STATE.keepers = TP_STATE.keepers.filter(x => x.upid !== upid); }
    else { k.dropped = !k.dropped; }
    renderAll();
}
function toggleProspectDrop(upid) {
    const p = TP_STATE.prospects.find(x => x.upid === upid);
    if (!p) return;
    if (p.added) { TP_STATE.prospects = TP_STATE.prospects.filter(x => x.upid !== upid); }
    else { p.dropped = !p.dropped; }
    renderAll();
}
function togglePickBuyin(i) { TP_STATE.picks[i].buyinChecked = !TP_STATE.picks[i].buyinChecked; renderAll(); }
function removeAddedPick(i) { TP_STATE.picks.splice(i, 1); renderAll(); }

function adjustWB(delta) { TP_STATE.wbAdjust += delta; renderAll(); }
function adjustSlot(kind, delta) {
    if (kind === 'dc') TP_STATE.dcSlots = Math.max(0, Math.min(15, TP_STATE.dcSlots + delta));
    if (kind === 'bc') TP_STATE.bcSlots = Math.max(0, Math.min(2, TP_STATE.bcSlots + delta));
    renderPad();
}

// ── Mode toggle ──────────────────────────────────────────────────────────
function setMode(mode) {
    TP_STATE.mode = mode;
    const tabKap = document.getElementById('modeTabKap');
    const tabPad = document.getElementById('modeTabPad');
    if (tabKap) tabKap.classList.toggle('active', mode === 'kap');
    if (tabPad) tabPad.classList.toggle('active', mode === 'pad');
    const kapSection = document.getElementById('kapModeSection');
    const padSection = document.getElementById('padModeSection');
    if (kapSection) kapSection.style.display = mode === 'kap' ? 'block' : 'none';
    if (padSection) padSection.style.display = mode === 'pad' ? 'block' : 'none';
    updateSavedMetaFromCache();
}

// ── Player / prospect picker (shared modal, filtered by type) ────────────
function openPlayerPicker(kind) {
    TP_STATE.picker = { kind, selected: new Set() };
    const title = document.getElementById('pickerTitle');
    if (title) title.textContent = kind === 'prospect' ? 'Add projected prospect' : 'Add real player';
    const teamFilter = document.getElementById('pickerTeamFilter');
    if (teamFilter) {
        teamFilter.innerHTML = '<option value="">All teams</option>' + getTeamOptions().map(t => `<option value="${t.abbr}">${t.name} (${t.abbr})</option>`).join('');
    }
    document.getElementById('pickerSearch').value = '';
    document.getElementById('playerPickerModal').classList.add('open');
    filterPlayerPicker();
}
function closePlayerPicker() {
    document.getElementById('playerPickerModal').classList.remove('open');
}
function filterPlayerPicker() {
    const kind = TP_STATE.picker.kind;
    const wantType = kind === 'prospect' ? 'Farm' : 'MLB';
    const q = (document.getElementById('pickerSearch').value || '').toLowerCase();
    const teamFilter = document.getElementById('pickerTeamFilter').value;
    const already = new Set((kind === 'prospect' ? TP_STATE.prospects : TP_STATE.keepers).map(x => x.upid));

    let results = (FBPHub.data.players || []).filter(p => p.player_type === wantType && !already.has(String(p.upid || '')));
    if (teamFilter) results = results.filter(p => p.FBP_Team === teamFilter);
    if (q) results = results.filter(p => String(p.name || '').toLowerCase().includes(q));
    results = results.slice(0, 40);

    const container = document.getElementById('pickerResults');
    if (!results.length) {
        container.innerHTML = '<div class="empty-row">No matches. Try a different search or team filter.</div>';
        return;
    }
    container.innerHTML = results.map(p => {
        const upid = String(p.upid || '');
        const tier = kind === 'prospect' ? prospectTierFor(p) : (normalizeContract(p.years_simple) || 'TC-1');
        const checked = TP_STATE.picker.selected.has(upid);
        return `<div class="picker-row" onclick="togglePickerSelect('${upid}')">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" ${checked ? 'checked' : ''} onclick="event.stopPropagation();togglePickerSelect('${upid}')">
                <span>${p.name} <span class="picker-meta">${p.position || ''} · ${p.team || 'FA'} · ${p.FBP_Team || 'unowned'}</span></span>
            </label>
            <span class="badge ${badgeClass(tier)}">${tier}</span>
        </div>`;
    }).join('');
}
function togglePickerSelect(upid) {
    if (TP_STATE.picker.selected.has(upid)) TP_STATE.picker.selected.delete(upid);
    else TP_STATE.picker.selected.add(upid);
    filterPlayerPicker();
}
function confirmPlayerPickerAdd() {
    const kind = TP_STATE.picker.kind;
    const players = FBPHub.data.players || [];
    let added = 0;
    TP_STATE.picker.selected.forEach(upid => {
        const p = players.find(x => String(x.upid) === upid);
        if (!p) return;
        if (kind === 'prospect') {
            TP_STATE.prospects.push({ upid, name: p.name, pos: p.position || '?', team: p.team || '', tier: prospectTierFor(p), dropped: false, added: true, fromTeam: p.FBP_Team || null });
        } else {
            const contract = normalizeContract(p.years_simple) || 'TC-1';
            TP_STATE.keepers.push({ upid, name: p.name, pos: p.position || '?', team: p.team || '', contract, il: false, rat: false, dropped: false, added: true, fromTeam: p.FBP_Team || null });
        }
        added++;
    });
    closePlayerPicker();
    renderAll();
    showToast(added ? `Added ${added} ${kind === 'prospect' ? 'prospect' : 'player'}${added === 1 ? '' : 's'}` : 'Nothing selected', added ? 'success' : 'warning');
}

// ── Pick picker ──────────────────────────────────────────────────────────
function openPickPicker() {
    TP_STATE.picker = { kind: 'pick', selected: new Set() };
    const teamFilter = document.getElementById('pickPickerTeamFilter');
    if (teamFilter) teamFilter.innerHTML = '<option value="">All teams</option>' + getTeamOptions().map(t => `<option value="${t.abbr}">${t.name} (${t.abbr})</option>`).join('');
    document.getElementById('pickPickerModal').classList.add('open');
    filterPickPicker();
}
function closePickPicker() { document.getElementById('pickPickerModal').classList.remove('open'); }
function filterPickPicker() {
    const teamFilter = document.getElementById('pickPickerTeamFilter').value;
    const roundFilter = document.getElementById('pickPickerRoundFilter').value;
    const order = TP_STATE.draftOrder || [];
    const already = new Set(TP_STATE.picks.map(p => p.round + ':' + p.pick));

    let results = order.filter(p => p && p.draft === 'keeper' && !already.has(p.round + ':' + p.pick));
    if (teamFilter) results = results.filter(p => p.current_owner === teamFilter);
    if (roundFilter) results = results.filter(p => String(p.round) === roundFilter);
    results = results.sort((a, b) => a.round - b.round).slice(0, 60);

    const container = document.getElementById('pickPickerResults');
    if (!results.length) {
        container.innerHTML = '<div class="empty-row">No matching picks.</div>';
        return;
    }
    container.innerHTML = results.map(p => {
        const key = p.round + ':' + p.pick;
        const checked = TP_STATE.picker.selected.has(key);
        return `<div class="picker-row" onclick="togglePickPickerSelect('${key}')">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" ${checked ? 'checked' : ''} onclick="event.stopPropagation();togglePickPickerSelect('${key}')">
                <span>RD${p.round} P${p.pick} <span class="picker-meta">${p.current_owner}${p.buyin_purchased ? ' · bought in' : ''}</span></span>
            </label>
        </div>`;
    }).join('');
}
function togglePickPickerSelect(key) {
    if (TP_STATE.picker.selected.has(key)) TP_STATE.picker.selected.delete(key);
    else TP_STATE.picker.selected.add(key);
    filterPickPicker();
}
function confirmPickPickerAdd() {
    const order = TP_STATE.draftOrder || [];
    let added = 0;
    TP_STATE.picker.selected.forEach(key => {
        const [round, pick] = key.split(':').map(Number);
        const src = order.find(p => p.draft === 'keeper' && p.round === round && p.pick === pick);
        if (!src) return;
        TP_STATE.picks.push({
            round: src.round, pick: src.pick, originalOwner: src.original_owner, currentOwner: src.current_owner,
            buyinRequired: !!src.buyin_required, buyinPurchased: !!src.buyin_purchased, buyinCost: src.buyin_cost || 0,
            buyinChecked: !!src.buyin_purchased, added: true
        });
        added++;
    });
    closePickPicker();
    renderAll();
    showToast(added ? `Added ${added} pick${added === 1 ? '' : 's'}` : 'Nothing selected', added ? 'success' : 'warning');
}

// ── Save / load plan ─────────────────────────────────────────────────────
function localPlanKey() { return `fbp_team_planner_${TP_STATE.team}_${TP_STATE.mode}`; }

function buildPlanPayload() {
    return {
        team: TP_STATE.team,
        mode: TP_STATE.mode,
        plan: {
            keepers_dropped: TP_STATE.keepers.filter(k => k.dropped).map(k => k.upid),
            keepers_added: TP_STATE.keepers.filter(k => k.added).map(k => k.upid),
            il_tags: TP_STATE.keepers.filter(k => k.il).map(k => k.upid),
            rat_applications: TP_STATE.keepers.filter(k => k.rat).map(k => k.upid),
            prospects_dropped: TP_STATE.prospects.filter(p => p.dropped).map(p => p.upid),
            prospects_added: TP_STATE.prospects.filter(p => p.added).map(p => p.upid),
            picks_added: TP_STATE.picks.filter(p => p.added).map(p => ({ round: p.round, pick: p.pick })),
            picks_removed: [],
            wb_adjust: TP_STATE.wbAdjust,
            dc_slots: TP_STATE.dcSlots,
            bc_slots: TP_STATE.bcSlots
        }
    };
}

function applyPlanState(plan) {
    if (!plan) return;
    const players = FBPHub.data.players || [];
    (plan.keepers_dropped || []).forEach(upid => { const k = TP_STATE.keepers.find(x => x.upid === upid); if (k) k.dropped = true; });
    (plan.il_tags || []).forEach(upid => { const k = TP_STATE.keepers.find(x => x.upid === upid); if (k && canILTag(k)) k.il = true; });
    (plan.rat_applications || []).forEach(upid => { const k = TP_STATE.keepers.find(x => x.upid === upid); if (k && canRaT(k)) k.rat = true; });
    (plan.prospects_dropped || []).forEach(upid => { const p = TP_STATE.prospects.find(x => x.upid === upid); if (p) p.dropped = true; });
    (plan.keepers_added || []).forEach(upid => {
        if (TP_STATE.keepers.some(k => k.upid === upid)) return;
        const p = players.find(x => String(x.upid) === upid);
        if (!p) return;
        const contract = normalizeContract(p.years_simple) || 'TC-1';
        TP_STATE.keepers.push({ upid, name: p.name, pos: p.position || '?', team: p.team || '', contract, il: false, rat: false, dropped: false, added: true, fromTeam: p.FBP_Team || null });
    });
    (plan.prospects_added || []).forEach(upid => {
        if (TP_STATE.prospects.some(x => x.upid === upid)) return;
        const p = players.find(x => String(x.upid) === upid);
        if (!p) return;
        TP_STATE.prospects.push({ upid, name: p.name, pos: p.position || '?', team: p.team || '', tier: prospectTierFor(p), dropped: false, added: true, fromTeam: p.FBP_Team || null });
    });
    (plan.picks_added || []).forEach(({ round, pick }) => {
        if (TP_STATE.picks.some(p => p.round === round && p.pick === pick)) return;
        const src = (TP_STATE.draftOrder || []).find(p => p.draft === 'keeper' && p.round === round && p.pick === pick);
        if (!src) return;
        TP_STATE.picks.push({
            round: src.round, pick: src.pick, originalOwner: src.original_owner, currentOwner: src.current_owner,
            buyinRequired: !!src.buyin_required, buyinPurchased: !!src.buyin_purchased, buyinCost: src.buyin_cost || 0,
            buyinChecked: !!src.buyin_purchased, added: true
        });
    });
    TP_STATE.wbAdjust = plan.wb_adjust || 0;
    TP_STATE.dcSlots = plan.dc_slots || 0;
    TP_STATE.bcSlots = plan.bc_slots || 0;
}

function updateSavedMeta(text) {
    setText('savedMetaTop', text);
    setText('savedMetaBottom', text);
}
function updateSavedMetaFromCache() {
    try {
        const raw = localStorage.getItem(localPlanKey());
        if (!raw) { updateSavedMeta('Not saved yet'); return; }
        const { savedAt } = JSON.parse(raw);
        updateSavedMeta(savedAt ? 'Last saved ' + new Date(savedAt).toLocaleString() : 'Not saved yet');
    } catch (e) { updateSavedMeta('Not saved yet'); }
}

async function savePlan() {
    if (!TP_STATE.team) { showToast('Select a team first', 'error'); return; }
    const payload = buildPlanPayload();
    const savedAt = Date.now();
    try { localStorage.setItem(localPlanKey(), JSON.stringify({ ...payload, savedAt })); } catch (e) {}

    const apiBase = window.FBPHub?.config?.apiBase;
    if (!apiBase) {
        updateSavedMeta('Saved on this device only (no save server configured)');
        showToast('Saved on this device', 'warning');
        return;
    }
    try {
        const res = await fetch(`${apiBase}/api/team-planner/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': FBPHub.config.apiKey || '' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('save failed: ' + res.status);
        updateSavedMeta('Last saved ' + new Date(savedAt).toLocaleString());
        showToast('Plan saved — available on any device', 'success');
    } catch (e) {
        console.warn('Team Planner: save endpoint unavailable, kept local copy only', e);
        updateSavedMeta('Saved on this device only (could not reach save server)');
        showToast('Saved on this device (sync unavailable)', 'warning');
    }
}

async function loadSavedPlan() {
    const apiBase = window.FBPHub?.config?.apiBase;
    let saved = null;
    if (apiBase && TP_STATE.team) {
        try {
            const res = await fetch(`${apiBase}/api/team-planner/${TP_STATE.team}`, { headers: { 'X-API-Key': FBPHub.config.apiKey || '' } });
            if (res.ok) {
                const data = await res.json();
                saved = data?.[TP_STATE.mode] || null;
            }
        } catch (e) { console.warn('Team Planner: could not reach save server, checking local copy', e); }
    }
    if (!saved) {
        try { const raw = localStorage.getItem(localPlanKey()); if (raw) saved = JSON.parse(raw); } catch (e) {}
    }
    if (saved?.plan) applyPlanState(saved.plan);
    updateSavedMeta(saved?.savedAt ? 'Last saved ' + new Date(saved.savedAt).toLocaleString() : 'Not saved yet');
}

// ── Toast ────────────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
    if (typeof window.showToast === 'function' && window.showToast !== showToast) { window.showToast(msg, type); return; }
    const t = document.getElementById('tpToast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'tp-toast show ' + type;
    clearTimeout(window._tpToastTimer);
    window._tpToastTimer = setTimeout(() => { t.classList.remove('show'); }, 3200);
}

// ── Team select / init ───────────────────────────────────────────────────
async function onTeamSelect(abbr) {
    if (!abbr) return;
    await loadTeamPlan(abbr);
    await loadSavedPlan();
    renderAll();
    const url = new URL(window.location.href);
    url.searchParams.set('team', abbr);
    window.history.replaceState({}, '', url);
}

function initTeamPlannerPage() {
    waitForHubReady().then(async () => {
        const teamSelect = document.getElementById('teamSelect');
        const params = new URLSearchParams(window.location.search);
        let defaultTeam = params.get('team');
        if (!defaultTeam && typeof authManager !== 'undefined') {
            try { defaultTeam = authManager.getTeam?.()?.abbreviation || null; } catch (e) {}
        }

        if (teamSelect) {
            teamSelect.innerHTML = '<option value="">— Select Team —</option>' +
                getTeamOptions().map(t => `<option value="${t.abbr}">${t.name} (${t.abbr})</option>`).join('');
            teamSelect.addEventListener('change', (e) => onTeamSelect(e.target.value));
            if (defaultTeam) teamSelect.value = defaultTeam;
        }

        await loadDraftOrder();

        if (defaultTeam) {
            await onTeamSelect(defaultTeam);
        } else {
            renderAll();
        }
    });
}

window.initTeamPlannerPage = initTeamPlannerPage;
