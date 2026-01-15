/**
 * FBP Hub - Draft Board
 * Personal player rankings and draft planning
 */

let BOARD_STATE = {
    userTeam: null,
    targets: [],
    watchList: [],
    availablePlayers: [],
    selectedPlayer: null,
    draggedElement: null,
    draftType: 'keeper',
    draftStatus: 'pre'
};

/**
 * Initialize draft board
 */
async function initDraftBoard() {
    console.log('📋 Initializing draft board...');
    
    // Check authentication
    if (typeof authManager === 'undefined' || !authManager.isAuthenticated()) {
        document.getElementById('authRequired').style.display = 'flex';
        return;
    }
    
    BOARD_STATE.userTeam = authManager.getTeam();

    // Determine initial draft type from URL (keeper default)
    const params = new URLSearchParams(window.location.search);
    BOARD_STATE.draftType = params.get('type') === 'prospect' ? 'prospect' : 'keeper';

    document.getElementById('boardContent').style.display = 'block';

    // Load board data
    await loadBoardData();

    // Load available players
    await loadAvailablePlayers();

    // Display board
    displayTargets();
    displayAvailablePlayers();
    displayWatchList();

    // Setup filters & draft-type toggle
    setupFilters();
    setupDraftTypeToggle();
    updateDraftPhaseStatus();
}

/**
 * Load board data
 */
async function loadBoardData() {
    try {
        const response = await fetch(`data/draft_boards/${BOARD_STATE.userTeam.abbreviation}.json`);
        if (response.ok) {
            const data = await response.json();
            BOARD_STATE.targets = data.targets || [];
            BOARD_STATE.watchList = data.watch_list || [];
        } else {
            // Load from localStorage
            const saved = localStorage.getItem(`draft_board_${BOARD_STATE.userTeam.abbreviation}`);
            if (saved) {
                const data = JSON.parse(saved);
                BOARD_STATE.targets = data.targets || [];
                BOARD_STATE.watchList = data.watch_list || [];
            }
        }
    } catch (e) {
        console.log('No saved board, starting fresh');
    }
}

/**
 * Load available players from combined_players based on draft context
 */
async function loadAvailablePlayers() {
    if (!FBPHub.data?.players) {
        console.warn('No player data loaded for draft board');
        BOARD_STATE.availablePlayers = [];
        return;
    }

    const players = FBPHub.data.players;
    let pool = [];

    if (BOARD_STATE.draftType === 'prospect') {
        // Prospect draft: all prospects without DC/PC/BC contracts
        pool = players.filter(p => p.player_type === 'Farm');
        pool = pool.filter(p => {
            const yearsSimple = p.years_simple || '';
            const match = yearsSimple.match(/^([A-Z]+)/);
            const contractCode = match ? match[1] : '';
            return contractCode !== 'DC' && contractCode !== 'PC' && contractCode !== 'BC';
        });
    } else {
        // Keeper draft: MLB players not currently on an FBP roster
        pool = players.filter(p => p.player_type === 'MLB' && (!p.FBP_Team || p.FBP_Team === ''));
    }

    BOARD_STATE.availablePlayers = pool.map(p => ({
        upid: p.upid,
        name: p.name,
        position: p.position,
        mlb_team: p.team,
        age: p.age,
        available: true
    }));
}

/**
 * Display targets list
 */
function displayTargets() {
    const container = document.getElementById('targetsList');
    
    if (BOARD_STATE.targets.length === 0) {
        container.innerHTML = `
            <div class="empty-board">
                <i class="fas fa-clipboard-list"></i>
                <p>Add players to your draft board</p>
                <button class="btn-primary" onclick="addPlayerToBoard()">
                    <i class="fas fa-plus"></i> Add Player
                </button>
            </div>
        `;
        return;
    }
    
    document.getElementById('targetCount').textContent = `${BOARD_STATE.targets.length} players`;
    
    container.innerHTML = BOARD_STATE.targets.map((target, idx) => {
        const pickedClass = target.taken ? 'picked' : '';
        const pickedBadge = target.taken 
            ? `<span class="picked-badge">Picked by ${target.taken_by} (#${target.taken_at_pick})</span>`
            : '';
        
        return `
            <div class="board-player-card ${pickedClass}" draggable="true" data-index="${idx}">
                <div class="board-player-header">
                    <div class="board-player-rank">${idx + 1}</div>
                    <div class="board-player-name">${target.player_name}</div>
                    <div class="board-player-actions">
                        ${!target.taken ? `<button class="btn-icon" onclick="removeTarget(${idx})" title="Remove"><i class="fas fa-times"></i></button>` : ''}
                        <button class="btn-icon" onclick="editTarget(${idx})" title="Edit"><i class="fas fa-edit"></i></button>
                    </div>
                </div>
                <div class="board-player-meta">
                    <span>${target.position}</span>
                    <span>${target.mlb_team}</span>
                    ${target.target_round ? `<span>Target: RD ${target.target_round}</span>` : ''}
                    ${pickedBadge}
                </div>
                ${target.notes ? `<div class="board-player-notes">${target.notes}</div>` : ''}
            </div>
        `;
    }).join('');
    
    // Setup drag and drop
    setupDragAndDrop();
}

/**
 * Setup drag and drop
 */
function setupDragAndDrop() {
    const cards = document.querySelectorAll('.board-player-card:not(.picked)');
    
    cards.forEach(card => {
        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragover', handleDragOver);
        card.addEventListener('drop', handleDrop);
        card.addEventListener('dragend', handleDragEnd);
    });
}

function handleDragStart(e) {
    BOARD_STATE.draggedElement = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
    if (e.preventDefault) e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleDrop(e) {
    if (e.stopPropagation) e.stopPropagation();
    
    if (BOARD_STATE.draggedElement !== this) {
        const fromIndex = parseInt(BOARD_STATE.draggedElement.dataset.index);
        const toIndex = parseInt(this.dataset.index);
        
        // Reorder array
        const item = BOARD_STATE.targets.splice(fromIndex, 1)[0];
        BOARD_STATE.targets.splice(toIndex, 0, item);
        
        // Redisplay
        displayTargets();
    }
    
    return false;
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
}

/**
 * Display available players
 */
function displayAvailablePlayers() {
    const container = document.getElementById('availableList');
    const hideFilter = document.getElementById('hidePickedToggle')?.checked;
    const searchQuery = document.getElementById('availableSearch')?.value.toLowerCase() || '';
    
    let players = BOARD_STATE.availablePlayers.filter(p => p.available);
    
    // Filter by search
    if (searchQuery) {
        players = players.filter(p => 
            p.name.toLowerCase().includes(searchQuery) ||
            (p.position || '').toLowerCase().includes(searchQuery) ||
            (p.mlb_team || '').toLowerCase().includes(searchQuery)
        );
    }
    
    // Hide picked if enabled
    if (hideFilter) {
        const pickedUpids = BOARD_STATE.targets
            .filter(t => t.taken)
            .map(t => t.upid);
        players = players.filter(p => !pickedUpids.includes(p.upid));
    }
    
    container.innerHTML = players.slice(0, 50).map(player => `
        <div class="board-player-card">
            <div class="board-player-header">
                <div class="board-player-name">${player.name}</div>
                <div class="board-player-actions">
                    <button class="btn-icon" onclick="quickAddToBoard('${player.upid}')" title="Add to board">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
            </div>
            <div class="board-player-meta">
                <span>${player.position}</span>
                <span>${player.mlb_team}</span>
                ${player.age ? `<span>Age ${player.age}</span>` : ''}
            </div>
        </div>
    `).join('');
}

/**
 * Display watch list
 */
function displayWatchList() {
    const container = document.getElementById('watchList');
    
    if (BOARD_STATE.watchList.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-eye"></i><p>No players on watch list</p></div>';
        return;
    }
    
    container.innerHTML = BOARD_STATE.watchList.map((player, idx) => `
        <div class="board-player-card">
            <div class="board-player-header">
                <div class="board-player-name">${player.player_name}</div>
                <div class="board-player-actions">
                    <button class="btn-icon" onclick="removeFromWatch(${idx})">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            ${player.notes ? `<div class="board-player-notes">${player.notes}</div>` : ''}
        </div>
    `).join('');
}

/**
 * Add player to board (modal)
 */
function addPlayerToBoard() {
    document.getElementById('addPlayerModal').classList.add('active');
    document.getElementById('modalPlayerSearch').focus();
    
    // Setup search
    const searchInput = document.getElementById('modalPlayerSearch');
    searchInput.addEventListener('input', searchAvailablePlayers);
}

/**
 * Search available players
 */
function searchAvailablePlayers() {
    const query = document.getElementById('modalPlayerSearch').value.toLowerCase();
    const results = document.getElementById('modalSearchResults');
    
    if (!query || query.length < 2) {
        results.innerHTML = '';
        return;
    }
    
    const matches = BOARD_STATE.availablePlayers
        .filter(p => p.name.toLowerCase().includes(query))
        .slice(0, 10);
    
    results.innerHTML = matches.map(player => `
        <div class="search-result-item" onclick="selectPlayerForBoard('${player.upid}')">
            <div style="font-weight: 700;">${player.name}</div>
            <div style="font-size: 12px; color: var(--text-gray);">${player.position} • ${player.mlb_team}</div>
        </div>
    `).join('');
}

/**
 * Select player for board
 */
function selectPlayerForBoard(upid) {
    const player = BOARD_STATE.availablePlayers.find(p => p.upid === upid);
    if (!player) return;
    
    BOARD_STATE.selectedPlayer = player;
    
    document.getElementById('selectedPlayerPreview').style.display = 'block';
    document.getElementById('selectedPlayerInfo').innerHTML = `
        <div style="background: rgba(255, 182, 18, 0.1); border: 2px solid var(--accent-yellow); padding: 12px; border-radius: 8px; margin-bottom: 16px;">
            <div style="font-weight: 700; font-size: 16px; margin-bottom: 4px;">${player.name}</div>
            <div style="font-size: 14px; color: var(--text-gray);">${player.position} • ${player.mlb_team}</div>
        </div>
    `;
    document.getElementById('confirmAddBtn').disabled = false;
}

/**
 * Confirm add player
 */
function confirmAddPlayer() {
    const player = BOARD_STATE.selectedPlayer;
    const targetRound = document.getElementById('targetRound').value;
    const notes = document.getElementById('playerNotes').value;
    
    BOARD_STATE.targets.push({
        rank: BOARD_STATE.targets.length + 1,
        player_name: player.name,
        upid: player.upid,
        position: player.position,
        mlb_team: player.mlb_team,
        target_round: targetRound ? parseInt(targetRound) : null,
        notes: notes,
        taken: false
    });
    
    closeAddPlayerModal();
    displayTargets();
    saveBoard();
}

/**
 * Close add player modal
 */
function closeAddPlayerModal() {
    document.getElementById('addPlayerModal').classList.remove('active');
    document.getElementById('modalPlayerSearch').value = '';
    document.getElementById('targetRound').value = '';
    document.getElementById('playerNotes').value = '';
    document.getElementById('selectedPlayerPreview').style.display = 'none';
    document.getElementById('confirmAddBtn').disabled = true;
    BOARD_STATE.selectedPlayer = null;
}

/**
 * Quick add to board
 */
function quickAddToBoard(upid) {
    const player = BOARD_STATE.availablePlayers.find(p => p.upid === upid);
    if (!player) return;
    
    BOARD_STATE.targets.push({
        rank: BOARD_STATE.targets.length + 1,
        player_name: player.name,
        upid: player.upid,
        position: player.position,
        mlb_team: player.mlb_team,
        target_round: null,
        notes: '',
        taken: false
    });
    
    displayTargets();
    saveBoard();
}

/**
 * Remove target
 */
function removeTarget(index) {
    if (confirm(`Remove ${BOARD_STATE.targets[index].player_name} from board?`)) {
        BOARD_STATE.targets.splice(index, 1);
        displayTargets();
        saveBoard();
    }
}

/**
 * Remove from watch list
 */
function removeFromWatch(index) {
    BOARD_STATE.watchList.splice(index, 1);
    displayWatchList();
    saveBoard();
}

/**
 * Save board
 */
function saveBoard() {
    const boardData = {
        team: BOARD_STATE.userTeam.abbreviation,
        draft_id: 'fbp_keeper_draft_2026',
        last_updated: new Date().toISOString(),
        targets: BOARD_STATE.targets,
        watch_list: BOARD_STATE.watchList
    };
    
    // Save to localStorage
    localStorage.setItem(`draft_board_${BOARD_STATE.userTeam.abbreviation}`, JSON.stringify(boardData));
    
    // In production: POST to /api/draft/save-board
    console.log('💾 Board saved');
    
    showToast('Draft board saved!', 'success');
}

/**
 * Clear board
 */
function clearBoard() {
    if (confirm('Clear your entire draft board? This cannot be undone.')) {
        BOARD_STATE.targets = [];
        BOARD_STATE.watchList = [];
        displayTargets();
        displayWatchList();
        saveBoard();
    }
}

/**
 * Setup filters
 */
function setupFilters() {
    const posFilter = document.getElementById('positionFilter');
    const hideToggle = document.getElementById('hidePickedToggle');
    const searchInput = document.getElementById('availableSearch');
    
    if (posFilter) posFilter.addEventListener('change', displayAvailablePlayers);
    if (hideToggle) hideToggle.addEventListener('change', displayAvailablePlayers);
    if (searchInput) searchInput.addEventListener('input', displayAvailablePlayers);
}

/**
 * Setup draft type toggle (keeper vs prospect)
 */
function setupDraftTypeToggle() {
    const buttons = document.querySelectorAll('.draft-type-btn');
    if (!buttons.length) return;

    const applyActive = () => {
        buttons.forEach(btn => {
            const type = btn.dataset.type;
            btn.classList.toggle('active', type === BOARD_STATE.draftType);
        });
    };

    applyActive();

    buttons.forEach(btn => {
        btn.addEventListener('click', async () => {
            const type = btn.dataset.type;
            if (!type || type === BOARD_STATE.draftType) return;
            BOARD_STATE.draftType = type;
            applyActive();
            await loadAvailablePlayers();
            displayAvailablePlayers();
        });
    });
}

/**
 * Update draft phase status (pre/active/post)
 */
async function updateDraftPhaseStatus() {
    const statusEl = document.getElementById('draftPhaseStatus');
    if (!statusEl) return;

    try {
        const basePath = (typeof FBPHub !== 'undefined' && FBPHub.config?.dataPath)
            ? FBPHub.config.dataPath
            : './data/';
        const resp = await fetch(`${basePath}draft_active.json`);
        if (!resp.ok) {
            statusEl.textContent = 'Pre-Draft';
            return;
        }
        const data = await resp.json();
        let label = 'Pre-Draft';
        if (data.status === 'in_progress') {
            label = 'Active Draft';
        } else if (data.status === 'completed') {
            label = 'Post-Draft';
        }
        statusEl.textContent = label;
    } catch (e) {
        statusEl.textContent = 'Pre-Draft';
    }
}

/**
 * Toast notification
 */
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        bottom: 100px;
        right: 20px;
        background-color: var(--bg-charcoal);
        border: 3px solid ${type === 'success' ? '#4CAF50' : '#EF3E42'};
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
        z-index: 10000;
        font-family: var(--font-body);
        font-weight: 600;
    `;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Expose functions
window.initDraftBoard = initDraftBoard;
window.addPlayerToBoard = addPlayerToBoard;
window.closeAddPlayerModal = closeAddPlayerModal;
window.selectPlayerForBoard = selectPlayerForBoard;
window.confirmAddPlayer = confirmAddPlayer;
window.quickAddToBoard = quickAddToBoard;
window.removeTarget = removeTarget;
window.removeFromWatch = removeFromWatch;
window.saveBoard = saveBoard;
window.clearBoard = clearBoard;
