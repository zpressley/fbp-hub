/**
 * FBP Hub - Draft Preview
 * Shows available players before draft starts
 */

let PREVIEW_STATE = {
    allPlayers: [],
    fypdPlayers: [],
    seasonDates: null,
    statsByUpid: {},
    currentTab: 'keeper',
    fypdOnly: false
};

/**
 * Initialize draft preview
 */
async function initDraftPreview() {
    console.log('👁️ Initializing draft preview...');
    
    // Load data
    await loadPreviewData();
    
    // Update draft status
    updateDraftStatus();
    
    // Setup tabs
    setupTabs();
    
    // Setup filters
    setupFilters();
    
    // Display initial view
    displayKeeperPreview();
}

/**
 * Load preview data
 */
async function loadPreviewData() {
    // Load all players
    if (typeof FBPHub !== 'undefined' && FBPHub.data?.players) {
        PREVIEW_STATE.allPlayers = FBPHub.data.players;
    }
    
    // Load FYPD rankings if available
    try {
        const response = await fetch('data/fypd_2026_rankings.json');
        if (response.ok) {
            const data = await response.json();
            PREVIEW_STATE.fypdPlayers = data.players || [];
        }
    } catch (e) {
        console.log('No FYPD rankings available');
    }
    
    // Load season dates (now from data/season_dates.json)
    try {
        const response = await fetch('data/season_dates.json');
        if (response.ok) {
            PREVIEW_STATE.seasonDates = await response.json();
        }
    } catch (e) {
        console.log('No season dates available');
    }

    // Load 2025 player stats database (player_stats.json or fallback file)
    PREVIEW_STATE.statsByUpid = {};
    try {
        let resp = await fetch('data/player_stats.json');
        if (!resp.ok) {
            // Fallback to the 2025-specific file created by build_player_stats_database.py
            resp = await fetch('data/player_stats_2025.json');
        }
        if (resp.ok) {
            const db = await resp.json();
            if (db && db.stats_by_upid) {
                PREVIEW_STATE.statsByUpid = db.stats_by_upid;
            }
        }
    } catch (e) {
        console.log('No player stats database available for draft preview');
    }
}

/**
 * Update draft status banner
 */
function updateDraftStatus() {
    const statusBadge = document.getElementById('draftStatus');
    const statusText = document.getElementById('statusText');
    const draftInfo = document.getElementById('draftInfo');
    
    if (!PREVIEW_STATE.seasonDates) {
        statusText.textContent = 'PRE-DRAFT';
        draftInfo.innerHTML = `
            <div class="round-display">
                <span class="round-label">KEEPER DRAFT</span>
                <span class="round-number">TBD</span>
            </div>
            <div class="pick-display">
                <span class="pick-label">PROSPECT DRAFT</span>
                <span class="pick-number">TBD</span>
            </div>
        `;
        return;
    }
    
    const today = new Date().toISOString().split('T')[0];
    const keeperDate = PREVIEW_STATE.seasonDates.keeper_draft;
    const prospectDate = PREVIEW_STATE.seasonDates.prospect_draft;
    
    // Determine status
    let status = 'PRE-DRAFT';
    let statusClass = 'pre-draft';
    
    if (today === keeperDate || today === prospectDate) {
        status = 'DRAFT DAY';
        statusClass = 'draft-day';
        statusBadge.querySelector('i').className = 'fas fa-gavel';
    } else if (today > keeperDate) {
        status = 'POST-DRAFT';
        statusClass = 'post-draft';
        statusBadge.querySelector('i').className = 'fas fa-check-circle';
    } else if (today > prospectDate && today < keeperDate) {
        status = 'BETWEEN DRAFTS';
        statusClass = 'pre-draft';
    }
    
    statusBadge.className = `draft-status-badge ${statusClass}`;
    statusText.textContent = status;
    
    // Update draft info
    draftInfo.innerHTML = `
        <div class="round-display">
            <span class="round-label">KEEPER</span>
            <span class="round-number">${formatDate(keeperDate)}</span>
        </div>
        <div class="pick-display">
            <span class="pick-label">PROSPECT</span>
            <span class="pick-number">${formatDate(prospectDate)}</span>
        </div>
    `;
}

/**
 * Setup tabs
 */
function setupTabs() {
    const tabs = document.querySelectorAll('.view-btn');
    const views = document.querySelectorAll('.draft-view');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;
            
            tabs.forEach(t => t.classList.remove('active'));
            views.forEach(v => v.classList.remove('active'));
            
            tab.classList.add('active');
            document.getElementById(`${targetTab}-view`).classList.add('active');
            
            PREVIEW_STATE.currentTab = targetTab;
            
            // Display appropriate content
            if (targetTab === 'keeper') {
                displayKeeperPreview();
            } else {
                displayProspectPreview();
            }
        });
    });
}

/**
 * Setup filters
 */
function setupFilters() {
    const keeperSearch = document.getElementById('keeperSearch');
    const prospectSearch = document.getElementById('prospectSearch');
    const fypdToggle = document.getElementById('fypdToggle');
    
    if (keeperSearch) {
        keeperSearch.addEventListener('input', displayKeeperPreview);
    }
    
    if (prospectSearch) {
        prospectSearch.addEventListener('input', displayProspectPreview);
    }
    
    if (fypdToggle) {
        fypdToggle.addEventListener('change', (e) => {
            PREVIEW_STATE.fypdOnly = e.target.checked;
            displayProspectPreview();
        });
    }
}

/**
 * Display keeper draft preview
 */
function displayKeeperPreview() {
    const searchTerm = document.getElementById('keeperSearch')?.value.toLowerCase() || '';
    
    // Filter: MLB players, not owned
    let available = PREVIEW_STATE.allPlayers.filter(p => 
        p.player_type === 'MLB' &&
        !p.manager &&
        !p.FBP_Team
    );
    
    // Apply search
    if (searchTerm) {
        available = available.filter(p =>
            p.name.toLowerCase().includes(searchTerm) ||
            (p.position || '').toLowerCase().includes(searchTerm) ||
            (p.team || '').toLowerCase().includes(searchTerm)
        );
    }
    
    // Sort by name
    available.sort((a, b) => a.name.localeCompare(b.name));
    
    // Update count
    document.getElementById('keeperCount').textContent = `${available.length} players`;
    
    // Display
    const container = document.getElementById('keeperGrid');
    
    if (available.length === 0) {
        container.innerHTML = '<div class="empty-state">No available keeper players</div>';
        return;
    }
    
    container.innerHTML = available
        .map((player, index) => renderPlayerRow(player, false, index + 1))
        .join('');
}

/**
 * Display prospect draft preview
 */
function displayProspectPreview() {
    const searchTerm = document.getElementById('prospectSearch')?.value.toLowerCase() || '';
    
    // Filter: Farm players, not owned, not contracted
    let available = PREVIEW_STATE.allPlayers.filter(p => 
        p.player_type === 'Farm' &&
        !p.manager &&
        !p.FBP_Team &&
        !isContracted(p)
    );
    
    // Apply FYPD filter
    if (PREVIEW_STATE.fypdOnly) {
        const fypdUpids = new Set(PREVIEW_STATE.fypdPlayers.map(f => String(f.upid)));
        available = available.filter(p => 
            fypdUpids.has(String(p.upid)) || p.fypd === true
        );
    }
    
    // Apply search
    if (searchTerm) {
        available = available.filter(p =>
            p.name.toLowerCase().includes(searchTerm) ||
            (p.position || '').toLowerCase().includes(searchTerm) ||
            (p.team || '').toLowerCase().includes(searchTerm)
        );
    }
    
    // Sort by FYPD rank if available, then name
    available.sort((a, b) => {
        const aFypd = PREVIEW_STATE.fypdPlayers.find(f => String(f.upid) === String(a.upid));
        const bFypd = PREVIEW_STATE.fypdPlayers.find(f => String(f.upid) === String(b.upid));
        
        if (aFypd && bFypd) return aFypd.rank - bFypd.rank;
        if (aFypd) return -1;
        if (bFypd) return 1;
        
        return a.name.localeCompare(b.name);
    });
    
    // Update count
    document.getElementById('prospectCount').textContent = `${available.length} prospects`;
    
    // Display
    const container = document.getElementById('prospectGrid');
    
    if (available.length === 0) {
        container.innerHTML = '<div class="empty-state">No available prospects</div>';
        return;
    }
    
    container.innerHTML = available
        .map((player, index) => renderPlayerRow(player, true, index + 1))
        .join('');
}

/**
 * Render a single-line player row for preview lists
 * Rank - Name Team Pos  StatsSummary
 */
function renderPlayerRow(player, isProspect, rank) {
    const fypdInfo = PREVIEW_STATE.fypdPlayers.find(f => String(f.upid) === String(player.upid));
    const isFypd = !!fypdInfo || player.fypd === true;
    const statsSummary = getPlayerStatsSummary(player);

    return `
        <div class="preview-player-row${isFypd && isProspect ? ' preview-player-row-fypd' : ''}">
            <div class="preview-row-main">
                <span class="preview-rank">#${rank}</span>
                <span class="preview-name">${player.name}</span>
                <span class="preview-team">${player.team || 'FA'}</span>
                <span class="preview-pos">${player.position || ''}</span>
                ${isFypd && isProspect ? '<span class="preview-fypd-tag">FYPD</span>' : ''}
            </div>
            ${statsSummary ? `<div class="preview-row-stats">${statsSummary}</div>` : ''}
        </div>
    `;
}

/**
 * Build a compact 2025 stat line from player_stats data (if available)
 */
function getPlayerStatsSummary(player) {
    const upid = player.upid ? String(player.upid) : null;
    if (!upid || !PREVIEW_STATE.statsByUpid || !PREVIEW_STATE.statsByUpid[upid]) {
        return '';
    }

    const record = PREVIEW_STATE.statsByUpid[upid];
    const stats = record.stats || {};

    if (record.player_type === 'pitcher') {
        const era = typeof stats.era === 'number' ? stats.era.toFixed(2) : null;
        const whip = typeof stats.whip === 'number' ? stats.whip.toFixed(2) : null;
        const k = stats.strikeOuts;
        const ip = stats.inningsPitched;
        const parts = [];
        if (era) parts.push(`${era} ERA`);
        if (whip) parts.push(`${whip} WHIP`);
        if (typeof k === 'number') parts.push(`${k} K`);
        if (typeof ip === 'number') parts.push(`${ip} IP`);
        return parts.length ? `2025: ${parts.join(', ')}` : '';
    }

    // Default to batter-style line
    const hr = stats.homeRuns;
    const sb = stats.stolenBases;
    const avg = typeof stats.avg === 'number' ? stats.avg.toFixed(3).replace(/^0/, '') : null;
    const obp = typeof stats.obp === 'number' ? stats.obp.toFixed(3).replace(/^0/, '') : null;
    const slg = typeof stats.slg === 'number' ? stats.slg.toFixed(3).replace(/^0/, '') : null;

    const pieces = [];
    if (typeof hr === 'number') pieces.push(`${hr} HR`);
    if (typeof sb === 'number') pieces.push(`${sb} SB`);
    if (avg && obp && slg) pieces.push(`${avg}/${obp}/${slg}`);

    return pieces.length ? `2025: ${pieces.join(', ')}` : '';
}

/**
 * Check if player is contracted
 */
function isContracted(player) {
    const contract = (player.contract_type || '').toLowerCase();
    const years = (player.years_simple || '').toLowerCase();
    
    const indicators = ['bc', 'dc', 'pc', 'blue', 'development', 'purchased'];
    
    return indicators.some(indicator => 
        contract.includes(indicator) || years.includes(indicator)
    );
}

/**
 * Format date
 */
function formatDate(dateStr) {
    if (!dateStr) return 'TBD';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric'
    });
}

// Expose globally
window.initDraftPreview = initDraftPreview;
