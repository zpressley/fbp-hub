/**
 * FBP Hub - Draft Picks Tracker
 * Displays keeper draft pick ownership and buy-in status with purchase functionality
 */

// Constants
const BUY_IN_COSTS = {
    1: 55,
    2: 35,
    3: 10
};

// Discord webhook is handled by backend API

// State
let draftData = [];
let keeperPicks = [];
let managersData = null;
let currentUser = null;
let isAdmin = false;

/**
 * Get team color fallback
 */
function getTeamColor(teamAbbr) {
    const teamColors = {
        'WIZ': '#FF8C42',
        'B2J': '#4ECDC4',
        'CFL': '#95E1D3',
        'HAM': '#F38181',
        'JEP': '#AA96DA',
        'LFB': '#FCBAD3',
        'DMN': '#A8E6CF',
        'SAD': '#FFD3B6',
        'DRO': '#FFAAA5',
        'RV': '#FF8B94',
        'TBB': '#A8E6CF',
        'WAR': '#C7CEEA'
    };
    return teamColors[teamAbbr] || '#FF8C42';
}

/**
 * Initialize draft picks page
 */
async function initDraftPicksPage() {
    console.log('🎯 Initializing draft picks page...');
    
    // Load data first (needed to check admin role)
    await loadDraftData();
    
    // Check auth status
    if (typeof authManager !== 'undefined') {
        currentUser = authManager.isAuthenticated() ? authManager.getTeam()?.abbreviation : null;
        
        // Check if current user has admin role from managers.json
        if (currentUser && managersData?.teams?.[currentUser]) {
            isAdmin = managersData.teams[currentUser].role === 'admin';
        }
    }
    
    // Display keeper draft
    displayKeeperDraft();
}

/**
 * Load draft order data
 */
async function loadDraftData() {
    try {
        // Load draft order (contains both prospect and keeper drafts)
        const draftRes = await fetch('./data/draft_order_2026.json');
        if (draftRes.ok) {
            draftData = await draftRes.json();
            keeperPicks = draftData.filter(pick => pick.draft === 'keeper');
            console.log(`✅ Loaded ${keeperPicks.length} keeper draft picks`);
        }
        
        // Load managers data for team info and KAP balances
        const managersRes = await fetch('./config/managers.json');
        if (managersRes.ok) {
            managersData = await managersRes.json();
            console.log('✅ Loaded managers data');
        }
    } catch (error) {
        console.error('Error loading draft data:', error);
    }
}

/**
 * Get full manager display name
 */
function getManagerName(teamAbbr) {
    const teamData = managersData?.teams?.[teamAbbr];
    if (teamData?.name) {
        return `${teamData.name} (${teamAbbr})`;
    }
    return teamAbbr;
}

/**
 * Calculate overall pick number accounting for buy-ins and taxed picks
 */
function calculateOverallPickNumber(pick, allPicks) {
    // Count all non-eliminated picks before this one
    let overallCount = 0;
    for (const p of allPicks) {
        if (p.round > pick.round) break;
        if (p.round === pick.round && p.pick > pick.pick) break;
        
        // Only count if not eliminated (taxed out)
        if (!p.taxed_out) {
            overallCount++;
        }
    }
    return overallCount;
}

/**
 * Display keeper draft as list view with team colors
 */
function displayKeeperDraft() {
    const container = document.getElementById('draftGridContainer');
    if (!container) return;
    
    if (!keeperPicks || keeperPicks.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>No keeper draft data available</p>
            </div>
        `;
        return;
    }
    
    // Sort all picks by round and pick number
    const allPicks = [...keeperPicks].sort((a, b) => {
        if (a.round !== b.round) return a.round - b.round;
        return a.pick - b.pick;
    });
    
    console.log(`📊 Displaying ${allPicks.length} keeper picks across ${new Set(allPicks.map(p => p.round)).size} rounds`);
    
    // Check for filter
    const showYourPicks = document.getElementById('yourPicksFilter')?.checked;
    
    let html = '<div class="draft-picks-list">';
    
    // Group by round
    for (let round = 1; round <= 29; round++) {
        const roundPicks = allPicks.filter(p => p.round === round);
        if (roundPicks.length === 0) {
            console.warn(`⚠️ Round ${round} has no picks`);
            continue;
        }
        
        // Filter for user's picks if enabled
        const filteredPicks = showYourPicks && currentUser
            ? roundPicks.filter(p => p.current_owner === currentUser)
            : roundPicks;
        
        if (filteredPicks.length === 0) continue;
        
        console.log(`✅ Round ${round}: ${roundPicks.length} picks`);
        
        const buyInCost = BUY_IN_COSTS[round];
        
        html += `
            <div class="round-group">
                <div class="round-header">
                    <span class="round-title">Round ${round}</span>
                    ${buyInCost ? `<span class="round-buyin">Buy-In: $${buyInCost}</span>` : ''}
                </div>
                <div class="round-picks">
                    ${filteredPicks.map(pick => createPickRow(pick, allPicks)).join('')}
                </div>
            </div>
        `;
    }
    
    html += '</div>';
    container.innerHTML = html;
}


/**
 * Create pick row HTML with website colors and team tag
 * Format: R# - P# (Overall) Manager [Tag]
 */
function createPickRow(pick, allPicks) {
    const team = pick.current_owner;
    const round = pick.round;
    const purchased = pick.buyin_purchased || false;
    const traded = pick.traded || (team !== pick.original_owner);
    const isUserTeam = currentUser && team === currentUser;
    const canPurchase = isUserTeam && !purchased && round <= 3;
    
    // Use taxed_out field from data
    const isEliminated = pick.taxed_out || false;
    
    // Calculate overall pick number dynamically
    const overallPick = calculateOverallPickNumber(pick, allPicks);
    
    // Get team colors for tag only
    const teamColors = FBPHub?.data?.teamColors?.[team];
    const teamColor = teamColors?.primary || getTeamColor(team);
    
    // Determine row state classes
    let rowClass = 'pick-row';
    if (isEliminated) rowClass += ' eliminated';
    if (!purchased && round <= 3) rowClass += ' not-purchased';
    if (purchased) rowClass += ' purchased';
    if (traded) rowClass += ' traded';
    
    // Build action/status HTML
    let actionHTML = '';
    
    if (isEliminated) {
        actionHTML = '<span class="pick-status eliminated"><i class="fas fa-ban"></i> Eliminated</span>';
    } else if (round <= 3) {
        if (purchased) {
            actionHTML = '<span class="pick-status purchased"><i class="fas fa-check-circle"></i> Purchased</span>';
            if (isAdmin) {
                actionHTML += `
                    <button class="refund-btn" onclick="showRefundModal(${round}, '${team}')">
                        <i class="fas fa-undo"></i> Refund
                    </button>
                `;
            }
        } else if (canPurchase) {
            actionHTML = `
                <button class="buyin-btn" onclick="showBuyinModal(${round}, ${pick.buyin_cost}, '${team}')">
                    <i class="fas fa-shopping-cart"></i> Purchase ($${pick.buyin_cost})
                </button>
            `;
        } else if (!purchased) {
            actionHTML = '<span class="pick-status not-purchased"><i class="fas fa-lock"></i> Not Purchased</span>';
        }
    }
    
    const managerName = managersData?.teams?.[team]?.name || team;
    const originalOwnerName = managersData?.teams?.[pick.original_owner]?.name || pick.original_owner;
    
    // New format: R# - P# (Overall) Manager [Tag]
    const pickLabel = `R${round} - P${pick.pick} (${overallPick}) ${managerName}`;
    const teamTag = `<span class="team-tag" style="background-color: ${teamColor};">${team}</span>`;
    
    // Build traded info with crossed out original owner
    let tradedHTML = '';
    if (traded) {
        tradedHTML = `
            <span class="pick-traded">
                <span class="original-owner">${originalOwnerName}</span>
            </span>
        `;
    }
    
    return `
        <div class="${rowClass}">
            <div class="pick-info">
                <span class="pick-label">${pickLabel} ${teamTag}</span>
                ${tradedHTML}
                ${isEliminated ? '<span class="pick-tax-label">Tax Penalty</span>' : ''}
            </div>
            <div class="pick-actions">
                ${actionHTML}
            </div>
        </div>
    `;
}

/**
 * Show buy-in purchase modal
 */
window.showBuyinModal = function(round, cost, team) {
    if (!currentUser) {
        alert('Please log in to purchase buy-ins');
        return;
    }
    
    // Check if team has multiple picks in this round
    const teamRoundPicks = keeperPicks.filter(p => 
        p.round === round && 
        p.current_owner === team
    );
    
    // If multiple picks, show pick selection modal instead
    if (teamRoundPicks.length > 1) {
        showPickSelectionModal(round, cost, team, teamRoundPicks);
        return;
    }
    
    // Single pick - proceed with standard modal
    const pickNumber = teamRoundPicks.length === 1 ? teamRoundPicks[0].pick : null;
    
    // Get team's KAP balance
    const teamData = managersData?.teams?.[team];
    const kapBalance = teamData?.wizbucks?.['2026']?.allotments?.KAP?.total || 0;
    
    const modalBody = document.getElementById('buyinModalBody');
    modalBody.innerHTML = `
        <div class="modal-warning">
            <strong><i class="fas fa-exclamation-triangle"></i> This purchase is NON-REFUNDABLE</strong>
            <p>Once purchased, Round ${round} buy-in cannot be undone except by commissioner action.</p>
        </div>
        
        <div class="modal-info">
            <p><strong>Round ${round} Buy-In</strong></p>
            <p>Cost: <strong>$${cost}</strong> (taxable)</p>
            <p>Your KAP Balance: <strong>$${kapBalance}</strong></p>
            <p>Remaining After Purchase: <strong>$${kapBalance - cost}</strong></p>
        </div>
        
        <p>This buy-in is required to trade picks in Round ${round}. The cost will be deducted from your KAP allotment and counts toward your taxable spend.</p>
    `;
    
    // Validate funds
    const confirmBtn = document.getElementById('confirmBuyinBtn');
    if (kapBalance < cost) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fas fa-times"></i> Insufficient Funds';
        modalBody.innerHTML += `
            <div class="modal-warning">
                <strong>Insufficient KAP Balance</strong>
                <p>You need $${cost} but only have $${kapBalance} available.</p>
            </div>
        `;
    } else {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = '<i class="fas fa-check"></i> Confirm Purchase';
        confirmBtn.onclick = () => confirmBuyinPurchase(round, cost, team, pickNumber);
    }
    
    document.getElementById('buyinModal').classList.add('active');
};

/**
 * Show pick selection modal for teams with multiple picks in same round
 */
function showPickSelectionModal(round, cost, team, picks) {
    const teamData = managersData?.teams?.[team];
    const kapBalance = teamData?.wizbucks?.['2026']?.allotments?.KAP?.total || 0;
    
    const modalBody = document.getElementById('buyinModalBody');
    
    // Build pick selection options
    const pickOptions = picks.map(p => {
        const purchased = p.buyin_purchased ? ' (Already Purchased)' : '';
        const traded = p.original_owner !== p.current_owner ? ' (Traded)' : ' (Original)';
        return `
            <div class="pick-option ${p.buyin_purchased ? 'disabled' : ''}">
                <input 
                    type="radio" 
                    name="pickSelection" 
                    id="pick_${p.pick}" 
                    value="${p.pick}"
                    ${p.buyin_purchased ? 'disabled' : ''}
                >
                <label for="pick_${p.pick}">
                    Pick #${p.pick}${traded}${purchased}
                </label>
            </div>
        `;
    }).join('');
    
    modalBody.innerHTML = `
        <div class="modal-warning">
            <strong><i class="fas fa-info-circle"></i> Multiple Picks Detected</strong>
            <p>You have ${picks.length} picks in Round ${round}. Please select which pick you want to purchase a buy-in for.</p>
        </div>
        
        <div class="pick-selection">
            ${pickOptions}
        </div>
        
        <div class="modal-info">
            <p><strong>Round ${round} Buy-In</strong></p>
            <p>Cost: <strong>$${cost}</strong> (taxable)</p>
            <p>Your KAP Balance: <strong>$${kapBalance}</strong></p>
            <p>Remaining After Purchase: <strong>$${kapBalance - cost}</strong></p>
        </div>
        
        <p>This buy-in is required to trade picks in Round ${round}. The cost will be deducted from your KAP allotment.</p>
    `;
    
    const confirmBtn = document.getElementById('confirmBuyinBtn');
    
    if (kapBalance < cost) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fas fa-times"></i> Insufficient Funds';
    } else {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = '<i class="fas fa-check"></i> Confirm Purchase';
        confirmBtn.onclick = () => {
            const selectedPick = document.querySelector('input[name="pickSelection"]:checked');
            if (!selectedPick) {
                alert('Please select a pick');
                return;
            }
            confirmBuyinPurchase(round, cost, team, parseInt(selectedPick.value));
        };
    }
    
    document.getElementById('buyinModal').classList.add('active');
}

/**
 * Close buy-in modal
 */
window.closeBuyinModal = function() {
    document.getElementById('buyinModal').classList.remove('active');
};

/**
 * Confirm buy-in purchase
 */
async function confirmBuyinPurchase(round, cost, team, pickNumber = null) {
    try {
        console.log(`Processing buy-in purchase: Round ${round}, Team ${team}, Cost $${cost}, Pick ${pickNumber || 'N/A'}`);
        
        // Close modal
        closeBuyinModal();
        
        // Call backend API
        const session = (typeof authManager !== 'undefined' && authManager.getSession) ? authManager.getSession() : null;
        const authHeader = session?.token ? { 'Authorization': `Bearer ${session.token}` } : {};

        // Build payload - include pick if specified (required for teams with multiple picks in same round)
        const payload = {
            team,
            round,
            cost,
            purchased_by: currentUser
        };
        
        if (pickNumber !== null) {
            payload.pick = pickNumber;
        }

        const response = await fetch(`${FBPHub.config.apiBase}/api/buyin/purchase`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...authHeader,
            },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Purchase failed');
        }
        
        const result = await response.json();
        
        // Show success message
        if (typeof showToast === 'function') {
            showToast(`Round ${round} buy-in purchased successfully!`, 'success');
        } else {
            alert(`Round ${round} buy-in purchased for $${cost}!`);
        }
        
        // Reload data to reflect changes from backend
        await loadDraftData();
        displayKeeperDraft();
        
    } catch (error) {
        console.error('Error processing buy-in:', error);
        alert(`Error: ${error.message}`);
    }
}

/**
 * Show refund modal (admin only)
 */
window.showRefundModal = function(round, team) {
    if (!isAdmin) {
        alert('Admin access required');
        return;
    }
    
    const pick = keeperPicks.find(p => p.round === round && p.current_owner === team);
    if (!pick || !pick.buyin_purchased) {
        alert('This buy-in has not been purchased');
        return;
    }
    
    const cost = BUY_IN_COSTS[round];
    
    const modalBody = document.getElementById('refundModalBody');
    modalBody.innerHTML = `
        <div class="modal-info">
            <p><strong>Refund Round ${round} Buy-In</strong></p>
            <p>Team: <strong>${team}</strong></p>
            <p>Refund Amount: <strong>$${cost}</strong></p>
            ${pick.buyin_purchased_at ? `<p>Purchased: ${formatDate(pick.buyin_purchased_at)}</p>` : ''}
        </div>
        
        <div class="modal-warning">
            <strong>Administrator Action</strong>
            <p>This will reverse the buy-in purchase and restore $${cost} to ${team}'s KAP balance.</p>
        </div>
    `;
    
    const confirmBtn = document.getElementById('confirmRefundBtn');
    confirmBtn.onclick = () => confirmRefund(round, team, cost);
    
    document.getElementById('refundModal').classList.add('active');
};

/**
 * Close refund modal
 */
window.closeRefundModal = function() {
    document.getElementById('refundModal').classList.remove('active');
};

/**
 * Confirm refund
 */
async function confirmRefund(round, team, cost) {
    try {
        console.log(`Processing refund: Round ${round}, Team ${team}, Amount $${cost}`);
        
        // Close modal
        closeRefundModal();
        
        // Call backend API
        const session = (typeof authManager !== 'undefined' && authManager.getSession) ? authManager.getSession() : null;
        const authHeader = session?.token ? { 'Authorization': `Bearer ${session.token}` } : {};

        const response = await fetch(`${FBPHub.config.apiBase}/api/buyin/refund`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...authHeader,
            },
            body: JSON.stringify({
                team,
                round,
                admin_user: currentUser
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Refund failed');
        }
        
        const result = await response.json();
        
        // Show success
        if (typeof showToast === 'function') {
            showToast(`Round ${round} buy-in refunded for ${team}`, 'success');
        } else {
            alert(`Refund processed: $${cost} restored to ${team}`);
        }
        
        // Reload data to reflect changes from backend
        await loadDraftData();
        displayKeeperDraft();
        
    } catch (error) {
        console.error('Error processing refund:', error);
        alert(`Error: ${error.message}`);
    }
}


/**
 * Format date helper
 */
function formatDate(dateStr) {
    if (typeof window.formatDate === 'function') {
        return window.formatDate(dateStr);
    }
    const date = new Date(dateStr);
    return date.toLocaleDateString();
}

// Make function available globally
window.initDraftPicksPage = initDraftPicksPage;
