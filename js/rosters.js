/**
 * FBP Hub - Rosters Page JavaScript
 * Handles displaying keeper and prospect rosters by team
 */

// Page state
let currentRosterType = 'keepers';
let selectedTeam = '';

// Team mapping
const TEAM_NAMES = {
    'WIZ': 'Whiz Kids',
    'B2J': 'Btwn2Jackies',
    'CFL': 'Country Fried Lamb',
    'HAM': 'Hammers',
    'JEP': 'Jepordizers!',
    'LFB': 'La Flama Blanca',
    'LAW': 'Law-Abiding Citizens',
    'SAD': 'not much of a donkey',
    'DRO': 'Andromedans',
    'RV': 'Rick Vaughn',
    'TBB': 'The Bluke Blokes',
    'WAR': 'Weekend Warriors'
};

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
    
    // Get players for this team. Some records use the team abbreviation (e.g. "WIZ"),
    // others use the full team name (e.g. "Whiz Kids") in the `manager` field.
    // Include both so keepers and prospects all appear.
    const managerKeys = [teamAbbr, teamName];
    const players = FBPHub.data.players.filter(p => managerKeys.includes(p.manager));
    
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
    
    // Group by position
    const groups = groupPlayersByPosition(rosterPlayers);
    
    // Create position groups HTML
    const groupsHTML = Object.entries(groups).map(([groupName, players]) => {
        const playersHTML = players.map(player => {
            if (currentRosterType === 'keepers') {
                return createKeeperPlayerHTML(player);
            } else {
                return createProspectPlayerHTML(player);
            }
        }).join('');
        
        return `
            <div class="position-group">
                <div class="position-group-header">
                    <div class="position-group-title">
                        ${getGroupIcon(groupName)}
                        <span>${groupName}</span>
                    </div>
                    <div class="position-group-count">${players.length}</div>
                </div>
                <div class="position-group-list">
                    ${playersHTML}
                </div>
            </div>
        `;
    }).join('');
    
    // Create summary if detailed view
    let summaryHTML = '';
    if (detailed) {
        summaryHTML = createRosterSummary(rosterPlayers, groups);
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
 * Group players by position category
 */
function groupPlayersByPosition(players) {
    const groups = {
        'Catchers': [],
        'Infielders': [],
        'Outfielders': [],
        'Starting Pitchers': [],
        'Relief Pitchers': []
    };
    
    players.forEach(player => {
        const posStr = player.position || '';
        const tokens = posStr.split(',').map(p => p.trim()).filter(Boolean);
        
        if (tokens.includes('C')) {
            groups['Catchers'].push(player);
        } else if (tokens.some(p => ['1B', '2B', '3B', 'SS'].includes(p))) {
            groups['Infielders'].push(player);
        } else if (tokens.some(p => ['LF', 'CF', 'RF', 'OF'].includes(p))) {
            groups['Outfielders'].push(player);
        } else if (tokens.includes('SP')) {
            groups['Starting Pitchers'].push(player);
        } else if (tokens.some(p => ['RP', 'P'].includes(p))) {
            groups['Relief Pitchers'].push(player);
        }
    });
    
    // Remove empty groups
    return Object.fromEntries(
        Object.entries(groups).filter(([_, players]) => players.length > 0)
    );
}

/**
 * Get icon for position group
 */
function getGroupIcon(groupName) {
    const icons = {
        'Catchers': '<i class="fas fa-baseball-ball"></i>',
        'Infielders': '<i class="fas fa-users"></i>',
        'Outfielders': '<i class="fas fa-running"></i>',
        'Starting Pitchers': '<i class="fas fa-hand-holding"></i>',
        'Relief Pitchers': '<i class="fas fa-fire"></i>'
    };
    
    return icons[groupName] || '<i class="fas fa-user"></i>';
}

/**
 * Create keeper player HTML
 */
function createKeeperPlayerHTML(player) {
    return `
        <div class="roster-player">
            <div class="roster-player-info">
                ${createPositionBadge(player.position)}
                <div>
                    <div class="roster-player-name">${player.name}</div>
                    <div class="roster-player-team">${player.team || 'FA'}</div>
                </div>
            </div>
            <div class="roster-player-badges">
                ${player.years_simple ? createContractBadge(player.years_simple) : ''}
            </div>
        </div>
    `;
}

/**
 * Create prospect player HTML
 */
function createProspectPlayerHTML(player) {
    return `
        <div class="roster-player">
            <div class="roster-player-info">
                ${createPositionBadge(player.position)}
                <div>
                    <div class="roster-player-name">${player.name}</div>
                    <div class="roster-player-team">${player.team || 'Unassigned'}</div>
                </div>
            </div>
            <div class="prospect-status">
                ${player.years_simple ? createContractBadge(player.years_simple) : ''}
                <div class="prospect-contract-info">
                    ${player.contract_type || 'Farm'}
                </div>
            </div>
        </div>
    `;
}

/**
 * Create roster summary
 */
function createRosterSummary(players, groups) {
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