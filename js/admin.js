/**
 * FBP Hub - Admin Portal
 * Player management with comprehensive logging to player_log.json
 */

let ADMIN_STATE = {
    adminUser: null,
    allPlayers: [],
    filteredPlayers: [],
    selectedPlayer: null,
    originalPlayerData: null,
    pendingChanges: {},
    managers: {}
};

// MLB Teams list
const MLB_TEAMS = [
    'AZ', 'ATL', 'BAL', 'BOS', 'CHC', 'CHW', 'CIN', 'CLE', 'COL', 'DET',
    'HOU', 'KC', 'LAA', 'LAD', 'MIA', 'MIL', 'MIN', 'NYM', 'NYY', 'OAK',
    'PHI', 'PIT', 'SD', 'SF', 'SEA', 'STL', 'TB', 'TEX', 'TOR', 'WSH', 'FA'
];

// Position options
const POSITIONS = [
    'C', '1B', '2B', '3B', 'SS', 'OF', 'CF', 'LF', 'RF', 'DH', 'Util',
    'P', 'SP', 'RP', 'SP, RP',
    '2B, SS', '2B, 3B', '3B, SS', '1B, 3B', '1B, OF', 'SS, OF',
    '2B, 3B, SS', '2B, 3B, SS, OF', 'C, 1B', 'C, OF'
];

// Contract type options (from FBP Constitution Article 2 & 3)
// Values match what's stored in combined_players.json
const CONTRACT_TYPES = [
    '',
    'Keeper Contract',      // MLB keepers (TC, VC, FC tiers)
    'Development Cont.',    // DC - Prospect development contract ($5)
    'Purchased Contract',   // PC - Purchased prospect contract ($10)
    'Blue Chip Contract',   // BC - Blue-chip prospect contract ($20)
    'Farm Contract'         // Legacy/alternate prospect contract type
];

// Years simple - contract tier display (from combined_players.json)
// Format: [Contract Type] [Year/Status]
const YEARS_SIMPLE = [
    '',
    // Team Contract tiers
    'TC R',      // Team Contract Rookie ($5)
    'TC BC-1',   // Team Contract Blue-Chip Year 1 ($5)
    'TC BC-2',   // Team Contract Blue-Chip Year 2 ($5)
    'TC 1',      // Team Contract Year 1 ($15)
    'TC 2',      // Team Contract Year 2 ($25)
    // Veteran Contract tiers  
    'VC 1',      // Veteran Contract Year 1 ($35)
    'VC 2',      // Veteran Contract Year 2 ($55)
    // Franchise Contract tiers
    'FC 1',      // Franchise Contract Year 1 ($85)
    'FC 2',      // Franchise Contract Year 2+ ($125)
    // Prospect status
    'P'          // Prospect (DC, PC, or BC)
];

// Status rank mapping - lower number = higher priority/value
// Status format: [rank] CODE
const STATUS_FROM_YEARS = {
    'FC 2':    { rank: 0, code: 'FC2' },
    'FC 1':    { rank: 1, code: 'FC1' },
    'VC 2':    { rank: 2, code: 'VC2' },
    'VC 1':    { rank: 3, code: 'VC1' },
    'TC 2':    { rank: 4, code: 'TC2' },
    'TC 1':    { rank: 5, code: 'TC1' },
    'TC R':    { rank: 6, code: 'TCR' },
    'TC BC-2': { rank: 7, code: 'TCBC2' },
    'TC BC-1': { rank: 8, code: 'TCBC1' },
    'P':       { rank: 9, code: 'P' }
};

/**
 * Generate status string from years_simple value
 */
function generateStatusFromYears(years) {
    if (!years) return '';
    const mapping = STATUS_FROM_YEARS[years];
    if (!mapping) return '';
    return `[${mapping.rank}] ${mapping.code}`;
}

// Level options
const LEVELS = ['MLB', 'AAA', 'AA', 'A+', 'A', 'A-', 'Rk', 'CPX'];

// Update type options (for player_log entries)
const UPDATE_TYPES = [
    'Admin',
    'Auction',
    'Call Up Penalty',
    'DC',
    'Draft',
    'Drop',
    'Franchise',
    'Graduate',
    'Keeper',
    'PAD',
    'Purchase',
    'Reset',
    'Roster',
    'Trade'
];

/**
 * Initialize admin portal
 */
async function initAdminPortal() {
    console.log('🛡️ Initializing admin portal...');
    
    // Check authentication and admin role
    if (!AuthUI.requireAdmin()) {
        document.getElementById('authRequired').style.display = 'flex';
        return;
    }
    
    const user = authManager.getUser();
    const team = authManager.getTeam();
    
    ADMIN_STATE.adminUser = user.username || team.abbreviation;
    
    // Load managers config
    await loadManagersConfig();
    
    // Load all players
    await loadAllPlayers();
    
    // Show admin content
    document.getElementById('adminContent').style.display = 'block';
    
    // Populate dynamic dropdowns
    populateDropdowns();
    
    // Initialize displays
    updateAdminStats();
    setupSearch();
    setupTabs();
    loadRecentLogs();
    loadTeamBalances();
}

/**
 * Load managers configuration from config/managers.json
 */
async function loadManagersConfig() {
    try {
        const response = await fetch('./config/managers.json');
        if (response.ok) {
            const data = await response.json();
            ADMIN_STATE.managers = data.teams || {};
            console.log(`✅ Loaded ${Object.keys(ADMIN_STATE.managers).length} managers from config`);
        }
    } catch (e) {
        console.warn('Failed to load managers config, using defaults', e);
    }
}

/**
 * Get manager abbreviation from either abbreviation or full name
 */
function getManagerAbbreviation(value) {
    if (!value) return '';
    
    // Check if it's already an abbreviation
    if (ADMIN_STATE.managers[value]) {
        return value;
    }
    
    // Look up by full name
    for (const [abbr, data] of Object.entries(ADMIN_STATE.managers)) {
        if (data.name === value || data.name?.toLowerCase() === value.toLowerCase()) {
            return abbr;
        }
    }
    
    // Return original value if no match found
    return value;
}

/**
 * Populate all dynamic dropdowns
 */
function populateDropdowns() {
    // Get manager abbreviations sorted
    const managerAbbrevs = Object.keys(ADMIN_STATE.managers).sort();
    
    // Populate Owner filters in search
    const ownerFilterOptions = '<option value="">All Owners</option>' + 
        managerAbbrevs.map(abbr => {
            const name = ADMIN_STATE.managers[abbr]?.name || abbr;
            return `<option value="${abbr}">${abbr} - ${name}</option>`;
        }).join('');
    
    const searchOwnerFilter = document.getElementById('searchOwnerFilter');
    if (searchOwnerFilter) searchOwnerFilter.innerHTML = ownerFilterOptions;
    
    // Populate edit form owner dropdown
    const editOwnerOptions = '<option value="">Unowned</option>' + 
        managerAbbrevs.map(abbr => {
            const name = ADMIN_STATE.managers[abbr]?.name || abbr;
            return `<option value="${abbr}">${abbr} - ${name}</option>`;
        }).join('');
    
    const editOwner = document.getElementById('editOwner');
    if (editOwner) editOwner.innerHTML = editOwnerOptions;
    
    // Populate WizBucks team dropdown
    const wbTeamOptions = '<option value="">Select Team...</option>' + 
        managerAbbrevs.map(abbr => {
            const name = ADMIN_STATE.managers[abbr]?.name || abbr;
            return `<option value="${abbr}">${abbr} - ${name}</option>`;
        }).join('');
    
    const wbTeam = document.getElementById('wbTeam');
    if (wbTeam) wbTeam.innerHTML = wbTeamOptions;
    
    // Populate MLB Team dropdown
    const mlbTeamOptions = '<option value="">N/A</option>' + 
        MLB_TEAMS.map(team => `<option value="${team}">${team}</option>`).join('');
    
    const editTeam = document.getElementById('editTeam');
    if (editTeam) editTeam.innerHTML = mlbTeamOptions;
    
    // Populate Position dropdown
    const positionOptions = '<option value="">N/A</option>' + 
        POSITIONS.map(pos => `<option value="${pos}">${pos}</option>`).join('');
    
    const editPosition = document.getElementById('editPosition');
    if (editPosition) editPosition.innerHTML = positionOptions;
    
    // Populate Contract Type dropdown
    const contractOptions = CONTRACT_TYPES.map(ct => 
        `<option value="${ct}">${ct || '(None)'}</option>`
    ).join('');
    
    const editContract = document.getElementById('editContract');
    if (editContract) editContract.innerHTML = contractOptions;
    
    // Populate Years Simple dropdown
    const yearsOptions = YEARS_SIMPLE.map(ys => 
        `<option value="${ys}">${ys || '(None)'}</option>`
    ).join('');
    
    const editYears = document.getElementById('editYears');
    if (editYears) editYears.innerHTML = yearsOptions;
    
    // Populate Level dropdown
    const levelOptions = LEVELS.map(lvl => `<option value="${lvl}">${lvl}</option>`).join('');
    
    const editLevel = document.getElementById('editLevel');
    if (editLevel) editLevel.innerHTML = levelOptions;
    
    // Populate Update Type dropdown
    const updateTypeOptions = UPDATE_TYPES.map(ut => 
        `<option value="${ut}">${ut}</option>`
    ).join('');
    
    const editUpdateType = document.getElementById('editUpdateType');
    if (editUpdateType) editUpdateType.innerHTML = updateTypeOptions;
}

/**
 * Load all players from combined_players.json
 */
async function loadAllPlayers() {
    if (typeof FBPHub !== 'undefined' && FBPHub.data?.players) {
        ADMIN_STATE.allPlayers = FBPHub.data.players;
        ADMIN_STATE.filteredPlayers = [...ADMIN_STATE.allPlayers];
    } else {
        // Mock data for testing
        ADMIN_STATE.allPlayers = getMockPlayers();
        ADMIN_STATE.filteredPlayers = [...ADMIN_STATE.allPlayers];
    }
    
    console.log(`✅ Loaded ${ADMIN_STATE.allPlayers.length} players`);
}

/**
 * Mock players for testing
 */
function getMockPlayers() {
    return [
        {
            upid: '10001',
            name: 'Bobby Witt Jr.',
            team: 'KC',
            position: 'SS',
            age: 24,
            manager: 'WIZ',
            player_type: 'MLB',
            contract_type: 'VC-2',
            years_simple: 'VC-2'
        },
        {
            upid: '10002',
            name: 'Kyle Schwarber',
            team: 'PHI',
            position: 'OF',
            age: 31,
            manager: 'HAM',
            player_type: 'MLB',
            contract_type: 'FC-1',
            years_simple: 'FC-1'
        },
        {
            upid: '12345',
            name: 'Leo de Vries',
            team: 'ATL',
            position: 'SS',
            age: 20,
            level: 'AAA',
            manager: 'WIZ',
            player_type: 'Farm',
            contract_type: 'PC',
            years_simple: 'P'
        }
    ];
}

/**
 * Update admin stats
 */
function updateAdminStats() {
    document.getElementById('totalPlayers').textContent = ADMIN_STATE.allPlayers.length;
    
    // Count pending changes
    document.getElementById('pendingChanges').textContent = Object.keys(ADMIN_STATE.pendingChanges).length;
    
    // Count recent logs (last 24 hours)
    const logs = JSON.parse(localStorage.getItem('player_log') || '[]');
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentCount = logs.filter(log => new Date(log.timestamp) > dayAgo).length;
    document.getElementById('recentLogs').textContent = recentCount;
}

/**
 * Setup player search
 */
function setupSearch() {
    const searchInput = document.getElementById('adminPlayerSearch');
    const ownerFilter = document.getElementById('searchOwnerFilter');
    const typeFilter = document.getElementById('searchTypeFilter');
    const contractFilter = document.getElementById('searchContractFilter');
    
    const performSearch = () => {
        const query = searchInput.value.toLowerCase();
        const owner = ownerFilter.value;
        const type = typeFilter.value;
        const contract = contractFilter.value;
        
        ADMIN_STATE.filteredPlayers = ADMIN_STATE.allPlayers.filter(p => {
            // Text search
            const matchesQuery = !query || 
                p.name.toLowerCase().includes(query) ||
                (p.upid || '').toLowerCase().includes(query) ||
                (p.team || '').toLowerCase().includes(query) ||
                (p.position || '').toLowerCase().includes(query);
            
            // Owner filter
            const matchesOwner = !owner || p.manager === owner;
            
            // Type filter
            const matchesType = !type || p.player_type === type;
            
            // Contract filter
            const matchesContract = !contract || 
                (p.contract_type || '').toLowerCase().includes(contract.toLowerCase());
            
            return matchesQuery && matchesOwner && matchesType && matchesContract;
        });
        
        displaySearchResults();
    };
    
    searchInput.addEventListener('input', performSearch);
    ownerFilter.addEventListener('change', performSearch);
    typeFilter.addEventListener('change', performSearch);
    contractFilter.addEventListener('change', performSearch);
    
    // Initial display
    displaySearchResults();
}

/**
 * Display search results
 */
function displaySearchResults() {
    const container = document.getElementById('searchResults');
    const count = ADMIN_STATE.filteredPlayers.length;
    
    document.getElementById('searchResultsCount').textContent = `${count} player${count !== 1 ? 's' : ''} found`;
    
    if (count === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-search"></i><p>No players match your search</p></div>';
        return;
    }
    
    // Limit to first 100 results
    const displayPlayers = ADMIN_STATE.filteredPlayers.slice(0, 100);
    
    container.innerHTML = displayPlayers.map(p => `
        <div class="player-result-card" onclick="selectPlayerForEdit('${p.upid}')">
            <div class="player-result-info">
                <div class="player-result-name">${p.name}</div>
                <div class="player-result-meta">
                    <span>${p.position || 'N/A'}</span>
                    <span>${p.team || 'FA'}</span>
                    ${p.age ? `<span>Age ${p.age}</span>` : ''}
                    <span>${p.manager || 'Unowned'}</span>
                    <span>${p.player_type || 'Unknown'}</span>
                    ${p.contract_type ? `<span>${p.contract_type}</span>` : ''}
                </div>
            </div>
            <div class="player-result-actions">
                <button class="btn-edit" onclick="selectPlayerForEdit('${p.upid}'); event.stopPropagation();">
                    <i class="fas fa-edit"></i> Edit
                </button>
            </div>
        </div>
    `).join('');
    
    if (count > 100) {
        container.innerHTML += `
            <div class="empty-state">
                <p>Showing first 100 of ${count} results. Refine your search to see more.</p>
            </div>
        `;
    }
}

/**
 * Clear search
 */
function clearSearch() {
    document.getElementById('adminPlayerSearch').value = '';
    document.getElementById('searchOwnerFilter').value = '';
    document.getElementById('searchTypeFilter').value = '';
    document.getElementById('searchContractFilter').value = '';
    
    ADMIN_STATE.filteredPlayers = [...ADMIN_STATE.allPlayers];
    displaySearchResults();
}

/**
 * Select player for editing
 */
function selectPlayerForEdit(upid) {
    const player = ADMIN_STATE.allPlayers.find(p => p.upid === upid);
    if (!player) return;
    
    ADMIN_STATE.selectedPlayer = player;
    ADMIN_STATE.originalPlayerData = { ...player };
    
    // Switch to edit tab
    document.querySelectorAll('.admin-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.admin-tab-content').forEach(content => content.classList.remove('active'));
    document.querySelector('[data-tab="edit"]').classList.add('active');
    document.getElementById('edit-tab').classList.add('active');
    
    // Show edit form
    document.getElementById('noPlayerSelected').style.display = 'none';
    document.getElementById('playerEditForm').style.display = 'flex';
    
    // Populate form
    populateEditForm(player);
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Populate edit form with player data
 */
function populateEditForm(player) {
    // Set all form values
    document.getElementById('editName').value = player.name || '';
    document.getElementById('editUPID').value = player.upid || '';
    
    // For select elements, we need to handle custom values that may not be in the dropdown
    setSelectOrCustom('editPosition', player.position);
    setSelectOrCustom('editTeam', player.team);
    document.getElementById('editAge').value = player.age || '';
    setSelectOrCustom('editLevel', player.level || 'MLB');
    
    // Owner needs special handling - could be abbreviation or full name
    const ownerAbbrev = getManagerAbbreviation(player.manager);
    document.getElementById('editOwner').value = ownerAbbrev;
    
    document.getElementById('editPlayerType').value = player.player_type || 'MLB';
    setSelectOrCustom('editContract', player.contract_type);
    setSelectOrCustom('editYears', player.years_simple);
    // Status is auto-generated from years_simple - no input field
    document.getElementById('editBats').value = player.bats || '';
    document.getElementById('editThrows').value = player.throws || '';
    document.getElementById('editFYPD').checked = player.fypd === true;
    
    // Clear log entry fields
    const updateTypeEl = document.getElementById('editUpdateType');
    if (updateTypeEl) updateTypeEl.selectedIndex = 0;
    const eventEl = document.getElementById('editEvent');
    if (eventEl) eventEl.value = '';
    
    // Build current player info display showing ALL fields
    const currentInfoHTML = buildCurrentPlayerInfo(player);
    document.getElementById('currentPlayerInfo').innerHTML = currentInfoHTML;
    
    // Setup change detection
    setupChangeDetection();
    
    // Setup owner change handler to sync FBP_Team
    const ownerSelect = document.getElementById('editOwner');
    ownerSelect.removeEventListener('change', handleOwnerChange);
    ownerSelect.addEventListener('change', handleOwnerChange);
}

/**
 * Helper to set select value, adding custom option if needed
 */
function setSelectOrCustom(selectId, value) {
    const select = document.getElementById(selectId);
    if (!select) return;
    
    const val = value || '';
    
    // Check if option exists
    const optionExists = Array.from(select.options).some(opt => opt.value === val);
    
    if (!optionExists && val) {
        // Add custom option
        const customOpt = document.createElement('option');
        customOpt.value = val;
        customOpt.textContent = val + ' (custom)';
        select.appendChild(customOpt);
    }
    
    select.value = val;
}

/**
 * Build the current player info display
 */
function buildCurrentPlayerInfo(player) {
    // Resolve owner to show both abbreviation and name consistently
    const ownerAbbrev = getManagerAbbreviation(player.manager);
    const ownerDisplay = ownerAbbrev 
        ? `${ownerAbbrev}${ADMIN_STATE.managers[ownerAbbrev]?.name ? ' - ' + ADMIN_STATE.managers[ownerAbbrev].name : ''}`
        : 'Unowned';
    
    const fields = [
        { label: 'Name', value: player.name },
        { label: 'UPID', value: player.upid },
        { label: 'MLB Team', value: player.team || 'N/A' },
        { label: 'Position', value: player.position || 'N/A' },
        { label: 'Age', value: player.age || 'N/A' },
        { label: 'Level', value: player.level || 'MLB' },
        { label: 'FBP Owner', value: ownerDisplay },
        { label: 'FBP Team', value: player.FBP_Team || 'N/A' },
        { label: 'Player Type', value: player.player_type || 'N/A' },
        { label: 'Contract', value: player.contract_type || 'None' },
        { label: 'Years', value: player.years_simple || 'N/A' },
        { label: 'Status', value: player.status || 'N/A' },
        { label: 'Bats', value: player.bats || 'N/A' },
        { label: 'Throws', value: player.throws || 'N/A' },
        { label: 'FYPD', value: player.fypd ? 'Yes' : 'No' },
    ];
    
    return `
        <h4><i class="fas fa-database"></i> Current Version</h4>
        <div class="current-info-grid">
            ${fields.map(f => `
                <div class="current-info-item">
                    <span class="current-info-label">${f.label}</span>
                    <span class="current-info-value">${f.value}</span>
                </div>
            `).join('')}
        </div>
    `;
}

/**
 * Handle owner change - sync FBP_Team
 */
function handleOwnerChange(e) {
    // FBP_Team should match the manager abbreviation
    // This is tracked in pendingChanges via detectChanges()
    detectChanges();
}

/**
 * Setup change detection
 */
function setupChangeDetection() {
    const fields = [
        'editName', 'editPosition', 'editTeam', 'editAge', 'editLevel', 
        'editOwner', 'editPlayerType', 'editContract', 'editYears',
        'editBats', 'editThrows', 'editFYPD'
    ];
    
    fields.forEach(fieldId => {
        const element = document.getElementById(fieldId);
        if (!element) return;
        
        element.addEventListener('input', detectChanges);
        element.addEventListener('change', detectChanges);
    });
}

/**
 * Detect changes and show preview
 */
function detectChanges() {
    const changes = {};
    
    // Fields to check - manager and status handled separately
    const fieldMap = {
        editName: 'name',
        editPosition: 'position',
        editTeam: 'team',
        editAge: 'age',
        editLevel: 'level',
        editPlayerType: 'player_type',
        editContract: 'contract_type',
        editYears: 'years_simple',
        editBats: 'bats',
        editThrows: 'throws'
    };
    
    Object.entries(fieldMap).forEach(([elementId, field]) => {
        const element = document.getElementById(elementId);
        if (!element) return;
        
        const newValue = element.value;
        const oldValue = ADMIN_STATE.originalPlayerData[field] || '';
        
        if (String(newValue) !== String(oldValue)) {
            changes[field] = {
                from: oldValue,
                to: newValue
            };
        }
    });
    
    // Auto-generate status from years_simple
    const yearsEl = document.getElementById('editYears');
    if (yearsEl) {
        const newYears = yearsEl.value;
        const newStatus = generateStatusFromYears(newYears);
        const oldStatus = ADMIN_STATE.originalPlayerData.status || '';
        
        if (newStatus !== oldStatus) {
            changes['status'] = {
                from: oldStatus,
                to: newStatus
            };
        }
    }
    
    // Handle FYPD checkbox
    const fypdEl = document.getElementById('editFYPD');
    if (fypdEl) {
        const newFYPD = fypdEl.checked;
        const oldFYPD = ADMIN_STATE.originalPlayerData.fypd === true;
        if (newFYPD !== oldFYPD) {
            changes['fypd'] = {
                from: oldFYPD ? 'Yes' : 'No',
                to: newFYPD ? 'Yes' : 'No'
            };
        }
    }
    
    // Handle manager/owner - normalize both to abbreviation for comparison
    const ownerEl = document.getElementById('editOwner');
    if (ownerEl) {
        const newManager = ownerEl.value; // Always abbreviation from dropdown
        const originalManagerAbbrev = getManagerAbbreviation(ADMIN_STATE.originalPlayerData.manager);
        const oldFBPTeam = ADMIN_STATE.originalPlayerData.FBP_Team || '';
        
        // Only show manager change if it actually changed (compare abbreviations)
        if (newManager !== originalManagerAbbrev) {
            changes['manager'] = {
                from: originalManagerAbbrev || '(empty)',
                to: newManager || '(empty)'
            };
            
            // Also update FBP_Team when manager changes
            if (newManager !== oldFBPTeam) {
                changes['FBP_Team'] = {
                    from: oldFBPTeam,
                    to: newManager
                };
            }
        }
    }
    
    ADMIN_STATE.pendingChanges = changes;
    
    // Display changes preview
    const previewEl = document.getElementById('changesPreview');
    
    if (Object.keys(changes).length === 0) {
        previewEl.classList.remove('has-changes');
        previewEl.innerHTML = '';
        return;
    }
    
    previewEl.classList.add('has-changes');
    
    // Field display names for better readability
    const fieldLabels = {
        name: 'Name',
        position: 'Position',
        team: 'MLB Team',
        age: 'Age',
        level: 'Level',
        manager: 'FBP Owner',
        FBP_Team: 'FBP Team',
        player_type: 'Player Type',
        contract_type: 'Contract',
        years_simple: 'Years',
        status: 'Status',
        bats: 'Bats',
        throws: 'Throws',
        fypd: 'FYPD'
    };
    
    const changesHTML = `
        <h4><i class="fas fa-exchange-alt"></i> Pending Changes</h4>
        <div class="changes-list">
            ${Object.entries(changes).map(([field, change]) => `
                <div class="change-item">
                    <span class="change-field">${fieldLabels[field] || field}:</span>
                    <span class="change-from">${change.from || '(empty)'}</span>
                    <span class="change-arrow">→</span>
                    <span class="change-to">${change.to || '(empty)'}</span>
                </div>
            `).join('')}
        </div>
    `;
    
    previewEl.innerHTML = changesHTML;
}

/**
 * Save player changes
 */
function savePlayerChanges() {
    if (Object.keys(ADMIN_STATE.pendingChanges).length === 0) {
        showToast('No changes to save', 'warning');
        return;
    }
    
    const updateType = document.getElementById('editUpdateType').value;
    if (!updateType) {
        showToast('Update Type is required', 'error');
        return;
    }
    
    // Show confirmation modal
    showEditConfirmation();
}

/**
 * Show edit confirmation modal
 */
function showEditConfirmation() {
    const updateType = document.getElementById('editUpdateType').value;
    const event = document.getElementById('editEvent').value.trim();
    
    const summaryHTML = `
        <div class="confirmation-section">
            <h4>Player: ${ADMIN_STATE.selectedPlayer.name}</h4>
            <div style="margin-top: var(--space-md);">
                ${Object.entries(ADMIN_STATE.pendingChanges).map(([field, change]) => `
                    <div style="padding: var(--space-xs) 0; font-size: var(--text-sm);">
                        <strong>${field}:</strong> 
                        <span style="color: var(--text-gray);">${change.from || '(empty)'}</span>
                        →
                        <span style="color: var(--accent-yellow); font-weight: 700;">${change.to || '(empty)'}</span>
                    </div>
                `).join('')}
            </div>
        </div>
        
        <div class="confirmation-section">
            <h4>Log Entry</h4>
            <p style="color: var(--text-white); font-size: var(--text-sm);">
                <strong>Update Type:</strong> ${updateType}<br>
                ${event ? `<strong>Event:</strong> ${event}` : ''}
            </p>
        </div>
    `;
    
    document.getElementById('editConfirmSummary').innerHTML = summaryHTML;
    document.getElementById('editConfirmModal').classList.add('active');
}

/**
 * Cancel edit confirmation
 */
function cancelEditConfirm() {
    document.getElementById('editConfirmModal').classList.remove('active');
}

/**
 * Toggle loading state on confirm button
 */
function setAdminSubmitting(isSubmitting) {
    const btn = document.getElementById('confirmUpdateBtn');
    if (!btn) return;
    
    if (isSubmitting) {
        if (!btn.dataset.originalHtml) {
            btn.dataset.originalHtml = btn.innerHTML;
        }
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
    } else {
        btn.disabled = false;
        if (btn.dataset.originalHtml) {
            btn.innerHTML = btn.dataset.originalHtml;
            delete btn.dataset.originalHtml;
        }
    }
}

/**
 * Confirm and apply player update
 */
async function confirmPlayerUpdate() {
    console.log('💾 Saving player changes via admin API...');
    
    setAdminSubmitting(true);
    
    const updateType = document.getElementById('editUpdateType').value;
    const event = document.getElementById('editEvent').value.trim();
    
    const session = typeof authManager !== 'undefined' ? authManager.getSession() : null;
    const token = session?.token;
    
    if (!token) {
        showToast('Your session has expired. Please log in again.', 'error');
        setAdminSubmitting(false);
        document.getElementById('editConfirmModal').classList.remove('active');
        return;
    }
    
    // Calculate current season (year)
    const currentSeason = new Date().getFullYear();
    
    // Build field patch for backend (field -> new value)
    const fieldPatch = {};
    Object.entries(ADMIN_STATE.pendingChanges).forEach(([field, change]) => {
        // Convert FYPD display value back to boolean
        if (field === 'fypd') {
            fieldPatch[field] = change.to === 'Yes';
        } else {
            fieldPatch[field] = change.to;
        }
    });
    
    const payload = {
        season: currentSeason,
        admin: ADMIN_STATE.adminUser,
        upid: ADMIN_STATE.selectedPlayer.upid,
        changes: fieldPatch,
        log_event: event || '',
        log_source: 'Admin Portal',
        update_type: updateType
    };
    
    try {
        const res = await fetch(`${AUTH_CONFIG.workerUrl}/api/admin/update-player`, {
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
            } catch (e) {
                // Non-JSON error body; ignore
            }
            const baseMsg = `Admin update failed (status ${res.status})`;
            const fullMsg = detail ? `${baseMsg}: ${detail}` : baseMsg;
            console.error('Admin update failed', { status: res.status, detail });
            showToast(fullMsg, 'error');
            setAdminSubmitting(false);
            return;
        }
        
        console.log('✅ API returned 200 OK, processing response...');
        
        let data = {};
        try {
            data = await res.json();
        } catch (e) {
            data = {};
        }
        
        if (data && data.player && typeof data.player === 'object') {
            Object.assign(ADMIN_STATE.selectedPlayer, data.player);
        } else {
            // Fallback: apply pendingChanges locally
            Object.entries(ADMIN_STATE.pendingChanges).forEach(([field, change]) => {
                ADMIN_STATE.selectedPlayer[field] = change.to;
            });
        }
        
        // Also maintain local admin log cache for this UI
        // Format matches player_log.json structure
        const timestamp = new Date().toISOString();
        const ownerValue = document.getElementById('editOwner')?.value || '';
        const ownerName = ownerValue ? (ADMIN_STATE.managers[ownerValue]?.name || ownerValue) : '';
        
        const logEntry = {
            id: `${currentSeason}-${timestamp}-UPID_${ADMIN_STATE.selectedPlayer.upid}-${updateType}-Admin_Portal`,
            season: currentSeason,
            source: 'Admin Portal',
            admin: ADMIN_STATE.adminUser,
            timestamp: timestamp,
            
            upid: ADMIN_STATE.selectedPlayer.upid,
            player_name: ADMIN_STATE.selectedPlayer.name,
            team: document.getElementById('editTeam')?.value || '',
            pos: document.getElementById('editPosition')?.value || '',
            age: parseInt(document.getElementById('editAge')?.value) || null,
            level: document.getElementById('editLevel')?.value || '',
            team_rank: null,
            rank: null,
            eta: '',
            player_type: document.getElementById('editPlayerType')?.value || '',
            
            owner: ownerName,
            contract: document.getElementById('editContract')?.value || '',
            status: generateStatusFromYears(document.getElementById('editYears')?.value) || '',
            years: document.getElementById('editYears')?.value || '',
            
            update_type: updateType,
            event: event || '',
            
            changes: ADMIN_STATE.pendingChanges
        };
        
        const playerLog = JSON.parse(localStorage.getItem('player_log') || '[]');
        playerLog.push(logEntry);
        localStorage.setItem('player_log', JSON.stringify(playerLog));
        
        console.log('📋 Player log entry created:', logEntry.id);
        
        // Close modal
        document.getElementById('editConfirmModal').classList.remove('active');
        
        // Show success and reset form
        showToast(`✅ ${ADMIN_STATE.selectedPlayer.name} updated successfully!`, 'success');
        
        setAdminSubmitting(false);
        cancelEdit();
        updateAdminStats();
        loadRecentLogs();
    } catch (err) {
        console.error('Admin update error', err);
        showToast(`Admin update error: ${err.message || 'Network error'}. Check console for details.`, 'error');
        setAdminSubmitting(false);
    }
}

/**
 * Cancel edit
 */
function cancelEdit() {
    ADMIN_STATE.selectedPlayer = null;
    ADMIN_STATE.originalPlayerData = null;
    ADMIN_STATE.pendingChanges = {};
    
    document.getElementById('noPlayerSelected').style.display = 'flex';
    document.getElementById('playerEditForm').style.display = 'none';
    document.getElementById('changesPreview').classList.remove('has-changes');
    
    // Clear log entry fields
    const updateTypeEl = document.getElementById('editUpdateType');
    if (updateTypeEl) updateTypeEl.selectedIndex = 0;
    const eventEl = document.getElementById('editEvent');
    if (eventEl) eventEl.value = '';
}

/**
 * Load recent logs
 */
async function loadRecentLogs() {
    const typeFilter = document.getElementById('logTypeFilter')?.value || '';
    const limitFilter = parseInt(document.getElementById('logLimitFilter')?.value || '50');
    const container = document.getElementById('activityLog');

    let logs = [];

    const session = typeof authManager !== 'undefined' ? authManager.getSession() : null;
    const token = session?.token;

    // Prefer live API via Cloudflare Worker → FastAPI → player_log.json
    if (AUTH_CONFIG?.workerUrl && token) {
        try {
            const params = new URLSearchParams();
            params.set('limit', String(limitFilter));
            if (typeFilter) params.set('update_type', typeFilter);

            const res = await fetch(`${AUTH_CONFIG.workerUrl}/api/admin/player-log?${params.toString()}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    logs = data;
                }
            } else {
                console.warn('Admin player log API returned', res.status);
            }
        } catch (e) {
            console.warn('Failed to load admin player log via API', e);
        }
    }

    // Fallback: localStorage cache used by earlier admin portal versions
    if (!Array.isArray(logs) || logs.length === 0) {
        const playerLog = JSON.parse(localStorage.getItem('player_log') || '[]');
        logs = [...playerLog].reverse(); // Most recent first

        if (typeFilter) {
            logs = logs.filter(log => log.update_type === typeFilter);
        }

        logs = logs.slice(0, limitFilter);
    }

    if (!container) return;

    if (!logs.length) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-clipboard-list"></i><p>No activity logs</p></div>';
        return;
    }

    container.innerHTML = logs.map(log => {
        const isAdmin = log.update_type === 'admin_manual';
        
        return `
            <div class="log-entry ${isAdmin ? 'admin-manual' : ''}">
                <div class="log-entry-header">
                    <div class="log-entry-player">${log.player_name}</div>
                    <div class="log-entry-date">${formatDateTime(log.timestamp)}</div>
                </div>
                <div class="log-entry-event">${log.event}</div>
                <div class="log-entry-meta">
                    <span class="type-badge">${log.update_type}</span>
                    ${log.owner ? `<span><i class="fas fa-user"></i> ${log.owner}</span>` : ''}
                    ${log.admin ? `<span><i class="fas fa-shield-alt"></i> ${log.admin}</span>` : ''}
                    ${log.source ? `<span><i class="fas fa-code"></i> ${log.source}</span>` : ''}
                </div>
                ${log.changes && Object.keys(log.changes).length > 0 ? `
                    <div class="log-entry-changes">
                        ${Object.entries(log.changes).map(([field, change]) => `
                            <div class="change-item">
                                <span class="change-field">${field}:</span>
                                <span class="change-from">${change.from || '(empty)'}</span>
                                <span class="change-arrow">→</span>
                                <span class="change-to">${change.to || '(empty)'}</span>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

/**
 * Load team WizBucks balances
 */
async function loadTeamBalances() {
    const container = document.getElementById('teamBalances');
    if (!container) return;

    const teams = ['WIZ', 'B2J', 'CFL', 'HAM', 'JEP', 'LFB', 'DMN', 'SAD', 'DRO', 'RV', 'TBB', 'WAR'];
    let balances = {};

    const session = typeof authManager !== 'undefined' ? authManager.getSession() : null;
    const token = session?.token;

    // Prefer live balances from the bot API via the Worker
    if (AUTH_CONFIG?.workerUrl && token) {
        try {
            const res = await fetch(`${AUTH_CONFIG.workerUrl}/api/admin/wizbucks-balances`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });
            if (res.ok) {
                const data = await res.json();
                if (data && data.balances && typeof data.balances === 'object') {
                    balances = data.balances;
                }
            } else {
                console.warn('Admin WB balances API returned', res.status);
            }
        } catch (e) {
            console.warn('Failed to load WB balances via API', e);
        }
    }

    // Fallback: localStorage ledger used by earlier admin versions
    if (!balances || Object.keys(balances).length === 0) {
        const ledger = JSON.parse(localStorage.getItem('wizbucks_ledger') || '[]');
        const tmpBalances = {};
        teams.forEach(team => {
            const teamTxns = ledger.filter(txn => txn.team === team);
            const balance = teamTxns.length > 0
                ? teamTxns[teamTxns.length - 1].balance_after
                : 0;
            tmpBalances[team] = balance;
        });
        balances = tmpBalances;
    }

    container.innerHTML = teams.map(team => `
        <div class="team-balance-card">
            <span class="team-balance-name">${team}</span>
            <span class="team-balance-amount">$${balances[team] || 0}</span>
        </div>
    `).join('');
}

/**
 * Apply WizBucks adjustment
 */
async function applyWBAdjustment() {
    const team = document.getElementById('wbTeam').value;
    const installment = document.getElementById('wbInstallment').value;
    const amount = parseInt(document.getElementById('wbAmount').value);
    const reason = document.getElementById('wbReason').value.trim();
    
    if (!team || !installment || isNaN(amount) || !reason) {
        showToast('All fields are required', 'error');
        return;
    }

    const session = typeof authManager !== 'undefined' ? authManager.getSession() : null;
    const token = session?.token;

    if (!AUTH_CONFIG?.workerUrl || !token) {
        showToast('WB adjustments require a valid admin session. Please log in again.', 'error');
        return;
    }

    const payload = {
        season: 2026, // keep in sync with current league season
        admin: ADMIN_STATE.adminUser,
        team,
        installment,
        amount,
        reason,
    };

    try {
        const res = await fetch(`${AUTH_CONFIG.workerUrl}/api/admin/wizbucks-adjustment`, {
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
            } catch (e) {
                // non-JSON error body
            }
            const baseMsg = `WB adjustment failed (status ${res.status})`;
            const fullMsg = detail ? `${baseMsg}: ${detail}` : baseMsg;
            console.error('WB adjustment failed', { status: res.status, detail });
            showToast(fullMsg, 'error');
            return;
        }

        let data = {};
        try {
            data = await res.json();
        } catch (e) {
            data = {};
        }

        // Reset form
        document.getElementById('wbAdjustmentForm').reset();

        // Refresh balances from API
        await loadTeamBalances();

        const applied = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
        showToast(`✅ $${applied >= 0 ? '+' : ''}${applied} applied to ${team}`, 'success');
    } catch (err) {
        console.error('WB adjustment error', err);
        showToast('WB adjustment failed due to a network error. Please try again.', 'error');
    }
}

/**
 * Setup tabs
 */
function setupTabs() {
    const tabs = document.querySelectorAll('.admin-tab');
    const contents = document.querySelectorAll('.admin-tab-content');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;
            
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            
            tab.classList.add('active');
            document.getElementById(`${targetTab}-tab`).classList.add('active');
            
            // Refresh data when switching to logs
            if (targetTab === 'logs') {
                loadRecentLogs();
            }
        });
    });
    
    // Setup log filters
    const logTypeFilter = document.getElementById('logTypeFilter');
    const logLimitFilter = document.getElementById('logLimitFilter');
    
    if (logTypeFilter) logTypeFilter.addEventListener('change', loadRecentLogs);
    if (logLimitFilter) logLimitFilter.addEventListener('change', loadRecentLogs);
}

/**
 * Helper functions
 */
function formatDateTime(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

function showToast(message, type = 'success') {
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
    setTimeout(() => toast.remove(), 5000);
}

// Initialize on load
window.initAdminPortal = initAdminPortal;

// Expose functions
window.selectPlayerForEdit = selectPlayerForEdit;
window.cancelEdit = cancelEdit;
window.savePlayerChanges = savePlayerChanges;
window.cancelEditConfirm = cancelEditConfirm;
window.confirmPlayerUpdate = confirmPlayerUpdate;
window.clearSearch = clearSearch;
window.applyWBAdjustment = applyWBAdjustment;
