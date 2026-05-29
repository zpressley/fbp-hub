/**
 * FBP Hub - Homepage JavaScript
 * Handles standings display, matchups, and quick stats
 */

// ─── Import transactions feed ─────────────────────────────────────────────────
// Loaded as ES module via <script type="module"> in index.html.
// The initActivityFeed export handles the "RECENT LEAGUE ACTIVITY" section.
import { loadTransactionFeed, renderFeedHTML } from './transactions.js';

/**
 * Initialize homepage
 */
function initHomepage() {
    console.log('🏠 Initializing homepage...');
    displayStandings();
    displayMatchups();
    displayQuickStats();
    displayUpcomingDeadline();
    initActivityFeed();           // ← replaces displayRecentLeagueActivity()
}

// ─── Transactions feed widget ─────────────────────────────────────────────────
/**
 * Load the 8 most recent transactions and render them into #activityFeed.
 * Also updates the "View All" link to point to transactions.html.
 */
async function initActivityFeed() {
    const feed = document.getElementById('activityFeed');
    if (!feed) return;

    feed.innerHTML = '<div class="txn-loading"><div class="spinner"></div><p>Loading activity…</p></div>';

    try {
        const events = await loadTransactionFeed();
        feed.innerHTML  = renderFeedHTML(events, { limit: 8, compact: true });
    } catch (err) {
        console.error('Failed to load activity feed:', err);
        feed.innerHTML = '<div class="txn-empty"><p>Could not load recent activity.</p></div>';
    }

    // Point the section "view all" link at transactions.html
    const viewAllLink = document.getElementById('activityViewAll');
    if (viewAllLink) {
        viewAllLink.href = 'transactions.html';
        viewAllLink.textContent = 'View All Transactions';
    }
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
        standingsBody.innerHTML = `<tr><td colspan="4" class="empty-state"><i class="fas fa-info-circle"></i><p>Standings data not available</p></td></tr>`;
        return;
    }
    if (standingsDate && standings.date) {
        standingsDate.textContent = `Updated: ${formatDate(standings.date)}`;
    }
    standingsBody.innerHTML = standings.standings.map(team => `
        <tr>
            <td><strong>${team.rank}</strong></td>
            <td>${createTeamBadge(team.manager)}</td>
            <td>${team.record}</td>
            <td>${team.win_pct.toFixed(3)}</td>
        </tr>
    `).join('');
}

/**
 * Display current week's matchups
 */
function displayMatchups() {
    const matchupsGrid = document.getElementById('matchupsGrid');
    if (!matchupsGrid) return;
    const standings = FBPHub.data.standings;
    if (!standings || !standings.matchups || standings.matchups.length === 0) {
        matchupsGrid.innerHTML = `<div class="empty-state"><i class="fas fa-calendar-times"></i><p>No current matchups available</p></div>`;
        return;
    }
    matchupsGrid.innerHTML = standings.matchups.map(matchup => {
        // New format: {team1: {team, score}, team2: {team, score}}
        if (matchup.team1 && matchup.team2) {
            const t1 = matchup.team1;
            const t2 = matchup.team2;
            return `<div class="matchup-card">
                <div class="matchup-team"><div class="matchup-team-name">${createTeamBadge(t1.team)}</div><div class="matchup-team-score">${t1.score || '0'}</div></div>
                <div class="matchup-vs">vs</div>
                <div class="matchup-team"><div class="matchup-team-name">${createTeamBadge(t2.team)}</div><div class="matchup-team-score">${t2.score || '0'}</div></div>
            </div>`;
        }
        // Legacy string format fallback
        const parts = String(matchup).split(' vs ');
        if (parts.length !== 2) return '';
        const [t1n, t1s] = parts[0].trim().split(' ');
        const [t2n, t2s] = parts[1].trim().split(' ');
        return `<div class="matchup-card">
            <div class="matchup-team"><div class="matchup-team-name">${createTeamBadge(t1n)}</div><div class="matchup-team-score">${t1s || '0'}</div></div>
            <div class="matchup-vs">vs</div>
            <div class="matchup-team"><div class="matchup-team-name">${createTeamBadge(t2n)}</div><div class="matchup-team-score">${t2s || '0'}</div></div>
        </div>`;
    }).join('');

}

/**
 * Update Live Rank tile for the logged-in user.
 */
function updateLiveRankTile(standings) {
    const el = document.getElementById('liveRank');
    if (!el) return;
    try {
        const team = (typeof authManager !== 'undefined' && authManager.isAuthenticated?.())
            ? authManager.getTeam?.()?.abbreviation : null;
        if (!team || !standings?.standings) { el.textContent = '—'; return; }
        const entry = standings.standings.find(s => String(s.team).toUpperCase() === team.toUpperCase());
        el.textContent = entry?.live_rank ? `#${entry.live_rank}` : '—';
    } catch { el.textContent = '—'; }
}

/**
 * Derive keeper contract WB value from years_simple / status / contract_type.
 */
function getContractValueForPlayer(player) {
    const raw = (player.years_simple || player.status || player.contract_type || '').toUpperCase().trim();
    if (!raw) return 0;
    const key = raw.replace(/\s+/g, '');
    if (key.startsWith('TC-R') || key.startsWith('TCR') || key.startsWith('R-') || key === 'R' || key.startsWith('TCBC')) return 5;
    if (key.includes('TC1') || key === 'TC-1') return 15;
    if (key.includes('TC2') || key === 'TC-2') return 25;
    if (key.includes('VC1') || key === 'VC-1') return 35;
    if (key.includes('VC2') || key === 'VC-2') return 55;
    if (key.includes('FC1') || key === 'FC-1' || key === 'F1') return 85;
    if (key.includes('FC2') || key.includes('F2') || key.includes('F3')) return 125;
    return 0;
}

/**
 * Display quick stats cards
 */
function displayQuickStats() {
    const players = Array.isArray(FBPHub.data.players) ? FBPHub.data.players : [];
    const totalPlayersEl = document.getElementById('totalPlayers');
    if (totalPlayersEl) totalPlayersEl.textContent = players.length.toLocaleString();

    const salaryTileEl = document.getElementById('totalProspects');
    if (salaryTileEl && players.length) {
        let total = 0;
        players.forEach(p => {
            if (p.player_type === 'MLB' && p.FBP_Team && String(p.FBP_Team).trim() !== '') {
                const v = getContractValueForPlayer(p);
                if (v > 0) { p.contract_value = v; total += v; }
            }
        });
        salaryTileEl.textContent = `$${total.toLocaleString()}`;
    }

    updateAuctionTile();
    updateLiveRankTile(FBPHub.data.standings);

    const totalWizBucksEl = document.getElementById('totalWizBucks');
    if (totalWizBucksEl && FBPHub.data.wizbucks) {
        const total = Object.values(FBPHub.data.wizbucks).reduce((s, v) => s + v, 0);
        totalWizBucksEl.textContent = `$${total.toLocaleString()}`;
    }
}

/**
 * Update Weekly Auction tile from auction_current.json.
 */
async function updateAuctionTile() {
    const el = document.getElementById('auctionTotal');
    if (!el) return;
    try {
        const dataPath = window.FBPHub?.config?.dataPath || './data/';
        const res = await fetch(`${dataPath}auction_current.json`, { cache: 'no-store' });
        if (!res.ok) { el.textContent = '$0'; return; }
        const state = await res.json();
        if (!state) { el.textContent = '$0'; return; }
        const phase = state.phase || 'off_week';
        const bids  = Array.isArray(state.bids) ? state.bids : [];
        if (!bids.length || phase === 'off_week' || phase === 'processing') { el.textContent = '$0'; return; }
        // Sum the highest bid per prospect (the current winning bid)
        const highByProspect = {};
        bids.forEach(b => {
            const pid = String(b.prospect_id);
            const amt = parseInt(b.amount, 10) || 0;
            if (!highByProspect[pid] || amt > highByProspect[pid]) highByProspect[pid] = amt;
        });
        const total = Object.values(highByProspect).reduce((s, v) => s + v, 0);
        el.textContent = `$${total.toLocaleString()}`;
    } catch { el.textContent = '$0'; }
}

/**
 * Load season_dates.json (local data/ first, then bot repo fallback).
 */
async function loadSeasonDatesConfig() {
    if (typeof loadJSON === 'function') {
        const local = await loadJSON('season_dates.json');
        if (local) return local;
    }
    try {
        const res = await fetch('https://raw.githubusercontent.com/zpressley/fbp-trade-bot/main/config/season_dates.json', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (err) {
        console.warn('Could not load season_dates.json:', err);
        return null;
    }
}

/**
 * Display upcoming deadline banner
 */
async function displayUpcomingDeadline() {
    const deadlineName   = document.getElementById('deadlineName');
    const deadlineDate   = document.getElementById('deadlineDate');
    const deadlineBanner = document.getElementById('deadlineBanner');
    if (!deadlineName || !deadlineDate) return;

    const now   = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const config = await loadSeasonDatesConfig();

    if (config) {
        const auction   = config.auction || {};
        const rawEvents = [
            { key: 'pad_open_date',        label: 'PAD Opens' },
            { key: 'pad_date',             label: 'Prospect Assignment Day' },
            { key: 'prospect_draft',        label: 'Prospect Draft' },
            { key: 'franchise_tag_date',    label: 'Franchise Tag Deadline' },
            { key: 'trade_window_start',    label: 'Trade Window Opens' },
            { key: 'trade_window_end',      label: 'Trade Window Closes' },
            { key: 'kap_open_date',         label: 'KAP Opens' },
            { key: 'keeper_deadline',       label: 'Keeper Deadline' },
            { key: 'kap_end_date',          label: 'KAP Deadline' },
            { key: 'keeper_draft',          label: 'Keeper Draft' },
            { key: 'division_draft',        label: 'Division Draft' },
            { key: 'week_1_start',          label: 'Week 1 Starts' },
            { key: 'regular_season_end',    label: 'Final Day of Regular Season' },
            { key: 'playoffs_end',          label: 'Playoffs End' },
            { key: 'start',                 label: 'Prospect Auction Start',             from: 'auction' },
            { key: 'all_star_break_start',  label: 'Auction Pauses – All-Star Break',    from: 'auction' },
            { key: 'restart',               label: 'Prospect Auction Restart',           from: 'auction' },
            { key: 'playoffs_start',        label: 'Auctions End for Playoffs',          from: 'auction' },
        ];

        const deadlines = rawEvents
            .map(ev => {
                const src = ev.from === 'auction' ? auction : config;
                const iso = src && src[ev.key];
                if (!iso) return null;
                const d = new Date(iso + 'T00:00:00');
                return isNaN(d.getTime()) ? null : { name: ev.label, date: d };
            })
            .filter(Boolean)
            .sort((a, b) => a.date - b.date);

        const upcoming = deadlines.filter(d => d.date >= today);

        if (upcoming.length) {
            const listEl = document.getElementById('deadlineList');
            deadlineName.textContent = 'Upcoming League Events';
            deadlineDate.textContent = formatDate(upcoming[0].date);

            if (listEl) {
                listEl.innerHTML = upcoming.slice(0, 4).map(d => {
                    const days = Math.ceil((d.date - now) / (1000 * 60 * 60 * 24));
                    const rel  = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days < 7 ? `In ${days} days` : '';
                    const dateLabel = rel ? `${formatDate(d.date)} \u00B7 ${rel}` : formatDate(d.date);
                    return `<li><span class="deadline-list-name">${d.name}</span> <span class="deadline-list-date">${dateLabel}</span></li>`;
                }).join('');
            }
            if (Math.ceil((upcoming[0].date - now) / 86400000) <= 3 && deadlineBanner)
                deadlineBanner.style.background = 'var(--bg-charcoal)';
            return;
        }

        deadlineName.textContent = 'Off-Season';
        deadlineDate.textContent = `Season ${config.season_year || ''} complete`;
        const listEl = document.getElementById('deadlineList');
        if (listEl) listEl.innerHTML = '';
        if (deadlineBanner) deadlineBanner.style.background = 'var(--bg-charcoal)';
        return;
    }

    // Hard-coded 2025 fallback
    const deadlines = [
        { name: 'Prospect Assignment Day',    date: new Date('2025-02-10') },
        { name: 'Prospect Draft',             date: new Date('2025-02-17') },
        { name: 'Franchise Tag Deadline',     date: new Date('2025-02-19') },
        { name: 'Trade Window Opens',         date: new Date('2025-02-20') },
        { name: 'Trade Window Closes',        date: new Date('2025-02-27') },
        { name: 'Keeper Deadline',            date: new Date('2025-02-28') },
        { name: 'Keeper Draft',               date: new Date('2025-03-08') },
        { name: 'Division Draft',             date: new Date('2025-03-10') },
        { name: 'Week 1 Starts',              date: new Date('2025-03-17') },
        { name: '30-Team Opening Day',        date: new Date('2025-03-27') },
        { name: 'FBP Trade Deadline',         date: new Date('2025-07-31') },
        { name: 'Final Day of Regular Season',date: new Date('2025-08-31') },
    ];
    const upcoming = deadlines.find(d => d.date >= today);
    if (upcoming) {
        deadlineName.textContent = upcoming.name;
        const days = Math.ceil((upcoming.date - now) / 86400000);
        deadlineDate.textContent = days === 0 ? 'Today!' : days === 1 ? 'Tomorrow' : days < 7 ? `In ${days} days` : formatDate(upcoming.date);
        if (days <= 3 && deadlineBanner) deadlineBanner.style.background = 'linear-gradient(135deg, #F44336, #E53935)';
    } else {
        deadlineName.textContent = 'Off-Season';
        deadlineDate.textContent = 'Check back for upcoming season dates';
        if (deadlineBanner) deadlineBanner.style.background = 'var(--bg-charcoal)';
    }
}

window.initHomepage = initHomepage;
