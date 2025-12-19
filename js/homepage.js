/**
 * FBP Hub - Homepage JavaScript
 * Handles standings display, matchups, and quick stats
 */

/**
 * Initialize homepage
 */
function initHomepage() {
    console.log('🏠 Initializing homepage...');
    
    // Display standings
    displayStandings();
    
    // Display matchups
    displayMatchups();
    
    // Display quick stats
    displayQuickStats();
    
    // Display upcoming deadline
    displayUpcomingDeadline();
}

/**
 * Display current standings
 */
function displayStandings() {
    const standingsBody = document.getElementById('standingsBody');
    const standingsDate = document.getElementById('standingsDate');
    
    if (!standingsBody) return;
    
    const standings = FBPHub.data.standings;
    
    if (!standings || !standings.standings) {
        standingsBody.innerHTML = `
            <tr>
                <td colspan="4" class="empty-state">
                    <i class="fas fa-info-circle"></i>
                    <p>Standings data not available</p>
                </td>
            </tr>
        `;
        return;
    }
    
    // Update last updated date
    if (standingsDate && standings.date) {
        standingsDate.textContent = `Updated: ${formatDate(standings.date)}`;
    }
    
    // Build standings rows
    const rows = standings.standings.map(team => `
        <tr>
            <td><strong>${team.rank}</strong></td>
            <td>${createTeamBadge(team.team)}</td>
            <td>${team.record}</td>
            <td>${team.win_pct.toFixed(3)}</td>
        </tr>
    `).join('');
    
    standingsBody.innerHTML = rows;
}

/**
 * Display current week's matchups
 */
function displayMatchups() {
    const matchupsGrid = document.getElementById('matchupsGrid');
    
    if (!matchupsGrid) return;
    
    const standings = FBPHub.data.standings;
    
    if (!standings || !standings.matchups || standings.matchups.length === 0) {
        matchupsGrid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-calendar-times"></i>
                <p>No current matchups available</p>
            </div>
        `;
        return;
    }
    
    // Parse matchups (format: "WIZ 5 vs B2J 4")
    const matchupCards = standings.matchups.map(matchup => {
        const parts = matchup.split(' vs ');
        if (parts.length !== 2) return '';
        
        const team1Parts = parts[0].trim().split(' ');
        const team2Parts = parts[1].trim().split(' ');
        
        const team1Name = team1Parts[0];
        const team1Score = team1Parts[1] || '0';
        const team2Name = team2Parts[0];
        const team2Score = team2Parts[1] || '0';
        
        return `
            <div class="matchup-card">
                <div class="matchup-team">
                    <div class="matchup-team-name">${createTeamBadge(team1Name)}</div>
                    <div class="matchup-team-score">${team1Score}</div>
                </div>
                <div class="matchup-vs">vs</div>
                <div class="matchup-team">
                    <div class="matchup-team-name">${createTeamBadge(team2Name)}</div>
                    <div class="matchup-team-score">${team2Score}</div>
                </div>
            </div>
        `;
    }).join('');
    
    matchupsGrid.innerHTML = matchupCards;
}

/**
 * Display quick stats cards
 */
function displayQuickStats() {
    // Total players
    const totalPlayersEl = document.getElementById('totalPlayers');
    if (totalPlayersEl) {
        totalPlayersEl.textContent = FBPHub.data.players.length.toLocaleString();
    }
    
    // Total prospects
    const totalProspectsEl = document.getElementById('totalProspects');
    if (totalProspectsEl) {
        const prospectCount = FBPHub.data.players.filter(p => 
            p.player_type === 'Farm'
        ).length;
        totalProspectsEl.textContent = prospectCount.toLocaleString();
    }
    
    // Total trades (placeholder - will be updated when transaction data available)
    const totalTradesEl = document.getElementById('totalTrades');
    if (totalTradesEl) {
        totalTradesEl.textContent = '--';
    }
    
    // Total WizBucks
    const totalWizBucksEl = document.getElementById('totalWizBucks');
    if (totalWizBucksEl && FBPHub.data.wizbucks) {
        const total = Object.values(FBPHub.data.wizbucks).reduce((sum, val) => sum + val, 0);
        totalWizBucksEl.textContent = `$${total.toLocaleString()}`;
    }
}

/**
 * Display upcoming deadline banner
 */
function displayUpcomingDeadline() {
    const deadlineName = document.getElementById('deadlineName');
    const deadlineDate = document.getElementById('deadlineDate');
    const deadlineBanner = document.getElementById('deadlineBanner');
    
    if (!deadlineName || !deadlineDate) return;
    
    // FBP Season 13 (2025) Important Dates
    const deadlines = [
        { name: 'Prospect Assignment Day', date: new Date('2025-02-10') },
        { name: 'Prospect Draft', date: new Date('2025-02-17') },
        { name: 'Franchise Tag Deadline', date: new Date('2025-02-19') },
        { name: 'Trade Window Opens', date: new Date('2025-02-20') },
        { name: 'Trade Window Closes', date: new Date('2025-02-27') },
        { name: 'Keeper Deadline', date: new Date('2025-02-28') },
        { name: 'Keeper Draft', date: new Date('2025-03-08') },
        { name: 'Division Draft', date: new Date('2025-03-10') },
        { name: 'Week 1 Starts', date: new Date('2025-03-17') },
        { name: '30-Team Opening Day', date: new Date('2025-03-27') },
        { name: 'FBP Trade Deadline', date: new Date('2025-07-31') },
        { name: 'Final Day of Regular Season', date: new Date('2025-08-31') }
    ];
    
    const now = new Date();
    
    // Find next upcoming deadline
    const upcoming = deadlines.find(d => d.date > now);
    
    if (upcoming) {
        deadlineName.textContent = upcoming.name;
        
        // Calculate days until deadline
        const daysUntil = Math.ceil((upcoming.date - now) / (1000 * 60 * 60 * 24));
        
        if (daysUntil === 0) {
            deadlineDate.textContent = 'Today!';
        } else if (daysUntil === 1) {
            deadlineDate.textContent = 'Tomorrow';
        } else if (daysUntil < 7) {
            deadlineDate.textContent = `In ${daysUntil} days`;
        } else {
            deadlineDate.textContent = formatDate(upcoming.date);
        }
        
        // Change banner color if very close
        if (daysUntil <= 3 && deadlineBanner) {
            deadlineBanner.style.background = 'linear-gradient(135deg, #F44336, #E53935)';
        }
    } else {
        // Off-season
        deadlineName.textContent = 'Off-Season';
        deadlineDate.textContent = 'Check back for 2026 dates';
        
        if (deadlineBanner) {
            deadlineBanner.style.background = 'linear-gradient(135deg, #666, #888)';
        }
    }
}

// Make function available globally
window.initHomepage = initHomepage;