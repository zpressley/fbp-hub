/**
 * FBP Hub - Live Draft Tracker
 * Real-time draft monitoring and updates
 */

// ============================================
// MANUAL TOGGLE: Set to true when draft is live
// When false, redirects all visitors to draft-preview.html
// ============================================
const ACTIVE_DRAFT = false;

let DRAFT_STATE = {
    draftData: null,
    draftPool: null,
    userTeam: null,
    updateInterval: null,
    timerInterval: null,
    // Default to prospect draft; /draft start currently runs the prospect
    // draft, and draft.html will switch to keeper if FBPHub.draftInitialMode
    // is set to 'keeper' by the preflight script.
    mode: 'prospect', // 'keeper' or 'prospect'
    initializedFromHint: false
};

/**
 * Initialize draft page
 */
async function initDraft() {
    // Redirect to draft-preview if no active draft
    if (!ACTIVE_DRAFT) {
        window.location.href = 'draft-preview.html';
        return;
    }
    
    // If backend pre-detected an active draft type, honor it on first load
    // only. After that, allow managers to switch views locally.
    if (!DRAFT_STATE.initializedFromHint && window.FBPHub && FBPHub.draftInitialMode && (FBPHub.draftInitialMode === 'keeper' || FBPHub.draftInitialMode === 'prospect')) {
        DRAFT_STATE.mode = FBPHub.draftInitialMode;
        DRAFT_STATE.initializedFromHint = true;
    }

    // Sync toggle UI with current mode (ensures Prospect is visibly active
    // when the prospect draft is live)
    updateDraftModeUI();

    console.log('🎯 Initializing draft tracker...', DRAFT_STATE.mode);
    
    // Get user team (optional - can view draft without auth)
    if (typeof authManager !== 'undefined' && authManager.isAuthenticated()) {
        DRAFT_STATE.userTeam = authManager.getTeam();
    }

    // Load schedule/config if API is available (for labels under toggle)
    await loadDraftConfig();
    
    // Load draft data for current mode
    await loadDraftData(DRAFT_STATE.mode);

    // Populate initial draft pool list
    displayDraftPool();

    // If no data, show inactive state
    if (!DRAFT_STATE.draftData) {
        if (DRAFT_STATE.updateInterval) clearInterval(DRAFT_STATE.updateInterval);
        if (DRAFT_STATE.timerInterval) clearInterval(DRAFT_STATE.timerInterval);
        const inactiveEl = document.getElementById('draftInactive');
        const contentEl = document.getElementById('draftContent');
        if (inactiveEl) inactiveEl.style.display = 'flex';
        if (contentEl) contentEl.style.display = 'none';
        return;
    }
    
    // Show active draft container and hide inactive banner (if present)
    const inactiveEl = document.getElementById('draftInactive');
    const contentEl = document.getElementById('draftContent');
    if (inactiveEl) inactiveEl.style.display = 'none';
    if (contentEl) contentEl.style.display = 'block';
    
    // Initialize display
    updateDraftHeader();
    updateOnTheClock();
    displayRecentPicks();
    displayUpcomingPicks();
    setupViewToggle();
    
    // Start auto-refresh (every 5 seconds)
    DRAFT_STATE.updateInterval = setInterval(refreshDraftData, 5000);
    
    // Start timer countdown
    startPickTimer();
}

/**
 * Load draft configuration (scheduled dates) from /api/draft/config.
 * This populates the helper text under the Keeper/Prospect toggle.
 */
async function loadDraftConfig() {
    const apiBase = FBPHub.config?.apiBase || null;
    if (!apiBase) return; // nothing to do without API

    try {
        const url = new URL('/api/draft/config', apiBase);
        const response = await fetch(url.toString(), { cache: 'no-store' });
        if (!response.ok) return;
        const cfg = await response.json();

        const el = document.getElementById('draftSchedule');
        if (!el) return;

        const keeperDate = cfg?.keeper?.scheduled_date ? new Date(cfg.keeper.scheduled_date) : null;
        const prospectDate = cfg?.prospect?.scheduled_date ? new Date(cfg.prospect.scheduled_date) : null;

        function fmt(d) {
            if (!d) return 'TBD';
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        }

        el.textContent = `Keeper Draft: ${fmt(keeperDate)}  •  Prospect Draft: ${fmt(prospectDate)}`;
    } catch (e) {
        console.error('Error loading draft config', e);
    }
}

/**
 * Load draft data for the given draft type ('keeper' or 'prospect').
 */
async function loadDraftData(draftType) {
    const apiBase = FBPHub.config?.apiBase || null;

    try {
        if (apiBase) {
            // Prefer live API via Cloudflare Worker → Render → health.py
            const url = new URL('/api/draft/active', apiBase);
            url.searchParams.set('draft_type', draftType || 'keeper');

            const response = await fetch(url.toString(), { cache: 'no-store' });
            if (response.ok) {
                const data = await response.json();
                DRAFT_STATE.draftData = data || null;
            } else {
                console.warn('API /api/draft/active returned', response.status);
                DRAFT_STATE.draftData = null;
            }
        } else {
            // Fallback: static JSON for local testing
            const basePath = (typeof FBPHub !== 'undefined' && FBPHub.config?.dataPath)
                ? FBPHub.config.dataPath
                : './data/';
            const response = await fetch(`${basePath}draft_active.json`, { cache: 'no-store' });
            if (response.ok) {
                const data = await response.json();
                DRAFT_STATE.draftData = data || null;
            } else {
                console.warn('draft_active.json not found or not OK; assuming no active draft');
                DRAFT_STATE.draftData = null;
            }
        }
    } catch (e) {
        console.error('Error loading draft data', e);
        DRAFT_STATE.draftData = null;
    }
    
    // Note: we no longer fetch draft_pool.json. The live draft UI is driven
    // entirely by the /api/draft/active payload from the bot API. If we
    // ever want a local "pool" view, we can derive it from combined_players
    // (FBPHub.data.players) instead of a separate JSON file.
}

/**
 * Refresh draft data
 */
async function refreshDraftData() {
    const oldPick = DRAFT_STATE.draftData?.current_pick;
    
    await loadDraftData(DRAFT_STATE.mode);
    
    // If draft ended or no longer active, flip UI and stop timers.
    if (!DRAFT_STATE.draftData) {
        if (DRAFT_STATE.updateInterval) clearInterval(DRAFT_STATE.updateInterval);
        if (DRAFT_STATE.timerInterval) clearInterval(DRAFT_STATE.timerInterval);
        const inactiveEl = document.getElementById('draftInactive');
        const contentEl = document.getElementById('draftContent');
        if (inactiveEl) inactiveEl.style.display = 'flex';
        if (contentEl) contentEl.style.display = 'none';
        return;
    }
    
    const newPick = DRAFT_STATE.draftData?.current_pick;
    
    // Check if pick changed
        if (oldPick !== newPick) {
            console.log('📢 New pick detected!');
            updateDraftHeader();
            updateOnTheClock();
            displayRecentPicks();
            displayUpcomingPicks();
            
            // Show notification
            showPickNotification();
        } else {
            // Even if pick didn't change, keep upcoming list fresh
            displayUpcomingPicks();
        }
}

/**
 * Update draft header
 */
function updateDraftHeader() {
    const draft = DRAFT_STATE.draftData;
    if (!draft) return;
    
    // Update title
    const draftTypeText = draft.draft_type === 'keeper' ? 'KEEPER' : 'PROSPECT';
    document.getElementById('draftTitle').textContent = `FBP ${draftTypeText} DRAFT ${draft.season}`;

    // Update status badge
    const statusEl = document.getElementById('draftStatus');
    if (statusEl) {
        const statusSpan = statusEl.querySelector('span');
        let label = 'PRE-DRAFT';
        switch (draft.status) {
            case 'active_draft':
                label = 'ACTIVE DRAFT';
                break;
            case 'draft_day':
                label = 'DRAFT DAY';
                break;
            case 'post_draft':
                label = 'POST-DRAFT';
                break;
            case 'pre_draft':
            default:
                label = 'PRE-DRAFT';
        }
        if (statusSpan) {
            statusSpan.textContent = label;
        }
    }
}

/**
 * Update on-the-clock display
 */
function updateOnTheClock() {
    const draft = DRAFT_STATE.draftData;
    const teamEl = document.getElementById('clockTeam');
    const nameEl = document.getElementById('clockTeamName');
    const quickPickSection = document.getElementById('quickPickSection');
    const timerDisplay = document.getElementById('timerDisplay');
    const timerBar = document.getElementById('timerBar');
    const clockRoundEl = document.getElementById('clockRound');
    const clockPickEl = document.getElementById('clockPickOverall');
    const clockNextEl = document.getElementById('clockNext');

    if (!draft || draft.status !== 'active_draft' || !draft.current_team) {
        // No active draft or no current team: clear clock state
        if (teamEl) teamEl.textContent = '--';
        if (nameEl) nameEl.textContent = 'No team on the clock';
        if (quickPickSection) quickPickSection.style.display = 'none';
        if (DRAFT_STATE.timerInterval) {
            clearInterval(DRAFT_STATE.timerInterval);
            DRAFT_STATE.timerInterval = null;
        }
        if (timerDisplay) timerDisplay.textContent = '--:--';
        if (timerBar) timerBar.style.width = '0%';
        if (clockRoundEl) clockRoundEl.textContent = '-';
        if (clockPickEl) clockPickEl.textContent = '-';
        if (clockNextEl) clockNextEl.textContent = 'Next Pick: —';
        return;
    }

    const clockTeam = draft.current_team;
    const teamName = TEAM_NAMES[clockTeam] || clockTeam;

    if (teamEl) teamEl.textContent = clockTeam;
    if (nameEl) nameEl.textContent = teamName;
    if (clockRoundEl) clockRoundEl.textContent = draft.current_round ?? '-';
    if (clockPickEl) clockPickEl.textContent = draft.current_pick ?? '-';

    // Compute next pick for on-tile summary
    if (clockNextEl && Array.isArray(draft.draft_order) && draft.total_rounds) {
        const perRound = draft.draft_order.length;
        const totalPicks = draft.total_rounds * perRound;
        const nextPickNum = (draft.current_pick || 0) + 1;
        if (nextPickNum <= totalPicks) {
            const nextRound = Math.floor((nextPickNum - 1) / perRound) + 1;
            const idxInRound = (nextPickNum - 1) % perRound;
            const nextTeam = draft.draft_order[idxInRound];
            const nextName = TEAM_NAMES[nextTeam] || nextTeam;
            clockNextEl.textContent = `Next Pick: ${nextName} (RD ${nextRound} / PK ${nextPickNum})`;
        } else {
            clockNextEl.textContent = 'Next Pick: —';
        }
    }

    // Apply solid team colors to the on-the-clock banner
    const banner = document.getElementById('clockBanner');
    if (banner && FBPHub && FBPHub.data) {
        const tc = (FBPHub.data.teamColors && FBPHub.data.teamColors[clockTeam]) || null;
        const background = tc && tc.primary ? tc.primary : getTeamColor(clockTeam);
        const border = tc && tc.secondary ? tc.secondary : background;
        banner.style.background = background;
        banner.style.borderColor = border;
    }

    // Show quick pick if it's user's turn
    if (quickPickSection) {
        if (DRAFT_STATE.userTeam && DRAFT_STATE.userTeam.abbreviation === clockTeam) {
            quickPickSection.style.display = 'block';
        } else {
            quickPickSection.style.display = 'none';
        }
    }

    // Restart timer only when active
    startPickTimer();
}

/**
 * Start pick timer countdown
 */
function startPickTimer() {
    if (DRAFT_STATE.timerInterval) {
        clearInterval(DRAFT_STATE.timerInterval);
    }
    
    const draft = DRAFT_STATE.draftData;
    if (!draft || !draft.clock_started_at || draft.status !== 'active_draft') {
        return; // Only run timer while draft is active and we have a clock start
    }
    const clockStarted = new Date(draft.clock_started_at);
    const timeLimit = draft.pick_clock_seconds || 120;
    
    DRAFT_STATE.timerInterval = setInterval(() => {
        const now = new Date();
        const elapsed = Math.floor((now - clockStarted) / 1000);
        const remaining = Math.max(0, timeLimit - elapsed);
        
        // Update timer display
        const minutes = Math.floor(remaining / 60);
        const seconds = remaining % 60;
        document.getElementById('timerDisplay').textContent = 
            `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        // Update timer bar
        const percentage = (remaining / timeLimit) * 100;
        document.getElementById('timerBar').style.width = `${percentage}%`;
        
        // Color based on time remaining
        const timerBar = document.getElementById('timerBar');
        if (remaining < 30) {
            timerBar.style.backgroundColor = '#f44336';
        } else if (remaining < 60) {
            timerBar.style.backgroundColor = '#FF9800';
        } else {
            timerBar.style.backgroundColor = 'var(--accent-yellow)';
        }
        
        if (remaining === 0) {
            clearInterval(DRAFT_STATE.timerInterval);
        }
    }, 1000);
}

/**
 * Display recent picks
 */
function displayRecentPicks() {
    const draft = DRAFT_STATE.draftData;
    const picks = [...draft.picks].reverse().slice(0, 20); // Last 20 picks
    
    const container = document.getElementById('recentPicksList');
    const totalPicks = draft.picks.length;
    const maxPicks = draft.total_rounds * 12;
    
    document.getElementById('picksCount').textContent = `${totalPicks} / ${maxPicks}`;
    
    container.innerHTML = picks.map(pick => {
        const teamColors = FBPHub.data?.teamColors?.[pick.team];
        const teamBadgeStyle = teamColors 
            ? `background: linear-gradient(135deg, ${teamColors.primary}, ${teamColors.secondary}); color: white;`
            : '';
        
        return `
            <div class="pick-card">
                <div class="pick-number-display">
                    <div class="pick-round">RD ${pick.round}</div>
                    <div class="pick-overall">${pick.pick_number}</div>
                </div>
                <div class="pick-player-info">
                    <div class="pick-player-name">${pick.player_name}</div>
                    <div class="pick-player-meta">
                        <span>${pick.position}</span>
                        <span>${pick.mlb_team}</span>
                        <span>${formatTimeAgo(pick.picked_at)}</span>
                    </div>
                </div>
                <div class="pick-team-info">
                    <div class="pick-team-name" style="${teamBadgeStyle || `color: var(--primary-red);`}">
                        ${pick.team}
                    </div>
                    <div class="pick-timestamp">${formatTime(pick.picked_at)}</div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Setup view toggle
 */
function setupViewToggle() {
    const viewBtns = document.querySelectorAll('.view-btn');
    const views = document.querySelectorAll('.draft-view');
    
    viewBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetView = btn.dataset.view;
            
            viewBtns.forEach(b => b.classList.remove('active'));
            views.forEach(v => v.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(`${targetView}-view`).classList.add('active');
            
            // Load view-specific content
            if (targetView === 'pool') {
                displayDraftPool();
            } else if (targetView === 'grid') {
                displayDraftGrid();
            } else if (targetView === 'order') {
                displayDraftOrder();
            }
        });
    });
}

/**
 * Display full draft grid
 */
function displayDraftGrid() {
    const draft = DRAFT_STATE.draftData;
    const container = document.getElementById('draftGrid');
    if (!draft || !container) return;

    const selector = document.getElementById('roundSelector');
    if (!selector) return;

    // Group picks that have actually been made by round so the grid
    // reflects real draft history rather than a theoretical order.
    const picksByRound = new Map();
    (draft.picks || []).forEach(p => {
        const r = p.round || 0;
        if (!r) return;
        if (!picksByRound.has(r)) picksByRound.set(r, []);
        picksByRound.get(r).push(p);
    });

    // Build round selector options based on rounds that have at least
    // one pick, falling back to total_rounds if we have no picks yet.
    selector.innerHTML = '';
    const maxRound = draft.total_rounds || Math.max(...Array.from(picksByRound.keys(), Number), 0) || 1;
    for (let i = 1; i <= maxRound; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `Round ${i}`;
        if (i === draft.current_round) option.selected = true;
        selector.appendChild(option);
    }

    selector.onchange = (e) => {
        const value = e.target.value;
        const roundNum = value === 'current' ? 'current' : parseInt(value, 10);
        scrollToRound(roundNum);
    };

    let gridHTML = '';
    for (let round = 1; round <= maxRound; round++) {
        const roundPicks = (picksByRound.get(round) || []).slice().sort((a, b) => {
            return (a.pick_number || 0) - (b.pick_number || 0);
        });

        if (!roundPicks.length && round > (draft.current_round || 1)) {
            continue; // skip completely empty future rounds
        }

        const picksHTML = roundPicks.map(pick => {
            const isCurrent = pick.pick_number === draft.current_pick;
            const team = pick.team;
            return `
                <div class="grid-pick ${isCurrent ? 'current' : ''}">
                    <div class="grid-pick-team">${team}</div>
                    <div class="grid-pick-player">${pick.player_name}</div>
                    <div class="grid-pick-meta">${pick.position}  b7 ${pick.mlb_team}</div>
                </div>
            `;
        }).join('') || `
            <div class="grid-pick">
                <div class="grid-pick-player">No picks yet</div>
            </div>
        `;

        gridHTML += `
            <div class="draft-round" id="round-${round}">
                <div class="draft-round-header">
                    <div class="draft-round-title">Round ${round}</div>
                </div>
                <div class="draft-round-picks">
                    ${picksHTML}
                </div>
            </div>
        `;
    }

    container.innerHTML = gridHTML;
}

/**
 * Display draft order
 */
function displayDraftOrder() {
    const draft = DRAFT_STATE.draftData;
    const container = document.getElementById('draftOrderList');
    if (!draft || !container) return;

    // If the payload includes team_slots (BC/DC slots per team), use that
    // as the primary source so we can present a consolidated summary.
    const teamSlots = draft.team_slots && typeof draft.team_slots === 'object'
        ? draft.team_slots
        : null;

    if (teamSlots) {
        const orderList = Array.isArray(draft.draft_order) ? draft.draft_order : [];
        const firstIndex = {};
        orderList.forEach((team, idx) => {
            if (firstIndex[team] === undefined) firstIndex[team] = idx;
        });

        const teams = Object.keys(teamSlots).sort((a, b) => {
            const ia = firstIndex[a] ?? 9999;
            const ib = firstIndex[b] ?? 9999;
            if (ia !== ib) return ia - ib;
            return a.localeCompare(b);
        });

        container.innerHTML = teams.map(team => {
            const slot = teamSlots[team] || {};
            const bcSlots = slot.bc_slots ?? 0;
            const dcSlots = slot.dc_slots ?? 0;
            const bcUsed = slot.bc_used ?? 0;
            const dcUsed = slot.dc_used ?? 0;

            return `
                <div class="order-team-card">
                    <div class="order-team-info">
                        <div class="order-position">${team}</div>
                        <div>
                            <div class="order-team-name">${TEAM_NAMES[team] || team}</div>
                            <div style="font-size: var(--text-xs); color: var(--text-gray); margin-top: 4px;">
                                BC: ${bcUsed}/${bcSlots}  b7 DC: ${dcUsed}/${dcSlots}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        return;
    }

    // Fallback: simple view based on how many total picks each team owns.
    const countsByTeam = {};
    (draft.draft_order || []).forEach(team => {
        countsByTeam[team] = (countsByTeam[team] || 0) + 1;
    });

    const teamsInOrder = Object.keys(countsByTeam).sort((a, b) => {
        const ia = (draft.draft_order || []).indexOf(a);
        const ib = (draft.draft_order || []).indexOf(b);
        return ia - ib;
    });

    container.innerHTML = teamsInOrder.map((team, idx) => {
        const totalPicks = countsByTeam[team] || 0;
        const teamPicks = (draft.picks || []).filter(p => p.team === team);

        return `
            <div class="order-team-card">
                <div class="order-team-info">
                    <div class="order-position">${idx + 1}</div>
                    <div>
                        <div class="order-team-name">${team} - ${TEAM_NAMES[team] || team}</div>
                        <div style="font-size: var(--text-xs); color: var(--text-gray); margin-top: 4px;">
                            Total slots: ${totalPicks}
                        </div>
                    </div>
                </div>
                <div class="order-picks-count">${teamPicks.length} selected</div>
            </div>
        `;
    }).join('');
}

/**
 * Scroll to specific round
 */
function scrollToRound(roundNum) {
    if (roundNum === 'current') {
        roundNum = DRAFT_STATE.draftData.current_round;
    }
    
    const roundEl = document.getElementById(`round-${roundNum}`);
    if (roundEl) {
        roundEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

/**
 * Display draft pool (live view)
 */
function displayDraftPool() {
    const draft = DRAFT_STATE.draftData;
    const poolList = document.getElementById('draftPoolList');
    const countEl = document.getElementById('draftPoolCount');

    if (!poolList || !countEl) return;

    // Keeper mode: we don't yet have a keeper draft pool wired up; avoid
    // showing prospect pool when Keeper is selected.
    if (DRAFT_STATE.mode === 'keeper') {
        countEl.textContent = '0 players';
        poolList.innerHTML = '<div class="empty-state">Keeper draft pool view is not available yet.</div>';
        return;
    }

    if (!draft || !FBPHub || !FBPHub.data || !Array.isArray(FBPHub.data.players)) {
        return;
    }

    const searchTerm = (document.getElementById('draftPoolSearch')?.value || '').toLowerCase();

    const currentRound = draft.current_round || 1;
    const isFypdRound = currentRound <= 2; // Rounds 1–2 are FYPD-only rules-wise

    // Build a set of drafted player names (case-insensitive) so we can
    // hide anyone already taken during this draft.
    const draftedNames = new Set(
        Array.isArray(draft.picks)
            ? draft.picks
                  .map(p => (p.player_name || '').toLowerCase())
                  .filter(Boolean)
            : []
    );

    // Base filter: entire eligible draft pool = Farm prospects, unowned,
    // no prospect contract. We always show the full pool; FYPD players
    // are highlighted and sorted to the top in early rounds.
    let available = FBPHub.data.players.filter(p =>
        p.player_type === 'Farm' &&
        !p.manager &&
        !p.FBP_Team &&
        !(p.contract_type || '').trim() &&
        !draftedNames.has((p.name || '').toLowerCase())
    );

    // Apply search
    if (searchTerm) {
        available = available.filter(p =>
            p.name.toLowerCase().includes(searchTerm) ||
            (p.position || '').toLowerCase().includes(searchTerm) ||
            (p.team || '').toLowerCase().includes(searchTerm)
        );
    }

    // Sort:
    // - In FYPD rounds, FYPD players first ordered by fypd_rank,
    //   then remaining prospects by global rank.
    // - In later rounds, sort purely by global rank.
    available.sort((a, b) => {
        if (isFypdRound) {
            const aIsF = !!a.fypd;
            const bIsF = !!b.fypd;
            if (aIsF !== bIsF) return aIsF ? -1 : 1; // FYPD first
            const ar = typeof a.fypd_rank === 'number' ? a.fypd_rank : (typeof a.rank === 'number' ? a.rank : 99999);
            const br = typeof b.fypd_rank === 'number' ? b.fypd_rank : (typeof b.rank === 'number' ? b.rank : 99999);
            if (ar !== br) return ar - br;
            return a.name.localeCompare(b.name);
        }
        const ar = typeof a.rank === 'number' ? a.rank : 99999;
        const br = typeof b.rank === 'number' ? b.rank : 99999;
        if (ar !== br) return ar - br;
        return a.name.localeCompare(b.name);
    });

    countEl.textContent = `${available.length} players`;

    if (!available.length) {
        poolList.innerHTML = '<div class="empty-state">No eligible players available</div>';
        return;
    }

    // Reuse preview list styling but surface richer prospect info: Name,
    // MLB team, position, Age, Level, org Team Rank.
    poolList.innerHTML = available.map((player, idx) => {
        const isFypd = !!player.fypd;
        const profileLink = (typeof createPlayerLink === 'function') ? createPlayerLink(player) : '#';

        let rank;
        if (isFypdRound) {
            if (typeof player.fypd_rank === 'number') {
                rank = player.fypd_rank;
            } else if (typeof player.rank === 'number') {
                rank = player.rank;
            } else {
                rank = idx + 1;
            }
        } else {
            rank = typeof player.rank === 'number' ? player.rank : idx + 1;
        }

        const age = typeof player.age === 'number' ? player.age : '—';
        const level = player.level || player.mlb_level || '—';
        const teamRank =
            typeof player.team_rank === 'number'
                ? player.team_rank
                : (typeof player.org_rank === 'number' ? player.org_rank : '—');

        return `
            <div class="preview-player-row${isFypd ? ' preview-player-row-fypd' : ''}">
                <div class="preview-row-main">
                    <span class="preview-rank">#${rank}</span>
                    <a href="${profileLink}" class="preview-name-link">${player.name}</a>
                    <span class="preview-team">${player.team || 'FA'}</span>
                    <span class="preview-pos">${player.position || ''}</span>
                    ${isFypd ? '<span class="preview-fypd-tag">FYPD</span>' : ''}
                </div>
                <div class="preview-row-stats">
                    Age ${age}  b7 Level ${level}  b7 Team Rank ${teamRank}
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Display upcoming picks (sidebar card)
 */
function displayUpcomingPicks() {
    const draft = DRAFT_STATE.draftData;
    const listEl = document.getElementById('upcomingList');
    if (!draft || !listEl) return;

    const totalPerRound = Array.isArray(draft.draft_order) ? draft.draft_order.length : 0;
    const totalPicks = (draft.total_rounds || 0) * totalPerRound;
    const currentPick = draft.current_pick || 0;

    if (!totalPerRound || !totalPicks || currentPick >= totalPicks) {
        listEl.innerHTML = '<div class="upcoming-pick">No upcoming picks.</div>';
        return;
    }

    const maxUpcoming = 6;
    const items = [];
    for (let pk = currentPick + 1; pk <= Math.min(currentPick + maxUpcoming, totalPicks); pk++) {
        const round = Math.floor((pk - 1) / totalPerRound) + 1;
        const indexInRound = (pk - 1) % totalPerRound;
        const team = draft.draft_order[indexInRound];
        items.push({ round, pick: pk, team });
    }

    listEl.innerHTML = items.map(item => {
        const teamName = TEAM_NAMES[item.team] || item.team;
        return `
            <div class="upcoming-pick">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="font-family: var(--font-title); font-weight:700;">${teamName}</div>
                        <div style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-gray);">${item.team}</div>
                    </div>
                    <div style="text-align:right; font-family: var(--font-mono); font-size: var(--text-sm);">
                        RD ${item.round}<br>PK ${item.pick}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Show pick notification
 */
function showPickNotification() {
    const lastPick = DRAFT_STATE.draftData.picks[DRAFT_STATE.draftData.picks.length - 1];
    
    if (!lastPick) return;
    
    const notification = document.createElement('div');
    notification.className = 'draft-notification';
    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
            <i class="fas fa-gavel" style="font-size: 24px; color: var(--primary-red);"></i>
            <div>
                <div style="font-weight: 700; margin-bottom: 4px;">${lastPick.team} selects</div>
                <div style="font-size: 14px;">${lastPick.player_name} (${lastPick.position})</div>
            </div>
        </div>
    `;
    notification.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        background-color: var(--bg-charcoal);
        border: 3px solid var(--primary-red);
        padding: 20px;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        z-index: 10000;
        animation: slideInRight 0.3s ease-out;
    `;
    
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

/**
 * Submit quick pick
 */
function submitQuickPick() {
    const playerName = document.getElementById('quickPickSearch').value.trim();
    
    if (!playerName) {
        alert('Enter player name');
        return;
    }
    
    // In production: POST to /api/draft/pick
    console.log('📝 Submitting pick:', playerName);
    
    // Mock: Record pick locally
    alert(`Pick submitted: ${playerName}\n\nIn production, this would notify Discord bot and update draft_active.json`);
}

/**
 * Helper functions
 */
function formatTime(isoString) {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatTimeAgo(isoString) {
    const date = new Date(isoString);
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

function setDraftMode(mode) {
    if (mode !== 'keeper' && mode !== 'prospect') return;
    DRAFT_STATE.mode = mode;

    // Update button UI + sliding thumb
    updateDraftModeUI();

    // Reset timers and reload state
    if (DRAFT_STATE.updateInterval) clearInterval(DRAFT_STATE.updateInterval);
    if (DRAFT_STATE.timerInterval) clearInterval(DRAFT_STATE.timerInterval);

    initDraft();
}

function updateDraftModeUI() {
    const toggle = document.querySelector('.draft-mode-toggle');
    if (toggle) {
        toggle.dataset.mode = DRAFT_STATE.mode;
    }
    const buttons = document.querySelectorAll('.mode-btn');
    buttons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === DRAFT_STATE.mode);
    });
}

// Expose functions
window.initDraft = initDraft;
window.scrollToRound = scrollToRound;
window.submitQuickPick = submitQuickPick;
window.setDraftMode = setDraftMode;

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (DRAFT_STATE.updateInterval) clearInterval(DRAFT_STATE.updateInterval);
    if (DRAFT_STATE.timerInterval) clearInterval(DRAFT_STATE.timerInterval);
});
