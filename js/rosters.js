/**
 * FBP Hub - Rosters Page JavaScript
 * Handles displaying keeper and prospect rosters by team
 */

// Page state
let currentRosterType = 'keepers';
let selectedTeam = '';
let top100ByUpid = {};  // Lookup for Top 100 rank by UPID

/**
 * Initialize rosters page
 */
async function initRostersPage() {
    console.log('📋 Initializing rosters page...');
    
    // Load Top 100 data
    await loadTop100Data();
    
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
 * Load Top 100 prospects data
 */
async function loadTop100Data() {
    try {
        const response = await fetch('data/top100_prospects.json');
        if (response.ok) {
            const data = await response.json();
            data.forEach(p => {
                if (p.upid) {
                    top100ByUpid[String(p.upid)] = p.rank;
                }
            });
            console.log(`✅ Loaded ${data.length} Top 100 prospects`);
        }
    } catch (e) {
        console.log('No top100_prospects.json available');
    }
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
    
    let groupsHTML;
    
    if (currentRosterType === 'prospects') {
        // Group prospects by contract type (BC, PC, DC)
        groupsHTML = createProspectContractGroupsHTML(rosterPlayers);
    } else {
        // Group keepers by position into batters vs pitchers
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
        groupsHTML = `
            <div class="position-groups-column">
                ${batterGroupsHTML || '<div style="color: var(--text-gray); text-align: center; padding: var(--space-lg);">No batters</div>'}
            </div>
            <div class="position-groups-column">
                ${pitcherGroupsHTML || '<div style="color: var(--text-gray); text-align: center; padding: var(--space-lg);">No pitchers</div>'}
            </div>
        `;
    }
    
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
 * Create prospect groups HTML organized by contract type (BC, PC, DC)
 */
function createProspectContractGroupsHTML(players) {
    // Group players by contract type
    const groups = {
        'Blue Chip Contract (BC)': [],
        'Purchased Contract (PC)': [],
        'Development Contract (DC)': []
    };
    
    players.forEach(player => {
        const ct = (player.contract_type || '').toLowerCase();
        if (ct.includes('purchased')) {
            groups['Purchased Contract (PC)'].push(player);
        } else if (ct.includes('development')) {
            groups['Development Contract (DC)'].push(player);
        } else if (ct.includes('blue chip') || ct.includes('farm')) {
            groups['Blue Chip Contract (BC)'].push(player);
        } else {
            // Uncontracted prospects also go to BC section
            groups['Blue Chip Contract (BC)'].push(player);
        }
    });
    
    // Sort each group by Top 100 rank (if available), then by name
    Object.keys(groups).forEach(key => {
        groups[key].sort((a, b) => {
            const aRank = top100ByUpid[String(a.upid)] || Infinity;
            const bRank = top100ByUpid[String(b.upid)] || Infinity;
            if (aRank !== bRank) return aRank - bRank;
            return (a.name || '').localeCompare(b.name || '');
        });
    });
    
    // Create HTML for each contract type section
    const sectionsHTML = Object.entries(groups)
        .filter(([, players]) => players.length > 0)
        .map(([groupName, players]) => {
            const playersHTML = players.map(player => createProspectTableRow(player)).join('');
            
            return `
                <div class="position-group contract-group">
                    <div class="position-group-header">${groupName} <span class="group-count">(${players.length})</span></div>
                    <table class="roster-depth-table prospect-contract-table">
                        <thead>
                            <tr>
                                <th>TOP 100</th>
                                <th>PLAYER</th>
                                <th>ORG</th>
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
    
    // Return as a single column for prospects (contract type view)
    return `
        <div class="position-groups-column prospect-contracts-layout">
            ${sectionsHTML || '<div style="color: var(--text-gray); text-align: center; padding: var(--space-lg);">No prospects</div>'}
        </div>
    `;
}

/**
 * Create prospect table row with Top 100 rank
 */
function createProspectTableRow(player) {
    const upid = String(player.upid || '');
    const top100Rank = top100ByUpid[upid];
    const rankDisplay = top100Rank ? `<span class="top100-rank">#${top100Rank}</span>` : '<span class="no-rank">-</span>';
    
    const org = player.team || 'FA';
    const pos = player.position || '';
    const age = player.age || '--';
    
    const profileLink = window.createPlayerLink ? createPlayerLink(player) : '#';
    
    return `
        <tr class="${top100Rank ? 'has-top100' : ''}">
            <td class="prospect-rank-cell">${rankDisplay}</td>
            <td class="roster-name"><a href="${profileLink}">${player.name}</a></td>
            <td class="roster-team">${org}</td>
            <td class="roster-pos">${pos}</td>
            <td class="roster-age">${age}</td>
        </tr>
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
        'DH': [],
        'Utility': []
    };
    
    const pitchers = {
        'Starting Pitcher': [],
        'Relief Pitcher': [],
        'Pitcher': []
    };
    
    players.forEach(player => {
        const posStr = player.position || '';
        const tokens = posStr.split(',').map(p => p.trim()).filter(Boolean);

        // Normalize tokens for pitcher detection (handle RHP/LHP style tags for prospects)
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
        } else if (normalizedTokens.includes('UTIL')) {
            batters['Utility'].push(player);
        }
        
        // Pitchers
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
 * Create depth table row for player
 */
function createDepthTableRow(player) {
    // For prospects, display their prospect contract code (PC / DC / BC)
    let status;
    if (player.player_type === 'Farm') {
        status = getProspectContractCode(player);
    } else {
        status = player.years_simple || player.contract_type || player.status || '';
    }

    const team = player.team || 'FA';
    const pos = player.position || '';
    const age = player.age || '--';
    
    // Determine contract tier for color coding
    const normalized = (status || '').toUpperCase().replace(/\s+/g, '');
    let statusClass = 'tc';

    // Rookie TC (R, R-*, TC-R) should use legacy blue
    const isRookie = normalized === 'R' || normalized.startsWith('R-') || normalized.startsWith('TC-R');
    if (normalized.includes('VC')) {
        statusClass = 'vc';
    } else if (normalized.startsWith('FC') || normalized.startsWith('F')) {
        statusClass = 'fc';
    } else if (isRookie) {
        statusClass = 'rookie';
    }
    
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
 * Get contract type code for a prospect
 */
function getProspectContractCode(player) {
    const ct = (player.contract_type || '').toLowerCase();
    if (ct.includes('purchased')) return 'PC';
    if (ct.includes('development')) return 'DC';
    if (ct.includes('blue chip') || ct.includes('farm')) return 'BC';
    return 'BC';  // Default uncontracted to BC
}

/**
 * Create roster summary
 */
function createRosterSummary(players) {
    // Reuse the same grouping logic used for the depth tables so
    // batters/pitchers counts stay in sync with what is rendered.
    const { batters, pitchers } = groupPlayersByPosition(players);
    const batterCount = Object.values(batters).reduce((sum, list) => sum + list.length, 0);
    const pitcherCount = Object.values(pitchers).reduce((sum, list) => sum + list.length, 0);
    
    // Count prospect contract types (BC / PC / DC)
    let contractCounts = { BC: 0, PC: 0, DC: 0 };
    if (currentRosterType === 'prospects') {
        players.forEach(p => {
            const code = getProspectContractCode(p);
            contractCounts[code]++;
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
                    <span class="summary-stat-value">${batterCount}</span>
                </div>
                <div class="summary-stat">
                    <span class="summary-stat-label">Pitchers</span>
                    <span class="summary-stat-value">${pitcherCount}</span>
                </div>
                ${currentRosterType === 'prospects' ? `
                    <div class="summary-stat">
                        <span class="summary-stat-label">Base (BC)</span>
                        <span class="summary-stat-value">${contractCounts.BC}</span>
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
