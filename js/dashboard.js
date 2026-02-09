/**
 * FBP Hub - Dashboard JavaScript
 * Displays personalized manager dashboard
 */

// Dashboard roster filter state
let dashboardRosterFilters = {
    section: 'all',      // all | infield | outfield | sp | rp
    rosterType: 'all'    // all | keepers | prospects
};

document.addEventListener('DOMContentLoaded', () => {
    // Require authentication
    if (!AuthUI.requireAuth()) {
        return;
    }
    
    // Initialize dashboard
    initDashboard();
});

/**
 * Initialize dashboard
 */
function initDashboard() {
    const user = authManager.getUser();
    const team = authManager.getTeam();
    
    // Apply team color theme (if configured)
    applyDashboardTeamTheme(team);
    
    // Update welcome message
    updateWelcomeMessage(user, team);
    
    // Load team stats
    loadTeamStats(team);
    
    // Update quick action links
    updateQuickActions(team);
    
    // Show admin link for admins only
    const adminLink = document.getElementById('adminDashboardLink');
    if (adminLink && typeof authManager !== 'undefined' && authManager.isAdmin && authManager.isAdmin()) {
        adminLink.style.display = 'flex';
    }
    
    // Setup roster filters + load roster preview
    setupRosterFilters(team);
    loadRosterPreview(team);
}

/**
 * Update welcome message
 */
function updateWelcomeMessage(user, team) {
    const header = document.getElementById('dashboardHeader');
    if (!header) return;
    
    const greeting = getGreeting();
    const teamName = team ? team.name : 'Manager';
    
    header.innerHTML = `
        <div class="welcome-message">
            <h2>${greeting}, ${teamName}!</h2>
            <p>Welcome to your FBP Hub dashboard</p>
        </div>
        <div class="user-badge">
            <img src="${authManager.getAvatarUrl(64)}" alt="${user.username}" class="avatar-large">
            <div class="user-info-dashboard">
                <div class="username">${user.username}</div>
                ${team ? `<div class="team-name">${team.abbreviation}</div>` : ''}
            </div>
        </div>
    `;
}

/**
 * Get time-appropriate greeting
 */
function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
}

/**
 * Load auction state for the dashboard (safe wrapper).
 * Returns an object with { bidCount, phaseLabel } for the given team.
 */
async function getAuctionBidSummary(teamAbbr) {
    const DATA_PATH = window.FBPHub?.config?.dataPath || './data/';

    try {
        const res = await fetch(`${DATA_PATH}auction_current.json`, { cache: 'no-store' });
        if (!res.ok) {
            return { bidCount: 0, phaseLabel: 'Auction off week' };
        }

        const state = await res.json();
        const phase = state?.phase || 'off_week';
        const allBids = Array.isArray(state?.bids) ? state.bids : [];

        const myBids = allBids.filter(b => String(b.team).toUpperCase() === String(teamAbbr).toUpperCase());
        let phaseLabel;
        switch (phase) {
            case 'ob_window':
                phaseLabel = 'OB window open';
                break;
            case 'cb_window':
                phaseLabel = 'CB window open';
                break;
            case 'ob_final':
                phaseLabel = 'OB match/forfeit window';
                break;
            case 'processing':
                phaseLabel = 'Processing results';
                break;
            case 'off_week':
            default:
                phaseLabel = 'Auction off week';
                break;
        }

        return { bidCount: myBids.length, phaseLabel };
    } catch (e) {
        console.warn('Dashboard: auction_current.json not available or invalid', e);
        return { bidCount: 0, phaseLabel: 'Auction data unavailable' };
    }
}

/**
 * Load team statistics
 */
async function loadTeamStats(team) {
    const statsGrid = document.getElementById('teamStats');
    if (!statsGrid || !team) return;
    
    // Filter players for this team using FBP_Team abbreviation
    const teamPlayers = FBPHub.data.players.filter(p => p.FBP_Team === team.abbreviation);
    const keepers = teamPlayers.filter(p => p.player_type === 'MLB');
    const prospects = teamPlayers.filter(p => p.player_type === 'Farm');
    
    // Get WizBucks balance (wizbucks.json is keyed by full team name)
    let wizbucks = 0;
    const wizData = FBPHub.data.wizbucks || {};
    if (team.name && Object.prototype.hasOwnProperty.call(wizData, team.name)) {
        wizbucks = wizData[team.name];
    } else if (Object.prototype.hasOwnProperty.call(wizData, team.abbreviation)) {
        wizbucks = wizData[team.abbreviation];
    }

    // Prospect contract breakdown
    const purchasedProspects = prospects.filter(p => (p.contract_type || '').includes('Purchased')).length;

    // Auction bids this week
    const { bidCount, phaseLabel } = await getAuctionBidSummary(team.abbreviation);
    
    statsGrid.innerHTML = `
        <div class="stat-card-large">
            <div class="stat-icon">
                <i class="fas fa-gavel"></i>
            </div>
            <div class="stat-content">
                <div class="stat-label">Auction Bids</div>
                <div class="stat-value-large">${bidCount}</div>
                <div class="stat-meta">${phaseLabel}</div>
            </div>
        </div>
        
        <div class="stat-card-large">
            <div class="stat-icon">
                <i class="fas fa-baseball-ball"></i>
            </div>
            <div class="stat-content">
                <div class="stat-label">Keepers</div>
                <div class="stat-value-large">${keepers.length}</div>
                <div class="stat-meta">${keepers.length} / 26 roster</div>
            </div>
        </div>
        
        <div class="stat-card-large">
            <div class="stat-icon">
                <i class="fas fa-seedling"></i>
            </div>
            <div class="stat-content">
                <div class="stat-label">Prospects</div>
                <div class="stat-value-large">${prospects.length}</div>
                <div class="stat-meta">${purchasedProspects} purchased</div>
            </div>
        </div>
        
        <div class="stat-card-large">
            <div class="stat-icon">
                <i class="fas fa-coins"></i>
            </div>
            <div class="stat-content">
                <div class="stat-label">WizBucks</div>
                <div class="stat-value-large">$${wizbucks}</div>
                <div class="stat-meta">Current balance</div>
            </div>
        </div>
    `;
}

/**
 * Update quick action links
 */
function updateQuickActions(team) {
    if (!team) return;
    
    const viewKeepersLink = document.getElementById('viewKeepersLink');
    const viewProspectsLink = document.getElementById('viewProspectsLink');
    
    if (viewKeepersLink) {
        viewKeepersLink.href = `rosters.html?type=keepers&team=${team.abbreviation}`;
    }
    
    if (viewProspectsLink) {
        viewProspectsLink.href = `rosters.html?type=prospects&team=${team.abbreviation}`;
    }
}

/**
 * Load roster preview
 */
function loadRosterPreview(team) {
    const preview = document.getElementById('rosterPreview');
    if (!preview || !team) return;
    
    const teamPlayers = FBPHub.data.players.filter(p => p.FBP_Team === team.abbreviation);
    const keepers = teamPlayers.filter(p => p.player_type === 'MLB');
    const prospects = teamPlayers.filter(p => p.player_type === 'Farm');
    
    let html = '';

    const wantKeepers = dashboardRosterFilters.rosterType === 'all' || dashboardRosterFilters.rosterType === 'keepers';
    const wantProspects = dashboardRosterFilters.rosterType === 'all' || dashboardRosterFilters.rosterType === 'prospects';
    
    if (wantKeepers && keepers.length > 0) {
        html += renderDashboardRosterSection(keepers, 'Keepers');
    }
    
    if (wantProspects && prospects.length > 0) {
        html += renderDashboardRosterSection(prospects, 'Prospects');
    }
    
    if (!html) {
        html = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <p>No players on your roster yet</p>
            </div>
        `;
    }
    
    preview.innerHTML = html;
}

/**
 * Group players into dashboard roster buckets (batters vs pitchers)
 */
function groupPlayersForDashboard(players) {
    const batters = {
        'Catcher': [],
        'Infield': [],
        'Outfield': [],
        'DH': []
    };
    
    const pitchers = {
        'Starting Pitcher': [],
        'Relief Pitcher': [],
        'Pitcher': []
    };

    players.forEach(player => {
        const posStr = player.position || '';
        const tokens = posStr.split(',').map(p => p.trim()).filter(Boolean);
        const normalizedTokens = tokens.map(t => t.toUpperCase());

        // DH can coexist with other positions (e.g., DH/SP like Ohtani)
        if (normalizedTokens.includes('DH')) {
            batters['DH'].push(player);
        }

        // Batters (mutually exclusive buckets besides DH)
        if (normalizedTokens.includes('C')) {
            batters['Catcher'].push(player);
        } else if (normalizedTokens.some(p => ['1B', '2B', '3B', 'SS'].includes(p))) {
            batters['Infield'].push(player);
        } else if (normalizedTokens.some(p => ['LF', 'CF', 'RF', 'OF'].includes(p))) {
            batters['Outfield'].push(player);
        }
        
        // Pitchers (handle SP/RP/P plus RHP/LHP styles)
        const isGenericPitcher = normalizedTokens.includes('P');
        const isStarter = normalizedTokens.includes('SP');
        const isReliever = normalizedTokens.includes('RP');
        const isHandedPitcher = normalizedTokens.includes('RHP') || normalizedTokens.includes('LHP');

        if (isStarter) {
            pitchers['Starting Pitcher'].push(player);
        } else if (isReliever) {
            pitchers['Relief Pitcher'].push(player);
        } else if (isGenericPitcher || isHandedPitcher) {
            pitchers['Pitcher'].push(player);
        }
    });

    return { batters, pitchers };
}

/**
 * Render a full roster section in depth-chart style (batters left, pitchers right)
 */
function renderDashboardRosterSection(players, title) {
    if (!players || players.length === 0) return '';

    const { batters, pitchers } = groupPlayersForDashboard(players);

    // Apply section-level filters (Catcher/Infield/Outfield/SP/RP)
    const section = dashboardRosterFilters.section || 'all';

    const filteredBattersEntries = Object.entries(batters).filter(([groupName, list]) => {
        if (!list.length) return false;
        if (section === 'catcher') return groupName === 'Catcher';
        if (section === 'infield') return groupName === 'Infield';
        if (section === 'outfield') return groupName === 'Outfield';
        if (section === 'sp' || section === 'rp') return false; // pitching-only filter
        return true; // 'all'
    });

    const filteredPitchersEntries = Object.entries(pitchers).filter(([groupName, list]) => {
        if (!list.length) return false;
        if (section === 'sp') return groupName === 'Starting Pitcher';
        if (section === 'rp') return groupName === 'Relief Pitcher';
        if (section === 'catcher' || section === 'infield' || section === 'outfield') return false; // hitting-only filter
        return true; // 'all'
    });
    
    // Render batters column (left)
    const batterGroups = filteredBattersEntries
        .map(([groupName, list]) => renderPositionGroup(groupName, list))
        .join('');
    
    // Render pitchers column (right)
    const pitcherGroups = filteredPitchersEntries
        .map(([groupName, list]) => renderPositionGroup(groupName, list))
        .join('');

    return `
        <div class="dashboard-roster-section">
            <h4>${title}</h4>
            <div class="dash-roster-grid">
                <div class="dash-roster-column">
                    ${batterGroups || '<div style="color: var(--text-gray); text-align: center; padding: var(--space-lg);">No batters</div>'}
                </div>
                <div class="dash-roster-column">
                    ${pitcherGroups || '<div style="color: var(--text-gray); text-align: center; padding: var(--space-lg);">No pitchers</div>'}
                </div>
            </div>
        </div>
    `;
}

/**
 * Attach click handlers for roster filters
 */
function setupRosterFilters(team) {
    const filterBar = document.getElementById('rosterFilterBar');
    if (!filterBar || !team) return;

    filterBar.addEventListener('click', (event) => {
        const chip = event.target.closest('.roster-filter-chip');
        if (!chip) return;

        const sectionFilter = chip.getAttribute('data-section-filter');
        const rosterFilter = chip.getAttribute('data-roster-filter');

        if (sectionFilter) {
            dashboardRosterFilters.section = sectionFilter;
            const sectionChips = filterBar.querySelectorAll('[data-section-filter]');
            sectionChips.forEach(el => {
                el.classList.toggle('active', el === chip);
            });
        }

        if (rosterFilter) {
            dashboardRosterFilters.rosterType = rosterFilter;
            const rosterChips = filterBar.querySelectorAll('[data-roster-filter]');
            rosterChips.forEach(el => {
                el.classList.toggle('active', el === chip);
            });
        }

        loadRosterPreview(team);
    });
}

/**
 * Render a single position group
 */
/**
 * Apply team color scheme to dashboard using CSS variables
 */
function applyDashboardTeamTheme(team) {
    const root = document.documentElement;

    if (!team || typeof FBPHub === 'undefined') {
        // Clear any previous overrides and fall back to global theme
        root.style.removeProperty('--team-primary');
        root.style.removeProperty('--team-secondary');
        root.style.removeProperty('--team-accent-1');
        root.style.removeProperty('--team-accent-2');
        root.style.removeProperty('--team-accent-3');
        return;
    }

    const colors = FBPHub.data?.teamColors?.[team.abbreviation];
    if (colors && colors.primary) {
        const secondary = colors.secondary || '#FFB612';
        root.style.setProperty('--team-primary', colors.primary);
        root.style.setProperty('--team-secondary', secondary);
        if (colors.accent1) root.style.setProperty('--team-accent-1', colors.accent1);
        if (colors.accent2) root.style.setProperty('--team-accent-2', colors.accent2);
        if (colors.accent3) root.style.setProperty('--team-accent-3', colors.accent3);
    } else {
        // No custom colors for this team; clear overrides
        root.style.removeProperty('--team-primary');
        root.style.removeProperty('--team-secondary');
        root.style.removeProperty('--team-accent-1');
        root.style.removeProperty('--team-accent-2');
        root.style.removeProperty('--team-accent-3');
    }
}

/**
 * Get eligible prospects for contract upgrades
 * Note: DC contracts can only be purchased during PAD
 * Self-service allows upgrading FROM DC to PC/BC, or FROM PC to BC
 */
function getEligibleContractUpgrades(team) {
    const teamPlayers = FBPHub.data.players.filter(p => p.FBP_Team === team.abbreviation);
    const prospects = teamPlayers.filter(p => p.player_type === 'Farm');
    
    const eligible = [];
    
    prospects.forEach(p => {
        const contract = (p.contract_type || '').toLowerCase();
        
        if (contract.includes('development')) {
            // DC prospects can upgrade to PC ($5) or BC ($15)
            eligible.push({ ...p, upgradeCost: 5, upgradeType: 'DC → PC', newContract: 'Purchased Contract' });
            eligible.push({ ...p, upgradeCost: 15, upgradeType: 'DC → BC', newContract: 'Blue Chip Contract' });
        } else if (contract.includes('purchased')) {
            // PC prospects can upgrade to BC ($10)
            eligible.push({ ...p, upgradeCost: 10, upgradeType: 'PC → BC', newContract: 'Blue Chip Contract' });
        }
        // BC prospects are already max tier - no upgrades available
        // Uncontracted/Farm prospects need DC first (PAD only)
    });
    
    return eligible;
}

/**
 * Check if self-service contract purchases are enabled (after PAD deadline)
 */
async function isContractPurchaseEnabled() {
    try {
        const res = await fetch('./data/season_dates.json');
        if (!res.ok) return true; // Default to enabled if file not found
        const dates = await res.json();
        const padDate = dates.prospect_draft;
        if (!padDate) return true;
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const padDeadline = new Date(padDate + 'T00:00:00');
        
        return today > padDeadline;
    } catch (e) {
        console.warn('Could not check PAD deadline:', e);
        return true; // Default to enabled on error
    }
}

/**
 * Show contract purchase modal
 */
async function showContractPurchaseModal() {
    // Check if self-service is enabled (after PAD deadline)
    const enabled = await isContractPurchaseEnabled();
    if (!enabled) {
        showToast('Contract purchases open after PAD deadline', 'warning');
        return;
    }
    
    const team = authManager.getTeam();
    if (!team) return;
    
    const eligible = getEligibleContractUpgrades(team);
    
    if (eligible.length === 0) {
        showToast('No prospects available for contract upgrade', 'warning');
        return;
    }
    
    // Get current WizBucks balance
    const wizData = FBPHub.data.wizbucks || {};
    let balance = 0;
    if (team.name && wizData[team.name] !== undefined) {
        balance = wizData[team.name];
    } else if (wizData[team.abbreviation] !== undefined) {
        balance = wizData[team.abbreviation];
    }
    
    const modalHTML = `
        <div class="contract-purchase-modal active" id="contractPurchaseModal">
            <div class="contract-purchase-content">
                <div class="contract-purchase-header">
                    <h2><i class="fas fa-file-contract"></i> Purchase Contract Upgrades</h2>
                    <p>Upgrade your prospects to higher contract tiers</p>
                </div>
                
                <div class="balance-display">
                    <span class="balance-label">Your WizBucks Balance:</span>
                    <span class="balance-value">$${balance}</span>
                </div>
                
                <div class="contract-info-box">
                    <div class="info-row">
                        <span class="info-label">📄 DC → PC:</span>
                        <span class="info-value">$5</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">⭐ DC → BC:</span>
                        <span class="info-value">$15</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">⭐ PC → BC:</span>
                        <span class="info-value">$10</span>
                    </div>
                    <div class="info-note">
                        💡 DC contracts can only be assigned during PAD
                    </div>
                </div>
                
                <div class="upgrade-options">
                    <h4>Your Eligible Prospects:</h4>
                    <div class="upgrade-list">
                        ${eligible.map(p => {
                            const canAfford = balance >= p.upgradeCost;
                            const currentContract = p.contract_type || 'None';
                            return `
                                <div class="upgrade-option ${canAfford ? '' : 'insufficient-funds'}" 
                                     ${canAfford ? `onclick="selectContractUpgrade('${p.upid}', '${p.upgradeType}', ${p.upgradeCost}, '${p.newContract}')"` : ''}>
                                    <div class="upgrade-player-info">
                                        <div class="upgrade-player-name">${p.name}</div>
                                        <div class="upgrade-player-meta">
                                            ${p.position || 'N/A'} - ${p.team || 'FA'} • 
                                            Current: ${currentContract}
                                        </div>
                                    </div>
                                    <div class="upgrade-action">
                                        <div class="upgrade-type">${p.upgradeType}</div>
                                        <div class="upgrade-cost ${canAfford ? '' : 'insufficient'}">
                                            $${p.upgradeCost}
                                            ${!canAfford ? '<span class="insufficient-badge">Insufficient</span>' : ''}
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
                
                <div class="contract-purchase-actions">
                    <button class="btn-secondary" onclick="closeContractPurchaseModal()">
                        <i class="fas fa-times"></i> Cancel
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

/**
 * Close contract purchase modal
 */
function closeContractPurchaseModal() {
    const modal = document.getElementById('contractPurchaseModal');
    if (modal) modal.remove();
}

/**
 * Select a contract upgrade and confirm
 */
function selectContractUpgrade(upid, upgradeType, cost, newContract) {
    const player = FBPHub.data.players.find(p => p.upid === upid);
    if (!player) return;
    
    const currentContract = player.contract_type || 'None';
    
    const confirmHTML = `
        <div class="contract-confirm-modal active" id="contractConfirmModal">
            <div class="confirmation-content">
                <div class="confirmation-header">
                    <h2><i class="fas fa-check-circle"></i> Confirm Contract Purchase</h2>
                    <p>Review before purchasing</p>
                </div>
                
                <div class="confirmation-section">
                    <h4>Player: ${player.name}</h4>
                    <div style="margin-top: var(--space-md);">
                        <p><strong>Position:</strong> ${player.position || 'N/A'}</p>
                        <p><strong>MLB Team:</strong> ${player.team || 'FA'}</p>
                        <p><strong>Current Contract:</strong> ${currentContract}</p>
                    </div>
                </div>
                
                <div class="confirmation-section">
                    <h4>Purchase Details</h4>
                    <div class="upgrade-summary">
                        <div class="upgrade-summary-row">
                            <span>Contract Type:</span>
                            <span class="upgrade-type-display">${newContract}</span>
                        </div>
                        <div class="upgrade-summary-row">
                            <span>Cost:</span>
                            <span class="cost-display">$${cost}</span>
                        </div>
                    </div>
                </div>
                
                <div class="confirmation-warning">
                    <i class="fas fa-info-circle"></i>
                    <strong>This will deduct $${cost} from your WizBucks balance</strong>
                    <p>The contract purchase will be logged to your transaction history</p>
                </div>
                
                <div class="confirmation-actions">
                    <button class="btn-secondary" onclick="closeContractConfirmModal()">
                        <i class="fas fa-times"></i> Cancel
                    </button>
                    <button class="btn-primary" id="confirmPurchaseBtn" 
                            onclick="confirmContractPurchase('${upid}', '${upgradeType}', ${cost}, '${newContract}')">
                        <i class="fas fa-check"></i> Purchase for $${cost}
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', confirmHTML);
}

/**
 * Close contract confirmation modal
 */
function closeContractConfirmModal() {
    const modal = document.getElementById('contractConfirmModal');
    if (modal) modal.remove();
}

/**
 * Confirm and execute contract purchase
 */
async function confirmContractPurchase(upid, upgradeType, cost, newContract) {
    const btn = document.getElementById('confirmPurchaseBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    }
    
    const session = typeof authManager !== 'undefined' ? authManager.getSession() : null;
    const token = session?.token;
    
    if (!token) {
        showToast('Your session has expired. Please log in again.', 'error');
        closeContractConfirmModal();
        return;
    }
    
    const team = authManager.getTeam();
    if (!team) {
        showToast('Could not determine your team', 'error');
        closeContractConfirmModal();
        return;
    }
    
    const player = FBPHub.data.players.find(p => p.upid === upid);
    if (!player) {
        showToast('Player not found', 'error');
        closeContractConfirmModal();
        return;
    }
    
    const currentSeason = new Date().getFullYear();
    
    // Build admin payload for contract update + WizBucks deduction
    const payload = {
        season: currentSeason,
        admin: team.abbreviation, // Manager's team as admin ID
        upid: upid,
        changes: {
            contract_type: newContract,
            years_simple: 'P'
        },
        log_event: `${currentSeason} ${upgradeType}`,
        log_source: 'Dashboard Self-Service',
        update_type: 'Purchase',
        // WizBucks deduction
        wizbucks_team: team.abbreviation,
        wizbucks_delta: -cost  // Negative for deduction
    };
    
    try {
        const res = await fetch(`${AUTH_CONFIG.workerUrl}/api/admin/update-player`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
        });
        
        if (!res.ok) {
            let detail = '';
            try {
                const body = await res.json();
                detail = body.detail || body.error || '';
            } catch (e) {}
            const baseMsg = `Contract purchase failed (status ${res.status})`;
            const fullMsg = detail ? `${baseMsg}: ${detail}` : baseMsg;
            showToast(fullMsg, 'error');
            
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-check"></i> Purchase for $' + cost;
            }
            return;
        }
        
        const result = await res.json();
        
        // Update local player data
        if (result.player) {
            const idx = FBPHub.data.players.findIndex(p => p.upid === upid);
            if (idx !== -1) {
                FBPHub.data.players[idx] = result.player;
            }
        }
        
        // Update WizBucks balance locally
        if (result.wizbucks_balance !== null && result.wizbucks_balance !== undefined) {
            if (team.name && FBPHub.data.wizbucks[team.name] !== undefined) {
                FBPHub.data.wizbucks[team.name] = result.wizbucks_balance;
            } else if (FBPHub.data.wizbucks[team.abbreviation] !== undefined) {
                FBPHub.data.wizbucks[team.abbreviation] = result.wizbucks_balance;
            }
        }
        
        // Close modals
        closeContractConfirmModal();
        closeContractPurchaseModal();
        
        // Show success
        const contractName = newContract === 'Purchased Contract' ? 'PC' : 'BC';
        showToast(`✅ ${player.name} - ${contractName} purchased! -$${cost} WB`, 'success');
        
        // Refresh dashboard
        loadTeamStats(team);
        loadRosterPreview(team);
        
    } catch (err) {
        console.error('Contract purchase error', err);
        showToast(`Contract purchase failed: ${err.message || 'Network error'}`, 'error');
        
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-check"></i> Purchase for $' + cost;
        }
    }
}

/**
 * Show toast notification
 */
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: 'check-circle',
        error: 'exclamation-circle',
        warning: 'exclamation-triangle'
    };
    
    toast.innerHTML = `
        <i class="fas fa-${icons[type]}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Remove after 5 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

// Expose functions to global scope
window.showContractPurchaseModal = showContractPurchaseModal;
window.closeContractPurchaseModal = closeContractPurchaseModal;
window.selectContractUpgrade = selectContractUpgrade;
window.closeContractConfirmModal = closeContractConfirmModal;
window.confirmContractPurchase = confirmContractPurchase;

function renderPositionGroup(groupName, players) {
    const rows = players.map(p => {
        // For prospects, display their prospect contract code (PC / DC / BC)
        let status;
        if (p.player_type === 'Farm') {
            const ct = (p.contract_type || '').toLowerCase();
            if (ct.includes('purchased')) {
                status = 'PC';
            } else if (ct.includes('development')) {
                status = 'DC';
            } else if (ct.includes('blue chip')) {
                status = 'BC';
            } else if (ct.includes('farm')) {
                status = 'FC';
            } else {
                status = p.years_simple || p.status || '';
            }
        } else {
            status = p.years_simple || p.status || '';
        }

        const team = p.team || 'FA';
        const pos = p.position || '';
        const age = p.age || '--';
        
        // Determine contract tier for color coding
        const normalized = (status || '').toUpperCase().replace(/\s+/g, '');
        let statusClass = 'tc';

        const isRookie = normalized === 'R' || normalized.startsWith('R-') || normalized.startsWith('TC-R');
        if (normalized.includes('VC')) {
            statusClass = 'vc';
        } else if (normalized.startsWith('FC') || normalized.startsWith('F')) {
            statusClass = 'fc';
        } else if (isRookie) {
            statusClass = 'rookie';
        }
        
        const profileLink = window.createPlayerLink ? createPlayerLink(p) : '#';

        return `
            <tr>
                <td><span class="dash-roster-status ${statusClass}">${status}</span></td>
                <td class="dash-roster-name"><a href="${profileLink}">${p.name}</a></td>
                <td class="dash-roster-team">${team}</td>
                <td class="dash-roster-pos">${pos}</td>
                <td class="dash-roster-age">${age}</td>
            </tr>
        `;
    }).join('');

    return `
        <div class="dash-roster-group">
            <div class="dash-roster-group-header">${groupName}</div>
            <table class="dash-roster-table">
                <thead>
                    <tr>
                        <th>STATUS</th>
                        <th>PLAYER</th>
                        <th>TEAM</th>
                        <th>POS</th>
                        <th>AGE</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>
    `;
}
