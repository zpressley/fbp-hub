/**
 * FBP Hub - Player Profile Page
 * Comprehensive player view with stats, history, and transactions
 */

let PLAYER_DATA = {
    upid: null,
    player: null,
    // stats: { seasons: [...], hasBatting: bool, hasPitching: bool }
    stats: null,
    // unified timeline of events from player_log.json + transactions_history.json
    history: []
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

    // Load per-season stats from player_stats.json (if available)
    PLAYER_DATA.stats = null;
    try {
        const statsResponse = await fetch('./data/player_stats.json');
        if (statsResponse.ok) {
            const allStats = await statsResponse.json();
            const playerStats = (Array.isArray(allStats) ? allStats : []).filter(row =>
                row.upid === PLAYER_DATA.upid ||
                row.player_name === PLAYER_DATA.player.name
            );

            if (playerStats.length > 0) {
                const seasons = [...playerStats].sort((a, b) => (a.season || 0) - (b.season || 0));
                const hasBatting = seasons.some(s => s.stat_type === 'batting');
                const hasPitching = seasons.some(s => s.stat_type === 'pitching');

                PLAYER_DATA.stats = { seasons, hasBatting, hasPitching };
            }
        }
    } catch (e) {
        console.log('No player_stats.json available for player profile');
    }

    // Load unified player history from transactions_history.json + player_log.json
    try {
        const [historyResp, logResp] = await Promise.all([
            fetch('./data/transactions_history.json'),
            fetch('./data/player_log.json')
        ]);

        const historyJson = historyResp.ok ? await historyResp.json() : [];
        const logJson = logResp.ok ? await logResp.json() : [];

        const normalize = (rec, source) => ({
            id: rec.id || '',
            season: rec.season ?? null,
            source,
            timestamp: rec.timestamp || '',
            upid: rec.upid || '',
            player_name: rec.player_name || rec.playerName || '',
            team: rec.team || '',
            pos: rec.pos || rec.position || '',
            owner: rec.owner || '',
            update_type: rec.update_type || rec.updateType || '',
            event: rec.event || '',
            contract: rec.contract || '',
            status: rec.status || '',
            years: rec.years || ''
        });

        const combined = [
            ...(Array.isArray(historyJson) ? historyJson.map(r => normalize(r, 'history')) : []),
            ...(Array.isArray(logJson) ? logJson.map(r => normalize(r, 'player_log')) : [])
        ];

        PLAYER_DATA.history = combined
            .filter(entry =>
                entry.upid === PLAYER_DATA.upid ||
                entry.player_name === PLAYER_DATA.player.name
            )
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } catch (e) {
        console.log('No unified player history available');
        PLAYER_DATA.history = [];
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

    // Latest season stats snapshot (batting + pitching)
    const currentStatsContainer = document.getElementById('currentSeasonStats');
    if (PLAYER_DATA.stats && PLAYER_DATA.stats.seasons?.length) {
        const seasons = PLAYER_DATA.stats.seasons;
        const latestSeason = seasons[seasons.length - 1]?.season;
        const latestBatting = seasons
            .filter(s => s.stat_type === 'batting' && s.season === latestSeason)
            .slice(-1)[0];
        const latestPitching = seasons
            .filter(s => s.stat_type === 'pitching' && s.season === latestSeason)
            .slice(-1)[0];

        let html = '';

        if (latestBatting) {
            html += `
                <div class="info-card">
                    <div class="info-row header-row">
                        <span class="info-label">Batting (${latestSeason})</span>
                    </div>
                    <div class="info-row"><span class="info-label">R</span><span class="info-value">${latestBatting.runs ?? '-'}</span></div>
                    <div class="info-row"><span class="info-label">H</span><span class="info-value">${latestBatting.hits ?? '-'}</span></div>
                    <div class="info-row"><span class="info-label">HR</span><span class="info-value">${latestBatting.homeRuns ?? '-'}</span></div>
                    <div class="info-row"><span class="info-label">RBI</span><span class="info-value">${latestBatting.rbi ?? '-'}</span></div>
                    <div class="info-row"><span class="info-label">SB</span><span class="info-value">${latestBatting.stolenBases ?? '-'}</span></div>
                    <div class="info-row"><span class="info-label">BB</span><span class="info-value">${latestBatting.baseOnBalls ?? '-'}</span></div>
                    <div class="info-row"><span class="info-label">K</span><span class="info-value">${latestBatting.strikeOuts ?? '-'}</span></div>
                    <div class="info-row"><span class="info-label">TB</span><span class="info-value">${latestBatting.totalBases ?? '-'}</span></div>
                    <div class="info-row"><span class="info-label">AVG</span><span class="info-value">${formatRate(latestBatting.avg)}</span></div>
                    <div class="info-row"><span class="info-label">OPS</span><span class="info-value">${formatRate(latestBatting.ops)}</span></div>
                </div>
            `;
        }

        if (latestPitching) {
            const p = latestPitching;
            html += `
                <div class="info-card">
                    <div class="info-row header-row">
                        <span class="info-label">Pitching (${latestSeason})</span>
                    </div>
                    <div class="info-row"><span class="info-label">PAPP</span><span class="info-value">${p.papp ?? p.games ?? '-'}</span></div>
                    <div class="info-row"><span class="info-label">ER</span><span class="info-value">${p.er ?? p.earnedRuns ?? '-'}</span></div>
                    <div class="info-row"><span class="info-label">HR</span><span class="info-value">${p.hrAllowed ?? p.homeRuns ?? '-'}</span></div>
                    <div class="info-row"><span class="info-label">K</span><span class="info-value">${p.strikeOuts ?? p.k ?? '-'}</span></div>
                    <div class="info-row"><span class="info-label">TB</span><span class="info-value">${p.totalBases ?? '-'}</span></div>
                    <div class="info-row"><span class="info-label">ERA</span><span class="info-value">${formatRate(p.era)}</span></div>
                    <div class="info-row"><span class="info-label">H/9</span><span class="info-value">${formatRate(p.h9 || p.hitsPer9)}</span></div>
                    <div class="info-row"><span class="info-label">BB/9</span><span class="info-value">${formatRate(p.bb9 || p.walksPer9)}</span></div>
                    <div class="info-row"><span class="info-label">K/9</span><span class="info-value">${formatRate(p.k9 || p.strikeoutsPer9)}</span></div>
                    <div class="info-row"><span class="info-label">QS</span><span class="info-value">${p.qs ?? p.qualityStarts ?? '-'}</span></div>
                </div>
            `;
        }

        currentStatsContainer.innerHTML = html || '<div class="empty-state"><i class="fas fa-chart-line"></i><p>No stats available</p></div>';
    } else {
        currentStatsContainer.innerHTML = '<div class="empty-state"><i class="fas fa-chart-line"></i><p>No stats available</p></div>';
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
 * Display ownership timeline based on unified history
 */
function displayOwnershipTimeline() {
    const container = document.getElementById('ownershipTimeline');
    if (!container) return;

    const entries = [...(PLAYER_DATA.history || [])]
        .filter(e => e.owner && e.timestamp)
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    if (!entries.length) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-timeline"></i><p>No ownership history</p></div>';
        return;
    }

    const periods = [];
    let currentOwner = entries[0].owner;
    let currentStart = entries[0].timestamp;

    for (let i = 1; i < entries.length; i++) {
        const entry = entries[i];
        if (entry.owner !== currentOwner) {
            periods.push({
                owner: currentOwner,
                start: currentStart,
                end: entry.timestamp,
                isCurrent: false
            });
            currentOwner = entry.owner;
            currentStart = entry.timestamp;
        }
    }

    // Final/current owner period
    periods.push({
        owner: currentOwner,
        start: currentStart,
        end: null,
        isCurrent: !PLAYER_DATA.player.manager || PLAYER_DATA.player.manager === currentOwner
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
        </div>
    `).join('');

    container.innerHTML = timelineHTML;
}

/**
 * Display stats tab
 */
function displayStats() {
    const seasons = PLAYER_DATA.stats?.seasons || [];

    if (!seasons.length) {
        document.getElementById('careerStats').innerHTML = '<div class="empty-state"><i class="fas fa-chart-bar"></i><p>No stats available</p></div>';
        document.getElementById('seasonStats').innerHTML = '<div class="empty-state"><i class="fas fa-calendar-alt"></i><p>No season stats available</p></div>';
        return;
    }

    const battingSeasons = seasons.filter(s => s.stat_type === 'batting').sort((a, b) => (a.season || 0) - (b.season || 0));
    const pitchingSeasons = seasons.filter(s => s.stat_type === 'pitching').sort((a, b) => (a.season || 0) - (b.season || 0));

    // Batting season-by-season table
    if (battingSeasons.length) {
        const battingRows = battingSeasons.map(row => `
            <tr>
                <td>${row.season || ''}</td>
                <td>${row.level || ''}</td>
                <td>${row.games ?? ''}</td>
                <td>${row.atBats ?? ''}</td>
                <td>${row.runs ?? ''}</td>
                <td>${row.hits ?? ''}</td>
                <td>${row.homeRuns ?? ''}</td>
                <td>${row.rbi ?? ''}</td>
                <td>${row.stolenBases ?? ''}</td>
                <td>${row.baseOnBalls ?? ''}</td>
                <td>${row.strikeOuts ?? ''}</td>
                <td>${row.totalBases ?? ''}</td>
                <td>${formatRate(row.avg)}</td>
                <td>${formatRate(row.obp)}</td>
                <td>${formatRate(row.slg)}</td>
                <td>${formatRate(row.ops)}</td>
            </tr>
        `).join('');

        document.getElementById('careerStats').innerHTML = `
            <table class="stats-table">
                <thead>
                    <tr>
                        <th>Year</th>
                        <th>Lvl</th>
                        <th>G</th>
                        <th>AB</th>
                        <th>R</th>
                        <th>H</th>
                        <th>HR</th>
                        <th>RBI</th>
                        <th>SB</th>
                        <th>BB</th>
                        <th>K</th>
                        <th>TB</th>
                        <th>AVG</th>
                        <th>OBP</th>
                        <th>SLG</th>
                        <th>OPS</th>
                    </tr>
                </thead>
                <tbody>
                    ${battingRows}
                </tbody>
            </table>
        `;
    } else {
        document.getElementById('careerStats').innerHTML = '<div class="empty-state"><i class="fas fa-chart-bar"></i><p>No batting stats available</p></div>';
    }

    // Pitching season-by-season table
    if (pitchingSeasons.length) {
        const pitchingRows = pitchingSeasons.map(p => `
            <tr>
                <td>${p.season || ''}</td>
                <td>${p.level || ''}</td>
                <td>${p.papp ?? p.games ?? ''}</td>
                <td>${p.er ?? p.earnedRuns ?? ''}</td>
                <td>${p.hrAllowed ?? p.homeRuns ?? ''}</td>
                <td>${p.strikeOuts ?? p.k ?? ''}</td>
                <td>${p.totalBases ?? ''}</td>
                <td>${formatRate(p.era)}</td>
                <td>${formatRate(p.h9 || p.hitsPer9)}</td>
                <td>${formatRate(p.bb9 || p.walksPer9)}</td>
                <td>${formatRate(p.k9 || p.strikeoutsPer9)}</td>
                <td>${p.qs ?? p.qualityStarts ?? ''}</td>
            </tr>
        `).join('');

        document.getElementById('seasonStats').innerHTML = `
            <table class="stats-table">
                <thead>
                    <tr>
                        <th>Year</th>
                        <th>Lvl</th>
                        <th>PAPP</th>
                        <th>ER</th>
                        <th>HR</th>
                        <th>K</th>
                        <th>TB</th>
                        <th>ERA</th>
                        <th>H/9</th>
                        <th>BB/9</th>
                        <th>K/9</th>
                        <th>QS</th>
                    </tr>
                </thead>
                <tbody>
                    ${pitchingRows}
                </tbody>
            </table>
        `;
    } else {
        document.getElementById('seasonStats').innerHTML = '<div class="empty-state"><i class="fas fa-calendar-alt"></i><p>No pitching stats available</p></div>';
    }
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

// Helper to print decimals cleanly (e.g. AVG/OPS/ERA)
function formatRate(value) {
    if (value === null || value === undefined || value === '') return '-';
    const num = Number(value);
    if (Number.isNaN(num)) return String(value);
    // Show 3 decimals for AVG/ERA-style stats, 3 for OPS by default
    if (num === 0) return '0.000';
    return num.toFixed(3);
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
