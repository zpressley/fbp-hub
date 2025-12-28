/**
 * FBP Hub - Self-Service Transactions
 * Graduate prospects, buy DC slots, manage 30-man roster
 */

let userTeam = null;
let eligibleGraduations = [];
let dcSlotsUsed = 0;
let rosterCompliance = [];

function initTransactionsPage() {
    console.log('🔄 Initializing transactions page...');
    
    // Check authentication
    if (typeof authManager === 'undefined' || !authManager.isAuthenticated()) {
        document.getElementById('authRequired').style.display = 'flex';
        document.getElementById('transactionDashboard').style.display = 'none';
        return;
    }
    
    // Get user's team
    userTeam = authManager.getTeam()?.abbreviation;
    if (!userTeam) {
        showError('Could not determine your team');
        return;
    }
    
    // Hide auth required, show dashboard
    document.getElementById('authRequired').style.display = 'none';
    document.getElementById('transactionDashboard').style.display = 'block';
    
    // Setup tabs
    setupTabs();
    
    // Load data
    loadTransactionData();
}

function setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;
            
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            
            tab.classList.add('active');
            document.getElementById(`${targetTab}-tab`).classList.add('active');
        });
    });
}

async function loadTransactionData() {
    // Load service stats for graduations
    try {
        const response = await fetch('./data/service_stats.json');
        if (response.ok) {
            const stats = await response.json();
            checkEligibleGraduations(stats);
        }
    } catch (e) {
        console.log('No service stats available');
    }
    
    // Load 30-man compliance
    check30ManCompliance();
    
    // Update UI
    updateQuickStats();
    displayGraduations();
    displayDCSlots();
    display30ManRoster();
}

function checkEligibleGraduations(stats) {
    eligibleGraduations = [];
    
    const myProspects = FBPHub.data.players.filter(p => 
        p.manager === userTeam && p.player_type === 'Farm'
    );
    
    myProspects.forEach(prospect => {
        const playerStats = stats[prospect.name];
        if (!playerStats) return;
        
        const mlbLimits = playerStats.mlb_limits_status;
        const fbpLimits = playerStats.fbp_limits_status;
        
        // Check if graduated (exceeded limits)
        const mlbExceeded = Object.values(mlbLimits).some(l => l.exceeded);
        const fbpExceeded = Object.values(fbpLimits).some(l => l.exceeded);
        
        if (mlbExceeded || fbpExceeded) {
            const isPC = prospect.years_simple?.includes('PC') || prospect.contract_type?.includes('Purchased');
            eligibleGraduations.push({
                ...prospect,
                refundAmount: isPC ? 15 : 0,
                limitType: fbpExceeded ? 'FBP' : 'MLB'
            });
        }
    });
}

function check30ManCompliance() {
    rosterCompliance = [];
    // This would check MLB-active prospects not on Yahoo roster
    // Needs integration with Yahoo roster data
}

function updateQuickStats() {
    document.getElementById('eligibleGrads').textContent = eligibleGraduations.length;
    document.getElementById('dcSlotsAvailable').textContent = Math.max(0, 2 - dcSlotsUsed);
    document.getElementById('rosterAlerts').textContent = rosterCompliance.length;
}

function displayGraduations() {
    const container = document.getElementById('graduationsList');
    
    if (eligibleGraduations.length === 0) {
        container.innerHTML = `
            <div class="empty-message">
                <i class="fas fa-check-circle"></i>
                <p>No prospects ready for graduation</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = eligibleGraduations.map(p => `
        <div class="graduation-card">
            <div class="grad-player-info">
                <h4>${p.name}</h4>
                <div class="grad-meta">
                    <span>${p.position} - ${p.team}</span>
                    <span class="grad-limit">${p.limitType} limits exceeded</span>
                </div>
            </div>
            <div class="grad-action">
                ${p.refundAmount > 0 ? `<div class="refund-badge">+$${p.refundAmount} refund</div>` : ''}
                <button class="btn-primary" onclick="graduateProspect('${p.name}', ${p.refundAmount})">
                    <i class="fas fa-graduation-cap"></i>
                    Graduate to R-4
                </button>
            </div>
        </div>
    `).join('');
}

function displayDCSlots() {
    const btn = document.getElementById('buyDCSlot');
    const status = document.getElementById('dcStatus');
    
    // Check current DC usage
    const myProspects = FBPHub.data.players.filter(p => 
        p.manager === userTeam && p.player_type === 'Farm'
    );
    dcSlotsUsed = myProspects.filter(p => 
        p.years_simple?.includes('DC') || p.contract_type?.includes('Development')
    ).length;
    
    if (dcSlotsUsed >= 2) {
        btn.disabled = true;
        status.innerHTML = '<span class="text-muted">Maximum DC slots reached (2/2)</span>';
    } else {
        btn.disabled = false;
        status.innerHTML = `<span class="text-success">Can purchase ${2 - dcSlotsUsed} more DC slot(s)</span>`;
    }
}

function display30ManRoster() {
    const container = document.getElementById('roster30List');
    container.innerHTML = `
        <div class="info-message">
            <i class="fas fa-info-circle"></i>
            <p>30-Man roster tracking requires Yahoo API integration</p>
            <p class="text-muted">Coming soon: Automatic compliance checking</p>
        </div>
    `;
}

async function graduateProspect(playerName, refundAmount) {
    if (!confirm(`Graduate ${playerName} to R-4 contract?${refundAmount > 0 ? `\n\nYou will receive a $${refundAmount} refund.` : ''}`)) {
        return;
    }
    
    // In production, this would call Cloudflare Worker
    console.log(`Graduating ${playerName}, refund: $${refundAmount}`);
    
    showToast(`${playerName} graduated! ${refundAmount > 0 ? `$${refundAmount} refund pending` : ''}`, 5000);
    
    // Remove from eligible list
    eligibleGraduations = eligibleGraduations.filter(p => p.name !== playerName);
    displayGraduations();
    updateQuickStats();
}

function showError(message) {
    const dashboard = document.getElementById('transactionDashboard');
    dashboard.innerHTML = `
        <div class="error-message">
            <i class="fas fa-exclamation-triangle"></i>
            <p>${message}</p>
        </div>
    `;
}

window.initTransactionsPage = initTransactionsPage;
window.graduateProspect = graduateProspect;
