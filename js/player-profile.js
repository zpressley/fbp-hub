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
    history: [],
    // Prospect tags data (badges, FV, status) from prospect_tags.json
    prospectTags: null
};
let managerProfileUpdateListenerBound = false;

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

    // Setup manager edit hooks
    setupManagerPlayerProfileUpdateListener();
    
    // Check if user can purchase contract for this player
    checkContractPurchaseEligibility();
    
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
            PLAYER_DATA.player = FBPHub.data.players.find(p => String(p.upid) === String(upid));
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
                String(row.upid) === String(PLAYER_DATA.upid) ||
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

    // Load prospect tags (badges, FV, status) from prospect_tags.json
    PLAYER_DATA.prospectTags = null;
    try {
        const tagsResponse = await fetch('./data/prospect_tags.json');
        if (tagsResponse.ok) {
            const tagsData = await tagsResponse.json();
            const players = tagsData.players || [];
            PLAYER_DATA.prospectTags = players.find(p => 
                String(p.upid) === String(PLAYER_DATA.upid)
            ) || null;
        }
    } catch (e) {
        console.log('No prospect_tags.json available for player profile');
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
                String(entry.upid) === String(PLAYER_DATA.upid) ||
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
        return mockPlayers.find(p => String(p.upid) === String(upid));
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

    // Apply owner-based theming for this profile
    applyOwnerThemeForPlayer(player);
    
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
    
    // Show contract salary only for MLB keepers (hide for Farm/prospects)
    const contractSublabel = document.getElementById('contractSublabel');
    if (player.player_type === 'MLB' && player.contract_type) {
        const salary = getKeeperSalary(player.contract_type);
        if (salary) {
            contractSublabel.textContent = `$${salary} salary`;
            contractSublabel.style.display = '';
        } else {
            contractSublabel.style.display = 'none';
        }
    } else {
        // Hide salary for Farm players (prospects don't have a keeper salary)
        contractSublabel.style.display = 'none';
    }

    // Service-time based progress has been deprecated; keep the service card hidden for now.

    renderAddToTradeButton();
    renderEditPlayerButton();

    // External research links (BBRef, FG, MLB, Yahoo)
    const linksRow = document.getElementById('externalLinksRow');
    if (linksRow && typeof window.PlayerLinks?.renderBadges === 'function') {
        linksRow.innerHTML = window.PlayerLinks.renderBadges(player);
    }
}

function renderAddToTradeButton() {
    const container = document.getElementById('addToTradeContainer');
    if (!container) return;

    container.innerHTML = '';

    if (typeof authManager === 'undefined' || !authManager.isAuthenticated()) {
        return;
    }

    const userTeam = authManager.getTeam();
    if (!userTeam?.abbreviation) {
        return;
    }

    const player = PLAYER_DATA.player;
    const upid = player?.upid;
    if (!upid) {
        return;
    }

    // Only allow for rostered players (owned by an FBP team)
    const ownerAbbr = String(player.FBP_Team || '').toUpperCase();
    if (!ownerAbbr) {
        return;
    }

    container.innerHTML = `
        <button type="button" class="btn-add-to-trade" onclick="addPlayerToTradeFromProfile()">
            <i class="fas fa-handshake"></i>
            <span>ADD TO TRADE</span>
        </button>
    `;
}

function renderEditPlayerButton() {
    const container = document.getElementById('editPlayerContainer');
    if (!container) return;

    container.innerHTML = '';

    if (!window.ManagerPlayerTools?.canManagePlayers || !window.ManagerPlayerTools.canManagePlayers()) {
        return;
    }

    const player = PLAYER_DATA.player;
    if (!player?.upid) return;

    container.innerHTML = `
        <button type="button" class="btn-add-to-trade" onclick="openEditPlayerFromProfile()">
            <i class="fas fa-pen"></i>
            <span>EDIT PLAYER</span>
        </button>
    `;
}

function openEditPlayerFromProfile() {
    try {
        const player = PLAYER_DATA.player;
        if (!player?.upid) {
            showProfileToast('Could not determine player to edit.', 'error');
            return;
        }
        if (!window.ManagerPlayerTools?.openEditPlayerModal) {
            showProfileToast('Manager edit tools are unavailable.', 'error');
            return;
        }
        window.ManagerPlayerTools.openEditPlayerModal(player);
    } catch (e) {
        console.error('Edit player launch failed', e);
        showProfileToast('Failed to open edit player modal.', 'error');
    }
}

function setupManagerPlayerProfileUpdateListener() {
    if (managerProfileUpdateListenerBound) return;
    managerProfileUpdateListenerBound = true;

    window.addEventListener('manager-player-updated', event => {
        const updated = event.detail?.player;
        if (!updated?.upid || !PLAYER_DATA?.player?.upid) return;
        if (String(updated.upid) !== String(PLAYER_DATA.player.upid)) return;

        PLAYER_DATA.player = { ...PLAYER_DATA.player, ...updated };

        if (Array.isArray(FBPHub?.data?.players)) {
            const idx = FBPHub.data.players.findIndex(p => String(p.upid) === String(updated.upid));
            if (idx !== -1) {
                Object.assign(FBPHub.data.players[idx], updated);
            }
        }

        displayPlayerHeader();
        displayOverview();
    });
}

function addPlayerToTradeFromProfile() {
    try {
        const player = PLAYER_DATA.player;
        const upid = player?.upid;
        if (!upid) return;

        if (typeof authManager === 'undefined' || !authManager.isAuthenticated()) {
            showProfileToast('Please log in first', 'error');
            return;
        }

        const userTeam = authManager.getTeam();
        const userAbbr = String(userTeam?.abbreviation || '').toUpperCase();
        if (!userAbbr) {
            showProfileToast('Could not determine your team', 'error');
            return;
        }

        const ownerAbbr = String(player.FBP_Team || '').toUpperCase();
        if (!ownerAbbr) {
            showProfileToast('Cannot determine player owner', 'error');
            return;
        }

        let fromTeam = ownerAbbr;
        let toTeam = userAbbr;
        let teams = [userAbbr, ownerAbbr];

        // If the player is owned by the current user, ask who should receive.
        if (ownerAbbr === userAbbr) {
            const mapping = (typeof MANAGER_MAPPING !== 'undefined') ? MANAGER_MAPPING : {};
            const allTeams = Array.from(new Set(Object.values(mapping).map((t) => String(t).toUpperCase())));

            const recipient = String(prompt(`Send ${player.name} to which team? (e.g. HAM)`, '') || '').trim().toUpperCase();
            if (!recipient) return;
            if (recipient === userAbbr) {
                showProfileToast('Recipient must be a different team', 'error');
                return;
            }
            if (allTeams.length && !allTeams.includes(recipient)) {
                showProfileToast('Unknown team abbreviation', 'error');
                return;
            }

            fromTeam = userAbbr;
            toTeam = recipient;
            teams = [userAbbr, recipient];
        }

        const prefill = {
            teams,
            transfers: [
                {
                    type: 'player',
                    upid: String(upid),
                    from_team: fromTeam,
                    to_team: toTeam,
                },
            ],
        };

        localStorage.setItem('fbp_trade_prefill_v1', JSON.stringify(prefill));
        window.location.href = 'trade.html';
    } catch (e) {
        console.error('Add to trade failed', e);
        showProfileToast('Failed to add to trade', 'error');
    }
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

    // Contract details - only show Keeper Salary for MLB players (not Farm/prospects)
    const keeperSalary = getKeeperSalary(player.contract_type);
    const showKeeperSalary = player.player_type === 'MLB' && player.contract_type && keeperSalary;
    
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
            ${showKeeperSalary ? `
                <div class="info-row">
                    <span class="info-label">Keeper Salary</span>
                    <span class="info-value">$${keeperSalary}</span>
                </div>
            ` : ''}
        </div>
    `;
    document.getElementById('contractDetails').innerHTML = contractHTML;
    
    // Prospect badges and rankings (for Farm players)
    displayProspectBadges();
    
    // Ownership timeline
    displayOwnershipTimeline();
}

/**
 * Display prospect badges and FV grades from prospect_tags.json
 */
function displayProspectBadges() {
    const container = document.getElementById('prospectBadges');
    if (!container) return;
    
    const tagData = PLAYER_DATA.prospectTags;
    if (!tagData) {
        container.style.display = 'none';
        return;
    }
    
    const badges = tagData.badges || [];
    const fv = tagData.fv || {};
    const status = tagData.status || [];
    
    // Don't show section if no meaningful data
    if (!badges.length && !fv['2024'] && !fv['2025'] && !fv['2026']) {
        container.style.display = 'none';
        return;
    }
    
    container.style.display = 'block';
    
    // Group badges by category
    const badgeCategories = {
        'Top 100': [],
        'Org Top 10': [],
        'POS Top 10': [],
        'FYPD Top 20': [],
        'INT Top 10': [],
        'MLB Futures': []
    };
    
    badges.forEach(badge => {
        const type = badge.type || '';
        for (const category of Object.keys(badgeCategories)) {
            if (type.includes(category)) {
                badgeCategories[category].push(badge);
                break;
            }
        }
    });
    
    // Build FV display
    const fvItems = [];
    if (fv['2026']) fvItems.push(`<span class="fv-item"><span class="fv-year">2026</span><span class="fv-value">${fv['2026']}</span></span>`);
    if (fv['2025']) fvItems.push(`<span class="fv-item"><span class="fv-year">2025</span><span class="fv-value">${fv['2025']}</span></span>`);
    if (fv['2024']) fvItems.push(`<span class="fv-item"><span class="fv-year">2024</span><span class="fv-value">${fv['2024']}</span></span>`);
    
    // Build status badges
    const statusMap = {
        'fypd': { class: 'status-fypd', label: 'FYPD' },
        'int_signee': { class: 'status-int', label: 'INT Signee' },
        'debuted': { class: 'status-debuted', label: 'Debuted' },
        'dropped': { class: 'status-dropped', label: 'Dropped' }
    };
    
    const statusBadges = status
        .filter(s => statusMap[s])
        .map(s => `<span class="profile-status-badge ${statusMap[s].class}">${statusMap[s].label}</span>`)
        .join('');
    
    // Build badge display by category
    let badgeHTML = '';
    for (const [category, categoryBadges] of Object.entries(badgeCategories)) {
        if (categoryBadges.length === 0) continue;
        
        const badgeItems = categoryBadges.map(b => {
            const year = (b.type || '').match(/^(\d{4})/)?.[1] || '';
            const rank = b.rank ? `#${b.rank}` : '';
            return `<span class="profile-badge-item">
                <span class="badge-year">${year}</span>
                <span class="badge-rank">${rank}</span>
            </span>`;
        }).join('');
        
        badgeHTML += `
            <div class="profile-badge-category">
                <div class="badge-category-label">${category}</div>
                <div class="badge-category-items">${badgeItems}</div>
            </div>
        `;
    }
    
    container.innerHTML = `
        <h3>Prospect Rankings</h3>
        ${statusBadges ? `<div class="profile-status-badges">${statusBadges}</div>` : ''}
        ${fvItems.length ? `
            <div class="profile-fv-section">
                <div class="fv-label">Future Value (FV)</div>
                <div class="fv-items">${fvItems.join('')}</div>
            </div>
        ` : ''}
        ${badgeHTML ? `<div class="profile-badges-grid">${badgeHTML}</div>` : ''}
    `;
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

    // Show most recent ownership periods first in the UI
    const displayPeriods = [...periods].reverse();

    const timelineHTML = displayPeriods.map(period => `
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

    const battingSeasons = seasons.filter(s => s.stat_type === 'batting').sort((a, b) => (b.season || 0) - (a.season || 0));
    const pitchingSeasons = seasons.filter(s => s.stat_type === 'pitching').sort((a, b) => (b.season || 0) - (a.season || 0));

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

// Apply team color scheme based on player owner
function applyOwnerThemeForPlayer(player) {
    // Prefer canonical FBP_Team abbreviation when available; fall back to manager
    const ownerAbbr = player.FBP_Team || player.manager || null;
    const root = document.documentElement;

    // If there is a clear owner and we have team colors, use them
    if (ownerAbbr && typeof FBPHub !== 'undefined') {
        const colors = FBPHub.data?.teamColors?.[ownerAbbr];
        if (colors && colors.primary) {
            const secondary = colors.secondary || '#FFB612';

            // Drive page-wide CSS variables so the whole layout picks up the theme
            root.style.setProperty('--team-primary', colors.primary);
            root.style.setProperty('--team-secondary', secondary);
            if (colors.accent1) root.style.setProperty('--team-accent-1', colors.accent1);
            if (colors.accent2) root.style.setProperty('--team-accent-2', colors.accent2);
            if (colors.accent3) root.style.setProperty('--team-accent-3', colors.accent3);

            // Ownership badge (a bit more opinionated than the base CSS)
            const ownershipBadge = document.getElementById('ownershipBadge');
            if (ownershipBadge) {
                ownershipBadge.style.backgroundColor = `rgba(${hexToRgb(colors.primary)}, 0.15)`;
                ownershipBadge.style.borderColor = colors.primary;
                ownershipBadge.style.color = colors.primary;
            }

            return; // themed successfully via CSS variables
        }
    }

    // If unowned or no colors, fall back to base CSS (clear overrides & vars)
    root.style.removeProperty('--team-primary');
    root.style.removeProperty('--team-secondary');
    root.style.removeProperty('--team-accent-1');
    root.style.removeProperty('--team-accent-2');
    root.style.removeProperty('--team-accent-3');

    const ownershipBadge = document.getElementById('ownershipBadge');
    if (ownershipBadge) {
        ownershipBadge.style.backgroundColor = '';
        ownershipBadge.style.borderColor = '';
        ownershipBadge.style.color = '';
    }
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

// Helper function to convert hex color to RGB string
function hexToRgb(hex) {
    if (!hex || hex[0] !== '#' || (hex.length !== 7 && hex.length !== 4)) {
        return '239, 62, 66'; // fallback to primary red
    }

    // Handle short form like #F00
    if (hex.length === 4) {
        const r = parseInt(hex[1] + hex[1], 16);
        const g = parseInt(hex[2] + hex[2], 16);
        const b = parseInt(hex[3] + hex[3], 16);
        return `${r}, ${g}, ${b}`;
    }

    const r = parseInt(hex.substr(1, 2), 16);
    const g = parseInt(hex.substr(3, 2), 16);
    const b = parseInt(hex.substr(5, 2), 16);
    return `${r}, ${g}, ${b}`;
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

/**
 * Check if self-service contract purchases are enabled (after PAD deadline)
 */
async function isContractPurchaseEnabled() {
    try {
        const res = await fetch('./data/season_dates.json');
        if (!res.ok) return true; // Default to enabled if file not found
        const dates = await res.json();
        const padDate = dates.pad_date;
        if (!padDate) return true;
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const padDeadline = new Date(padDate + 'T00:00:00');
        
        return today > padDeadline;
    } catch (e) {
        console.warn('Could not check PAD deadline:', e);
        return true; // Default to enabled on error
    }
}

/**
 * Check if logged-in user can purchase a contract for this player
 * Conditions: user is logged in, owns the player, player is a prospect with DC or PC contract
 */
async function checkContractPurchaseEligibility() {
    const container = document.getElementById('purchaseContractContainer');
    if (!container) return;
    
    // Check if self-service is enabled (after PAD deadline)
    const enabled = await isContractPurchaseEnabled();
    if (!enabled) {
        return; // PAD not complete - hide button
    }
    
    const player = PLAYER_DATA.player;
    if (!player) return;
    
    // Check if user is authenticated
    if (typeof authManager === 'undefined' || !authManager.isAuthenticated()) {
        return; // Not logged in - hide button
    }
    
    const userTeam = authManager.getTeam();
    if (!userTeam) return;
    
    // Check if player belongs to user's team
    // FBP_Team uses abbreviations, manager uses full team names
    const playerOwner = player.FBP_Team || player.manager || '';
    if (playerOwner !== userTeam.abbreviation && playerOwner !== userTeam.name) {
        return; // Not the user's player
    }
    
    // Check if player is a prospect (Farm)
    if (player.player_type !== 'Farm') {
        return; // Not a prospect
    }
    
    // Check if player has a DC or PC contract (eligible for upgrade)
    const contract = (player.contract_type || '').toLowerCase();
    const hasDC = contract.includes('development');
    const hasPC = contract.includes('purchased');
    
    if (!hasDC && !hasPC) {
        return; // BC or no contract - not eligible for upgrade
    }
    
    // Player is eligible - show the button
    container.innerHTML = `
        <button type="button" class="btn-contract-purchase" onclick="showPlayerContractPurchase()">
            <i class="fas fa-file-contract"></i>
            <span>BUY CONTRACT</span>
        </button>
    `;
}

/**
 * Show contract purchase modal for the current player
 */
function showPlayerContractPurchase() {
    const player = PLAYER_DATA.player;
    if (!player) return;
    
    const userTeam = authManager.getTeam();
    if (!userTeam) return;
    
    // Get current WizBucks balance
    const wizData = FBPHub.data.wizbucks || {};
    let balance = 0;
    if (userTeam.name && wizData[userTeam.name] !== undefined) {
        balance = wizData[userTeam.name];
    } else if (wizData[userTeam.abbreviation] !== undefined) {
        balance = wizData[userTeam.abbreviation];
    }
    
    // Determine upgrade options based on current contract
    const contract = (player.contract_type || '').toLowerCase();
    const options = [];
    
    if (contract.includes('development')) {
        options.push({ upgradeType: 'DC → PC', cost: 5, newContract: 'Purchased Contract' });
        options.push({ upgradeType: 'DC → BC', cost: 15, newContract: 'Blue Chip Contract' });
    } else if (contract.includes('purchased')) {
        options.push({ upgradeType: 'PC → BC', cost: 10, newContract: 'Blue Chip Contract' });
    }
    
    if (options.length === 0) return;
    
    const modalHTML = `
        <div class="contract-purchase-modal active" id="contractPurchaseModal">
            <div class="contract-purchase-content">
                <div class="contract-purchase-header">
                    <h2><i class="fas fa-file-contract"></i> Purchase Contract Upgrade</h2>
                    <p>Upgrade ${player.name}'s contract</p>
                </div>
                
                <div class="balance-display">
                    <span class="balance-label">Your WizBucks Balance:</span>
                    <span class="balance-value">$${balance}</span>
                </div>
                
                <div class="contract-info-box">
                    <div class="info-row">
                        <span class="info-label">Current Contract:</span>
                        <span class="info-value">${player.contract_type || 'None'}</span>
                    </div>
                </div>
                
                <div class="upgrade-options">
                    <h4>Available Upgrades:</h4>
                    <div class="upgrade-list">
                        ${options.map(opt => {
                            const canAfford = balance >= opt.cost;
                            return `
                                <div class="upgrade-option ${canAfford ? '' : 'insufficient-funds'}" 
                                     ${canAfford ? `onclick="selectPlayerContractUpgrade('${player.upid}', '${opt.upgradeType}', ${opt.cost}, '${opt.newContract}')"` : ''}>
                                    <div class="upgrade-player-info">
                                        <div class="upgrade-player-name">${opt.upgradeType}</div>
                                        <div class="upgrade-player-meta">${opt.newContract}</div>
                                    </div>
                                    <div class="upgrade-action">
                                        <div class="upgrade-cost ${canAfford ? '' : 'insufficient'}">
                                            $${opt.cost}
                                            ${!canAfford ? '<span class="insufficient-badge">Insufficient</span>' : ''}
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
                
                <div class="contract-purchase-actions">
                    <button class="btn-secondary" onclick="closePlayerContractModal()">
                        <i class="fas fa-times"></i> Cancel
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

/**
 * Close contract purchase modal
 */
function closePlayerContractModal() {
    const modal = document.getElementById('contractPurchaseModal');
    if (modal) modal.remove();
}

/**
 * Select a contract upgrade and show confirmation
 */
function selectPlayerContractUpgrade(upid, upgradeType, cost, newContract) {
    const player = PLAYER_DATA.player;
    if (!player) return;
    
    const currentContract = player.contract_type || 'None';
    
    const confirmHTML = `
        <div class="contract-confirm-modal active" id="contractConfirmModal">
            <div class="confirmation-content">
                <div class="confirmation-header">
                    <h2><i class="fas fa-check-circle"></i> Confirm Contract Purchase</h2>
                    <p>Review before purchasing</p>
                </div>
                
                <div class="confirmation-section">
                    <h4>Player: ${player.name}</h4>
                    <div style="margin-top: var(--space-md);">
                        <p><strong>Position:</strong> ${player.position || 'N/A'}</p>
                        <p><strong>MLB Team:</strong> ${player.team || 'FA'}</p>
                        <p><strong>Current Contract:</strong> ${currentContract}</p>
                    </div>
                </div>
                
                <div class="confirmation-section">
                    <h4>Purchase Details</h4>
                    <div class="upgrade-summary">
                        <div class="upgrade-summary-row">
                            <span>Contract Type:</span>
                            <span class="upgrade-type-display">${newContract}</span>
                        </div>
                        <div class="upgrade-summary-row">
                            <span>Cost:</span>
                            <span class="cost-display">$${cost}</span>
                        </div>
                    </div>
                </div>
                
                <div class="confirmation-warning">
                    <i class="fas fa-info-circle"></i>
                    <strong>This will deduct $${cost} from your WizBucks balance</strong>
                    <p>The contract purchase will be logged to your transaction history</p>
                </div>
                
                <div class="confirmation-actions">
                    <button class="btn-secondary" onclick="closePlayerConfirmModal()">
                        <i class="fas fa-times"></i> Cancel
                    </button>
                    <button class="btn-primary" id="confirmPurchaseBtn" 
                            onclick="confirmPlayerContractPurchase('${upid}', '${upgradeType}', ${cost}, '${newContract}')">
                        <i class="fas fa-check"></i> Purchase for $${cost}
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', confirmHTML);
}

/**
 * Close confirmation modal
 */
function closePlayerConfirmModal() {
    const modal = document.getElementById('contractConfirmModal');
    if (modal) modal.remove();
}

/**
 * Confirm and execute contract purchase
 */
async function confirmPlayerContractPurchase(upid, upgradeType, cost, newContract) {
    const btn = document.getElementById('confirmPurchaseBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    }
    
    const session = typeof authManager !== 'undefined' ? authManager.getSession() : null;
    const token = session?.token;
    
    if (!token) {
        showProfileToast('Your session has expired. Please log in again.', 'error');
        closePlayerConfirmModal();
        return;
    }
    
    const team = authManager.getTeam();
    if (!team) {
        showProfileToast('Could not determine your team', 'error');
        closePlayerConfirmModal();
        return;
    }
    
    const player = PLAYER_DATA.player;
    if (!player) {
        showProfileToast('Player not found', 'error');
        closePlayerConfirmModal();
        return;
    }
    
    const currentSeason = new Date().getFullYear();
    
    // Manager self-service contract purchase payload
    // Server computes cost and validates the upgrade path.
    const payload = {
        season: currentSeason,
        team: team.abbreviation,
        upid: upid,
        new_contract_type: newContract,
        log_source: 'Player Profile Self-Service'
    };
    
    try {
        const res = await fetch(`${AUTH_CONFIG.workerUrl}/api/manager/contract-purchase`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
        });
        
        if (!res.ok) {
            let detail = '';
            try {
                const body = await res.json();
                detail = body.detail || body.error || '';
            } catch (e) {}
            const baseMsg = `Contract purchase failed (status ${res.status})`;
            const fullMsg = detail ? `${baseMsg}: ${detail}` : baseMsg;
            showProfileToast(fullMsg, 'error');
            
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-check"></i> Purchase for $' + cost;
            }
            return;
        }
        
        const result = await res.json();
        const chargedCost = (result.cost !== null && result.cost !== undefined) ? result.cost : cost;
        
        // Validate response structure - backend should return { player, wizbucks_balance }
        if (!result.player) {
            console.error('Contract purchase: unexpected response', result);
            showProfileToast(`Contract purchase failed: Invalid response from server`, 'error');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-check"></i> Purchase for $' + chargedCost;
            }
            return;
        }
        
        // Update local player data
        PLAYER_DATA.player = result.player;
        const idx = FBPHub.data.players.findIndex(p => String(p.upid) === String(upid));
        if (idx !== -1) {
            FBPHub.data.players[idx] = result.player;
        }
        
        // Update WizBucks balance locally
        if (result.wizbucks_balance !== null && result.wizbucks_balance !== undefined) {
            if (team.name && FBPHub.data.wizbucks[team.name] !== undefined) {
                FBPHub.data.wizbucks[team.name] = result.wizbucks_balance;
            } else if (FBPHub.data.wizbucks[team.abbreviation] !== undefined) {
                FBPHub.data.wizbucks[team.abbreviation] = result.wizbucks_balance;
            }
        }
        
        // Close modals
        closePlayerConfirmModal();
        closePlayerContractModal();
        
        // Show success
        const contractName = newContract === 'Purchased Contract' ? 'PC' : 'BC';
        showProfileToast(`✅ ${player.name} - ${contractName} purchased! -$${chargedCost} WB`, 'success');
        
        // Refresh player profile display
        displayPlayerHeader();
        displayOverview();
        checkContractPurchaseEligibility();
        
    } catch (err) {
        console.error('Contract purchase error', err);
        showProfileToast(`Contract purchase failed: ${err.message || 'Network error'}`, 'error');
        
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-check"></i> Purchase for $' + cost;
        }
    }
}

/**
 * Show toast notification
 */
function showProfileToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: 'check-circle',
        error: 'exclamation-circle',
        warning: 'exclamation-triangle'
    };
    
    toast.innerHTML = `
        <i class="fas fa-${icons[type]}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Remove after 5 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

// Expose modal functions to global scope
window.showPlayerContractPurchase = showPlayerContractPurchase;
window.closePlayerContractModal = closePlayerContractModal;
window.selectPlayerContractUpgrade = selectPlayerContractUpgrade;
window.closePlayerConfirmModal = closePlayerConfirmModal;
window.confirmPlayerContractPurchase = confirmPlayerContractPurchase;
window.addPlayerToTradeFromProfile = addPlayerToTradeFromProfile;
window.openEditPlayerFromProfile = openEditPlayerFromProfile;
