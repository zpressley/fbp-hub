/**
 * FBP Hub - Draft Picks Tracker
 * Displays draft pick ownership and buy-in status
 */

// Constants
const TOTAL_ROUNDS = 26; // 26-round draft
const BUY_IN_ROUNDS = {
    1: 55,
    2: 35,
    3: 10
};

// Page state
let draftPicks = [];
let buyIns = {};
let currentView = 'grid';
let currentTeam = null;
let draftOrder = []; // Loaded from draft_order.json

/**
 * Initialize draft picks page
 */
function initDraftPicksPage() {
    console.log('🎯 Initializing draft picks page...');
    
    // Load draft pick data
    loadDraftPicks();
    
    // Setup view toggle
    setupViewToggle();
    
    // Display based on view
    displayDraftPicks();
}

/**
 * Load draft pick data
 */
async function loadDraftPicks() {
    try {
        // FIRST: Load draft order from draft_order.json
        const orderResponse = await fetch('./data/draft_order.json');
        if (orderResponse.ok) {
            const orderData = await orderResponse.json();
            draftOrder = orderData.order || [];
            console.log(`✅ Loaded draft order:`, draftOrder);
        } else {
            console.warn('⚠️ No draft_order.json found, using fallback order');
            draftOrder = ['HAM', 'RV', 'B2J', 'CFL', 'LAW', 'LFB', 'JEP', 'TBB', 'WIZ', 'DRO', 'SAD', 'WAR'];
        }
        
        // THEN: Try to load actual picks/trades from draft_picks.json
        const response = await fetch('./data/draft_picks.json');
        
        if (response.ok) {
            const data = await response.json();
            draftPicks = data.picks || [];
            buyIns = data.buyins || {};
        } else {
            // Generate default picks using draft order (STRAIGHT, not snake)
            draftPicks = generateDefaultPicks();
            buyIns = {};
        }
        
        console.log(`✅ Loaded ${draftPicks.length} draft picks`);
        
    } catch (error) {
        console.error('Error loading draft picks:', error);
        // Fallback to default order
        draftOrder = ['HAM', 'RV', 'B2J', 'CFL', 'LAW', 'LFB', 'JEP', 'TBB', 'WIZ', 'DRO', 'SAD', 'WAR'];
        draftPicks = generateDefaultPicks();
        buyIns = {};
    }
}

/**
 * Generate default draft picks (STRAIGHT order, not snake)
 * Based on draft_order.json (2024 final standings)
 */
function generateDefaultPicks() {
    const picks = [];
    let pickNumber = 1;
    
    // Straight draft: same order every round
    for (let round = 1; round <= TOTAL_ROUNDS; round++) {
        draftOrder.forEach(team => {
            picks.push({
                round: round,
                pick: pickNumber,
                originalOwner: team,
                currentOwner: team,
                traded: false
            });
            pickNumber++;
        });
    }
    
    console.log(`📋 Generated ${picks.length} picks (straight draft, not snake)`);
    return picks;
}

/**
 * Setup view toggle
 */
function setupViewToggle() {
    const gridBtn = document.getElementById('gridViewBtn');
    const listBtn = document.getElementById('listViewBtn');
    
    if (!gridBtn || !listBtn) return;
    
    gridBtn.addEventListener('click', () => {
        currentView = 'grid';
        gridBtn.classList.add('active');
        listBtn.classList.remove('active');
        displayDraftPicks();
    });
    
    listBtn.addEventListener('click', () => {
        currentView = 'list';
        listBtn.classList.add('active');
        gridBtn.classList.remove('active');
        displayDraftPicks();
    });
}

/**
 * Display draft picks based on current view
 */
function displayDraftPicks() {
    if (currentView === 'grid') {
        showGridView();
        document.getElementById('gridView').style.display = 'block';
        document.getElementById('listView').style.display = 'none';
    } else {
        showListView();
        document.getElementById('gridView').style.display = 'none';
        document.getElementById('listView').style.display = 'block';
    }
}

/**
 * Show grid view (all teams, all rounds)
 */
function showGridView() {
    const container = document.getElementById('draftGridContainer');
    if (!container) return;
    
    let html = '';
    
    // Group by round
    for (let round = 1; round <= TOTAL_ROUNDS; round++) {
        const roundPicks = draftPicks.filter(p => p.round === round);
        
        if (roundPicks.length === 0) continue;
        
        const isBuyInRound = BUY_IN_ROUNDS[round] !== undefined;
        const buyInCost = BUY_IN_ROUNDS[round] || 0;
        
        html += `
            <div class="round-section">
                <div class="round-header">
                    <h3>Round ${round}</h3>
                    ${isBuyInRound ? `
                        <span class="buy-in-badge">
                            <i class="fas fa-dollar-sign"></i>
                            Buy-In: $${buyInCost}
                        </span>
                    ` : ''}
                </div>
                <div class="picks-grid">
                    ${roundPicks.map(pick => createPickCard(pick)).join('')}
                </div>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

/**
 * Create pick card HTML
 */
function createPickCard(pick) {
    const traded = pick.currentOwner !== pick.originalOwner;
    const isBuyInRound = BUY_IN_ROUNDS[pick.round] !== undefined;
    const boughtIn = buyIns[pick.currentOwner]?.includes(pick.round) || false;
    
    let statusBadge = '';
    if (isBuyInRound) {
        if (boughtIn) {
            statusBadge = '<span class="status-badge bought-in"><i class="fas fa-check"></i></span>';
        } else {
            statusBadge = `<span class="status-badge not-bought-in">$${BUY_IN_ROUNDS[pick.round]}</span>`;
        }
    }
    
    return `
        <div class="pick-card ${traded ? 'traded-pick' : ''}">
            <div class="pick-number">
                ${pick.pick}
                ${traded ? '<span class="pick-badge traded"><i class="fas fa-exchange-alt"></i></span>' : ''}
            </div>
            <div class="pick-owner">
                ${createTeamBadge(pick.currentOwner)}
            </div>
            ${traded ? `
                <div class="pick-original">
                    from ${pick.originalOwner}
                </div>
            ` : ''}
            ${statusBadge}
        </div>
    `;
}

/**
 * Show list view (your picks only)
 */
function showListView() {
    const container = document.getElementById('myPicksContainer');
    
    // Get current user's team
    let userTeam = null;
    if (typeof authManager !== 'undefined' && authManager.isAuthenticated()) {
        userTeam = authManager.getTeam()?.abbreviation;
    }
    
    if (!userTeam) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-sign-in-alt"></i>
                <p>Please log in to view your draft picks</p>
                <a href="login.html" class="btn-primary">
                    <i class="fas fa-sign-in-alt"></i>
                    Login with Discord
                </a>
            </div>
        `;
        return;
    }
    
    currentTeam = userTeam;
    
    // Get this team's picks
    const myPicks = draftPicks.filter(p => p.currentOwner === userTeam);
    
    if (myPicks.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>You have no draft picks! (This shouldn't happen)</p>
            </div>
        `;
        return;
    }
    
    // Update summary
    const totalPicks = myPicks.length;
    const buyInsComplete = Object.keys(BUY_IN_ROUNDS).filter(round => 
        buyIns[userTeam]?.includes(parseInt(round))
    ).length;
    
    document.getElementById('totalPicksCount').textContent = `${totalPicks} picks`;
    document.getElementById('buyInStatus').textContent = `${buyInsComplete} / 3 buy-ins`;
    
    // Group by round
    let html = '';
    
    // Buy-in rounds first
    [1, 2, 3].forEach(round => {
        const roundPicks = myPicks.filter(p => p.round === round);
        if (roundPicks.length > 0) {
            html += createRoundSection(round, roundPicks, userTeam);
        }
    });
    
    // Other rounds
    const otherPicks = myPicks.filter(p => p.round > 3);
    const roundGroups = {};
    otherPicks.forEach(pick => {
        if (!roundGroups[pick.round]) roundGroups[pick.round] = [];
        roundGroups[pick.round].push(pick);
    });
    
    Object.keys(roundGroups).sort((a, b) => a - b).forEach(round => {
        html += createRoundSection(parseInt(round), roundGroups[round], userTeam);
    });
    
    container.innerHTML = html;
}

/**
 * Create round section for list view
 */
function createRoundSection(round, picks, userTeam) {
    const isBuyInRound = BUY_IN_ROUNDS[round] !== undefined;
    const buyInCost = BUY_IN_ROUNDS[round] || 0;
    const boughtIn = buyIns[userTeam]?.includes(round) || false;
    
    return `
        <div class="my-round-section">
            <div class="my-round-header">
                <h4>Round ${round}</h4>
                ${isBuyInRound ? `
                    <div class="buy-in-status">
                        ${boughtIn ? `
                            <span class="status-badge bought-in">
                                <i class="fas fa-check-circle"></i>
                                Bought In ($${buyInCost})
                            </span>
                        ` : `
                            <span class="status-badge not-bought-in">
                                <i class="fas fa-dollar-sign"></i>
                                Buy-In Required: $${buyInCost}
                            </span>
                        `}
                    </div>
                ` : ''}
            </div>
            <div class="my-picks-list">
                ${picks.map(pick => {
                    const traded = pick.currentOwner !== pick.originalOwner;
                    return `
                        <div class="my-pick-card">
                            <div class="my-pick-info">
                                <span class="my-pick-number">Pick ${pick.pick}</span>
                                ${traded ? `
                                    <span class="my-pick-origin">
                                        <i class="fas fa-exchange-alt"></i>
                                        Acquired from ${pick.originalOwner}
                                    </span>
                                ` : `
                                    <span class="my-pick-origin text-muted">
                                        Original pick
                                    </span>
                                `}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

// Make function available globally
window.initDraftPicksPage = initDraftPicksPage;
