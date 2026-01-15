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
    
    // Display upcoming deadline (async, fire-and-forget)
    displayUpcomingDeadline();

    // Display recent league activity (player_log.json)
    displayRecentLeagueActivity();
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
 * Derive keeper contract value from years_simple / status / contract_type.
 * This mirrors the league's salary rules and is used to populate a
 * contract_value field on player objects at runtime (no changes to JSON file).
 */
function getContractValueForPlayer(player) {
    const raw = (player.years_simple || player.status || player.contract_type || '').toUpperCase().trim();
    if (!raw) return 0;

    const key = raw.replace(/\s+/g, ''); // e.g. "TC 1" -> "TC1", "FC 2+" -> "FC2+"

    // Team Contract / Rookie
    if (key.startsWith('TC-R') || key.startsWith('TCR') || key.startsWith('R-') || key === 'R' || key.startsWith('TCBC1') || key.startsWith('TC-BC-1') || key.startsWith('TCBC2') || key.startsWith('TC-BC-2')) {
        return 5;
    }
    // TC-1
    if (key.includes('TC1') || key === 'TC-1') return 15;
    // TC-2
    if (key.includes('TC2') || key === 'TC-2') return 25;
    // VC-1
    if (key.includes('VC1') || key === 'VC-1') return 35;
    // VC-2
    if (key.includes('VC2') || key === 'VC-2') return 55;
    // FC-1
    if (key.includes('FC1') || key === 'FC-1' || key === 'F1') return 85;
    // FC-2+
    if (key.includes('FC2+') || key.includes('FC2') || key.includes('F2') || key.includes('F3')) return 125;

    return 0;
}

/**
 * Display quick stats cards
 */
function displayQuickStats() {
    const players = Array.isArray(FBPHub.data.players) ? FBPHub.data.players : [];

    // Player Database: total number of players in combined_players.json
    const totalPlayersEl = document.getElementById('totalPlayers');
    if (totalPlayersEl) {
        totalPlayersEl.textContent = players.length.toLocaleString();
    }
    
    // Salary Calculator tile: total keeper WB across all owned MLB keepers
    const salaryTileEl = document.getElementById('totalProspects');
    if (salaryTileEl && players.length) {
        let totalKeeperWB = 0;
        players.forEach(p => {
            const ownedMLB = p.player_type === 'MLB' && p.FBP_Team && String(p.FBP_Team).trim() !== '';
            if (!ownedMLB) return;
            const value = getContractValueForPlayer(p);
            if (value > 0) {
                // Attach for downstream consumers if needed
                p.contract_value = value;
                totalKeeperWB += value;
            }
        });
        salaryTileEl.textContent = `$${totalKeeperWB.toLocaleString()}`;
    }
    
    // Weekly Auction tile: number of prospects with active bids this week
    updateAuctionTile();
    
    // Total WizBucks (unchanged)
    const totalWizBucksEl = document.getElementById('totalWizBucks');
    if (totalWizBucksEl && FBPHub.data.wizbucks) {
        const total = Object.values(FBPHub.data.wizbucks).reduce((sum, val) => sum + val, 0);
        totalWizBucksEl.textContent = `$${total.toLocaleString()}`;
    }
}

/**
 * Update Weekly Auction tile based on auction_current.json.
 */
async function updateAuctionTile() {
    const bidsEl = document.getElementById('activeBids');
    if (!bidsEl) return;

    try {
        const dataPath = window.FBPHub?.config?.dataPath || './data/';
        const res = await fetch(`${dataPath}auction_current.json`, { cache: 'no-store' });
        if (!res.ok) {
            bidsEl.textContent = '0';
            return;
        }
        const state = await res.json();
        if (!state) {
            bidsEl.textContent = '0';
            return;
        }

        const phase = state.phase || 'off_week';
        const bids = Array.isArray(state.bids) ? state.bids : [];

        if (!bids.length || phase === 'off_week' || phase === 'processing') {
            bidsEl.textContent = '0';
            return;
        }

        const uniqueProspects = new Set(bids.map(b => String(b.prospect_id))).size;
        bidsEl.textContent = uniqueProspects.toLocaleString();
    } catch (err) {
        console.warn('Failed to update Weekly Auction tile:', err);
        bidsEl.textContent = '0';
    }
}

/**
 * Load season_dates.json from local data first, then fall back to bot repo.
 */
async function loadSeasonDatesConfig() {
    // Prefer local season_dates.json synced into data/
    if (typeof loadJSON === 'function') {
        const local = await loadJSON('season_dates.json');
        if (local) return local;
    }

    const url = 'https://raw.githubusercontent.com/zpressley/fbp-trade-bot/main/config/season_dates.json';

    try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (err) {
        console.warn('Could not load season_dates.json from bot repo:', err);
        return null;
    }
}

/**
 * Display upcoming deadline banner
 */
async function displayUpcomingDeadline() {
    const deadlineName = document.getElementById('deadlineName');
    const deadlineDate = document.getElementById('deadlineDate');
    const deadlineBanner = document.getElementById('deadlineBanner');
    
    if (!deadlineName || !deadlineDate) return;

    const now = new Date();

    // Try dynamic config first (season_dates.json)
    const config = await loadSeasonDatesConfig();
    if (config) {
        const auction = config.auction || {};

        // Map config keys to human-readable event names
        const rawEvents = [
            { key: 'pad_open_date', label: 'PAD Opens' },
            { key: 'pad_date', label: 'Prospect Assignment Day' },
            { key: 'ppd_date', label: 'Prospect Draft' },
            { key: 'franchise_tag_date', label: 'Franchise Tag Deadline' },
            { key: 'trade_window_start', label: 'Trade Window Opens' },
            { key: 'trade_window_end', label: 'Trade Window Closes' },
            { key: 'kap_open_date', label: 'KAP Opens' },
            { key: 'keeper_deadline', label: 'Keeper Deadline' },
            { key: 'kap_end_date', label: 'KAP Deadline' },
            { key: 'keeper_draft', label: 'Keeper Draft' },
            { key: 'division_draft', label: 'Division Draft' },
            { key: 'week_1_start', label: 'Week 1 Starts' },
            { key: 'regular_season_end', label: 'Final Day of Regular Season' },
            { key: 'playoffs_end', label: 'Playoffs End' },
            // Auction-specific milestones
            { key: 'start', label: 'Prospect Auction Start', from: 'auction' },
            { key: 'all_star_break_start', label: 'Auction Pauses – All-Star Break', from: 'auction' },
            { key: 'restart', label: 'Prospect Auction Restart', from: 'auction' },
            { key: 'playoffs_start', label: 'Auctions End for Playoffs', from: 'auction' }
        ];

        const deadlines = rawEvents
            .map(ev => {
                const source = ev.from === 'auction' ? auction : config;
                const iso = source && source[ev.key];
                if (!iso) return null;
                const d = new Date(iso + 'T00:00:00');
                if (Number.isNaN(d.getTime())) return null;
                return { key: ev.key, name: ev.label, date: d };
            })
            .filter(Boolean)
            .sort((a, b) => a.date - b.date);

        const upcomingList = deadlines.filter(d => d.date > now);

        if (upcomingList.length > 0) {
            const upcoming = upcomingList[0];
            const listEl = document.getElementById('deadlineList');

            deadlineName.textContent = 'Upcoming League Events';
            deadlineDate.textContent = formatDate(upcoming.date);

            const items = upcomingList.slice(0, 3).map(d => {
                const daysUntil = Math.ceil((d.date - now) / (1000 * 60 * 60 * 24));
                let rel = '';
                if (daysUntil === 0) rel = 'Today';
                else if (daysUntil === 1) rel = 'Tomorrow';
                else if (daysUntil > 1 && daysUntil < 7) rel = `In ${daysUntil} days`;

                const dateLabel = rel ? `${formatDate(d.date)}  b7 ${rel}` : formatDate(d.date);
                return `<li><span class="deadline-list-name">${d.name}</span><span class="deadline-list-date">${dateLabel}</span></li>`;
            }).join('');

            if (listEl) {
                listEl.innerHTML = items;
            }

            const daysUntilNext = Math.ceil((upcoming.date - now) / (1000 * 60 * 60 * 24));
            if (daysUntilNext <= 3 && deadlineBanner) {
                deadlineBanner.style.background = 'linear-gradient(135deg, #F44336, #E53935)';
            }
            return;
        }

        // Config present but nothing upcoming: treat as completed season
        deadlineName.textContent = 'Off-Season';
        deadlineDate.textContent = `Season ${config.season_year || ''} complete`;
        const listEl = document.getElementById('deadlineList');
        if (listEl) listEl.innerHTML = '';
        if (deadlineBanner) {
            deadlineBanner.style.background = 'linear-gradient(135deg, #666, #888)';
        }
        return;
    }
    
    // Fallback: legacy 2025 hard-coded dates (used only if season_dates.json unavailable)
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
        deadlineDate.textContent = 'Check back for upcoming season dates';
        
        if (deadlineBanner) {
            deadlineBanner.style.background = 'linear-gradient(135deg, #666, #888)';
        }
    }
}

/**
 * Display recent league activity on homepage (last 14 days, max 50 records)
 * using data/player_log.json.
 */
async function displayRecentLeagueActivity() {
    const feed = document.getElementById('activityFeed');
    if (!feed) return;

    try {
        if (typeof loadJSON !== 'function') {
            throw new Error('loadJSON helper not available');
        }

        const playerLog = await loadJSON('player_log.json');
        const records = Array.isArray(playerLog) ? playerLog : [];

        const now = new Date();
        const cutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000); // last 14 days

        const recent = records
            .filter(rec => {
                if (!rec.timestamp) return false;
                const t = new Date(rec.timestamp);
                return !Number.isNaN(t.getTime()) && t >= cutoff;
            })
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 50);

        if (!recent.length) {
            feed.innerHTML = '<div class="empty-state"><p>No league activity in the last two weeks.</p></div>';
            return;
        }

        const itemsHtml = recent.map(rec => {
            const when = rec.timestamp ? formatDate(rec.timestamp) : '';
            const player = rec.player_name || '';
            const owner = rec.owner || '';
            const updateType = rec.update_type || '';
            const event = rec.event || '';
            const team = rec.team || '';

            return `
                <div class="activity-item">
                    <div class="activity-main">
                        <span class="activity-player">${player}</span>
                        <span class="activity-meta">${owner || team || ''}</span>
                    </div>
                    <div class="activity-sub">
                        <span class="activity-type">${updateType}</span>
                        <span class="activity-date">${when}</span>
                    </div>
                    ${event ? `<div class="activity-event">${event}</div>` : ''}
                </div>
            `;
        }).join('');

        feed.innerHTML = itemsHtml;
    } catch (err) {
        console.error('Failed to load recent league activity:', err);
        feed.innerHTML = '<div class="empty-state"><p>Failed to load recent activity.</p></div>';
    }
}

// Make function available globally
window.initHomepage = initHomepage;
