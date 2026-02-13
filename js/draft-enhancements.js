/**
 * FBP Draft Enhancements
 * - Player slide-in panel (reuses players.js pattern)
 * - Draft Board tab (replaces Draft Order, syncs with Discord boards)
 * - Web-initiated draft pick request (sends DM confirmation via bot)
 * - Clickable player rows in draft pool
 *
 * Include AFTER draft.js and player-profile.js in draft.html
 */

// ============================================
// SLIDE-IN PANEL FOR DRAFT PAGE
// ============================================

/**
 * Open player detail panel from draft pool click.
 * Reuses the same .player-detail-panel that players.js uses,
 * but adds draft-specific action buttons.
 */
function openDraftPlayerDetail(playerId) {
    const panel = document.getElementById('playerDetailPanel');
    if (!panel) return;

    // Find player in FBPHub data
    const player = (FBPHub?.data?.players || []).find(p =>
        (p.upid && String(p.upid) === String(playerId)) || p.name === playerId
    );

    if (!player) {
        console.warn('Player not found for detail:', playerId);
        return;
    }

    // Apply owner theme (from player-profile.js)
    if (typeof applyOwnerThemeForPlayerDetail === 'function') {
        applyOwnerThemeForPlayerDetail(player);
    }

    const profileLink = typeof createPlayerLink === 'function' ? createPlayerLink(player) : '#';

    // Determine if it's this user's turn (for Draft Player button)
    const draft = DRAFT_STATE?.draftData;
    const userTeam = DRAFT_STATE?.userTeam?.abbreviation;
    const isMyTurn = draft?.status === 'active_draft' && draft?.current_team === userTeam;
    const isAvailable = !player.manager && !player.FBP_Team && !(player.contract_type || '').trim();

    // Contract badge helper
    const contractBadgeHTML = player.years_simple
        ? createContractBadgeForDraft(player.years_simple)
        : '';
    const teamBadgeHTML = player.FBP_Team
        ? (typeof createTeamBadge === 'function' ? createTeamBadge(player.FBP_Team) : `<span>${player.FBP_Team}</span>`)
        : '';

    panel.innerHTML = `
        <div class="player-detail-header">
            <button class="detail-close-btn" onclick="closeDraftPlayerDetail()">
                <i class="fas fa-times"></i> CLOSE
            </button>
            <div class="player-detail-name">${player.name}</div>
            <div class="player-detail-title">${player.position || '??'} — ${player.team || 'Free Agent'}</div>
            <div class="player-detail-badges">
                ${contractBadgeHTML}
                ${teamBadgeHTML}
            </div>
            <div class="player-detail-actions">
                <a href="${profileLink}" class="btn btn-profile-accent">
                    <i class="fas fa-user"></i> View Full Profile
                </a>
                ${isAvailable && isMyTurn ? `
                    <button class="btn-draft-player-header" data-draft-player="${encodeURIComponent(player.name)}">
                        <i class="fas fa-gavel"></i> Draft
                    </button>
                ` : isAvailable && !isMyTurn ? `
                    <button class="btn-draft-player-header" disabled>
                        <i class="fas fa-clock"></i> Not Your Turn
                    </button>
                ` : `
                    <button class="btn-draft-player-header" disabled>
                        <i class="fas fa-lock"></i> Not Available
                    </button>
                `}
                <button class="btn-add-to-board-header" data-add-to-board="${encodeURIComponent(player.name)}">
                    <i class="fas fa-clipboard-list"></i> Add to Draft Board
                </button>
            </div>
        </div>

        <div class="player-detail-content">
            <div class="detail-section">
                <h3>PLAYER INFORMATION</h3>
                <div class="info-grid">
                    <div class="info-item">
                        <div class="info-label">Position</div>
                        <div class="info-value">${player.position || 'N/A'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">MLB Team</div>
                        <div class="info-value">${player.team || 'FA'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Age</div>
                        <div class="info-value">${player.age || 'N/A'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Bats / Throws</div>
                        <div class="info-value">${player.bats || '?'} / ${player.throws || '?'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Player Type</div>
                        <div class="info-value">${player.player_type === 'MLB' ? 'Keeper' : 'Prospect'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">FBP Owner</div>
                        <div class="info-value">${player.manager || player.FBP_Team || 'Unowned'}</div>
                    </div>
                    ${player.contract_type ? `
                        <div class="info-item">
                            <div class="info-label">Contract</div>
                            <div class="info-value">${player.contract_type}</div>
                        </div>
                    ` : ''}
                    ${player.years_simple ? `
                        <div class="info-item">
                            <div class="info-label">Status</div>
                            <div class="info-value">${player.years_simple}</div>
                        </div>
                    ` : ''}
                    ${player.fypd ? `
                        <div class="info-item">
                            <div class="info-label">FYPD</div>
                            <div class="info-value" style="color: #64B5F6;">Yes${player.fypd_rank ? ` (#${player.fypd_rank})` : ''}</div>
                        </div>
                    ` : ''}
                </div>
            </div>
        </div>
    `;

    panel.classList.add('active');
}

function closeDraftPlayerDetail() {
    const panel = document.getElementById('playerDetailPanel');
    if (panel) panel.classList.remove('active');
}

function createContractBadgeForDraft(contractStr) {
    const contract = contractStr.toUpperCase();
    let badgeClass = 'tc';
    if (contract.includes('VC')) badgeClass = 'vc';
    else if (contract.includes('FC')) badgeClass = 'fc';
    else if (contract.includes('PC')) badgeClass = 'pc';
    else if (contract.includes('DC')) badgeClass = 'dc';
    return `<span class="contract-badge ${badgeClass}">${contractStr}</span>`;
}

// ============================================
// CLICKABLE PLAYER ROWS IN DRAFT POOL
// ============================================

/**
 * Attach click handlers to each draft-pool row so tapping opens the slide-in panel.
 * Supports both the older card layout (.preview-player-row) and the new
 * table layout (.prospect-row in a prospect-table).
 */
function attachPoolClickHandlers() {
    const rows = document.querySelectorAll('#draftPoolList .preview-player-row, #draftPoolList .prospect-row');
    rows.forEach(row => {
        const nameLink = row.querySelector('.preview-name-link, .prospect-name-link');
        if (!nameLink) return;

        const playerName = nameLink.textContent.trim();

        nameLink.addEventListener('click', (e) => {
            e.preventDefault();
            openDraftPlayerDetail(playerName);
        });

        row.addEventListener('click', (e) => {
            if (e.target.closest('.preview-name-link') ||
                e.target.closest('.prospect-name-link')) {
                return;
            }
            openDraftPlayerDetail(playerName);
        });
    });
}

// Observe changes to the pool list so we can reattach handlers on re-render.
const _poolObserver = new MutationObserver(() => {
    attachPoolClickHandlers();
});

document.addEventListener('DOMContentLoaded', () => {
    const poolEl = document.getElementById('draftPoolList');
    if (poolEl) {
        _poolObserver.observe(poolEl, { childList: true });
    }
    // Initial attach in case content is already there
    attachPoolClickHandlers();
});

// ============================================
// DRAFT BOARD TAB (replaces Draft Order)
// ============================================

let DRAFT_BOARD_STATE = {
    board: [],
    loaded: false,
    syncing: false,
};

async function loadDraftBoard() {
    const team = DRAFT_STATE?.userTeam?.abbreviation;
    if (!team) {
        DRAFT_BOARD_STATE.board = [];
        DRAFT_BOARD_STATE.loaded = true;
        return;
    }

    const apiBase = FBPHub?.config?.apiBase;
    if (!apiBase) {
        const saved = localStorage.getItem(`draft_board_${team}`);
        if (saved) {
            try {
                const data = JSON.parse(saved);
                DRAFT_BOARD_STATE.board = data.targets?.map(t => t.player_name) || data.board || [];
            } catch (e) {
                DRAFT_BOARD_STATE.board = [];
            }
        }
        DRAFT_BOARD_STATE.loaded = true;
        return;
    }

    try {
        const res = await fetch(`${apiBase}/api/draft/boards/${team}`, {
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
        });
        if (res.ok) {
            const data = await res.json();
            DRAFT_BOARD_STATE.board = data.board || [];
        }
    } catch (e) {
        console.warn('Failed to load draft board:', e.message);
    }

    DRAFT_BOARD_STATE.loaded = true;
}

function displayDraftBoard() {
    const container = document.getElementById('draftOrderList');
    if (!container) return;

    const team = DRAFT_STATE?.userTeam?.abbreviation;

    if (!team) {
        container.innerHTML = `
            <div class="board-login-prompt">
                <i class="fas fa-lock"></i>
                <p>Log in to see your draft board</p>
                <a href="login.html"><i class="fas fa-sign-in-alt"></i> Login with Discord</a>
            </div>
        `;
        return;
    }

    if (!DRAFT_BOARD_STATE.loaded) {
        container.innerHTML = `
            <div class="board-inline-empty">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Loading your board...</p>
            </div>
        `;
        loadDraftBoard().then(displayDraftBoard);
        return;
    }

    const board = DRAFT_BOARD_STATE.board;

    if (!board.length) {
        container.innerHTML = `
            <div class="draft-board-inline">
                <div class="board-inline-header">
                    <h3><i class="fas fa-clipboard-list"></i> MY DRAFT BOARD</h3>
                    <a href="draft-board.html" class="btn-secondary" style="font-size: var(--text-xs);">
                        <i class="fas fa-external-link-alt"></i> Edit Board
                    </a>
                </div>
                <div class="board-inline-empty">
                    <i class="fas fa-clipboard-list"></i>
                    <p>Your board is empty</p>
                    <p style="font-size: var(--text-sm); margin-top: var(--space-sm);">
                        Use <a href="draft-board.html" style="color: var(--accent-yellow);">Draft Board</a>
                        or Discord <code>/add</code> to add targets
                    </p>
                </div>
            </div>
        `;
        return;
    }

    const draftedNames = new Set(
        (DRAFT_STATE?.draftData?.picks || []).map(p =>
            (p.player_name || '').toLowerCase()
        )
    );

    const allPlayers = FBPHub?.data?.players || [];

    const available = board.filter(name => !draftedNames.has(name.toLowerCase()));

    let html = `
        <div class="draft-board-inline">
            <div class="board-inline-header">
                <h3><i class="fas fa-clipboard-list"></i> MY DRAFT BOARD</h3>
                <div>
                    <span class="board-inline-count">${available.length} available / ${board.length} total</span>
                    <a href="draft-board.html" class="btn-secondary" style="font-size: var(--text-xs); margin-left: var(--space-sm);">
                        <i class="fas fa-edit"></i> Edit
                    </a>
                </div>
            </div>
            <div class="board-inline-list">
    `;

    board.forEach((name, idx) => {
        const isDrafted = draftedNames.has(name.toLowerCase());
        const player = allPlayers.find(p => p.name?.toLowerCase() === name.toLowerCase());
        const pos = player?.position || '';
        const team = player?.team || '';

        let draftedByText = '';
        if (isDrafted) {
            const pick = (DRAFT_STATE?.draftData?.picks || []).find(
                p => (p.player_name || '').toLowerCase() === name.toLowerCase()
            );
            if (pick) {
                draftedByText = `${pick.team} (Rd ${pick.round})`;
            }
        }

        html += `
            <div class="board-inline-item ${isDrafted ? 'board-item-drafted' : ''}"
                 data-open-player="${encodeURIComponent(name)}">
                <span class="board-inline-rank">${idx + 1}</span>
                <span class="board-inline-name">${name}</span>
                <span class="board-inline-meta">${pos} ${team}</span>
                ${isDrafted ? `<span class="board-inline-drafted-by">${draftedByText}</span>` : ''}
            </div>
        `;
    });

    html += '</div></div>';
    container.innerHTML = html;
}

async function addToBoardFromPanel(playerName) {
    const team = DRAFT_STATE?.userTeam?.abbreviation;
    if (!team) {
        alert('Please log in to use your draft board');
        return;
    }

    if (DRAFT_BOARD_STATE.board.some(n => n.toLowerCase() === playerName.toLowerCase())) {
        alert(`${playerName} is already on your board`);
        return;
    }

    DRAFT_BOARD_STATE.board.push(playerName);

    const apiBase = FBPHub?.config?.apiBase;
    if (apiBase) {
        try {
            await fetch(`${apiBase}/api/draft/boards/${team}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ team, board: DRAFT_BOARD_STATE.board }),
            });
        } catch (e) {
            console.warn('Board sync failed:', e.message);
        }
    }

    const localKey = `draft_board_${team}`;
    const existing = JSON.parse(localStorage.getItem(localKey) || '{}');
    existing.targets = existing.targets || [];
    existing.targets.push({
        rank: existing.targets.length + 1,
        player_name: playerName,
        upid: '',
        position: '',
        mlb_team: '',
        target_round: null,
        notes: '',
        taken: false,
    });
    localStorage.setItem(localKey, JSON.stringify(existing));

    displayDraftBoard();
    showDraftToast(`${playerName} added to your board`, 'success');
}

// ============================================
// WEB-INITIATED DRAFT PICK REQUEST
// ============================================

// Store pending pick data for the confirmation modal
let pendingPickData = null;

async function requestWebPick(playerName) {
    // Clear any previous suggestions
    hidePickSuggestions();
    
    const team = DRAFT_STATE?.userTeam?.abbreviation;
    if (!team) {
        alert('Please log in to make a pick');
        return;
    }

    const draft = DRAFT_STATE?.draftData;
    if (!draft || draft.status !== 'active_draft') {
        alert('Draft is not currently active');
        return;
    }

    if (draft.current_team !== team) {
        alert(`Not your turn. ${draft.current_team} is on the clock.`);
        return;
    }

    const apiBase = FBPHub?.config?.apiBase;
    if (!apiBase) {
        alert('API not configured');
        return;
    }

    // First validate the pick and get player data
    try {
        const res = await fetch(`${apiBase}/api/draft/prospect/validate-pick`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ team, player_name: playerName }),
        });

        const data = await res.json();

        if (!res.ok) {
            // Check if error contains "Did you mean" suggestions
            const errorMsg = data.detail || 'Invalid pick';
            if (errorMsg.includes('Did you mean')) {
                showPickSuggestions(errorMsg);
            } else {
                showPickError(errorMsg);
            }
            return;
        }

        // Validate response has required data
        if (!data.player || !data.pick_info) {
            showPickError('Invalid response from server');
            return;
        }

        // Show confirmation modal with player data
        showDraftConfirmModal(data.player, data.pick_info, team);

    } catch (e) {
        showPickError('Network error: ' + e.message);
    }
}

/**
 * Show "Did you mean" suggestions inline below the quick pick input
 */
function showPickSuggestions(errorMsg) {
    const container = document.getElementById('quickPickSuggestions');
    if (!container) return;
    
    // Parse the error message to extract suggestions
    // Format: "Player not found. Did you mean: 1. Name One, 2. Name Two, ..."
    const didYouMeanIndex = errorMsg.indexOf('Did you mean:');
    const mainError = didYouMeanIndex > 0 ? errorMsg.substring(0, didYouMeanIndex).trim() : 'Player not found.';
    const suggestionsText = didYouMeanIndex > 0 ? errorMsg.substring(didYouMeanIndex + 13).trim() : '';
    
    // Parse numbered suggestions (e.g., "1. Luis Hernández, 2. Alexis Hernandez")
    const suggestions = [];
    const regex = /\d+\.\s*([^,]+)/g;
    let match;
    while ((match = regex.exec(suggestionsText)) !== null) {
        suggestions.push(match[1].trim());
    }
    
    let html = `
        <div class="pick-suggestions-box">
            <div class="pick-suggestions-error">
                <i class="fas fa-exclamation-circle"></i> ${mainError}
            </div>
            <div class="pick-suggestions-label">Did you mean:</div>
            <div class="pick-suggestions-list">
    `;
    
    suggestions.forEach((name, idx) => {
        html += `
            <button class="pick-suggestion-btn" onclick="selectSuggestion('${name.replace(/'/g, "\\'")}')"> 
                ${name}
            </button>
        `;
    });
    
    html += `
            </div>
            <button class="pick-suggestions-dismiss" onclick="hidePickSuggestions()">
                <i class="fas fa-times"></i> Dismiss
            </button>
        </div>
    `;
    
    container.innerHTML = html;
    container.style.display = 'block';
}

/**
 * Show a general error below the quick pick input
 */
function showPickError(errorMsg) {
    const container = document.getElementById('quickPickSuggestions');
    if (!container) return;
    
    container.innerHTML = `
        <div class="pick-suggestions-box pick-error-box">
            <div class="pick-suggestions-error">
                <i class="fas fa-exclamation-circle"></i> ${errorMsg}
            </div>
            <button class="pick-suggestions-dismiss" onclick="hidePickSuggestions()">
                <i class="fas fa-times"></i> Dismiss
            </button>
        </div>
    `;
    container.style.display = 'block';
}

/**
 * Hide the suggestions box
 */
function hidePickSuggestions() {
    const container = document.getElementById('quickPickSuggestions');
    if (container) {
        container.innerHTML = '';
        container.style.display = 'none';
    }
}

/**
 * Select a suggestion and populate the input
 */
function selectSuggestion(playerName) {
    const input = document.getElementById('quickPickSearch');
    if (input) {
        input.value = playerName;
    }
    hidePickSuggestions();
    // Optionally auto-submit
    // requestWebPick(playerName);
}

/**
 * Show the draft confirmation modal with player and pick details
 */
function showDraftConfirmModal(player, pickInfo, team) {
    // Store the pending pick data for when user confirms
    pendingPickData = {
        team: team,
        player_name: player.name,
        player: player,
        pick_info: pickInfo,
    };

    // Populate modal
    const modal = document.getElementById('draftConfirmModal');
    if (!modal) return;

    document.getElementById('confirmPlayerName').textContent = player.name;

    // Player info badges
    const infoEl = document.getElementById('confirmPlayerInfo');
    const posSpan = infoEl.querySelector('.confirm-position');
    const teamSpan = infoEl.querySelector('.confirm-team');
    const rankSpan = infoEl.querySelector('.confirm-rank');

    posSpan.textContent = (player.position && player.position !== '?') ? player.position : '';
    teamSpan.textContent = (player.team && player.team !== '?') ? player.team : '';
    rankSpan.textContent = (player.rank && player.rank !== '?') ? `#${player.rank}` : '';

    // Pick info
    document.getElementById('confirmRound').textContent = pickInfo.round;
    document.getElementById('confirmPick').textContent = pickInfo.pick;
    document.getElementById('confirmRoundType').textContent = (pickInfo.round_type || 'DC').toUpperCase();

    // Reset button state
    const confirmBtn = document.getElementById('confirmPickBtn');
    confirmBtn.disabled = false;
    confirmBtn.classList.remove('loading');
    confirmBtn.innerHTML = '<i class="fas fa-check"></i> Confirm Pick';

    // Show modal
    modal.classList.add('active');
}

/**
 * Close the draft confirmation modal
 */
function closeDraftConfirmModal() {
    const modal = document.getElementById('draftConfirmModal');
    if (modal) {
        modal.classList.remove('active');
    }
    pendingPickData = null;
}

/**
 * Confirm the draft pick (called when user clicks Confirm in modal)
 */
async function confirmDraftPick() {
    if (!pendingPickData) {
        closeDraftConfirmModal();
        return;
    }

    const apiBase = FBPHub?.config?.apiBase;
    if (!apiBase) {
        alert('API not configured');
        return;
    }

    // Update button to loading state
    const confirmBtn = document.getElementById('confirmPickBtn');
    confirmBtn.disabled = true;
    confirmBtn.classList.add('loading');
    confirmBtn.innerHTML = '<i class="fas fa-spinner"></i> Confirming...';

    try {
        const res = await fetch(`${apiBase}/api/draft/prospect/pick-confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                team: pendingPickData.team,
                player_name: pendingPickData.player_name,
            }),
        });

        const data = await res.json();

        if (res.ok && data.success) {
            const playerName = pendingPickData.player_name; // Save before nulling
            closeDraftConfirmModal();
            closeDraftPlayerDetail();
            showDraftToast(`${playerName} drafted!`, 'success');
            
            // The draft state will auto-refresh from the polling interval
        } else {
            // Reset button
            confirmBtn.disabled = false;
            confirmBtn.classList.remove('loading');
            confirmBtn.innerHTML = '<i class="fas fa-check"></i> Confirm Pick';
            
            alert(data.detail || data.error || 'Pick confirmation failed');
        }
    } catch (e) {
        // Reset button
        confirmBtn.disabled = false;
        confirmBtn.classList.remove('loading');
        confirmBtn.innerHTML = '<i class="fas fa-check"></i> Confirm Pick';
        
        alert('Network error: ' + e.message);
    }
}

// ============================================
// HOOK INTO EXISTING VIEW TOGGLE / INIT
// ============================================

const _origSetupViewToggle = window.setupViewToggle;
window.setupViewToggle = function () {
    if (typeof _origSetupViewToggle === 'function') {
        _origSetupViewToggle();
    }

    const orderBtn = document.querySelector('.view-btn[data-view="order"]');
    if (orderBtn) {
        orderBtn.innerHTML = '<i class="fas fa-clipboard-list"></i> My Board';
        orderBtn.dataset.view = 'order';
        orderBtn.addEventListener('click', () => {
            displayDraftBoard();
        });
    }
};

const _origInitDraft = window.initDraft;
window.initDraft = async function () {
    if (typeof _origInitDraft === 'function') {
        await _origInitDraft();
    }
    await loadDraftBoard();
};

// ============================================
// TOAST UTILITY
// ============================================

function showDraftToast(message, type = 'success') {
    const toast = document.createElement('div');
    const borderColor = type === 'success' ? '#4CAF50' : '#EF3E42';
    toast.style.cssText = `
        position: fixed;
        bottom: 100px;
        right: 20px;
        background-color: var(--bg-charcoal, #1a1a1a);
        border: 3px solid ${borderColor};
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
        z-index: 10000;
        font-family: var(--font-body, sans-serif);
        font-weight: 600;
        max-width: 300px;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// ============================================
// EVENT DELEGATION FOR DRAFT BUTTONS
// ============================================

// Use event delegation to handle draft/board buttons with data attributes
// This avoids inline onclick handlers that can break with special characters
document.addEventListener('click', (e) => {
    // Handle draft player button
    const draftBtn = e.target.closest('[data-draft-player]');
    if (draftBtn && !draftBtn.disabled) {
        const playerName = decodeURIComponent(draftBtn.dataset.draftPlayer);
        requestWebPick(playerName);
        return;
    }
    
    // Handle add to board button
    const boardBtn = e.target.closest('[data-add-to-board]');
    if (boardBtn) {
        const playerName = decodeURIComponent(boardBtn.dataset.addToBoard);
        addToBoardFromPanel(playerName);
        return;
    }
    
    // Handle board item click to open player detail
    const boardItem = e.target.closest('[data-open-player]');
    if (boardItem) {
        const playerName = decodeURIComponent(boardItem.dataset.openPlayer);
        openDraftPlayerDetail(playerName);
        return;
    }
});

// Expose globals
window.openDraftPlayerDetail = openDraftPlayerDetail;
window.closeDraftPlayerDetail = closeDraftPlayerDetail;
window.addToBoardFromPanel = addToBoardFromPanel;
window.requestWebPick = requestWebPick;
window.displayDraftBoard = displayDraftBoard;
window.showDraftConfirmModal = showDraftConfirmModal;
window.closeDraftConfirmModal = closeDraftConfirmModal;
window.confirmDraftPick = confirmDraftPick;
window.showPickSuggestions = showPickSuggestions;
window.showPickError = showPickError;
window.hidePickSuggestions = hidePickSuggestions;
window.selectSuggestion = selectSuggestion;
