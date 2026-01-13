/**
 * FBP Hub - Rosters Page JavaScript
 * Handles displaying keeper and prospect rosters by team
 */

// Page state
let currentRosterType = 'keepers';
let selectedTeam = '';

/**
 * Initialize rosters page
 */
function initRostersPage() {
    console.log('📋 Initializing rosters page...');
    
    // Check URL for roster type + team
    const urlParams = new URLSearchParams(window.location.search);
    const typeParam = urlParams.get('type');
    const teamParam = urlParams.get('team');

    if (typeParam === 'prospects') {
        currentRosterType = 'prospects';
    }

    if (teamParam && TEAM_NAMES[teamParam]) {
        selectedTeam = teamParam;
    }
    
    // Setup roster type toggle
    setupRosterTypeToggle();
    
    // Setup team selector
    setupTeamSelector();
    
    // Update UI for current type
    updateRosterType();
    
    // Display rosters
    displayRosters();
}

/**
 * Setup roster type toggle
 */
function setupRosterTypeToggle() {
    const typeBtns = document.querySelectorAll('.roster-type-btn');
    
    typeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.type;
            
            if (type !== currentRosterType) {
                currentRosterType = type;
                
                typeBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                updateRosterType();
                displayRosters();
                
                // Update URL
                const url = new URL(window.location);
                url.searchParams.set('type', type);
                window.history.pushState({}, '', url);
            }
        });
        
        // Set active based on current type
        if (btn.dataset.type === currentRosterType) {
            btn.classList.add('active');
        }
    });
}

/**
 * Setup team selector dropdown
 */
function setupTeamSelector() {
    const teamSelect = document.getElementById('teamSelect');
    
    if (!teamSelect) return;
    
    // Populate team options
    Object.entries(TEAM_NAMES).forEach(([abbr, name]) => {
        const option = document.createElement('option');
        option.value = abbr;
        option.textContent = `${abbr} - ${name}`;
        if (selectedTeam === abbr) {
            option.selected = true;
        }
        teamSelect.appendChild(option);
    });

    // If selectedTeam came from URL, ensure the select reflects it
    if (selectedTeam && !TEAM_NAMES[selectedTeam]) {
        // Fallback: reset to all teams if somehow invalid
        selectedTeam = '';
        teamSelect.value = '';
    }
    
    // Listen for changes
    teamSelect.addEventListener('change', (e) => {
        selectedTeam = e.target.value;
        displayRosters();
    });
}

/**
 * Update UI for current roster type
 */
function updateRosterType() {
    const titleEl = document.getElementById('rosterTitle');
    
    if (titleEl) {
        if (currentRosterType === 'keepers') {
            titleEl.innerHTML = `
                <i class="fas fa-baseball-ball"></i>
                Keeper Rosters
            `;
        } else {
            titleEl.innerHTML = `
                <i class="fas fa-seedling"></i>
                Prospect Rosters
            `;
        }
    }
}

/**
 * Display rosters based on selection
 */
function displayRosters() {
    const container = document.getElementById('rosterContainer');
    
    if (!container) return;
    
    if (selectedTeam) {
        displaySingleTeamRoster(selectedTeam, container);
    } else {
        displayAllTeamsRosters(container);
    }
}

/**
 * Display all teams rosters
 */
function displayAllTeamsRosters(container) {
    const teams = Object.keys(TEAM_NAMES).sort();
    
    const teamsHTML = teams.map(teamAbbr => {
        return createTeamRosterCard(teamAbbr);
    }).join('');
    
    container.innerHTML = `<div class="all-teams-grid">${teamsHTML}</div>`;
}

/**
 * Display single team roster
 */
function displaySingleTeamRoster(teamAbbr, container) {
    container.innerHTML = createTeamRosterCard(teamAbbr, true);
}

/**
 * Create team roster card HTML
 */
function createTeamRosterCard(teamAbbr, detailed = false) {
    const teamName = TEAM_NAMES[teamAbbr];
    
    // Get players for this team by FBP_Team abbreviation
    const players = FBPHub.data.players.filter(p => p.FBP_Team === teamAbbr);
    
    // Filter by roster type
    let rosterPlayers;
    if (currentRosterType === 'keepers') {
        rosterPlayers = players.filter(p => p.player_type === 'MLB');
    } else {
        rosterPlayers = players.filter(p => p.player_type === 'Farm');
    }
    
    if (rosterPlayers.length === 0) {
        return `
            <div class="team-roster-card">
                <div class="team-roster-header">
                    <div class="team-name">${teamAbbr} - ${teamName}</div>
                </div>
                <div class="empty-roster">
                    <i class="fas fa-inbox"></i>
                    <p>No ${currentRosterType} on this roster</p>
                </div>
            </div>
        `;
    }
    
    // Group by position into batters vs pitchers
    const { batters, pitchers } = groupPlayersByPosition(rosterPlayers);
    
    // Create batters column HTML
    const batterGroupsHTML = Object.entries(batters)
        .filter(([, players]) => players.length > 0)
        .map(([groupName, players]) => {
            const playersHTML = players.map(player => createDepthTableRow(player)).join('');
            
            return `
                <div class="position-group">
                    <div class="position-group-header">${groupName}</div>
                    <table class="roster-depth-table">
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
                            ${playersHTML}
                        </tbody>
                    </table>
                </div>
            `;
        }).join('');
    
    // Create pitchers column HTML
    const pitcherGroupsHTML = Object.entries(pitchers)
        .filter(([, players]) => players.length > 0)
        .map(([groupName, players]) => {
            const playersHTML = players.map(player => createDepthTableRow(player)).join('');
            
            return `
                <div class="position-group">
                    <div class="position-group-header">${groupName}</div>
                    <table class="roster-depth-table">
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
                            ${playersHTML}
                        </tbody>
                    </table>
                </div>
            `;
        }).join('');
    
    // Create position groups HTML with 2-column layout
    const groupsHTML = `
        <div class="position-groups-column">
            ${batterGroupsHTML || '<div style="color: var(--text-gray); text-align: center; padding: var(--space-lg);">No batters</div>'}
        </div>
        <div class="position-groups-column">
            ${pitcherGroupsHTML || '<div style="color: var(--text-gray); text-align: center; padding: var(--space-lg);">No pitchers</div>'}
        </div>
    `;
    
    // Create summary if detailed view
    let summaryHTML = '';
    if (detailed) {
        summaryHTML = createRosterSummary(rosterPlayers);
    }
    
    return `
        <div class="team-roster-card">
            <div class="team-roster-header">
                <div class="team-name">${teamAbbr} - ${teamName}</div>
                <div class="team-count">${rosterPlayers.length} players</div>
            </div>
            <div class="position-groups">
                ${groupsHTML}
            </div>
            ${summaryHTML}
        </div>
    `;
}

/**
 * Group players by position category (batters vs pitchers)
 */
function groupPlayersByPosition(players) {
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
        
        // DH can coexist with other positions (e.g., DH/SP like Ohtani)
        if (tokens.includes('DH')) {
            batters['DH'].push(player);
        }

        // Batters (mutually exclusive buckets besides DH)
        if (tokens.includes('C')) {
            batters['Catcher'].push(player);
        } else if (tokens.some(p => ['1B', '2B', '3B', 'SS'].includes(p))) {
            batters['Infield'].push(player);
        } else if (tokens.some(p => ['LF', 'CF', 'RF', 'OF'].includes(p))) {
            batters['Outfield'].push(player);
        }
        
        // Pitchers
        if (tokens.includes('SP')) {
            pitchers['Starting Pitcher'].push(player);
        } else if (tokens.includes('RP')) {
            pitchers['Relief Pitcher'].push(player);
        } else if (tokens.some(p => ['P'].includes(p))) {
            pitchers['Pitcher'].push(player);
        }
    });
    
    return { batters, pitchers };
}

/**
 * Create depth table row for player
 */
function createDepthTableRow(player) {
    const status = player.years_simple || player.status || '';
    const team = player.team || 'FA';
    const pos = player.position || '';
    const age = player.age || '--';
    
    // Determine contract tier for color coding
    let statusClass = 'tc';
    if (status.includes('VC')) statusClass = 'vc';
    else if (status.includes('FC')) statusClass = 'fc';
    
    const profileLink = window.createPlayerLink ? createPlayerLink(player) : '#';
    
    return `
        <tr>
            <td><span class="roster-status ${statusClass}">${status}</span></td>
            <td class="roster-name"><a href="${profileLink}">${player.name}</a></td>
            <td class="roster-team">${team}</td>
            <td class="roster-pos">${pos}</td>
            <td class="roster-age">${age}</td>
        </tr>
    `;
}

/**
 * Create roster summary
 */
function createRosterSummary(players) {
    const batters = players.filter(p => !['SP', 'RP', 'P'].includes(p.position));
    const pitchers = players.filter(p => ['SP', 'RP', 'P'].includes(p.position));
    
    // Count contract types for prospects
    let contractCounts = { FC: 0, PC: 0, DC: 0 };
    if (currentRosterType === 'prospects') {
        players.forEach(p => {
            const contract = p.years_simple || '';
            if (contract.includes('FC')) contractCounts.FC++;
            else if (contract.includes('PC')) contractCounts.PC++;
            else if (contract.includes('DC')) contractCounts.DC++;
        });
    }
    
    return `
        <div class="roster-summary">
            <div class="roster-summary-title">Roster Summary</div>
            <div class="roster-summary-grid">
                <div class="summary-stat">
                    <span class="summary-stat-label">Total</span>
                    <span class="summary-stat-value">${players.length}</span>
                </div>
                <div class="summary-stat">
                    <span class="summary-stat-label">Batters</span>
                    <span class="summary-stat-value">${batters.length}</span>
                </div>
                <div class="summary-stat">
                    <span class="summary-stat-label">Pitchers</span>
                    <span class="summary-stat-value">${pitchers.length}</span>
                </div>
                ${currentRosterType === 'prospects' ? `
                    <div class="summary-stat">
                        <span class="summary-stat-label">Farm (FC)</span>
                        <span class="summary-stat-value">${contractCounts.FC}</span>
                    </div>
                    <div class="summary-stat">
                        <span class="summary-stat-label">Purchased (PC)</span>
                        <span class="summary-stat-value">${contractCounts.PC}</span>
                    </div>
                    <div class="summary-stat">
                        <span class="summary-stat-label">Development (DC)</span>
                        <span class="summary-stat-value">${contractCounts.DC}</span>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

// Make function available globally
window.initRostersPage = initRostersPage;
