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
    contract: '',
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
    // Position filter (use canonical position set across the site)
    const positionFilter = document.getElementById('positionFilter');
    if (positionFilter) {
        const canonicalPositions = ['C', '1B', '2B', 'SS', '3B', 'CF', 'OF', 'DH', 'SP', 'RP', 'P'];
        canonicalPositions.forEach(pos => {
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
    
    // Contract filter (combines years_simple status and contract_type)
    const contractFilter = document.getElementById('contractFilter');
    if (contractFilter) {
        // Build unique contract labels from both fields
        const contractLabels = new Map();
        // Status prefixes from years_simple (TC, VC, FC, P)
        contractLabels.set('TC', 'TC (Keeper)');
        contractLabels.set('VC', 'VC (Veteran)');
        contractLabels.set('FC', 'FC (Franchise)');
        contractLabels.set('P', 'P (Prospect)');
        // Contract types from contract_type field
        contractLabels.set('PC', 'PC (Purchased)');
        contractLabels.set('BC', 'BC (Blue Chip)');
        contractLabels.set('DC', 'DC (Development)');
        contractLabels.set('KC', 'KC (Keeper Contract)');

        contractLabels.forEach((label, value) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            contractFilter.appendChild(option);
        });

        contractFilter.addEventListener('change', (e) => {
            currentFilters.contract = e.target.value;
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
            contract: '',
            manager: ''
        };
        
        // Reset form elements
        document.getElementById('playerSearch').value = '';
        document.getElementById('positionFilter').value = '';
        document.getElementById('teamFilter').value = '';
        document.getElementById('contractFilter').value = '';
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
        contract: currentFilters.contract,
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
            const raw = player.years_simple;
            const contract = raw.toUpperCase();
            let badgeClass = 'tc';

            const isRookie = contract === 'R' || contract.includes('R-') || contract.startsWith('TC-R');
            
            if (contract.includes('VC')) {
                badgeClass = 'vc';
            } else if (contract.includes('FC') || contract.includes('F2') || contract.includes('F3')) {
                // Franchise contracts (FC-1/2/3) use primary red styling
                badgeClass = 'fc';
            } else if (contract.includes('PC')) {
                badgeClass = 'pc';
            } else if (contract.includes('DC')) {
                badgeClass = 'dc';
            }

            // TC rookies (R / R-*, TC-R) should use the legacy blue styling.
            // We reuse the PC colorway, which is already mapped to legacy blue.
            if (isRookie) {
                badgeClass = 'pc';
            }
            
            contractBadgeHTML = `<span class="contract-badge ${badgeClass}">${raw}</span>`;
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

    // Apply owner-based theming for the slide-out panel so it always
    // matches the current player's team colors.
    applyOwnerThemeForPlayerDetail(player);
    
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
                ${getAddToTradeActionHTML(player)}
                <a href="${profileLink}" class="btn btn-profile-accent">
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
function getAddToTradeActionHTML(player) {
    if (typeof authManager === 'undefined' || !authManager.isAuthenticated()) return '';
    if (!player?.upid) return '';

    // Only for rostered players (owned by an FBP team)
    const ownerAbbr = String(player.FBP_Team || '').toUpperCase();
    if (!ownerAbbr) return '';

    return `
        <button type="button" class="btn btn-profile-accent" onclick="addPlayerToTradeFromPlayers('${String(player.upid)}')">
            <i class="fas fa-handshake"></i>
            Add to Trade
        </button>
    `;
}

function addPlayerToTradeFromPlayers(upid) {
    try {
        const player = FBPHub.data.players.find(p => String(p.upid) === String(upid));
        if (!player) return;

        const userTeam = authManager.getTeam();
        const userAbbr = String(userTeam?.abbreviation || '').toUpperCase();
        if (!userAbbr) {
            showToast('Could not determine your team');
            return;
        }

        const ownerAbbr = String(player.FBP_Team || '').toUpperCase();
        if (!ownerAbbr) {
            showToast('Cannot determine player owner');
            return;
        }

        let fromTeam = ownerAbbr;
        let toTeam = userAbbr;
        let teams = [userAbbr, ownerAbbr];

        // If the player is owned by the current user, ask who should receive.
        if (ownerAbbr === userAbbr) {
            const mapping = (typeof MANAGER_MAPPING !== 'undefined') ? MANAGER_MAPPING : {};
            const allTeams = Array.from(new Set(Object.values(mapping).map((t) => String(t).toUpperCase())));

            const recipient = String(prompt(`Send ${player.name} to which team? (e.g. HAM)`, '') || '').trim().toUpperCase();
            if (!recipient) return;
            if (recipient === userAbbr) {
                showToast('Recipient must be a different team');
                return;
            }
            if (allTeams.length && !allTeams.includes(recipient)) {
                showToast('Unknown team abbreviation');
                return;
            }

            fromTeam = userAbbr;
            toTeam = recipient;
            teams = [userAbbr, recipient];
        }

        const prefill = {
            teams,
            transfers: [
                {
                    type: 'player',
                    upid: String(player.upid),
                    from_team: fromTeam,
                    to_team: toTeam,
                },
            ],
        };

        localStorage.setItem('fbp_trade_prefill_v1', JSON.stringify(prefill));
        window.location.href = 'trade.html';
    } catch (e) {
        console.error('Add to trade failed', e);
        showToast('Failed to add to trade');
    }
}

/**
 * Close player detail panel
 */
function closePlayerDetail() {
    const panel = document.getElementById('playerDetailPanel');
    if (panel) {
        panel.classList.remove('active');
    }
    
    // Optionally clear team-specific overrides when closing the panel.
    // We leave them in place for now so the rest of the page stays themed
    // to the last player viewed.
    
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

// Helper: apply owner-based theme for the players slide-out panel
function applyOwnerThemeForPlayerDetail(player) {
    const ownerAbbr = player.FBP_Team || player.manager || null;
    const root = document.documentElement;

    if (ownerAbbr && typeof FBPHub !== 'undefined') {
        const colors = FBPHub.data?.teamColors?.[ownerAbbr];
        if (colors && colors.primary) {
            const secondary = colors.secondary || '#FFB612';
            root.style.setProperty('--team-primary', colors.primary);
            root.style.setProperty('--team-secondary', secondary);
            if (colors.accent1) root.style.setProperty('--team-accent-1', colors.accent1);
            if (colors.accent2) root.style.setProperty('--team-accent-2', colors.accent2);
            if (colors.accent3) root.style.setProperty('--team-accent-3', colors.accent3);
            return;
        }
    }

    // Fallback: clear overrides so global theme is used.
    root.style.removeProperty('--team-primary');
    root.style.removeProperty('--team-secondary');
    root.style.removeProperty('--team-accent-1');
    root.style.removeProperty('--team-accent-2');
    root.style.removeProperty('--team-accent-3');
}

// Expose functions globally
window.initPlayersPage = initPlayersPage;
window.openPlayerDetail = openPlayerDetail;
window.closePlayerDetail = closePlayerDetail;
window.addPlayerToTradeFromPlayers = addPlayerToTradeFromPlayers;
