/**
 * Weekly Prospect Auction Portal
 * OB/CB bidding system with priority ordering
 */

const AUCTION_SCHEDULE = {
    OB_START: { day: 1, hour: 15 }, // Monday 3pm
    OB_END: { day: 2, hour: 23, minute: 59 }, // Tuesday EOD
    CB_END: { day: 5, hour: 21 }, // Friday 9pm
    OB_FINAL: { day: 6, hour: 23, minute: 59 }, // Saturday EOD
    PROCESS: { day: 0, hour: 23, minute: 59 } // Sunday EOD
};

let userTeam = null;
let currentClaims = [];
let availableProspects = [];
let priorityOrder = [];
let userBalance = 0;

function initAuctionPage() {
    console.log('🏆 Initializing auction portal...');
    
    // Check auth
    if (typeof authManager === 'undefined' || !authManager.isAuthenticated()) {
        document.getElementById('authRequired').style.display = 'flex';
        return;
    }
    
    userTeam = authManager.getTeam()?.abbreviation;
    if (!userTeam) return;
    
    document.getElementById('authRequired').style.display = 'none';
    document.getElementById('auctionDashboard').style.display = 'block';
    
    // Load data
    loadAuctionData();
    
    // Setup UI
    setupTabs();
    setupTimer();
    setupBidModal();
}

async function loadAuctionData() {
    try {
        // Load current auction
        const response = await fetch('./data/auction_current.json');
        if (response.ok) {
            const data = await response.json();
            currentClaims = data.claims || [];
            availableProspects = data.available || [];
            priorityOrder = data.priority || [];
        } else {
            currentClaims = [];
            availableProspects = getUnownedProspects();
            priorityOrder = generatePriorityFromStandings();
        }
        
        // Get user balance
        userBalance = FBPHub.data.wizbucks?.[userTeam] || 0;
        
        updateUI();
        
    } catch (error) {
        console.error('Error loading auction:', error);
    }
}

function getUnownedProspects() {
    return FBPHub.data.players.filter(p => 
        p.player_type === 'Farm' && !p.manager
    );
}

function generatePriorityFromStandings() {
    if (!FBPHub.data.standings?.standings) return [];
    
    // Sort by rank (worst first gets priority)
    return FBPHub.data.standings.standings
        .sort((a, b) => b.rank - a.rank)
        .map((s, index) => ({
            rank: index + 1,
            team: s.team,
            balance: FBPHub.data.wizbucks?.[s.team] || 0
        }));
}

function updateUI() {
    // Update balance
    const balanceEl = document.getElementById('userBalance');
    if (balanceEl) balanceEl.textContent = `$${userBalance}`;
    
    // Update priority
    const priorityEl = document.getElementById('userPriority');
    if (priorityEl) {
        const myPriority = priorityOrder.findIndex(p => p.team === userTeam) + 1;
        priorityEl.textContent = `#${myPriority}`;
    }
    
    // Update tabs
    displayMyBids();
    displayAllClaims();
    displayAvailableProspects();
    displayPriorityOrder();
}

function displayMyBids() {
    const container = document.getElementById('myBidsList');
    const myBids = currentClaims.filter(c => 
        c.originatingBidder === userTeam || 
        c.challengeBids?.some(cb => cb.bidder === userTeam)
    );
    
    if (myBids.length === 0) {
        container.innerHTML = `
            <div class="empty-message">
                <i class="fas fa-inbox"></i>
                <p>No active bids</p>
                <button class="btn-secondary" onclick="switchTab('available')">
                    Browse Available Prospects
                </button>
            </div>
        `;
        return;
    }
    
    container.innerHTML = myBids.map(claim => `
        <div class="claim-card my-claim">
            <div class="claim-player">
                <h4>${claim.prospect}</h4>
                <span class="claim-meta">${claim.position} - ${claim.team}</span>
            </div>
            <div class="claim-bidding">
                <div class="current-bid">
                    High Bid: $${claim.highBid}
                    ${claim.highBidder === userTeam ? 
                        '<span class="winning-badge"><i class="fas fa-crown"></i> Winning</span>' : 
                        '<span class="losing-badge">Outbid</span>'
                    }
                </div>
                ${canChallenge(claim) ? `
                    <button class="btn-challenge" onclick="openChallengeBid('${claim.prospect}', ${claim.highBid})">
                        <i class="fas fa-plus"></i>
                        Raise Bid (+$5 min)
                    </button>
                ` : ''}
            </div>
        </div>
    `).join('');
}

function displayAllClaims() {
    const container = document.getElementById('allClaimsList');
    
    if (currentClaims.length === 0) {
        container.innerHTML = `<div class="empty-message"><i class="fas fa-inbox"></i><p>No active claims this week</p></div>`;
        return;
    }
    
    container.innerHTML = currentClaims.map(claim => `
        <div class="claim-card">
            <div class="claim-header">
                <div class="claim-player">
                    <h4>${claim.prospect}</h4>
                    <span class="claim-meta">${claim.position} - ${claim.team || 'FA'}</span>
                </div>
                <div class="claim-originator">
                    OB by ${createTeamBadge(claim.originatingBidder)}
                </div>
            </div>
            <div class="claim-bids">
                <div class="bid-amount">High Bid: <strong>$${claim.highBid}</strong></div>
                <div class="bid-leader">Leader: ${createTeamBadge(claim.highBidder)}</div>
            </div>
            ${claim.challengeBids?.length > 0 ? `
                <div class="challenge-history">
                    <strong>Challenges:</strong> ${claim.challengeBids.map(cb => 
                        `${cb.bidder} ($${cb.amount})`
                    ).join(', ')}
                </div>
            ` : ''}
        </div>
    `).join('');
}

function displayAvailableProspects() {
    const container = document.getElementById('availableProspectsList');
    
    if (availableProspects.length === 0) {
        container.innerHTML = `<div class="empty-message"><i class="fas fa-check-circle"></i><p>All prospects claimed!</p></div>`;
        return;
    }
    
    // Show top 20 unowned prospects
    container.innerHTML = availableProspects.slice(0, 20).map(p => `
        <div class="prospect-card">
            <div class="prospect-info">
                <h4>${p.name}</h4>
                <span class="prospect-meta">${p.position} - ${p.team || 'FA'}</span>
            </div>
            <button class="btn-primary" onclick="openOriginatingBid('${p.name}')">
                <i class="fas fa-gavel"></i>
                Place OB ($10 min)
            </button>
        </div>
    `).join('');
}

function displayPriorityOrder() {
    const container = document.getElementById('priorityOrderList');
    
    container.innerHTML = `
        <div class="priority-table">
            ${priorityOrder.map(p => `
                <div class="priority-row ${p.team === userTeam ? 'user-row' : ''}">
                    <div class="priority-rank">#${p.rank}</div>
                    <div class="priority-team">${createTeamBadge(p.team)}</div>
                    <div class="priority-balance">$${p.balance}</div>
                </div>
            `).join('')}
        </div>
    `;
}

function setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            
            tab.classList.add('active');
            document.getElementById(`${tab.dataset.tab}-tab`).classList.add('active');
        });
    });
}

function setupTimer() {
    updateAuctionTimer();
    setInterval(updateAuctionTimer, 60000); // Update every minute
}

function updateAuctionTimer() {
    const status = document.getElementById('timerStatus');
    const countdown = document.getElementById('timerCountdown');
    
    const now = new Date();
    const day = now.getDay(); // 0=Sunday, 1=Monday...
    const hour = now.getHours();
    
    let phase = 'Closed';
    if (day === 1 && hour >= 15) phase = 'OB Open';
    else if (day === 2) phase = 'OB Closing Soon';
    else if (day >= 3 && day <= 5) phase = 'CB Active';
    else if (day === 6) phase = 'OB Final Window';
    else if (day === 0) phase = 'Processing';
    
    status.textContent = phase;
    countdown.textContent = getNextDeadline();
}

function getNextDeadline() {
    const now = new Date();
    const day = now.getDay();
    
    if (day === 1) return 'OB ends Tuesday 11:59pm';
    if (day === 2) return 'CB starts Wednesday';
    if (day >= 3 && day <= 4) return 'CB ends Friday 9pm';
    if (day === 5) return 'OB final window Saturday';
    if (day === 6) return 'Results Sunday';
    return 'Opens Monday 3pm';
}

function canChallenge(claim) {
    const now = new Date();
    const day = now.getDay();
    
    // CB window: Wed-Fri before 9pm
    if (day >= 3 && day <= 5) {
        if (day === 5 && now.getHours() >= 21) return false;
        return claim.originatingBidder !== userTeam;
    }
    return false;
}

function setupBidModal() {
    const closeBtn = document.getElementById('closeBidModal');
    const modal = document.getElementById('bidModal');
    
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }
    
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.style.display = 'none';
        });
    }
}

function openOriginatingBid(prospectName) {
    const modal = document.getElementById('bidModal');
    const body = document.getElementById('bidModalBody');
    
    body.innerHTML = `
        <div class="bid-form">
            <h4>${prospectName}</h4>
            <div class="bid-input-group">
                <label>OB Amount (min $10)</label>
                <div class="amount-selector">
                    <button onclick="adjustBid(-5)">-$5</button>
                    <input type="number" id="bidAmount" value="10" min="10" step="5">
                    <button onclick="adjustBid(5)">+$5</button>
                </div>
            </div>
            <div class="bid-rules">
                <p><strong>Rules:</strong></p>
                <ul>
                    <li>Minimum $10 OB</li>
                    <li>1 OB per team per week</li>
                    <li>$5 increments only</li>
                    <li>If 2 OBs placed, claim auto-wins (no waiver pool)</li>
                </ul>
            </div>
            <div class="bid-summary">
                <div>Your balance: $${userBalance}</div>
                <div>After bid: $<span id="afterBidBalance">${userBalance - 10}</span></div>
            </div>
            <button class="btn-primary btn-full" onclick="confirmOB('${prospectName}')">
                Confirm OB
            </button>
        </div>
    `;
    
    modal.style.display = 'flex';
}

function openChallengeBid(prospectName, currentBid) {
    const modal = document.getElementById('bidModal');
    const body = document.getElementById('bidModalBody');
    const minRaise = currentBid + 5;
    
    body.innerHTML = `
        <div class="bid-form">
            <h4>Challenge: ${prospectName}</h4>
            <div class="current-bid-display">Current High: $${currentBid}</div>
            <div class="bid-input-group">
                <label>Your CB (min $${minRaise})</label>
                <div class="amount-selector">
                    <button onclick="adjustBid(-5)">-$5</button>
                    <input type="number" id="bidAmount" value="${minRaise}" min="${minRaise}" step="5">
                    <button onclick="adjustBid(5)">+$5</button>
                </div>
            </div>
            <div class="bid-rules">
                <p><strong>CB Rules:</strong></p>
                <ul>
                    <li>Must raise by $5 minimum</li>
                    <li>1 CB per OB per day</li>
                    <li>CB window: Wed-Fri 9pm</li>
                </ul>
            </div>
            <div class="bid-summary">
                <div>Your balance: $${userBalance}</div>
                <div>After bid: $<span id="afterBidBalance">${userBalance - minRaise}</span></div>
            </div>
            <button class="btn-primary btn-full" onclick="confirmCB('${prospectName}')">
                Confirm Challenge
            </button>
        </div>
    `;
    
    modal.style.display = 'flex';
}

function adjustBid(amount) {
    const input = document.getElementById('bidAmount');
    const current = parseInt(input.value);
    const newVal = current + amount;
    const min = parseInt(input.min);
    
    if (newVal >= min && newVal <= userBalance) {
        input.value = newVal;
        document.getElementById('afterBidBalance').textContent = userBalance - newVal;
    }
}

async function confirmOB(prospect) {
    const amount = parseInt(document.getElementById('bidAmount').value);
    
    if (amount > userBalance) {
        alert('Insufficient balance!');
        return;
    }
    
    // In production: POST to Cloudflare Worker
    console.log(`OB: ${prospect} for $${amount}`);
    
    showToast(`Originating bid placed: ${prospect} for $${amount}`, 5000);
    document.getElementById('bidModal').style.display = 'none';
    
    // Reload data (would come from server)
    setTimeout(() => loadAuctionData(), 500);
}

async function confirmCB(prospect) {
    const amount = parseInt(document.getElementById('bidAmount').value);
    
    if (amount > userBalance) {
        alert('Insufficient balance!');
        return;
    }
    
    console.log(`CB: ${prospect} for $${amount}`);
    showToast(`Challenge bid placed: ${prospect} for $${amount}`, 5000);
    document.getElementById('bidModal').style.display = 'none';
    
    setTimeout(() => loadAuctionData(), 500);
}

function switchTab(tabName) {
    document.querySelector(`[data-tab="${tabName}"]`).click();
}

window.initAuctionPage = initAuctionPage;
window.openOriginatingBid = openOriginatingBid;
window.openChallengeBid = openChallengeBid;
window.adjustBid = adjustBid;
window.confirmOB = confirmOB;
window.confirmCB = confirmCB;
window.switchTab = switchTab;
