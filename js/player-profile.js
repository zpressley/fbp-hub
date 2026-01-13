/**
 * FBP Hub - Player Profile Page
 * Comprehensive player view with stats, history, and transactions
 */

let PLAYER_DATA = {
    upid: null,
    player: null,
    stats: null,
    history: [],
    transactions: []
};

/**
 * Initialize player profile page
 */
async function initPlayerProfile() {
    console.log('👤 Initializing player profile...');
    
    // Get player UPID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const upid = urlParams.get('upid');
    const playerName = urlParams.get('name');
    
    if (!upid && !playerName) {
        showNotFound();
        return;
    }
    
    // Load player data
    await loadPlayerData(upid, playerName);
    
    if (!PLAYER_DATA.player) {
        showNotFound();
        return;
    }
    
    // Display player profile
    displayPlayerHeader();
    displayOverview();
    displayStats();
    displayHistory();
    displayTransactions();
    
    // Setup tabs
    setupTabs();
    
    // Show profile
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('playerProfile').style.display = 'block';
}

/**
 * Load all player data
 */
async function loadPlayerData(upid, playerName) {
    // Load player from combined_players.json
    if (typeof FBPHub !== 'undefined' && FBPHub.data?.players) {
        if (upid) {
            PLAYER_DATA.player = FBPHub.data.players.find(p => p.upid === upid);
        } else if (playerName) {
            PLAYER_DATA.player = FBPHub.data.players.find(p => 
                p.name.toLowerCase() === playerName.toLowerCase()
            );
        }
        
        if (PLAYER_DATA.player) {
            PLAYER_DATA.upid = PLAYER_DATA.player.upid;
        }
    }
    
    if (!PLAYER_DATA.player) {
        // Try to load from mock data
        PLAYER_DATA.player = getMockPlayer(upid, playerName);
        if (PLAYER_DATA.player) {
            PLAYER_DATA.upid = PLAYER_DATA.player.upid;
        }
    }
    
    if (!PLAYER_DATA.player) return;
    
    // Service-time based stats were removed in 2026; we currently don't load per-player stats here.
    PLAYER_DATA.stats = null;
    
    // Load player history from player_log.json
    try {
        const logResponse = await fetch('./data/player_log.json');
        if (logResponse.ok) {
            const playerLog = await logResponse.json();
            PLAYER_DATA.history = playerLog.filter(entry => 
                entry.upid === PLAYER_DATA.upid || 
                entry.player_name === PLAYER_DATA.player.name
            ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        }
    } catch (e) {
        console.log('No player log available');
    }
    
    // Load WizBucks transactions related to player
    try {
        const wbResponse = await fetch('./data/wizbucks_ledger.json');
        if (wbResponse.ok) {
            const wbLedger = await wbResponse.json();
            PLAYER_DATA.transactions = wbLedger.filter(txn => 
                txn.related_player?.upid === PLAYER_DATA.upid ||
                txn.related_player?.name === PLAYER_DATA.player.name
            ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        }
    } catch (e) {
        console.log('No WizBucks ledger available');
        // Fallback to localStorage for testing
        const ledger = JSON.parse(localStorage.getItem('wizbucks_ledger') || '[]');
        PLAYER_DATA.transactions = ledger.filter(txn => 
            txn.related_player?.upid === PLAYER_DATA.upid ||
            txn.related_player?.name === PLAYER_DATA.player.name
        );
    }
}

/**
 * Mock player data for testing
 */
function getMockPlayer(upid, playerName) {
    const mockPlayers = [
        {
            upid: '12345',
            name: 'Leo de Vries',
            team: 'ATL',
            position: 'SS',
            age: 20,
            level: 'AAA',
            player_type: 'Farm',
            manager: 'WIZ',
            contract_type: 'PC',
            years_simple: 'P',
            photo_url: null
        }
    ];
    
    if (upid) {
        return mockPlayers.find(p => p.upid === upid);
    } else if (playerName) {
        return mockPlayers.find(p => p.name.toLowerCase() === playerName.toLowerCase());
    }
    
    return null;
}

/**
 * Display player header
 */
function displayPlayerHeader() {
    const player = PLAYER_DATA.player;
    
    document.getElementById('playerName').textContent = player.name;
    document.getElementById('playerPosition').textContent = player.position || 'N/A';
    document.getElementById('playerTeam').textContent = player.team || 'FA';
    document.getElementById('playerAge').textContent = player.age ? `Age ${player.age}` : 'Age N/A';
    document.getElementById('playerOwner').textContent = player.manager || 'Unowned';
    
    // Set page title
    document.title = `${player.name} - FBP Hub`;
    
    // Handle photo
    if (player.photo_url) {
        document.getElementById('playerPhoto').src = player.photo_url;
        document.getElementById('playerPhoto').style.display = 'block';
        document.getElementById('photoPlaceholder').style.display = 'none';
    } else {
        document.getElementById('playerPhoto').style.display = 'none';
        document.getElementById('photoPlaceholder').style.display = 'flex';
    }
    
    // Update stat cards
    document.getElementById('playerContract').textContent = player.contract_type || 'None';
    document.getElementById('playerYears').textContent = player.years_simple || 'N/A';
    document.getElementById('playerType').textContent = player.player_type || 'Unknown';
    
    // Show contract salary if keeper
    if (player.player_type === 'MLB' && player.contract_type) {
        const salary = getKeeperSalary(player.contract_type);
        if (salary) {
            document.getElementById('contractSublabel').textContent = `$${salary} salary`;
        }
    }

    // Service-time based progress has been deprecated; keep the service card hidden for now.
}

/**
 * Display overview tab
 */
function displayOverview() {
    const player = PLAYER_DATA.player;
    
    // Current season stats
    if (PLAYER_DATA.stats) {
        const stats = PLAYER_DATA.stats;
        const statsHTML = `
            <div class="info-card">
                ${stats.at_bats ? `<div class="info-row"><span class="info-label">At Bats</span><span class="info-value">${stats.at_bats}</span></div>` : ''}
                ${stats.innings_pitched ? `<div class="info-row"><span class="info-label">Innings Pitched</span><span class="info-value">${stats.innings_pitched}</span></div>` : ''}
                ${stats.pitching_appearances ? `<div class="info-row"><span class="info-label">Appearances</span><span class="info-value">${stats.pitching_appearances}</span></div>` : ''}
                ${stats.active_days ? `<div class="info-row"><span class="info-label">Active Days</span><span class="info-value">${stats.active_days}</span></div>` : ''}
                <div class="info-row"><span class="info-label">Games Played</span><span class="info-value">${stats.games_played || 0}</span></div>
            </div>
        `;
        document.getElementById('currentSeasonStats').innerHTML = statsHTML;
    } else {
        document.getElementById('currentSeasonStats').innerHTML = '<div class="empty-state"><i class="fas fa-chart-line"></i><p>No stats available</p></div>';
    }
    
    // Contract details
    const contractHTML = `
        <div class="info-card">
            <div class="info-row">
                <span class="info-label">Current Contract</span>
                <span class="info-value">${player.contract_type || 'None'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Years Status</span>
                <span class="info-value">${player.years_simple || 'N/A'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Player Type</span>
                <span class="info-value">${player.player_type || 'Unknown'}</span>
            </div>
            ${player.player_type === 'MLB' && player.contract_type ? `
                <div class="info-row">
                    <span class="info-label">Keeper Salary</span>
                    <span class="info-value">$${getKeeperSalary(player.contract_type) || '?'}</span>
                </div>
            ` : ''}
        </div>
    `;
    document.getElementById('contractDetails').innerHTML = contractHTML;
    
    // Ownership timeline
    displayOwnershipTimeline();
}

/**
 * Display ownership timeline
 */
function displayOwnershipTimeline() {
    const history = PLAYER_DATA.history.filter(h => 
        h.update_type === 'trade_acquired' || 
        h.update_type === 'trade_sent' ||
        h.update_type === 'contract_assigned' ||
        h.owner
    );
    
    if (history.length === 0) {
        document.getElementById('ownershipTimeline').innerHTML = '<div class="empty-state"><i class="fas fa-timeline"></i><p>No ownership history</p></div>';
        return;
    }
    
    // Group by owner
    const periods = [];
    let currentOwner = PLAYER_DATA.player.manager;
    let currentStart = new Date().toISOString();
    
    periods.push({
        owner: currentOwner,
        start: currentStart,
        end: null,
        isCurrent: true
    });
    
    // Build periods from history
    history.forEach(entry => {
        if (entry.update_type === 'trade_sent') {
            periods.push({
                owner: entry.owner,
                start: entry.timestamp,
                end: currentStart,
                isCurrent: false,
                event: 'Traded away'
            });
            currentStart = entry.timestamp;
        }
    });
    
    const timelineHTML = periods.map(period => `
        <div class="ownership-period ${period.isCurrent ? 'current' : ''}">
            <div class="ownership-period-header">
                <div class="ownership-team">
                    ${period.owner}
                    ${period.isCurrent ? '<i class="fas fa-check-circle" style="color: var(--success); margin-left: 8px;"></i>' : ''}
                </div>
                <div class="ownership-dates">
                    ${formatDate(period.start)}${period.end ? ` - ${formatDate(period.end)}` : ' - Present'}
                </div>
            </div>
            ${period.event ? `<div class="ownership-details">${period.event}</div>` : ''}
        </div>
    `).join('');
    
    document.getElementById('ownershipTimeline').innerHTML = timelineHTML;
}

/**
 * Display stats tab
 */
function displayStats() {
    // Career stats
    if (PLAYER_DATA.stats && PLAYER_DATA.stats.career_stats) {
        const career = PLAYER_DATA.stats.career_stats;
        const statsHTML = `
            <table class="stats-table">
                <thead>
                    <tr>
                        <th>Stat</th>
                        <th>Value</th>
                    </tr>
                </thead>
                <tbody>
                    ${career.career_games ? `<tr><td>Games</td><td>${career.career_games}</td></tr>` : ''}
                    ${career.career_at_bats ? `<tr><td>At Bats</td><td>${career.career_at_bats}</td></tr>` : ''}
                    ${career.career_innings ? `<tr><td>Innings Pitched</td><td>${career.career_innings}</td></tr>` : ''}
                    ${career.career_appearances ? `<tr><td>Appearances</td><td>${career.career_appearances}</td></tr>` : ''}
                    ${career.seasons_played ? `<tr><td>MLB Seasons</td><td>${career.seasons_played}</td></tr>` : ''}
                    ${career.debut_year ? `<tr><td>Debut Year</td><td>${career.debut_year}</td></tr>` : ''}
                </tbody>
            </table>
        `;
        document.getElementById('careerStats').innerHTML = statsHTML;
    } else {
        document.getElementById('careerStats').innerHTML = '<div class="empty-state"><i class="fas fa-chart-bar"></i><p>No career stats available</p></div>';
    }
    
    // Season-by-season would go here
    document.getElementById('seasonStats').innerHTML = '<div class="empty-state"><i class="fas fa-calendar-alt"></i><p>Season stats coming soon</p></div>';
}

/**
 * Display history tab
 */
function displayHistory() {
    if (PLAYER_DATA.history.length === 0) {
        document.getElementById('playerHistoryTimeline').innerHTML = '<div class="empty-state"><i class="fas fa-clock"></i><p>No history recorded</p></div>';
        return;
    }
    
    const timelineHTML = PLAYER_DATA.history.map(entry => {
        const isMajorEvent = ['prospect_graduated', 'trade_acquired', 'contract_assigned'].includes(entry.update_type);
        
        return `
            <div class="timeline-item">
                <div class="timeline-dot ${isMajorEvent ? 'major' : ''}"></div>
                <div class="timeline-content">
                    <div class="timeline-date">${formatDateTime(entry.timestamp)}</div>
                    <div class="timeline-event">${entry.event}</div>
                    <div class="timeline-details">
                        <span class="transaction-type">${entry.update_type}</span>
                        ${entry.owner ? `<span style="margin-left: var(--space-sm);">by ${entry.owner}</span>` : ''}
                    </div>
                    ${entry.changes && Object.keys(entry.changes).length > 0 ? `
                        <div class="timeline-changes">
                            ${Object.entries(entry.changes).map(([field, change]) => `
                                <div class="timeline-change">
                                    <span class="change-label">${field}:</span>
                                    <span class="change-from">${change.from || 'none'}</span>
                                    <span class="change-arrow">→</span>
                                    <span class="change-to">${change.to}</span>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
    
    document.getElementById('playerHistoryTimeline').innerHTML = timelineHTML;
}

/**
 * Display transactions tab
 */
function displayTransactions() {
    if (PLAYER_DATA.transactions.length === 0) {
        document.getElementById('transactionLog').innerHTML = '<div class="empty-state"><i class="fas fa-exchange-alt"></i><p>No WizBucks transactions</p></div>';
        return;
    }
    
    const transactionsHTML = PLAYER_DATA.transactions.map(txn => `
        <div class="transaction-item">
            <div class="transaction-header">
                <div class="transaction-type">${txn.transaction_type}</div>
                <div class="transaction-date">${formatDateTime(txn.timestamp)}</div>
            </div>
            <div class="transaction-description">${txn.description}</div>
            <div class="transaction-meta">
                <span><i class="fas fa-user"></i> ${txn.team}</span>
                <span><i class="fas fa-tag"></i> ${txn.installment.toUpperCase()}</span>
                <span class="wb-badge ${txn.amount >= 0 ? 'credit' : 'debit'}">
                    ${txn.amount >= 0 ? '+' : ''}$${txn.amount}
                </span>
                <span><i class="fas fa-coins"></i> Balance: $${txn.balance_after}</span>
            </div>
        </div>
    `).join('');
    
    document.getElementById('transactionLog').innerHTML = transactionsHTML;
}

/**
 * Setup tabs
 */
function setupTabs() {
    const tabs = document.querySelectorAll('.profile-tab');
    const contents = document.querySelectorAll('.profile-tab-content');
    
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

/**
 * Show not found state
 */
function showNotFound() {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('playerNotFound').style.display = 'flex';
}

/**
 * Helper functions
 */
function getKeeperSalary(contract) {
    const salaries = {
        'TC-R': 5, 'TC-BC-1': 5, 'TC-BC-2': 5, 'TC-1': 15, 'TC-2': 25,
        'VC-1': 35, 'VC-2': 55,
        'FC-1': 85, 'FC-2': 125, 'FC-2+': 125
    };
    return salaries[contract] || null;
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

/**
 * Create player link helper (for other pages to use)
 */
window.createPlayerLink = function(player) {
    const upid = player.upid || '';
    const name = player.name || player.player_name || '';
    
    if (upid) {
        return `player-profile.html?upid=${encodeURIComponent(upid)}`;
    } else if (name) {
        return `player-profile.html?name=${encodeURIComponent(name)}`;
    }
    
    return '#';
};

// Initialize on load
window.initPlayerProfile = initPlayerProfile;
