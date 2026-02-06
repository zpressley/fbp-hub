/**
 * FBP Hub - Draft Preview
 * Shows available players before draft starts
 */

let PREVIEW_STATE = {
    allPlayers: [],
    fypdPlayers: [],
    seasonDates: null,
    statsByUpid: {},
    fypdByUpid: {},
    top100Upids: new Set(),
    currentTab: 'keeper',
    fypdOnly: false,
    // New prospect tags system
    prospectTags: [],
    prospectFilters: {
        fvYear: '2024',
        status: 'any',
        position: 'any',
        badgeType: 'any',
        search: ''
    },
    prospectSort: { field: 'badges', direction: 'desc' },
    prospectPage: 0,
    prospectPageSize: 50,
    filteredProspects: []
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
    
    // Display initial view - default to prospect tab
    const prospectTab = document.querySelector('.view-btn[data-tab="prospect"]');
    if (prospectTab) {
        prospectTab.click();
    } else {
        displayKeeperPreview();
    }
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
            PREVIEW_STATE.fypdByUpid = {};
            PREVIEW_STATE.fypdPlayers.forEach(p => {
                if (p.upid != null) {
                    PREVIEW_STATE.fypdByUpid[String(p.upid)] = p;
                }
            });
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

    // Load Top 100 prospects list for badge + rank awareness
    PREVIEW_STATE.top100Upids = new Set();
    try {
        const response = await fetch('data/top100_prospects.json');
        if (response.ok) {
            const list = await response.json();
            list.forEach(p => {
                if (p.upid != null) {
                    PREVIEW_STATE.top100Upids.add(String(p.upid));
                }
            });
        }
    } catch (e) {
        console.log('No top100_prospects.json available');
    }
    
    // Load prospect tags database (new badge/filter system)
    try {
        const response = await fetch('data/prospect_tags.json');
        if (response.ok) {
            const data = await response.json();
            PREVIEW_STATE.prospectTags = data.players || [];
            console.log(`✅ Loaded ${PREVIEW_STATE.prospectTags.length} prospects from prospect_tags.json`);
        }
    } catch (e) {
        console.log('No prospect_tags.json available');
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
    
    if (keeperSearch) {
        keeperSearch.addEventListener('input', displayKeeperPreview);
    }
    
    // New prospect filter system
    if (prospectSearch) {
        prospectSearch.addEventListener('input', (e) => {
            PREVIEW_STATE.prospectFilters.search = e.target.value.toLowerCase();
            PREVIEW_STATE.prospectPage = 0;
            displayProspectPreview();
        });
    }
    
    // FV Year filter
    const fvYearFilter = document.getElementById('fvYearFilter');
    if (fvYearFilter) {
        fvYearFilter.addEventListener('change', (e) => {
            PREVIEW_STATE.prospectFilters.fvYear = e.target.value;
            PREVIEW_STATE.prospectPage = 0;
            displayProspectPreview();
        });
    }
    
    // Status filter
    const statusFilter = document.getElementById('statusFilter');
    if (statusFilter) {
        statusFilter.addEventListener('change', (e) => {
            PREVIEW_STATE.prospectFilters.status = e.target.value;
            PREVIEW_STATE.prospectPage = 0;
            displayProspectPreview();
        });
    }
    
    // Position filter
    const positionFilter = document.getElementById('positionFilter');
    if (positionFilter) {
        positionFilter.addEventListener('change', (e) => {
            PREVIEW_STATE.prospectFilters.position = e.target.value;
            PREVIEW_STATE.prospectPage = 0;
            displayProspectPreview();
        });
    }
    
    // Badge Type filter
    const badgeTypeFilter = document.getElementById('badgeTypeFilter');
    if (badgeTypeFilter) {
        badgeTypeFilter.addEventListener('change', (e) => {
            PREVIEW_STATE.prospectFilters.badgeType = e.target.value;
            PREVIEW_STATE.prospectPage = 0;
            displayProspectPreview();
        });
    }
    
    // Setup table sorting
    setupProspectTableSorting();
}

/**
 * Setup prospect table column sorting
 */
function setupProspectTableSorting() {
    const headers = document.querySelectorAll('.prospect-table th.sortable');
    headers.forEach(header => {
        header.addEventListener('click', () => {
            const field = header.dataset.sort;
            if (PREVIEW_STATE.prospectSort.field === field) {
                // Toggle direction
                PREVIEW_STATE.prospectSort.direction = 
                    PREVIEW_STATE.prospectSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                PREVIEW_STATE.prospectSort.field = field;
                PREVIEW_STATE.prospectSort.direction = field === 'fv' || field === 'badges' ? 'desc' : 'asc';
            }
            PREVIEW_STATE.prospectPage = 0;
            displayProspectPreview();
        });
    });
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
    
    // Sort by draft rank when available, then name
    available.sort((a, b) => {
        const aRank = typeof a.rank === 'number' ? a.rank : Infinity;
        const bRank = typeof b.rank === 'number' ? b.rank : Infinity;
        if (aRank !== bRank) return aRank - bRank;
        return a.name.localeCompare(b.name);
    });
    
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
 * Display prospect draft preview with new filtering system
 */
function displayProspectPreview() {
    const { fvYear, status, position, badgeType, search } = PREVIEW_STATE.prospectFilters;
    
    // Start with all prospects from prospect_tags.json
    let filtered = [...PREVIEW_STATE.prospectTags];
    
    // Filter by status (status is now an array of tags)
    if (status !== 'any') {
        filtered = filtered.filter(p => {
            const statusArr = p.status || [];
            if (status === 'standard') {
                // Standard = no status tags
                return statusArr.length === 0;
            }
            // Check if player has this status tag
            return statusArr.includes(status);
        });
    }
    
    // Filter by position
    if (position !== 'any') {
        filtered = filtered.filter(p => matchesPosition(p.position, position));
    }
    
    // Filter by badge type
    if (badgeType !== 'any') {
        filtered = filtered.filter(p => 
            p.badges?.some(b => b.type === badgeType)
        );
    }
    
    // Filter by search term
    if (search) {
        filtered = filtered.filter(p =>
            p.name?.toLowerCase().includes(search) ||
            p.org?.toLowerCase().includes(search) ||
            p.position?.toLowerCase().includes(search)
        );
    }
    
    // Sort
    sortProspects(filtered, fvYear);
    
    // Store filtered results
    PREVIEW_STATE.filteredProspects = filtered;
    
    // Update count
    const countEl = document.getElementById('prospectCount');
    if (countEl) {
        countEl.textContent = `${filtered.length} prospects`;
    }
    
    // Calculate pagination
    const startIdx = 0;
    const endIdx = (PREVIEW_STATE.prospectPage + 1) * PREVIEW_STATE.prospectPageSize;
    const displayed = filtered.slice(startIdx, endIdx);
    
    // Render table
    const tbody = document.getElementById('prospectTableBody');
    if (!tbody) return;
    
    if (displayed.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-state">No prospects match your filters</td>
            </tr>
        `;
        document.getElementById('prospectLoadMore').style.display = 'none';
        return;
    }
    
    tbody.innerHTML = displayed.map(p => renderProspectTableRow(p, fvYear)).join('');
    
    // Show/hide load more
    const loadMoreEl = document.getElementById('prospectLoadMore');
    if (loadMoreEl) {
        loadMoreEl.style.display = endIdx < filtered.length ? 'flex' : 'none';
    }
    
    // Update sort indicators
    updateSortIndicators();
}

/**
 * Check if player position matches filter
 */
function matchesPosition(playerPos, filterPos) {
    if (!playerPos) return false;
    const pos = playerPos.toUpperCase();
    const filter = filterPos.toUpperCase();
    
    // Split compound positions by common delimiters
    const posParts = pos.split(/[,\/]/).map(p => p.trim());
    
    // Direct match on any part
    if (posParts.includes(filter)) return true;
    
    // P matches any pitcher designation
    if (filter === 'P') {
        const pitcherTypes = ['SP', 'RP', 'LHP', 'RHP', 'SHP', 'P', 'MIRP', 'SIRP'];
        return posParts.some(p => pitcherTypes.includes(p));
    }
    
    // LHP matches LHP or any left-handed pitcher indicator
    if (filter === 'LHP') {
        return posParts.some(p => p === 'LHP' || p.includes('LHP'));
    }
    
    // RHP matches RHP or any right-handed pitcher indicator
    if (filter === 'RHP') {
        return posParts.some(p => p === 'RHP' || p.includes('RHP') || p === 'SHP' || p === 'SIRP' || p === 'MIRP');
    }
    
    // INF matches infield positions
    if (filter === 'INF') {
        const infTypes = ['C', '1B', '2B', '3B', 'SS', 'IF', 'INF'];
        return posParts.some(p => infTypes.includes(p));
    }
    
    // OF matches outfield positions
    if (filter === 'OF') {
        const ofTypes = ['OF', 'LF', 'CF', 'RF'];
        return posParts.some(p => ofTypes.includes(p));
    }
    
    // Check if any part matches the filter
    return posParts.some(p => p === filter || p.includes(filter));
}

/**
 * Sort prospects array in place
 */
function sortProspects(prospects, fvYear) {
    const { field, direction } = PREVIEW_STATE.prospectSort;
    const mult = direction === 'asc' ? 1 : -1;
    
    prospects.sort((a, b) => {
        let aVal, bVal;
        
        switch (field) {
            case 'name':
                return mult * (a.name || '').localeCompare(b.name || '');
            case 'org':
                return mult * (a.org || '').localeCompare(b.org || '');
            case 'position':
                return mult * (a.position || '').localeCompare(b.position || '');
            case 'fv':
                aVal = a.fv?.[fvYear] || 0;
                bVal = b.fv?.[fvYear] || 0;
                return mult * (aVal - bVal);
            case 'badges':
                aVal = a.badges?.length || 0;
                bVal = b.badges?.length || 0;
                return mult * (aVal - bVal);
            case 'status':
                aVal = getPrimaryStatus(a.status);
                bVal = getPrimaryStatus(b.status);
                return mult * aVal.localeCompare(bVal);
            default:
                return 0;
        }
    });
}

/**
 * Get status display strings from status array
 */
function getStatusDisplayArray(statusArr) {
    if (!statusArr || statusArr.length === 0) return ['Standard'];
    
    const displayMap = {
        'fypd': 'FYPD',
        'int_signee': 'INT',
        'debuted': 'Debuted',
        'dropped': 'Dropped'
    };
    
    return statusArr.map(s => displayMap[s] || s);
}

/**
 * Get primary status for sorting (priority: dropped > debuted > fypd > int_signee > standard)
 */
function getPrimaryStatus(statusArr) {
    if (!statusArr || statusArr.length === 0) return 'Standard';
    if (statusArr.includes('dropped')) return 'Dropped';
    if (statusArr.includes('debuted')) return 'Debuted';
    if (statusArr.includes('fypd')) return 'FYPD';
    if (statusArr.includes('int_signee')) return 'INT';
    return 'Standard';
}

/**
 * Render a prospect table row
 */
function renderProspectTableRow(player, fvYear) {
    const fv = player.fv?.[fvYear] || '-';
    const badgeCount = player.badges?.length || 0;
    const statusArr = player.status || [];
    const statusBadges = renderStatusBadges(statusArr);
    const isDropped = statusArr.includes('dropped');
    const profileLink = (typeof createPlayerLink === 'function') ? createPlayerLink(player) : '#';
    
    return `
        <tr class="prospect-row${isDropped ? ' prospect-dropped' : ''}">
            <td class="prospect-name">
                <a href="${profileLink}" class="prospect-name-link">${player.name || 'Unknown'}</a>
            </td>
            <td class="prospect-org">${player.org || '-'}</td>
            <td class="prospect-pos">${player.position || '-'}</td>
            <td class="prospect-fv">${fv}</td>
            <td class="prospect-badges">${badgeCount}</td>
            <td class="prospect-status">
                <div class="status-wrapper">${statusBadges}</div>
            </td>
        </tr>
    `;
}

/**
 * Render multiple status badges
 */
function renderStatusBadges(statusArr) {
    if (!statusArr || statusArr.length === 0) {
        return '<span class="status-badge status-standard">STND</span>';
    }
    
    const badgeMap = {
        'fypd': { class: 'status-fypd', label: 'FYPD' },
        'int_signee': { class: 'status-int', label: 'INT' },
        'debuted': { class: 'status-debuted', label: 'DEBU' },
        'dropped': { class: 'status-dropped', label: 'DROP' }
    };
    
    return statusArr.map(s => {
        const badge = badgeMap[s] || { class: 'status-standard', label: s };
        return `<span class="status-badge ${badge.class}">${badge.label}</span>`;
    }).join(' ');
}

/**
 * Get CSS class for a single status tag
 */
function getStatusClass(statusTag) {
    const classMap = {
        'fypd': 'status-fypd',
        'int_signee': 'status-int',
        'debuted': 'status-debuted',
        'dropped': 'status-dropped'
    };
    return classMap[statusTag] || 'status-standard';
}

/**
 * Update sort indicators in table headers
 */
function updateSortIndicators() {
    const headers = document.querySelectorAll('.prospect-table th.sortable');
    headers.forEach(header => {
        const field = header.dataset.sort;
        const icon = header.querySelector('i');
        if (!icon) return;
        
        if (field === PREVIEW_STATE.prospectSort.field) {
            icon.className = PREVIEW_STATE.prospectSort.direction === 'asc' 
                ? 'fas fa-sort-up' 
                : 'fas fa-sort-down';
            header.classList.add('sorted');
        } else {
            icon.className = 'fas fa-sort';
            header.classList.remove('sorted');
        }
    });
}

/**
 * Load more prospects
 */
function loadMoreProspects() {
    PREVIEW_STATE.prospectPage++;
    displayProspectPreview();
}

/**
 * Render a single-line player row for preview lists
 * Rank - Name Team Pos  StatsSummary
 */
function renderPlayerRow(player, isProspect, rank) {
    const fypdInfo = PREVIEW_STATE.fypdPlayers.find(f => String(f.upid) === String(player.upid));
    const isFypd = !!fypdInfo || player.fypd === true;
    const isTop100 = PREVIEW_STATE.top100Upids && PREVIEW_STATE.top100Upids.has(String(player.upid));
    const statsSummary = getPlayerStatsSummary(player);
    const profileLink = (typeof createPlayerLink === 'function') ? createPlayerLink(player) : '#';

    const tags = [];
    if (isFypd && isProspect) {
        tags.push('<span class="preview-fypd-tag">FYPD</span>');
    }
    if (isTop100) {
        tags.push('<span class="preview-top100-tag">Top 100</span>');
    }

    return `
        <div class="preview-player-row${isFypd && isProspect ? ' preview-player-row-fypd' : ''}">
            <div class="preview-row-main">
                <span class="preview-rank">#${rank}</span>
                <a href="${profileLink}" class="preview-name-link">${player.name}</a>
                <span class="preview-team">${player.team || 'FA'}</span>
                <span class="preview-pos">${player.position || ''}</span>
                ${tags.join(' ')}
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
