/**
 * FBP Hub - Players Page JavaScript
 * Handles player search, filtering, and display
 */

// Page state
let currentView = 'cards';
let currentFilters = {
    search: '',
    type: '',
    position: '',
    team: '',
    manager: ''
};
let displayedCount = 50; // Show 50 at a time
const LOAD_MORE_INCREMENT = 50;

/**
 * Initialize players page
 */
function initPlayersPage() {
    console.log('👥 Initializing players page...');
    
    // Setup filter dropdowns
    setupFilterDropdowns();
    
    // Setup search
    setupSearch();
    
    // Setup view toggle
    setupViewToggle();
    
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
 * Setup filter dropdown options
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
    
    // Manager filter
    const managerFilter = document.getElementById('managerFilter');
    if (managerFilter) {
        const managers = getUniqueValues('manager').filter(m => m);
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
    
    // Type filter
    const typeFilter = document.getElementById('typeFilter');
    if (typeFilter) {
        typeFilter.addEventListener('change', (e) => {
            currentFilters.type = e.target.value;
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
 * Setup view toggle (cards/list)
 */
function setupViewToggle() {
    const viewBtns = document.querySelectorAll('.view-btn');
    
    viewBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            
            if (view !== currentView) {
                currentView = view;
                
                viewBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                displayPlayers();
            }
        });
    });
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
        document.getElementById('typeFilter').value = '';
        document.getElementById('positionFilter').value = '';
        document.getElementById('teamFilter').value = '';
        document.getElementById('managerFilter').value = '';
        
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
    
    // Display based on view type
    const playersToShow = filtered.slice(0, displayedCount);
    
    if (playersToShow.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <p>No players found matching your criteria</p>
                <button class="btn-secondary" onclick="document.getElementById('clearFilters').click()">
                    <i class="fas fa-redo"></i>
                    Clear Filters
                </button>
            </div>
        `;
        return;
    }
    
    if (currentView === 'cards') {
        displayPlayersAsCards(playersToShow, container);
    } else {
        displayPlayersAsList(playersToShow, container);
    }
}

/**
 * Display players as cards
 */
function displayPlayersAsCards(players, container) {
    const cards = players.map(player => `
        <div class="player-card">
            <div class="player-card-header">
                <div>
                    <div class="player-name">${player.name}</div>
                    <div class="player-team">${player.team || 'FA'}</div>
                </div>
            </div>
            
            <div class="player-badges">
                ${createPositionBadge(player.position)}
                ${player.years_simple ? createContractBadge(player.years_simple) : ''}
                ${player.manager ? createTeamBadge(player.manager) : ''}
            </div>
            
            <div class="player-info">
                <div class="info-item">
                    <span class="info-label">Type</span>
                    <span class="info-value">${player.player_type === 'MLB' ? 'Keeper' : 'Prospect'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Contract</span>
                    <span class="info-value">${player.contract_type || 'N/A'}</span>
                </div>
                ${player.player_type === 'Farm' ? `
                    <div class="info-item">
                        <span class="info-label">Status</span>
                        <span class="info-value">${player.years_simple || 'N/A'}</span>
                    </div>
                ` : ''}
            </div>
        </div>
    `).join('');
    
    container.innerHTML = `<div class="players-grid">${cards}</div>`;
}

/**
 * Display players as list
 */
function displayPlayersAsList(players, container) {
    const items = players.map(player => `
        <div class="player-list-item">
            <div class="player-list-main">
                <div class="player-list-name">${player.name}</div>
                <div class="player-list-meta">
                    <span>${createPositionBadge(player.position)}</span>
                    <span>${player.team || 'FA'}</span>
                    <span>${player.player_type === 'MLB' ? 'Keeper' : 'Prospect'}</span>
                    ${player.years_simple ? `<span>${player.years_simple}</span>` : ''}
                </div>
            </div>
            ${player.manager ? createTeamBadge(player.manager) : '<span class="text-muted">Free Agent</span>'}
        </div>
    `).join('');
    
    container.innerHTML = `<div class="players-list">${items}</div>`;
}

// Make function available globally
window.initPlayersPage = initPlayersPage;