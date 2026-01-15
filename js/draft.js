/**
 * FBP Hub - Live Draft Tracker
 * Real-time draft monitoring and updates
 */

let DRAFT_STATE = {
    draftData: null,
    draftPool: null,
    userTeam: null,
    updateInterval: null,
    timerInterval: null,
    mode: 'keeper', // 'keeper' or 'prospect'
};

/**
 * Initialize draft page
 */
async function initDraft() {
    console.log('🎯 Initializing draft tracker...', DRAFT_STATE.mode);
    
    // Get user team (optional - can view draft without auth)
    if (typeof authManager !== 'undefined' && authManager.isAuthenticated()) {
        DRAFT_STATE.userTeam = authManager.getTeam();
    }
    
    // Load draft data for current mo    if (!DRAFT_STATE.draftData) {
        if (DRAFT_STATE.updateInterval) clearInterval(DRAFT_STATE.updateInterval);
        if (DRAFT_STATE.timerInterval) clearInterval(DRAFT_STATE.timerInterval);
        const inactiveEl = document.getElementById('draftInactive');
        const contentEl = document.getElementById('draftContent');
        if (inactiveEl) inactiveEl.style.display = 'flex';
        if (contentEl) contentEl.style.display = 'none';
        return;
    }
ve').style.display = 'flex';
        document.getElementById('draftContent').style.display = 'none';
        return;
    }
    
    document.getElementById('draftInactive').style.display = 'none';
    document.getElementById('draftContent').style.display = 'block';
    
    // Initialize display
    updateDraftHeader();
    updateOnTheClock();
    displayRecentPicks();
    setupViewToggle();
    
    // Start auto-refresh (every 5 seconds)
    DRAFT_STATE.updateInterval = setInterval(refreshDraftData, 5000);
    
    // Start timer countdown
    startPickTimer();
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
    
    // Load draft pool (optional, kept for future use)
    try {
        const basePath = (typeof FBPHub !== 'undefined' && FBPHub.config?.dataPath) ? FBPHub.config.dataPath : './data/';
        const poolResponse = await fetch(`${basePath}draft_pool.json`, { cache: 'no-store' });
        if (poolResponse.ok) {
            DRAFT_STATE.draftPool = await poolResponse.json();
        }
    } catch (e) {
        console.log('No draft pool data');
    }
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
        
        // Show notification
        showPickNotification();
    }
}

/**
 * Update draft header
 */
function updateDraftHeader() {
    const draft = DRAFT_STATE.draftData;
    if (!draft) return;

    document.getElementById('currentRound').textContent = draft.current_round ?? '-';
    document.getElementById('currentPickOverall').textContent = draft.current_pick ?? '-';
    
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
    if (!draft) return;
    const clockTeam = draft.current_team;
    const teamName = TEAM_NAMES[clockTeam] || clockTeam;
    
    document.getElementById('clockTeam').textContent = clockTeam;
    document.getElementById('clockTeamName').textContent = teamName;
    
    // Show quick pick if it's user's turn
    const quickPickSection = document.getElementById('quickPickSection');
    if (DRAFT_STATE.userTeam && DRAFT_STATE.userTeam.abbreviation === clockTeam) {
        quickPickSection.style.display = 'block';
    } else {
        quickPickSection.style.display = 'none';
    }
    
    // Restart timer
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
            if (targetView === 'grid') {
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
    
    // Build round selector
    const selector = document.getElementById('roundSelector');
    selector.innerHTML = '';
    for (let i = 1; i <= draft.total_rounds; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `Round ${i}`;
        if (i === draft.current_round) option.selected = true;
        selector.appendChild(option);
    }
    
    // Display all rounds
    let gridHTML = '';
    for (let round = 1; round <= draft.total_rounds; round++) {
        const roundPicks = draft.picks.filter(p => p.round === round);
        const picksHTML = draft.draft_order.map((team, idx) => {
            const pickNum = (round - 1) * 12 + idx + 1;
            const pick = roundPicks.find(p => p.team === team);
            const isCurrent = pickNum === draft.current_pick;
            
            if (pick) {
                return `
                    <div class="grid-pick ${isCurrent ? 'current' : ''}">
                        <div class="grid-pick-team">${team}</div>
                        <div class="grid-pick-player">${pick.player_name}</div>
                        <div class="grid-pick-meta">${pick.position} • ${pick.mlb_team}</div>
                    </div>
                `;
            } else {
                return `
                    <div class="grid-pick ${isCurrent ? 'current' : ''}">
                        <div class="grid-pick-team">${team}</div>
                        ${isCurrent ? '<div class="grid-pick-player">ON THE CLOCK</div>' : ''}
                    </div>
                `;
            }
        }).join('');
        
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
    
    container.innerHTML = draft.draft_order.map((team, idx) => {
        const teamPicks = draft.picks.filter(p => p.team === team);
        const pickPositions = draft.draft_order.reduce((acc, t, i) => {
            if (t === team) acc.push(i + 1);
            return acc;
        }, []);
        
        return `
            <div class="order-team-card">
                <div class="order-team-info">
                    <div class="order-position">${idx + 1}</div>
                    <div>
                        <div class="order-team-name">${team} - ${TEAM_NAMES[team] || team}</div>
                        <div style="font-size: var(--text-xs); color: var(--text-gray); margin-top: 4px;">
                            Picks: ${pickPositions.join(', ')}
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

    // Update button UI
    const buttons = document.querySelectorAll('.mode-btn');
    buttons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    // Reset timers and reload state
    if (DRAFT_STATE.updateInterval) clearInterval(DRAFT_STATE.updateInterval);
    if (DRAFT_STATE.timerInterval) clearInterval(DRAFT_STATE.timerInterval);

    initDraft();
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
