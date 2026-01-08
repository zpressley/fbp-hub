/**
 * FBP Hub - Player Log (Transaction History)
 * Combines historical CSV-derived data + new player_log.json and renders
 * a single filterable table. Admin field is never shown in the UI.
 */

let PLAYER_LOG_STATE = {
    allRecords: [],
    filtered: [],
    seasons: [],
    owners: [],
    updateTypes: []
};

async function initPlayerLogPage() {
    console.log('📜 Initializing Player Log page...');

    const loadingEl = document.getElementById('playerLogLoading');
    const tableEl = document.getElementById('playerLogTable');

    try {
        const [history, playerLog] = await Promise.all([
            loadJSON('transactions_history.json'),
            loadJSON('player_log.json')
        ]);

        const historyRecords = Array.isArray(history) ? history : [];
        const newRecords = Array.isArray(playerLog) ? playerLog : [];

        // Ensure schema compatibility and add a source hint if missing
        const normalize = (rec, fallbackSource) => ({
            id: rec.id || '',
            season: rec.season ?? null,
            source: rec.source || fallbackSource,
            admin: rec.admin || '',
            timestamp: rec.timestamp || '',
            upid: rec.upid || '',
            player_name: rec.player_name || rec.playerName || '',
            team: rec.team || '',
            pos: rec.pos || rec.position || '',
            age: rec.age ?? null,
            level: rec.level || '',
            team_rank: rec.team_rank ?? null,
            rank: rec.rank ?? null,
            eta: rec.eta || '',
            player_type: rec.player_type || rec.playerType || '',
            owner: rec.owner || '',
            contract: rec.contract || '',
            status: rec.status || '',
            years: rec.years || '',
            update_type: rec.update_type || rec.updateType || '',
            event: rec.event || ''
        });

        const all = [
            ...historyRecords.map(r => normalize(r, 'history')),
            ...newRecords.map(r => normalize(r, 'player_log'))
        ];

        PLAYER_LOG_STATE.allRecords = sortByTimestampDesc(all);
        buildPlayerLogFilters();
        wirePlayerLogEvents();
        applyPlayerLogFilters();

        if (loadingEl) loadingEl.style.display = 'none';
        if (tableEl) tableEl.style.display = '';
    } catch (err) {
        console.error('Failed to load player log data', err);
        if (loadingEl) {
            loadingEl.innerHTML = '<p>Failed to load transaction history.</p>';
        }
    }
}

function sortByTimestampDesc(records) {
    return [...records].sort((a, b) => {
        const da = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const db = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return db - da;
    });
}

function buildPlayerLogFilters() {
    const records = PLAYER_LOG_STATE.allRecords;
    const seasons = new Set();
    const owners = new Set();
    const types = new Set();

    records.forEach(r => {
        if (r.season) seasons.add(r.season);
        if (r.owner) owners.add(r.owner);
        if (r.update_type) types.add(r.update_type);
    });

    PLAYER_LOG_STATE.seasons = Array.from(seasons).sort((a, b) => b - a);
    PLAYER_LOG_STATE.owners = Array.from(owners).sort();
    PLAYER_LOG_STATE.updateTypes = Array.from(types).sort();

    const seasonSel = document.getElementById('logSeasonFilter');
    const ownerSel = document.getElementById('logOwnerFilter');
    const typeSel = document.getElementById('logTypeFilter');

    if (seasonSel) {
        PLAYER_LOG_STATE.seasons.forEach(s => {
            const opt = document.createElement('option');
            opt.value = String(s);
            opt.textContent = String(s);
            seasonSel.appendChild(opt);
        });
    }

    if (ownerSel) {
        PLAYER_LOG_STATE.owners.forEach(o => {
            const opt = document.createElement('option');
            opt.value = o;
            opt.textContent = o;
            ownerSel.appendChild(opt);
        });
    }

    if (typeSel) {
        PLAYER_LOG_STATE.updateTypes.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            typeSel.appendChild(opt);
        });
    }
}

function wirePlayerLogEvents() {
    const seasonSel = document.getElementById('logSeasonFilter');
    const ownerSel = document.getElementById('logOwnerFilter');
    const typeSel = document.getElementById('logTypeFilter');
    const searchInput = document.getElementById('logSearch');

    if (seasonSel) seasonSel.addEventListener('change', applyPlayerLogFilters);
    if (ownerSel) ownerSel.addEventListener('change', applyPlayerLogFilters);
    if (typeSel) typeSel.addEventListener('change', applyPlayerLogFilters);

    if (searchInput && typeof debounce === 'function') {
        searchInput.addEventListener('input', debounce(applyPlayerLogFilters, 200));
    } else if (searchInput) {
        searchInput.addEventListener('input', applyPlayerLogFilters);
    }
}

function applyPlayerLogFilters() {
    const seasonSel = document.getElementById('logSeasonFilter');
    const ownerSel = document.getElementById('logOwnerFilter');
    const typeSel = document.getElementById('logTypeFilter');
    const searchInput = document.getElementById('logSearch');

    const seasonVal = seasonSel ? seasonSel.value : '';
    const ownerVal = ownerSel ? ownerSel.value : '';
    const typeVal = typeSel ? typeSel.value : '';
    const searchVal = (searchInput ? searchInput.value : '').trim().toLowerCase();

    const base = PLAYER_LOG_STATE.allRecords;
    const filtered = base.filter(r => {
        if (seasonVal && String(r.season) !== seasonVal) return false;
        if (ownerVal && r.owner !== ownerVal) return false;
        if (typeVal && r.update_type !== typeVal) return false;

        if (searchVal) {
            const haystack = [
                r.player_name,
                r.team,
                r.owner,
                r.update_type,
                r.event
            ]
                .join(' ')
                .toLowerCase();
            if (!haystack.includes(searchVal)) return false;
        }

        return true;
    });

    PLAYER_LOG_STATE.filtered = filtered;
    renderPlayerLogTable();
}

function renderPlayerLogTable() {
    const tbody = document.querySelector('#playerLogTable tbody');
    const label = document.getElementById('logCountLabel');

    if (!tbody) return;

    tbody.innerHTML = '';

    PLAYER_LOG_STATE.filtered.forEach(rec => {
        const tr = document.createElement('tr');

        const dateText = rec.timestamp ? formatDate(rec.timestamp) : '';
        const playerText = rec.player_name || '';
        const teamText = rec.team || '';
        const ownerText = rec.owner || '';
        const typeText = rec.update_type || '';
        const contractStatus = [rec.contract, rec.status].filter(Boolean).join(' | ');
        const eventText = rec.event || '';

        tr.innerHTML = `
            <td>${dateText}</td>
            <td>${playerText}</td>
            <td>${teamText}</td>
            <td>${ownerText}</td>
            <td>${typeText}</td>
            <td>${contractStatus}</td>
            <td title="${eventText.replace(/"/g, '&quot;')}">${eventText}</td>
        `;

        tbody.appendChild(tr);
    });

    if (label) {
        const total = PLAYER_LOG_STATE.filtered.length;
        const all = PLAYER_LOG_STATE.allRecords.length;
        label.textContent = `${total.toLocaleString()} transactions${total !== all ? ` (of ${all.toLocaleString()})` : ''}`;
    }
}

// Expose init function globally
window.initPlayerLogPage = initPlayerLogPage;
