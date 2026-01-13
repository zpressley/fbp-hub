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
    pendingChanges: {}
};

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
    
    // Load all players
    await loadAllPlayers();
    
    // Show admin content
    document.getElementById('adminContent').style.display = 'block';
    
    // Initialize displays
    updateAdminStats();
    setupSearch();
    setupTabs();
    loadRecentLogs();
    loadTeamBalances();
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
    document.getElementById('editName').value = player.name || '';
    document.getElementById('editUPID').value = player.upid || '';
    document.getElementById('editPosition').value = player.position || '';
    document.getElementById('editTeam').value = player.team || '';
    document.getElementById('editAge').value = player.age || '';
    document.getElementById('editLevel').value = player.level || 'MLB';
    document.getElementById('editOwner').value = player.manager || '';
    document.getElementById('editPlayerType').value = player.player_type || 'MLB';
    document.getElementById('editContract').value = player.contract_type || '';
    document.getElementById('editYears').value = player.years_simple || '';
    document.getElementById('editAdminNote').value = '';
    
    // Display current info
    const currentInfoHTML = `
        <h4>Current Player Data</h4>
        <div class="current-info-grid">
            <div class="current-info-item">
                <span class="current-info-label">Name</span>
                <span class="current-info-value">${player.name}</span>
            </div>
            <div class="current-info-item">
                <span class="current-info-label">Owner</span>
                <span class="current-info-value">${player.manager || 'Unowned'}</span>
            </div>
            <div class="current-info-item">
                <span class="current-info-label">Contract</span>
                <span class="current-info-value">${player.contract_type || 'None'}</span>
            </div>
        </div>
    `;
    
    document.getElementById('currentPlayerInfo').innerHTML = currentInfoHTML;
    
    // Setup change detection
    setupChangeDetection();
}

/**
 * Setup change detection
 */
function setupChangeDetection() {
    const fields = ['editName', 'editPosition', 'editTeam', 'editAge', 'editLevel', 'editOwner', 'editPlayerType', 'editContract', 'editYears'];
    
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
    const fieldMap = {
        editName: 'name',
        editPosition: 'position',
        editTeam: 'team',
        editAge: 'age',
        editLevel: 'level',
        editOwner: 'manager',
        editPlayerType: 'player_type',
        editContract: 'contract_type',
        editYears: 'years_simple'
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
    
    ADMIN_STATE.pendingChanges = changes;
    
    // Display changes preview
    const previewEl = document.getElementById('changesPreview');
    
    if (Object.keys(changes).length === 0) {
        previewEl.classList.remove('has-changes');
        return;
    }
    
    previewEl.classList.add('has-changes');
    
    const changesHTML = `
        <h4>Pending Changes</h4>
        <div class="changes-list">
            ${Object.entries(changes).map(([field, change]) => `
                <div class="change-item">
                    <span class="change-field">${field}:</span>
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
    
    const adminNote = document.getElementById('editAdminNote').value.trim();
    if (!adminNote) {
        showToast('Admin note is required', 'error');
        return;
    }
    
    // Show confirmation modal
    showEditConfirmation();
}

/**
 * Show edit confirmation modal
 */
function showEditConfirmation() {
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
            <h4>Admin Note</h4>
            <p style="color: var(--text-white); font-size: var(--text-sm);">
                ${document.getElementById('editAdminNote').value}
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
 * Confirm and apply player update
 */
async function confirmPlayerUpdate() {
    console.log('💾 Saving player changes and logging to player_log.json...');
    
    const adminNote = document.getElementById('editAdminNote').value.trim();
    
    // Log to player_log.json
    const logEntry = {
        log_id: `player_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
        timestamp: new Date().toISOString(),
        season: 2026,
        source: 'admin_portal',
        admin: ADMIN_STATE.adminUser,
        
        upid: ADMIN_STATE.selectedPlayer.upid,
        player_name: ADMIN_STATE.selectedPlayer.name,
        team: document.getElementById('editTeam').value || '',
        pos: document.getElementById('editPosition').value || '',
        age: parseInt(document.getElementById('editAge').value) || null,
        level: document.getElementById('editLevel').value || '',
        
        owner: document.getElementById('editOwner').value || '',
        update_type: 'admin_manual',
        
        changes: ADMIN_STATE.pendingChanges,
        event: `Admin update: ${adminNote}`,
        
        related_transactions: {
            wizbucks_txn_id: null
        },
        
        metadata: {
            admin_note: adminNote,
            fields_updated: Object.keys(ADMIN_STATE.pendingChanges).join(', ')
        }
    };
    
    // Save to player log
    const playerLog = JSON.parse(localStorage.getItem('player_log') || '[]');
    playerLog.push(logEntry);
    localStorage.setItem('player_log', JSON.stringify(playerLog));
    
    console.log('📋 Player log entry created:', logEntry.log_id);
    
    // Update player in memory
    Object.entries(ADMIN_STATE.pendingChanges).forEach(([field, change]) => {
        ADMIN_STATE.selectedPlayer[field] = change.to;
    });
    
    // In production: POST to /api/admin/update-player
    // Would update combined_players.json via GitHub commit
    
    // Close modal
    document.getElementById('editConfirmModal').classList.remove('active');
    
    // Show success and reset form
    showToast(`✅ ${ADMIN_STATE.selectedPlayer.name} updated successfully!`, 'success');
    
    cancelEdit();
    updateAdminStats();
    loadRecentLogs();
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
}

/**
 * Load recent logs
 */
function loadRecentLogs() {
    const playerLog = JSON.parse(localStorage.getItem('player_log') || '[]');
    const typeFilter = document.getElementById('logTypeFilter')?.value || '';
    const limitFilter = parseInt(document.getElementById('logLimitFilter')?.value || '50');
    
    let logs = [...playerLog].reverse(); // Most recent first
    
    // Apply type filter
    if (typeFilter) {
        logs = logs.filter(log => log.update_type === typeFilter);
    }
    
    // Apply limit
    logs = logs.slice(0, limitFilter);
    
    const container = document.getElementById('activityLog');
    
    if (logs.length === 0) {
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
function loadTeamBalances() {
    // In production: calculate from wizbucks_ledger.json
    const ledger = JSON.parse(localStorage.getItem('wizbucks_ledger') || '[]');
    
    const teams = ['WIZ', 'B2J', 'CFL', 'HAM', 'JEP', 'LFB', 'LAW', 'SAD', 'DRO', 'RV', 'TBB', 'WAR'];
    
    const balances = {};
    teams.forEach(team => {
        const teamTxns = ledger.filter(txn => txn.team === team);
        const balance = teamTxns.length > 0 
            ? teamTxns[teamTxns.length - 1].balance_after 
            : 0;
        balances[team] = balance;
    });
    
    const container = document.getElementById('teamBalances');
    
    container.innerHTML = teams.map(team => `
        <div class="team-balance-card">
            <span class="team-balance-name">${team}</span>
            <span class="team-balance-amount">$${balances[team]}</span>
        </div>
    `).join('');
}

/**
 * Apply WizBucks adjustment
 */
function applyWBAdjustment() {
    const team = document.getElementById('wbTeam').value;
    const installment = document.getElementById('wbInstallment').value;
    const amount = parseInt(document.getElementById('wbAmount').value);
    const reason = document.getElementById('wbReason').value.trim();
    
    if (!team || !installment || isNaN(amount) || !reason) {
        showToast('All fields are required', 'error');
        return;
    }
    
    // Get current balance
    const ledger = JSON.parse(localStorage.getItem('wizbucks_ledger') || '[]');
    const teamTxns = ledger.filter(txn => txn.team === team);
    const currentBalance = teamTxns.length > 0 
        ? teamTxns[teamTxns.length - 1].balance_after 
        : 0;
    
    // Create transaction
    const txn = {
        txn_id: `wb_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
        timestamp: new Date().toISOString(),
        team: team,
        installment: installment,
        amount: amount,
        balance_before: currentBalance,
        balance_after: currentBalance + amount,
        transaction_type: 'admin_adjustment',
        description: `Admin adjustment: ${reason}`,
        related_player: null,
        metadata: {
            season: 2026,
            source: 'admin_portal',
            admin: ADMIN_STATE.adminUser,
            reason: reason
        }
    };
    
    ledger.push(txn);
    localStorage.setItem('wizbucks_ledger', JSON.stringify(ledger));
    
    console.log('💰 WizBucks adjustment logged:', txn.txn_id);
    
    // Reset form
    document.getElementById('wbAdjustmentForm').reset();
    
    // Reload balances
    loadTeamBalances();
    
    showToast(`✅ $${amount >= 0 ? '+' : ''}${amount} applied to ${team}`, 'success');
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
