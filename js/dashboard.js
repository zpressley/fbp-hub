/**
 * FBP Hub - Dashboard JavaScript
 * Displays personalized manager dashboard
 */

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
    
    // Load roster preview
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
 * Load team statistics
 */
function loadTeamStats(team) {
    const statsGrid = document.getElementById('teamStats');
    if (!statsGrid || !team) return;
    
    // Filter players for this team using FBP_Team abbreviation
    const teamPlayers = FBPHub.data.players.filter(p => p.FBP_Team === team.abbreviation);
    const keepers = teamPlayers.filter(p => p.player_type === 'MLB');
    const prospects = teamPlayers.filter(p => p.player_type === 'Farm');
    
    // Get WizBucks balance
    const wizbucks = FBPHub.data.wizbucks?.[team.abbreviation] || 0;
    
    // Get team standing
    const standings = FBPHub.data.standings?.standings || [];
    const teamStanding = standings.find(s => s.team === team.abbreviation);
    const rank = teamStanding?.rank || '--';
    const record = teamStanding?.record || '--';
    
    statsGrid.innerHTML = `
        <div class="stat-card-large">
            <div class="stat-icon">
                <i class="fas fa-trophy"></i>
            </div>
            <div class="stat-content">
                <div class="stat-label">League Rank</div>
                <div class="stat-value-large">#${rank}</div>
                <div class="stat-meta">${record}</div>
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
                <div class="stat-meta">${prospects.filter(p => p.years_simple?.includes('PC')).length} purchased</div>
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
    
    if (keepers.length > 0) {
        html += renderDashboardRosterSection(keepers, 'Keepers');
    }
    
    if (prospects.length > 0) {
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
        } else if (tokens.includes('P')) {
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
    
    // Render batters column (left)
    const batterGroups = Object.entries(batters)
        .filter(([, list]) => list.length > 0)
        .map(([groupName, list]) => renderPositionGroup(groupName, list))
        .join('');
    
    // Render pitchers column (right)
    const pitcherGroups = Object.entries(pitchers)
        .filter(([, list]) => list.length > 0)
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
 * Render a single position group
 */
function renderPositionGroup(groupName, players) {
    const rows = players.map(p => {
        const status = p.years_simple || p.status || '';
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
