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
    
    // Filter players for this team
    const teamPlayers = FBPHub.data.players.filter(p => p.manager === team.abbreviation);
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
    
    // Get team players
    const teamPlayers = FBPHub.data.players.filter(p => p.manager === team.abbreviation);
    const keepers = teamPlayers.filter(p => p.player_type === 'MLB').slice(0, 5);
    const prospects = teamPlayers.filter(p => p.player_type === 'Farm').slice(0, 5);
    
    let html = '';
    
    if (keepers.length > 0) {
        html += `
            <div class="preview-section">
                <h4>Recent Keepers</h4>
                <div class="preview-list">
                    ${keepers.map(p => `
                        <div class="preview-player">
                            ${createPositionBadge(p.position)}
                            <span class="player-name">${p.name}</span>
                            <span class="player-team">${p.team || 'FA'}</span>
                        </div>
                    `).join('')}
                </div>
                <a href="rosters.html?type=keepers&team=${team.abbreviation}" class="view-all-link">
                    View all ${teamPlayers.filter(p => p.player_type === 'MLB').length} keepers →
                </a>
            </div>
        `;
    }
    
    if (prospects.length > 0) {
        html += `
            <div class="preview-section">
                <h4>Top Prospects</h4>
                <div class="preview-list">
                    ${prospects.map(p => `
                        <div class="preview-player">
                            ${createPositionBadge(p.position)}
                            <span class="player-name">${p.name}</span>
                            ${p.years_simple ? createContractBadge(p.years_simple) : ''}
                        </div>
                    `).join('')}
                </div>
                <a href="rosters.html?type=prospects&team=${team.abbreviation}" class="view-all-link">
                    View all ${teamPlayers.filter(p => p.player_type === 'Farm').length} prospects →
                </a>
            </div>
        `;
    }
    
    if (html === '') {
        html = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <p>No players on your roster yet</p>
            </div>
        `;
    }
    
    preview.innerHTML = html;
}
