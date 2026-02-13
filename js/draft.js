/**
 * FBP Hub - Live Draft Tracker
 * Real-time draft monitoring and updates
 */

// ============================================
// MANUAL TOGGLE: Set to true when draft is live
// When false, redirects all visitors to draft-preview.html
// ============================================
const ACTIVE_DRAFT = true;

let DRAFT_STATE = {
    draftData: null,
    draftPool: null,
    draftOrder: null, // Loaded from draft_order_2026.json
    userTeam: null,
    updateInterval: null,
    timerInterval: null,
    // Default to prospect draft; /draft start currently runs the prospect
    // draft, and draft.html will switch to keeper if FBPHub.draftInitialMode
    // is set to 'keeper' by the preflight script.
    mode: 'prospect', // 'keeper' or 'prospect'
    initializedFromHint: false,
    // Enriched prospect data for the Draft Pool (from prospect_tags.json)
    tagsByUpid: {},
    prospectTagsLoaded: false,
    // Prospect PAD drop detection (aligned with draft-preview logic)
    droppedUpids: new Set(),
    // Guard so we only wire clock sticky behavior once
    clockStickyInitialized: false,
    // Draft pool sort state (mirrors draft-preview defaults)
    poolSort: { field: 'rank', direction: 'asc' }
};

/**
 * Initialize draft page
 */
async function initDraft() {
    // Redirect to draft-preview if no active draft (manual master switch).
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
    
    // Load draft order from static JSON file
    await loadDraftOrder();
    
    // Load draft data for current mode
    await loadDraftData(DRAFT_STATE.mode);

    // Load prospect tags + PAD drop data, then wire pool filters and render.
    await loadProspectTagsForDraft();
    await loadDroppedProspectsForDraft();
    setupDraftPoolFilters();
    displayDraftPool();

    // Always show the main draft UI; use the inactive banner only as a
    // status indicator when there is no active draft payload.
    const inactiveEl = document.getElementById('draftInactive');
    const contentEl = document.getElementById('draftContent');
    if (contentEl) contentEl.style.display = 'block';
    if (inactiveEl) inactiveEl.style.display = DRAFT_STATE.draftData ? 'none' : 'flex';

    // If we don't have live draft data yet, stop here. The page will show
    // the shell UI with "No Active Draft" messaging, but without timers
    // or recent-picks content wired up.
    if (!DRAFT_STATE.draftData) {
        if (DRAFT_STATE.updateInterval) clearInterval(DRAFT_STATE.updateInterval);
        if (DRAFT_STATE.timerInterval) clearInterval(DRAFT_STATE.timerInterval);
        // Clear clock UI to a neutral state.
        updateOnTheClock();
        setupViewToggle();
        return;
    }
    
    // We have an active draft payload – hide the inactive banner (if
    // present) and fully initialize the live tracker.
    if (inactiveEl) inactiveEl.style.display = 'none';
    if (contentEl) contentEl.style.display = 'block';
    
    // Initialize display
    updateDraftHeader();
    updateOnTheClock();
    displayRecentPicks();
    displayUpcomingPicks();
    setupViewToggle();
    setupPicksTabs();
    
    // Start auto-refresh (every 5 seconds)
    DRAFT_STATE.updateInterval = setInterval(refreshDraftData, 5000);
    
    // Start timer countdown
    startPickTimer();

    // Set up sticky clock banner once
    setupClockSticky();
}

/**
 * Load draft order from draft_order_2026.json
 */
async function loadDraftOrder() {
    try {
        const response = await fetch('data/draft_order_2026.json');
        if (response.ok) {
            const data = await response.json();
            DRAFT_STATE.draftOrder = data;
            console.log('✅ Loaded draft order:', data.length, 'total picks');
        } else {
            console.warn('Could not load draft_order_2026.json');
        }
    } catch (e) {
        console.error('Error loading draft order:', e);
    }
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
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: ET_TZ });
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
    
    // If draft ended or no longer active, stop timers but keep the main
    // UI visible so managers can still see the layout and static data.
    if (!DRAFT_STATE.draftData) {
        if (DRAFT_STATE.updateInterval) clearInterval(DRAFT_STATE.updateInterval);
        if (DRAFT_STATE.timerInterval) clearInterval(DRAFT_STATE.timerInterval);
        const inactiveEl = document.getElementById('draftInactive');
        const contentEl = document.getElementById('draftContent');
        if (inactiveEl) inactiveEl.style.display = 'flex';
        if (contentEl) contentEl.style.display = 'block';
        // Reset clock to neutral state.
        updateOnTheClock();
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
                label = (draft.raw_status === 'paused') ? 'PAUSED' : 'ACTIVE DRAFT';
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

    // Desktop: abbrev still available via #clockTeam; on mobile we hide it via CSS
    if (teamEl) teamEl.textContent = clockTeam;
    // Show full name + abbreviation on a single line
    if (nameEl) nameEl.textContent = `${teamName} (${clockTeam})`;
    // Use compact R#/P# format so it fits better in constrained layouts
    if (clockRoundEl) clockRoundEl.textContent = draft.current_round != null ? `R${draft.current_round}` : '-';
    if (clockPickEl) clockPickEl.textContent = draft.current_pick != null ? `P${draft.current_pick}` : '-';

    // Compute next pick for on-tile summary
    if (clockNextEl && Array.isArray(draft.draft_order)) {
        // draft.draft_order is the full pick-by-pick team sequence.
        const totalPicks = draft.draft_order.length;
        const nextPickNum = (draft.current_pick || 0) + 1;
        if (nextPickNum >= 1 && nextPickNum <= totalPicks) {
            const nextTeam = draft.draft_order[nextPickNum - 1];
            const nextName = TEAM_NAMES[nextTeam] || nextTeam;
            clockNextEl.textContent = `Next Pick: ${nextName} (PK ${nextPickNum})`;
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
        
        // Auto-adjust text color based on background luminance
        if (typeof getContrastTextColor === 'function') {
            const textColor = getContrastTextColor(background);
            banner.style.color = textColor;
            // Also update all text elements within the banner
            const textElements = banner.querySelectorAll('.clock-label, .clock-team-name, .clock-team, .clock-center-labels, .clock-center-values span, .clock-time-value, .clock-next');
            textElements.forEach(el => {
                el.style.color = textColor;
            });
        }
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
    // Only run countdown when the draft is truly active (not paused).
    if (!draft || !draft.clock_started_at || draft.status !== 'active_draft' || draft.raw_status !== 'active') {
        // No active timer - show placeholder
        const timerEl = document.getElementById('timerDisplay');
        const timerBar = document.getElementById('timerBar');
        if (timerEl) timerEl.textContent = '--:--';
        if (timerBar) timerBar.style.width = '0%';
        return;
    }
    let clockStarted = new Date(draft.clock_started_at);
    const timeLimit = draft.pick_clock_seconds || 240; // 4 minutes to match Discord bot
    
    // If clock started in the future, use current time instead
    const now = new Date();
    if (clockStarted > now) {
        console.warn('⚠️ Clock started in future! Using current time instead. Bot sent:', draft.clock_started_at);
        clockStarted = now;
    }
    
    // Debug logging
    console.log('⏱️ Timer starting:', {
        clock_started_at: draft.clock_started_at,
        clockStarted: clockStarted,
        pick_clock_seconds: draft.pick_clock_seconds,
        timeLimit: timeLimit,
        now: now
    });
    
    DRAFT_STATE.timerInterval = setInterval(() => {
        const now = new Date();
        let elapsed = Math.floor((now - clockStarted) / 1000);
        
        let remaining = Math.max(0, timeLimit - elapsed);
        
        // Cap at 59:59 maximum display (shouldn't happen with 4min limit)
        if (remaining > 3599) {
            console.error('Timer showing invalid time:', remaining, 'seconds. Resetting to limit.');
            remaining = timeLimit;
        }
        
        // Update timer display
        const minutes = Math.floor(remaining / 60);
        const seconds = remaining % 60;
        const timeLabel = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        const timerEl = document.getElementById('timerDisplay');
        if (timerEl) timerEl.textContent = timeLabel;

        // On narrow/mobile layouts, show "R# - P# - timer" on a single line
        if (window.innerWidth <= 767) {
            const clockRoundEl = document.getElementById('clockRound');
            const clockPickEl = document.getElementById('clockPickOverall');
            if (clockRoundEl && clockPickEl && draft?.current_round != null && draft.current_pick != null) {
                // Hide separate round value; everything goes into the pick span
                clockRoundEl.textContent = '';
                clockPickEl.textContent = `R${draft.current_round} - P${draft.current_pick} - ${timeLabel}`;
            }
        }
        
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
 * Display draft picks view (delegates to All Picks / My Picks renderers).
 */
function displayRecentPicks() {
    renderAllPicks();
    renderMyPicks();
}

/**
 * Render "All Picks" grouped by round (with FYPD/DC labels).
 */
function renderAllPicks() {
    const container = document.getElementById('allPicksList');
    const countEl = document.getElementById('picksCount');
    const draft = DRAFT_STATE.draftData;

    if (!container || !countEl) return;

    if (!draft || !Array.isArray(draft.picks) || draft.picks.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-hourglass-start"></i>
                <p>No picks have been made yet</p>
            </div>
        `;
        countEl.textContent = '0 picks';
        return;
    }

    const picks = draft.picks;
    const perRound = Array.isArray(draft.draft_order) ? draft.draft_order.length : 0;
    const totalPicks = picks.length;
    const maxPicks = draft.total_rounds && perRound ? draft.total_rounds * perRound : null;

    countEl.textContent = maxPicks ? `${totalPicks} / ${maxPicks}` : `${totalPicks} picks`;

    // Group by round
    const byRound = {};
    picks.forEach(pick => {
        const rd = pick.round || 1;
        if (!byRound[rd]) byRound[rd] = [];
        byRound[rd].push(pick);
    });

    let html = '';
    Object.keys(byRound).map(Number).sort((a, b) => a - b).forEach(rd => {
        const roundPicks = byRound[rd];
        if (!roundPicks || roundPicks.length === 0) return;

        const rawType = roundPicks[0]?.round_type || (rd <= 2 ? 'fypd' : 'dc');
        const roundType = rawType === 'fypd' ? 'FYPD' : 'DC';
        const roundTypeClass = rawType === 'fypd' ? 'fypd' : 'dc';

        html += `
            <div class="round-header">
                <span>Round ${rd}</span>
                <span class="round-type-badge ${roundTypeClass}">${roundType}</span>
            </div>
        `;

        const myTeamAbbr = DRAFT_STATE.userTeam?.abbreviation;

        roundPicks
            .slice()
            .sort((a, b) => (a.pick_number || 0) - (b.pick_number || 0))
            .forEach(pick => {
                const isMyPick = myTeamAbbr && pick.team === myTeamAbbr;
                html += `
                    <div class="pick-result-card ${isMyPick ? 'my-pick' : ''}">
                        <div class="pick-result-number">${rd}.${pick.pick_number}</div>
                        <div class="pick-result-team">${pick.team}</div>
                        <div class="pick-result-player">${pick.player_name}</div>
                        <div class="pick-result-type">${roundType}</div>
                    </div>
                `;
            });
    });

    container.innerHTML = html;
}

/**
 * Render "My Picks" list for the authenticated manager.
 */
function renderMyPicks() {
    const container = document.getElementById('myPicksList');
    const draft = DRAFT_STATE.draftData;

    if (!container) return;

    if (!draft || !Array.isArray(draft.picks)) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-hourglass-start"></i>
                <p>No active draft data available</p>
            </div>
        `;
        return;
    }

    const myTeam = DRAFT_STATE.userTeam?.abbreviation;
    if (!myTeam) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-user-circle"></i>
                <p>Log in to see your picks</p>
            </div>
        `;
        return;
    }

    const myPicks = draft.picks.filter(p => p.team === myTeam);

    if (myPicks.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-clipboard"></i>
                <p>${myTeam} hasn't made any picks yet</p>
            </div>
        `;
        return;
    }

    container.innerHTML = myPicks
        .slice()
        .sort((a, b) => (a.pick_number || 0) - (b.pick_number || 0))
        .map(pick => {
            const rawType = pick.round_type || (pick.round <= 2 ? 'fypd' : 'dc');
            const roundType = rawType === 'fypd' ? 'FYPD' : 'DC';
            return `
                <div class="pick-result-card my-pick">
                    <div class="pick-result-number">Rd ${pick.round}, Pk ${pick.pick_number}</div>
                    <div class="pick-result-player">${pick.player_name}</div>
                    <div class="pick-result-team">${pick.team}</div>
                    <div class="pick-result-type">${roundType}</div>
                </div>
            `;
        })
        .join('');
}

/**
 * Setup main view toggle (Pool / Picks / Grid / Order)
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
            } else if (targetView === 'recent') {
                displayRecentPicks();
            }
        });
    });
}

/**
 * Setup picks sub-tabs (All Picks / My Picks)
 */
function setupPicksTabs() {
    const tabButtons = document.querySelectorAll('.picks-tab-btn');
    const allList = document.getElementById('allPicksList');
    const myList = document.getElementById('myPicksList');

    if (!tabButtons.length || !allList || !myList) return;

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.picksView;

            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            if (view === 'my') {
                myList.classList.add('active');
                allList.classList.remove('active');
            } else {
                allList.classList.add('active');
                myList.classList.remove('active');
            }
        });
    });
}

/**
 * Display full draft grid
 * Uses draft_order_2026.json as the source of truth for grid layout
 */
function displayDraftGrid() {
    const draft = DRAFT_STATE.draftData;
    const container = document.getElementById('draftGrid');
    if (!container) return;

    const selector = document.getElementById('roundSelector');
    if (!selector) return;

    // Must have draft order loaded from draft_order_2026.json
    if (!DRAFT_STATE.draftOrder || DRAFT_STATE.draftOrder.length === 0) {
        container.innerHTML = '<div class="empty-state">Draft order not loaded. Please ensure draft_order_2026.json exists.</div>';
        return;
    }

    // Build a map of made picks by overall pick index for easy lookup
    // The draft order file defines the canonical sequence
    const picksByIndex = new Map();
    if (draft && Array.isArray(draft.picks)) {
        draft.picks.forEach(p => {
            // Match by player name to the draft order slot
            // This handles any mismatch in pick numbering schemes
            const playerName = (p.player_name || '').toLowerCase();
            if (playerName) {
                // Find the matching slot in draft order by team + round
                for (let i = 0; i < DRAFT_STATE.draftOrder.length; i++) {
                    const slot = DRAFT_STATE.draftOrder[i];
                    if (slot.round === p.round && slot.team === p.team) {
                        picksByIndex.set(i, p);
                        break;
                    }
                }
            }
        });
    }

    // Group draft order by round
    const orderByRound = {};
    let globalIdx = 0;
    DRAFT_STATE.draftOrder.forEach((slot, idx) => {
        const r = slot.round;
        if (!orderByRound[r]) orderByRound[r] = [];
        orderByRound[r].push({ ...slot, globalIndex: idx });
    });

    const rounds = Object.keys(orderByRound).map(Number).sort((a, b) => a - b);
    const maxRound = Math.max(...rounds);

    // Build round selector
    selector.innerHTML = '';
    for (let i = 1; i <= maxRound; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `Round ${i}`;
        if (draft && i === draft.current_round) option.selected = true;
        selector.appendChild(option);
    }

    selector.onchange = (e) => {
        const value = e.target.value;
        const roundNum = value === 'current' ? 'current' : parseInt(value, 10);
        scrollToRound(roundNum);
    };

    // Determine current pick index for highlighting
    const currentPickIndex = draft ? (draft.current_pick ? draft.current_pick - 1 : DRAFT_STATE.draftOrder.length) : -1;

    // Build grid HTML using draft order as the source of truth
    let gridHTML = '';
    rounds.forEach(round => {
        const roundSlots = orderByRound[round] || [];
        const roundType = roundSlots[0]?.round_type === 'fypd' ? 'FYPD' : 'DC';
        
        const picksHTML = roundSlots.map(slot => {
            const team = slot.team;
            const overallPick = slot.globalIndex + 1;
            const pick = picksByIndex.get(slot.globalIndex) || null;
            
            // Check if this slot is the current pick
            const isCurrent = slot.globalIndex === currentPickIndex;
            const isPicked = !!pick;
            const playerName = pick ? pick.player_name : '—';
            
            const metaParts = [`#${overallPick}`];
            if (pick?.position) metaParts.push(pick.position);
            if (pick?.mlb_team) metaParts.push(pick.mlb_team);
            const meta = metaParts.join(' • ');

            return `
                <div class="grid-pick ${isCurrent ? 'current' : ''} ${isPicked ? 'picked' : ''}">
                    <div class="grid-pick-team">${team || ''}</div>
                    <div class="grid-pick-player">${playerName}</div>
                    <div class="grid-pick-meta">${meta}</div>
                </div>
            `;
        }).join('');

        gridHTML += `
            <div class="draft-round" id="round-${round}">
                <div class="draft-round-header">
                    <div class="draft-round-title">Round ${round} — ${roundType} (${roundSlots.length} picks)</div>
                </div>
                <div class="draft-round-picks">
                    ${picksHTML}
                </div>
            </div>
        `;
    });

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
 * Helper: position matching for draft pool filters (same semantics as
 * draft-preview: supports composite roles like P/INF/OF/LHP/RHP).
 */
function draftPoolMatchesPosition(playerPos, filterPos) {
    if (!playerPos) return false;
    const pos = playerPos.toUpperCase();
    const filter = filterPos.toUpperCase();
    const posParts = pos.split(/[,/]/).map(p => p.trim());

    if (posParts.includes(filter)) return true;

    if (filter === 'P') {
        return posParts.some(p => ['SP', 'RP', 'LHP', 'RHP', 'SHP', 'P', 'MIRP', 'SIRP'].includes(p));
    }
    if (filter === 'LHP') return posParts.some(p => p === 'LHP' || p.includes('LHP'));
    if (filter === 'RHP') return posParts.some(p => ['RHP', 'SHP', 'SIRP', 'MIRP'].includes(p) || p.includes('RHP'));
    if (filter === 'INF') return posParts.some(p => ['1B', '2B', '3B', 'SS', 'IF', 'INF'].includes(p));
    if (filter === 'OF') return posParts.some(p => ['OF', 'LF', 'CF', 'RF'].includes(p));
    if (filter === 'C') return posParts.includes('C');

    return posParts.includes(filter);
}

/**
 * Sort draft pool prospects in-place using the same semantics as
 * draft-preview (rank/name/org/pos/FV/badges/status) but driven by
 * DRAFT_STATE.poolSort.
 */
function sortDraftPoolProspects(prospects, fvYear, isFypdRound) {
    const sort = DRAFT_STATE.poolSort || { field: 'rank', direction: 'asc' };
    const { field } = sort;
    let { direction } = sort;

    // In FYPD rounds, default rank sort should respect FYPD rank first
    if (!direction) direction = field === 'rank' ? 'asc' : 'desc';
    const mult = direction === 'asc' ? 1 : -1;

    prospects.sort((a, b) => {
        let aVal, bVal;

        switch (field) {
            case 'rank': {
                // Prioritize: fypd_rank > rank > large number (unranked last)
                const aRank = isFypdRound ? (a.fypd_rank || a.rank || 99999) : (a.rank || 99999);
                const bRank = isFypdRound ? (b.fypd_rank || b.rank || 99999) : (b.rank || 99999);
                return mult * (aRank - bRank);
            }
            case 'name':
                return mult * (a.name || '').localeCompare(b.name || '');
            case 'org':
                return mult * (a.org || '').localeCompare(b.org || '');
            case 'position':
                return mult * (a.position || '').localeCompare(b.position || '');
            case 'fv':
                aVal = a.fv?.[fvYear] || 0;
                bVal = b.fv?.[fvYear] || 0;
                // Match draft-preview behavior: higher FV first when "ascending"
                return mult * (bVal - aVal);
            case 'badges':
                aVal = a.badges?.length || 0;
                bVal = b.badges?.length || 0;
                // Match draft-preview behavior: more badges first when "ascending"
                return mult * (bVal - aVal);
            case 'status':
                aVal = draftPoolPrimaryStatus(a.status);
                bVal = draftPoolPrimaryStatus(b.status);
                return mult * aVal.localeCompare(bVal);
            default:
                return 0;
        }
    });
}

/**
 * Map a status array to a primary label for sorting priority.
 */
function draftPoolPrimaryStatus(statusArr) {
    if (!statusArr || statusArr.length === 0) return 'Standard';
    if (statusArr.includes('dropped')) return 'Dropped';
    if (statusArr.includes('debuted')) return 'Debuted';
    if (statusArr.includes('fypd')) return 'FYPD';
    if (statusArr.includes('int_signee')) return 'INT';
    return 'Standard';
}

/**
 * Attach click handlers to sortable headers in the live draft pool.
 */
function setupDraftPoolSorting() {
    const headers = document.querySelectorAll('#draftPoolList .prospect-table th.sortable');
    if (!headers.length) return;

    headers.forEach(header => {
        header.onclick = null; // clear any existing inline listeners on re-render
        header.addEventListener('click', () => {
            const field = header.dataset.sort;
            const sort = DRAFT_STATE.poolSort || { field: 'rank', direction: 'asc' };

            if (sort.field === field) {
                sort.direction = sort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                sort.field = field;
                sort.direction = field === 'rank' ? 'asc' : 'desc';
            }

            DRAFT_STATE.poolSort = sort;
            displayDraftPool();
        });
    });
}

/**
 * Update sort icons / visual state on the live draft pool headers.
 */
function updateDraftPoolSortIndicators() {
    const headers = document.querySelectorAll('#draftPoolList .prospect-table th.sortable');
    if (!headers.length) return;

    const sort = DRAFT_STATE.poolSort || { field: 'rank', direction: 'asc' };

    headers.forEach(header => {
        const field = header.dataset.sort;
        const icon = header.querySelector('i');
        if (!icon) return;

        if (field === sort.field) {
            icon.className = sort.direction === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
            header.classList.add('sorted');
        } else {
            icon.className = 'fas fa-sort';
            header.classList.remove('sorted');
        }
    });
}

/**
 * Make the On The Clock banner behave like a sticky bar, similar to the
 * PAD WizBucks sticky bar. We fall back to JS-driven fixed positioning so
 * it works reliably across browsers and nested scroll containers.
 */
function setupClockSticky() {
    if (DRAFT_STATE.clockStickyInitialized) return;
    const banner = document.getElementById('clockBanner');
    if (!banner) return;

    DRAFT_STATE.clockStickyInitialized = true;

    const nav = document.querySelector('.mobile-nav');
    const getOffsetTop = () => {
        if (!nav) return 0;
        const rect = nav.getBoundingClientRect();
        return (rect.height || 0) + 8; // small gap below nav
    };

    // Capture the banner's original document Y offset so we know
    // when we've scrolled "past" it and when we've scrolled back above it.
    const initialRect = banner.getBoundingClientRect();
    const initialDocTop = initialRect.top + window.scrollY;

    // Spacer div to prevent layout jump when the banner is taken out of flow
    const placeholder = document.createElement('div');
    placeholder.style.width = '100%';
    placeholder.style.height = `${initialRect.height}px`;
    placeholder.style.display = 'none';
    banner.parentNode.insertBefore(placeholder, banner.nextSibling);

    let isFixed = false;
    let fixedLeft = null;
    let fixedWidth = null;

    const onScroll = () => {
        const offset = getOffsetTop();
        const scrollTop = window.scrollY || window.pageYOffset || 0;
        const shouldStick = scrollTop + offset >= initialDocTop;

        // Keep spacer height in sync with the banner in case fonts/layout change
        placeholder.style.height = `${banner.offsetHeight}px`;

        if (shouldStick && !isFixed) {
            // Capture geometry before fixing
            const rect = banner.getBoundingClientRect();
            fixedLeft = rect.left + window.scrollX;
            fixedWidth = rect.width;
            placeholder.style.display = 'block';
            banner.style.position = 'fixed';
            banner.style.top = `${offset}px`;
            banner.style.left = `${fixedLeft}px`;
            banner.style.width = `${fixedWidth}px`;
            banner.style.zIndex = '110';
            isFixed = true;
        } else if (!shouldStick && isFixed) {
            banner.style.position = '';
            banner.style.top = '';
            banner.style.left = '';
            banner.style.width = '';
            banner.style.zIndex = '';
            placeholder.style.display = 'none';
            isFixed = false;
        }
    };

    window.addEventListener('scroll', onScroll);
    window.addEventListener('resize', onScroll);
    // Run once to initialize state
    onScroll();
}

/**
 * Load prospect_tags.json into DRAFT_STATE.tagsByUpid for enriched FV /
 * badge / status info in the draft pool. Safe no-op if the file is missing.
 */
async function loadProspectTagsForDraft() {
    try {
        const response = await fetch('data/prospect_tags.json');
        if (!response.ok) {
            console.warn('No prospect_tags.json available for draft pool');
            return;
        }
        const data = await response.json();
        const players = data.players || (Array.isArray(data) ? data : []);

        DRAFT_STATE.tagsByUpid = {};
        players.forEach(p => {
            if (p.upid) {
                DRAFT_STATE.tagsByUpid[String(p.upid)] = p;
            }
        });
        DRAFT_STATE.prospectTagsLoaded = true;
        console.log(`✅ Draft pool: loaded ${players.length} prospect tags`);
    } catch (e) {
        console.warn('Could not load prospect_tags.json for draft pool:', e);
    }
}

/**
 * Load player_log.json and compute the set of prospects dropped during PAD
 * (same heuristic as draft-preview). Used to tag prospects with 'dropped'
 * status in the live draft pool.
 */
async function loadDroppedProspectsForDraft() {
    try {
        const response = await fetch('data/player_log.json');
        if (!response.ok) {
            console.log('No player_log.json available for draft pool');
            return;
        }
        const log = await response.json();
        const currentYear = new Date().getFullYear();
        const dropped = new Set();

        log.forEach(entry => {
            const entryDate = entry.date || entry.timestamp || '';
            const ts = entryDate ? new Date(entryDate) : null;
            if (!ts || !entry.upid) return;

            const entryYear = ts.getFullYear();
            const entryMonth = ts.getMonth() + 1; // 1-12
            const isPADPeriod = entryYear === currentYear && entryMonth === 2; // February

            const eventStr = (entry.event || '').toLowerCase();
            const typeStr = (entry.type || '').toLowerCase();
            const updateStr = (entry.update_type || '').toLowerCase();

            const isDropped = eventStr.includes('drop') ||
                              typeStr.includes('drop') ||
                              updateStr.includes('drop') ||
                              (((entry.contract_type === '' || entry.contract_type == null)
                                 && entry.player_type === 'Farm'));

            if (isPADPeriod && isDropped) {
                dropped.add(String(entry.upid));
            }
        });

        DRAFT_STATE.droppedUpids = dropped;
        console.log(`✅ Draft pool: loaded ${dropped.size} dropped prospects from player_log.json`);
    } catch (e) {
        console.log('No player_log.json available for draft pool (draft page)');
    }
}

/**
 * Build the base eligible prospect pool from FBPHub.data.players, applying
 * only hard eligibility rules (Farm, unowned, no contract, undrafted).
 *
 * All constitution-level rules are enforced here. View-specific filters
 * (status/position/badges/search) are layered on top in displayDraftPool().
 */
function buildDraftPoolProspects() {
    const draft = DRAFT_STATE.draftData;
    if (!FBPHub?.data?.players) return [];

    const draftedNames = new Set(
        Array.isArray(draft?.picks)
            ? draft.picks.map(p => (p.player_name || '').toLowerCase()).filter(Boolean)
            : []
    );

    const prospects = [];
    const processedUpids = new Set();

    FBPHub.data.players.forEach(player => {
        if (player.player_type !== 'Farm') return;

        // Skip OWNED prospects (has a manager or FBP_Team)
        const hasManager = player.manager && player.manager !== 'None' && (player.manager || '').trim();
        const hasFbpTeam = player.FBP_Team && player.FBP_Team !== 'None' && (player.FBP_Team || '').trim();
        if (hasManager || hasFbpTeam) return;

        // Extra safety: skip anyone with an active prospect contract. In
        // theory these should only exist on owned players, but this guard
        // keeps eligibility aligned with the bot's rules.
        const hasContract = (player.contract_type || '').trim();
        if (hasContract) return;

        // Skip already drafted in this draft
        if (draftedNames.has((player.name || '').toLowerCase())) return;

        const upid = String(player.upid || '');
        if (!upid || processedUpids.has(upid)) return;
        processedUpids.add(upid);

        const tagData = DRAFT_STATE.tagsByUpid?.[upid] || {};
        const badges = tagData.badges || [];

        let statusArr = [];
        if (player.fypd === true) statusArr.push('fypd');
        if (player.debuted === true) statusArr.push('debuted');
        if (badges.some(b => (b.type || '').includes('INT Signee'))) statusArr.push('int_signee');
        if (badges.some(b => (b.type || '').includes('INT Top'))) statusArr.push('int_signee');
        if (DRAFT_STATE.droppedUpids && DRAFT_STATE.droppedUpids.has(upid)) statusArr.push('dropped');

        prospects.push({
            upid: player.upid,
            name: player.name,
            org: player.team || tagData.org || '-',
            position: player.position || tagData.position || '-',
            fv: tagData.fv || {},
            badges: badges,
            badgeCount: badges.length,
            status: statusArr,
            rank: tagData.rank || player.rank,
            fypd_rank: player.fypd_rank,
            age: tagData.age || player.age,
            fypd: player.fypd,
            // For slide-in panel + ownership context
            team: player.team,
            player_type: player.player_type,
            manager: player.manager,
            contract_type: player.contract_type,
            years_simple: player.years_simple,
            level: player.level || player.mlb_level
        });
    });

    return prospects;
}

/**
 * Render status badges based on the merged status array for a prospect.
 */
function renderDraftPoolStatusBadges(statusArr) {
    if (!statusArr || statusArr.length === 0) {
        return '<span class="status-badge status-standard">STND</span>';
    }
    const badgeMap = {
        'fypd': { cls: 'status-fypd', label: 'FYPD' },
        'int_signee': { cls: 'status-int', label: 'INT' },
        'debuted': { cls: 'status-debuted', label: 'DEBU' },
        'dropped': { cls: 'status-dropped', label: 'DROP' }
    };
    return statusArr.map(s => {
        const b = badgeMap[s] || { cls: 'status-standard', label: s };
        return `<span class="status-badge ${b.cls}">${b.label}</span>`;
    }).join(' ');
}

/**
 * Display draft pool (live view) with enriched filters + FYPD-only rounds
 * 1–2. This keeps the underlying eligibility identical to the previous
 * implementation while upgrading the UX.
 */
function displayDraftPool() {
    const draft = DRAFT_STATE.draftData;
    const poolList = document.getElementById('draftPoolList');
    const countEl = document.getElementById('draftPoolCount');

    if (!poolList || !countEl) return;

    // Keeper mode: not wired yet; avoid showing prospect pool here.
    if (DRAFT_STATE.mode === 'keeper') {
        countEl.textContent = '0 players';
        poolList.innerHTML = '<div class="empty-state">Keeper draft pool view is not available yet.</div>';
        return;
    }

    if (!FBPHub?.data?.players) return;

    const searchTerm = (document.getElementById('draftPoolSearch')?.value || '').toLowerCase();
    const fvYear = document.getElementById('poolFvYear')?.value || '2024';
    const statusFilter = document.getElementById('poolStatusFilter')?.value || 'any';
    const posFilter = document.getElementById('poolPositionFilter')?.value || 'any';
    const badgeFilter = document.getElementById('poolBadgeFilter')?.value || 'any';

    const currentRound = draft?.current_round || 1;
    const isFypdRound = currentRound <= 2;

    let available = buildDraftPoolProspects();

    // Enforce FYPD-only in Rounds 1–2 (constitution rule).
    if (isFypdRound) {
        available = available.filter(p => !!p.fypd);
    }

    // Status filter
    if (statusFilter !== 'any') {
        available = available.filter(p => {
            const arr = p.status || [];
            if (statusFilter === 'standard') return !arr.includes('dropped');
            return arr.includes(statusFilter);
        });
    }

    // Position filter
    if (posFilter !== 'any') {
        available = available.filter(p => draftPoolMatchesPosition(p.position, posFilter));
    }

    // Badge filter (matches exact badge type from prospect_tags.json)
    if (badgeFilter !== 'any') {
        available = available.filter(p =>
            p.badges?.some(b => b.type === badgeFilter)
        );
    }

    // Text search
    if (searchTerm) {
        available = available.filter(p =>
            (p.name || '').toLowerCase().includes(searchTerm) ||
            (p.org || '').toLowerCase().includes(searchTerm) ||
            (p.position || '').toLowerCase().includes(searchTerm)
        );
    }

    // Sorting: delegate to shared sorter so behavior matches draft-preview.
    sortDraftPoolProspects(available, fvYear, isFypdRound);

    countEl.textContent = `${available.length} players`;

    if (!available.length) {
        poolList.innerHTML = '<div class="empty-state">No eligible players match your filters</div>';
        return;
    }

    // Render as table; rows keep the preview-player-row structure so
    // draft-enhancements.js can keep wiring click handlers.
    const tableHTML = `
        <table class="prospect-table draft-pool-table">
            <thead>
                <tr>
                    <th class="sortable" data-sort="name">PROSPECT <i class="fas fa-sort"></i></th>
                    <th class="sortable" data-sort="org">ORG <i class="fas fa-sort"></i></th>
                    <th class="sortable" data-sort="position">POS <i class="fas fa-sort"></i></th>
                    <th class="sortable" data-sort="fv">FV <i class="fas fa-sort"></i></th>
                    <th class="sortable" data-sort="badges">BADGES <i class="fas fa-sort"></i></th>
                    <th class="sortable" data-sort="status">STATUS <i class="fas fa-sort"></i></th>
                </tr>
            </thead>
            <tbody>
                ${available.map((p, idx) => {
                    const rank = (isFypdRound ? (p.fypd_rank || p.rank) : p.rank) || idx + 1;
                    const fv = p.fv?.[fvYear] || '-';
                    const profileLink = (typeof createPlayerLink === 'function') ? createPlayerLink(p) : '#';
                    const isFypd = !!p.fypd;

                    return `
                        <tr class="prospect-row${isFypd ? ' prospect-row-fypd' : ''}"
                            data-player-id="${p.upid || ''}" data-player-name="${(p.name || '').replace(/"/g, '&quot;')}">
                            <td class="prospect-name">
                                <a href="${profileLink}" class="prospect-name-link">${p.name || 'Unknown'}</a>
                            </td>
                            <td class="prospect-org">${p.org || '-'}</td>
                            <td class="prospect-pos">${p.position || '-'}</td>
                            <td class="prospect-fv">${fv}</td>
                            <td class="prospect-badges">${p.badgeCount || 0}</td>
                            <td class="prospect-status">
                                <div class="status-wrapper">${renderDraftPoolStatusBadges(p.status)}</div>
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;

    poolList.innerHTML = tableHTML;

    // Wire sorting and update sort indicators on each render
    setupDraftPoolSorting();
    updateDraftPoolSortIndicators();
}

/**
 * Wire up the dropdown filters so any change re-renders the pool.
 */
function setupDraftPoolFilters() {
    ['poolFvYear', 'poolStatusFilter', 'poolPositionFilter', 'poolBadgeFilter'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => displayDraftPool());
    });

    const searchInput = document.getElementById('draftPoolSearch');
    if (searchInput) {
        searchInput.addEventListener('input', () => displayDraftPool());
    }
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
        const team = draft.draft_order[pk - 1];
        items.push({ pick: pk, team });
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
                        PK ${item.pick}
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
 * Submit quick pick - delegates to requestWebPick if available
 */
function submitQuickPick() {
    const playerName = document.getElementById('quickPickSearch').value.trim();
    
    if (!playerName) {
        alert('Enter player name');
        return;
    }
    
    // Use the web pick request flow from draft-enhancements.js
    if (typeof requestWebPick === 'function') {
        requestWebPick(playerName);
    } else {
        alert('Draft pick submission not available. Please use Discord.');
    }
}

/**
 * Helper functions
 */
const ET_TZ = 'America/New_York';

function formatTime(isoString) {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: ET_TZ });
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
