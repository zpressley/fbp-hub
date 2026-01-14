/**
 * FBP Hub - Players Page JavaScript
 * Handles player search, filtering, and compact list display
 */

// Page state
let currentFilters = {
    search: '',
    type: '',
    position: '',
    team: '',
    manager: ''
};
let displayedCount = 50;
const LOAD_MORE_INCREMENT = 50;
let selectedPlayer = null;

/**
 * Initialize players page
 */
function initPlayersPage() {
    console.log('👥 Initializing players page...');
    
    // Setup filter dropdowns
    setupFilterDropdowns();
    
    // Setup search
    setupSearch();
    
    // Setup quick filters
    setupQuickFilters();
    
    // Setup filter toggle
    setupFilterToggle();
    
    // Setup clear filters
    setupClearFilters();
    
    // Setup load more
    setupLoadMore();
    
    // Initial display
    displayPlayers();
}

/**
 * Setup quick filter chips
 */
function setupQuickFilters() {
    const chips = document.querySelectorAll('.filter-chip');
    
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            const filter = chip.dataset.filter;
            
            // Remove active from all
            chips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            
            // Apply filter
            if (filter === 'all') {
                currentFilters.type = '';
            } else if (filter === 'keepers') {
                currentFilters.type = 'MLB';
            } else if (filter === 'prospects') {
                currentFilters.type = 'Farm';
            } else if (filter === 'my-team') {
                // Get user's team if authenticated
                if (typeof authManager !== 'undefined' && authManager.isAuthenticated()) {
                    const team = authManager.getTeam();
                    if (team) {
                        currentFilters.manager = team.abbreviation;
                    }
                }
            }
            
            displayedCount = LOAD_MORE_INCREMENT;
            displayPlayers();
        });
    });
}

/**
 * Setup filter dropdowns
 */
function setupFilterDropdowns() {
    // Position filter
    const positionFilter = document.getElementById('positionFilter');
    if (positionFilter) {
        const positions = getUniqueValues('position');
        positions.forEach(pos => {
            const option = document.createElement('option');
            option.value = pos;
            option.textContent = pos;
            positionFilter.appendChild(option);
        });
        
        positionFilter.addEventListener('change', (e) => {
            currentFilters.position = e.target.value;
            displayedCount = LOAD_MORE_INCREMENT;
            displayPlayers();
        });
    }
    
    // Team filter
    const teamFilter = document.getElementById('teamFilter');
    if (teamFilter) {
        const teams = getUniqueValues('team');
        teams.forEach(team => {
            if (team && team !== 'FA') {
                const option = document.createElement('option');
                option.value = team;
                option.textContent = team.toUpperCase();
                teamFilter.appendChild(option);
            }
        });
        
        teamFilter.addEventListener('change', (e) => {
            currentFilters.team = e.target.value;
            displayedCount = LOAD_MORE_INCREMENT;
            displayPlayers();
        });
    }
    
    // Manager/team filter (by FBP team abbreviation)
    const managerFilter = document.getElementById('managerFilter');
    if (managerFilter) {
        const managers = getUniqueValues('FBP_Team').filter(m => m);
        managers.forEach(manager => {
            const option = document.createElement('option');
            option.value = manager;
            option.textContent = manager;
            managerFilter.appendChild(option);
        });
        
        managerFilter.addEventListener('change', (e) => {
            currentFilters.manager = e.target.value;
            displayedCount = LOAD_MORE_INCREMENT;
            displayPlayers();
        });
    }
}

/**
 * Setup search functionality
 */
function setupSearch() {
    const searchInput = document.getElementById('playerSearch');
    const clearBtn = document.getElementById('clearSearch');
    
    if (!searchInput) return;
    
    const debouncedSearch = debounce((value) => {
        currentFilters.search = value;
        displayedCount = LOAD_MORE_INCREMENT;
        displayPlayers();
    }, 300);
    
    searchInput.addEventListener('input', (e) => {
        const value = e.target.value;
        
        if (clearBtn) {
            clearBtn.style.display = value ? 'flex' : 'none';
        }
        
        debouncedSearch(value);
    });
    
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            currentFilters.search = '';
            clearBtn.style.display = 'none';
            displayedCount = LOAD_MORE_INCREMENT;
            displayPlayers();
        });
    }
}

/**
 * Setup filter toggle
 */
function setupFilterToggle() {
    const filterToggle = document.getElementById('filterToggle');
    const filtersPanel = document.getElementById('filtersPanel');
    
    if (!filterToggle || !filtersPanel) return;
    
    filterToggle.addEventListener('click', () => {
        filtersPanel.classList.toggle('active');
    });
}

/**
 * Setup clear filters button
 */
function setupClearFilters() {
    const clearBtn = document.getElementById('clearFilters');
    
    if (!clearBtn) return;
    
    clearBtn.addEventListener('click', () => {
        // Reset all filters
        currentFilters = {
            search: '',
            type: '',
            position: '',
            team: '',
            manager: ''
        };
        
        // Reset form elements
        document.getElementById('playerSearch').value = '';
        document.getElementById('positionFilter').value = '';
        document.getElementById('teamFilter').value = '';
        document.getElementById('managerFilter').value = '';
        
        // Reset quick filter chips
        document.querySelectorAll('.filter-chip').forEach(chip => {
            chip.classList.remove('active');
            if (chip.dataset.filter === 'all') {
                chip.classList.add('active');
            }
        });
        
        document.getElementById('clearSearch').style.display = 'none';
        
        displayedCount = LOAD_MORE_INCREMENT;
        displayPlayers();
    });
}

/**
 * Setup load more button
 */
function setupLoadMore() {
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    
    if (!loadMoreBtn) return;
    
    loadMoreBtn.addEventListener('click', () => {
        displayedCount += LOAD_MORE_INCREMENT;
        displayPlayers();
    });
}

/**
 * Display players based on current filters
 */
function displayPlayers() {
    const container = document.getElementById('playersContainer');
    const resultCount = document.getElementById('resultCount');
    const loadMoreContainer = document.getElementById('loadMoreContainer');
    
    if (!container) return;
    
    // Get filtered players
    const filtered = filterPlayers({
        playerType: currentFilters.type,
        position: currentFilters.position,
        team: currentFilters.team,
        manager: currentFilters.manager,
        search: currentFilters.search
    });
    
    // Sort alphabetically by name
    filtered.sort((a, b) => a.name.localeCompare(b.name));
    
    // Update result count
    if (resultCount) {
        const showing = Math.min(displayedCount, filtered.length);
        resultCount.textContent = `Showing ${showing} of ${filtered.length} players`;
    }
    
    // Update filter count badge
    const activeFilters = Object.values(currentFilters).filter(v => v).length;
    const filterCount = document.getElementById('filterCount');
    if (filterCount) {
        if (activeFilters > 0) {
            filterCount.textContent = activeFilters;
            filterCount.style.display = 'block';
        } else {
            filterCount.style.display = 'none';
        }
    }
    
    // Show/hide load more button
    if (loadMoreContainer) {
        loadMoreContainer.style.display = filtered.length > displayedCount ? 'block' : 'none';
    }
    
    // Display players
    const playersToShow = filtered.slice(0, displayedCount);
    
    if (playersToShow.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <p>No players found matching your criteria</p>
                <button class="btn-secondary" onclick="document.getElementById('clearFilters').click()">
                    <i class="fas fa-redo"></i>
                    CLEAR FILTERS
                </button>
            </div>
        `;
        return;
    }
    
    // Always display as list (compact)
    displayPlayersList(playersToShow, container);
}

/**
 * Display players as compact list
 */
function displayPlayersList(players, container) {
    const items = players.map(player => {
        // Determine contract badge class
        let contractBadgeHTML = '';
        if (player.years_simple) {
            const contract = player.years_simple.toUpperCase();
            let badgeClass = 'tc';
            
            if (contract.includes('VC')) badgeClass = 'vc';
            else if (contract.includes('FC') || contract.includes('F')) badgeClass = 'fc';
            else if (contract.includes('PC')) badgeClass = 'pc';
            else if (contract.includes('DC')) badgeClass = 'dc';
            
            contractBadgeHTML = `<span class="contract-badge ${badgeClass}">${player.years_simple}</span>`;
        }
        
        return `
            <div class="player-list-item" data-player-id="${player.upid || player.name}">
                <div class="player-list-main">
                    <div class="player-list-name">${player.name}</div>
                    <div class="player-list-meta">
                        <span>${player.position || '??'}</span>
                        <span>|</span>
                        <span>${player.team || 'FA'}</span>
                        <span>|</span>
                        <span>${player.player_type === 'MLB' ? 'Keeper' : 'Prospect'}</span>
                    </div>
                </div>
                <div class="player-list-badges">
                    ${contractBadgeHTML}
                    ${player.FBP_Team ? createTeamBadge(player.FBP_Team) : ''}
                </div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = `<div class="players-list">${items}</div>`;
    
    // Add click handlers for detail panel
    document.querySelectorAll('.player-list-item').forEach(item => {
        item.addEventListener('click', () => {
            const playerId = item.dataset.playerId;
            openPlayerDetail(playerId);
            
            // Highlight selected
            document.querySelectorAll('.player-list-item').forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
        });
    });
}

/**
 * Open player detail panel
 */
function openPlayerDetail(playerId) {
    const panel = document.getElementById('playerDetailPanel');
    if (!panel) return;
    
    // Find player data
    const player = FBPHub.data.players.find(p => 
        (p.upid && p.upid === playerId) || p.name === playerId
    );
    
    if (!player) {
        console.error('Player not found:', playerId);
        return;
    }
    
    selectedPlayer = player;
    
    // Build detail panel content
    const profileLink = window.createPlayerLink ? createPlayerLink(player) : '#';

    panel.innerHTML = `
        <div class="player-detail-header">
            <button class="detail-close-btn" onclick="closePlayerDetail()">
                <i class="fas fa-times"></i> CLOSE
            </button>
            <div class="player-detail-name">${player.name}</div>
            <div class="player-detail-title">${player.position} - ${player.team || 'Free Agent'}</div>
            <div class="player-detail-badges">
                ${player.years_simple ? createContractBadgeWithClass(player.years_simple) : ''}
                ${player.FBP_Team ? createTeamBadge(player.FBP_Team) : ''}
            </div>
            <div class="player-detail-actions">
                <a href="${profileLink}" class="btn btn-primary">
                    <i class="fas fa-user"></i>
                    View Full Profile
                </a>
            </div>
        </div>
        
        <div class="player-detail-content">
            <div class="detail-section">
                <h3>PLAYER INFORMATION</h3>
                <div class="info-grid">
                    <div class="info-item">
                        <div class="info-label">Position</div>
                        <div class="info-value">${player.position || 'N/A'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">MLB Team</div>
                        <div class="info-value">${player.team || 'FA'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Player Type</div>
                        <div class="info-value">${player.player_type === 'MLB' ? 'Keeper' : 'Prospect'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">FBP Manager</div>
                        <div class="info-value">${player.manager || 'Free Agent'}</div>
                    </div>
                    ${player.contract_type ? `
                        <div class="info-item">
                            <div class="info-label">Contract</div>
                            <div class="info-value">${player.contract_type}</div>
                        </div>
                    ` : ''}
                    ${player.years_simple ? `
                        <div class="info-item">
                            <div class="info-label">Status</div>
                            <div class="info-value">${player.years_simple}</div>
                        </div>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
    
    panel.classList.add('active');
}

/**
 * Close player detail panel
 */
function closePlayerDetail() {
    const panel = document.getElementById('playerDetailPanel');
    if (panel) {
        panel.classList.remove('active');
    }
    
    // Remove selection highlight
    document.querySelectorAll('.player-list-item').forEach(item => {
        item.classList.remove('selected');
    });
    
    selectedPlayer = null;
}

/**
 * Create contract badge with proper class
 */
function createContractBadgeWithClass(contractStr) {
    const contract = contractStr.toUpperCase();
    let badgeClass = 'tc';
    
    if (contract.includes('VC')) badgeClass = 'vc';
    else if (contract.includes('FC') || contract.includes('F')) badgeClass = 'fc';
    else if (contract.includes('PC')) badgeClass = 'pc';
    else if (contract.includes('DC')) badgeClass = 'dc';
    
    return `<span class="contract-badge ${badgeClass}">${contractStr}</span>`;
}

// Expose functions globally
window.initPlayersPage = initPlayersPage;
window.openPlayerDetail = openPlayerDetail;
window.closePlayerDetail = closePlayerDetail;
