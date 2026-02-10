/**
 * FBP Hub - Enhanced Admin Portal
 * UPID Database Management + Add Player Flow + Bulk Operations
 * 
 * This file extends admin.js - ADMIN_STATE and constants are defined there.
 */

// Extend ADMIN_STATE with additional properties for enhanced features
ADMIN_STATE.upidDatabase = null;    // UPID database with alt names
ADMIN_STATE.mlbTeamMap = null;      // MLB team alias mapping
ADMIN_STATE.bulkSelected = new Set(); // For bulk operations

// Constants are defined in admin.js - this file extends that functionality

/**
 * Initialize admin portal
 */
async function initAdminPortal() {
    console.log('🛡️ Initializing enhanced admin portal...');
    
    // Check authentication
    if (!AuthUI.requireAdmin()) {
        document.getElementById('authRequired').style.display = 'flex';
        return;
    }
    
    const user = authManager.getUser();
    const team = authManager.getTeam();
    ADMIN_STATE.adminUser = user.username || team.abbreviation;
    
    // Load all data
    await loadManagersConfig();
    await loadUPIDDatabase();      // NEW
    await loadMLBTeamMap();        // NEW
    await loadAllPlayers();
    
    // Show admin content
    document.getElementById('adminContent').style.display = 'block';
    
    // Setup UI
    populateDropdowns();
    updateAdminStats();
    setupSearch();
    setupTabs();
    setupBulkOperations();  // NEW
    initQueryTab();         // NEW: Paste Query tab
    loadRecentLogs();
    loadTeamBalances();
}

/**
 * Load UPID database
 */
async function loadUPIDDatabase() {
    try {
        const response = await fetch('data/upid_database.json');
        if (response.ok) {
            ADMIN_STATE.upidDatabase = await response.json();
            console.log(`✅ Loaded UPID database with ${Object.keys(ADMIN_STATE.upidDatabase.by_upid || {}).length} entries`);
        }
    } catch (e) {
        console.warn('⚠️ No UPID database available');
        ADMIN_STATE.upidDatabase = { by_upid: {}, name_index: {} };
    }
}

/**
 * Load MLB team alias map
 */
async function loadMLBTeamMap() {
    try {
        const response = await fetch('data/mlb_team_map.json');
        if (response.ok) {
            ADMIN_STATE.mlbTeamMap = await response.json();
            console.log(`✅ Loaded MLB team map with ${Object.keys(ADMIN_STATE.mlbTeamMap.official || {}).length} teams`);
        }
    } catch (e) {
        console.warn('⚠️ No MLB team map available');
        ADMIN_STATE.mlbTeamMap = { official: {}, aliases: {} };
    }
}

/**
 * Load managers config
 */
async function loadManagersConfig() {
    try {
        const response = await fetch('./config/managers.json');
        if (response.ok) {
            const data = await response.json();
            ADMIN_STATE.managers = data.teams || {};
            console.log(`✅ Loaded ${Object.keys(ADMIN_STATE.managers).length} managers`);
        }
    } catch (e) {
        console.warn('Failed to load managers config', e);
    }
}

/**
 * Load all players
 */
async function loadAllPlayers() {
    if (typeof FBPHub !== 'undefined' && FBPHub.data?.players) {
        ADMIN_STATE.allPlayers = FBPHub.data.players;
        ADMIN_STATE.filteredPlayers = [...ADMIN_STATE.allPlayers];
    } else {
        ADMIN_STATE.allPlayers = [];
        ADMIN_STATE.filteredPlayers = [];
    }
    console.log(`✅ Loaded ${ADMIN_STATE.allPlayers.length} players`);
}

/**
 * Get next available UPID
 */
function getNextUPID() {
    const existingUpids = Object.keys(ADMIN_STATE.upidDatabase?.by_upid || {})
        .map(u => parseInt(u))
        .filter(u => !isNaN(u));
    
    if (existingUpids.length === 0) return 1;
    
    const maxUpid = Math.max(...existingUpids);
    return maxUpid + 1;
}

/**
 * Check for duplicate player names
 */
function checkForDuplicates(name) {
    const key = name.toLowerCase().trim();
    const matches = ADMIN_STATE.upidDatabase?.name_index?.[key] || [];
    
    if (matches.length === 0) return null;
    
    // Get full player records
    const duplicates = matches.map(upid => {
        const dbEntry = ADMIN_STATE.upidDatabase.by_upid[upid];
        const combinedEntry = ADMIN_STATE.allPlayers.find(p => String(p.upid) === String(upid));
        
        return {
            upid,
            name: dbEntry?.name || combinedEntry?.name || 'Unknown',
            team: dbEntry?.team || combinedEntry?.team || 'N/A',
            position: dbEntry?.pos || combinedEntry?.position || 'N/A',
            owner: combinedEntry?.manager || 'Unowned'
        };
    });
    
    return duplicates;
}

// ============================================
// ADD PLAYER WORKFLOW
// ============================================

/**
 * Show add player modal
 */
function showAddPlayerModal() {
    const modal = document.getElementById('addPlayerModal');
    if (!modal) return;
    
    // Reset form
    document.getElementById('addPlayerForm').reset();
    document.getElementById('addPlayerDuplicates').style.display = 'none';
    document.getElementById('addPlayerEnrichment').style.display = 'none';
    
    // Show suggested UPID
    const nextUpid = getNextUPID();
    document.getElementById('addPlayerUpidSuggestion').textContent = `Next available: ${nextUpid}`;
    
    modal.classList.add('active');
}

/**
 * Check for duplicates when name is entered
 */
function checkAddPlayerDuplicates() {
    const name = document.getElementById('addPlayerName').value.trim();
    const dupesContainer = document.getElementById('addPlayerDuplicates');
    
    if (name.length < 3) {
        dupesContainer.style.display = 'none';
        return;
    }
    
    const duplicates = checkForDuplicates(name);
    
    if (!duplicates || duplicates.length === 0) {
        dupesContainer.style.display = 'none';
        return;
    }
    
    // Show duplicates warning
    dupesContainer.innerHTML = `
        <div class="duplicate-warning">
            <i class="fas fa-exclamation-triangle"></i>
            <strong>Potential Duplicates Found</strong>
            ${duplicates.map(d => `
                <div class="duplicate-entry">
                    <strong>${d.name}</strong> (UPID: ${d.upid})
                    • ${d.team} ${d.position}
                    • Owner: ${d.owner}
                </div>
            `).join('')}
            <p>Make sure this is a different player before continuing.</p>
        </div>
    `;
    dupesContainer.style.display = 'block';
}

/**
 * Enrich player data from APIs
 */
async function enrichPlayerData() {
    const name = document.getElementById('addPlayerName').value.trim();
    const team = document.getElementById('addPlayerTeam').value;
    
    if (!name) {
        showToast('Enter player name first', 'warning');
        return;
    }
    
    const enrichContainer = document.getElementById('addPlayerEnrichment');
    enrichContainer.style.display = 'block';
    enrichContainer.innerHTML = '<div class="enrichment-loading"><i class="fas fa-spinner fa-spin"></i> Fetching data from APIs...</div>';
    
    const session = authManager?.getSession();
    const token = session?.token;
    
    if (!token) {
        enrichContainer.innerHTML = '<div class="enrichment-error">Session expired. Please log in again.</div>';
        return;
    }
    
    try {
        const payload = { name, team: team || null };
        
        const res = await fetch(`${AUTH_CONFIG.workerUrl}/api/admin/enrich-player`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        
        if (!res.ok) {
            throw new Error(`API returned ${res.status}`);
        }
        
        const data = await res.json();
        
        // Display enriched data
        displayEnrichedData(data);
        
        // Auto-fill form fields
        if (data.mlb_id) document.getElementById('addPlayerMLBId').value = data.mlb_id;
        if (data.yahoo_id) document.getElementById('addPlayerYahooId').value = data.yahoo_id;
        if (data.birth_date) document.getElementById('addPlayerBirthDate').value = data.birth_date;
        if (data.debut_date) document.getElementById('addPlayerDebut').value = data.debut_date;
        if (data.bats) document.getElementById('addPlayerBats').value = data.bats;
        if (data.throws) document.getElementById('addPlayerThrows').value = data.throws;
        if (data.position && !document.getElementById('addPlayerPosition').value) {
            document.getElementById('addPlayerPosition').value = data.position;
        }
        if (data.team && !team) {
            document.getElementById('addPlayerTeam').value = data.team;
        }
        
    } catch (err) {
        console.error('Enrichment error:', err);
        enrichContainer.innerHTML = `
            <div class="enrichment-error">
                <i class="fas fa-exclamation-circle"></i>
                Could not fetch data: ${err.message}
            </div>
        `;
    }
}

/**
 * Display enriched API data
 */
function displayEnrichedData(data) {
    const container = document.getElementById('addPlayerEnrichment');
    
    const fields = [
        { label: 'MLB ID', value: data.mlb_id, icon: 'fa-baseball' },
        { label: 'Yahoo ID', value: data.yahoo_id, icon: 'fa-y' },
        { label: 'Birth Date', value: data.birth_date, icon: 'fa-birthday-cake' },
        { label: 'Debut', value: data.debut_date, icon: 'fa-star' },
        { label: 'Bats', value: data.bats, icon: 'fa-hand-rock' },
        { label: 'Throws', value: data.throws, icon: 'fa-hand-paper' },
        { label: 'Position', value: data.position, icon: 'fa-map-marker' },
        { label: 'Team', value: data.team, icon: 'fa-users' }
    ];
    
    const foundData = fields.filter(f => f.value);
    
    if (foundData.length === 0) {
        container.innerHTML = `
            <div class="enrichment-empty">
                <i class="fas fa-search"></i>
                <p>No matching data found in APIs</p>
                <p class="enrichment-tip">Try checking spelling or entering more details manually</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <div class="enrichment-success">
            <div class="enrichment-header">
                <i class="fas fa-check-circle"></i>
                <strong>Found ${foundData.length} field${foundData.length !== 1 ? 's' : ''} from APIs</strong>
            </div>
            <div class="enrichment-grid">
                ${foundData.map(f => `
                    <div class="enrichment-field">
                        <i class="fas ${f.icon}"></i>
                        <span class="enrichment-label">${f.label}:</span>
                        <span class="enrichment-value">${f.value}</span>
                    </div>
                `).join('')}
            </div>
            <p class="enrichment-tip">Fields have been auto-filled below</p>
        </div>
    `;
}

/**
 * Submit new player
 */
async function submitAddPlayer() {
    const form = document.getElementById('addPlayerForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    const session = authManager?.getSession();
    const token = session?.token;
    
    if (!token) {
        showToast('Session expired. Please log in again.', 'error');
        return;
    }
    
    // Collect form data
    const formData = {
        name: document.getElementById('addPlayerName').value.trim(),
        team: document.getElementById('addPlayerTeam').value,
        position: document.getElementById('addPlayerPosition').value,
        age: parseInt(document.getElementById('addPlayerAge').value) || null,
        level: document.getElementById('addPlayerLevel').value || 'MLB',
        player_type: document.getElementById('addPlayerType').value || 'Farm',
        manager: document.getElementById('addPlayerOwner').value,
        contract_type: document.getElementById('addPlayerContract').value,
        years_simple: document.getElementById('addPlayerYears').value,
        
        // API-enriched fields
        mlb_id: document.getElementById('addPlayerMLBId').value || null,
        yahoo_id: document.getElementById('addPlayerYahooId').value || null,
        birth_date: document.getElementById('addPlayerBirthDate').value || null,
        debut_date: document.getElementById('addPlayerDebut').value || null,
        bats: document.getElementById('addPlayerBats').value || null,
        throws: document.getElementById('addPlayerThrows').value || null,
        fypd: document.getElementById('addPlayerFYPD').checked,
        
        // Alternate names
        alt_names: document.getElementById('addPlayerAltNames').value
            .split('\n')
            .map(n => n.trim())
            .filter(n => n)
    };
    
    const btn = document.querySelector('#addPlayerForm button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding Player...';
    
    try {
        const res = await fetch(`${AUTH_CONFIG.workerUrl}/api/admin/add-player`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                admin: ADMIN_STATE.adminUser,
                player_data: formData
            })
        });
        
        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.detail || `API error ${res.status}`);
        }
        
        const result = await res.json();
        
        showToast(`✅ ${formData.name} added successfully! UPID: ${result.upid}`, 'success');
        
        // Close modal and refresh
        document.getElementById('addPlayerModal').classList.remove('active');
        await reloadAllData();
        
    } catch (err) {
        console.error('Add player error:', err);
        showToast(`Failed to add player: ${err.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-plus"></i> Add Player';
    }
}

// ============================================
// BULK OPERATIONS
// ============================================

/**
 * Setup bulk operations
 */
function setupBulkOperations() {
    // Add checkboxes to search results for bulk selection
    // This will be called when rendering search results
}

/**
 * Toggle bulk selection
 */
function toggleBulkSelect(upid, checkbox) {
    if (checkbox.checked) {
        ADMIN_STATE.bulkSelected.add(upid);
    } else {
        ADMIN_STATE.bulkSelected.delete(upid);
    }
    
    updateBulkActionButtons();
}

/**
 * Select all filtered players
 */
function selectAllFiltered() {
    ADMIN_STATE.filteredPlayers.forEach(p => {
        ADMIN_STATE.bulkSelected.add(p.upid);
    });
    
    // Update checkboxes
    document.querySelectorAll('.bulk-checkbox').forEach(cb => {
        cb.checked = true;
    });
    
    updateBulkActionButtons();
}

/**
 * Clear all selections
 */
function clearBulkSelection() {
    ADMIN_STATE.bulkSelected.clear();
    
    document.querySelectorAll('.bulk-checkbox').forEach(cb => {
        cb.checked = false;
    });
    
    updateBulkActionButtons();
}

/**
 * Update bulk action button states
 */
function updateBulkActionButtons() {
    const count = ADMIN_STATE.bulkSelected.size;
    
    // Update button text
    const bulkGradBtn = document.getElementById('bulkGraduateBtn');
    const bulkContractBtn = document.getElementById('bulkContractBtn');
    const bulkReleaseBtn = document.getElementById('bulkReleaseBtn');
    
    if (bulkGradBtn) bulkGradBtn.textContent = `Graduate (${count})`;
    if (bulkContractBtn) bulkContractBtn.textContent = `Update Contracts (${count})`;
    if (bulkReleaseBtn) bulkReleaseBtn.textContent = `Release (${count})`;
    
    // Enable/disable based on selection
    const enabled = count > 0;
    if (bulkGradBtn) bulkGradBtn.disabled = !enabled;
    if (bulkContractBtn) bulkContractBtn.disabled = !enabled;
    if (bulkReleaseBtn) bulkReleaseBtn.disabled = !enabled;
}

/**
 * Show bulk graduation modal
 */
function showBulkGraduationModal() {
    if (ADMIN_STATE.bulkSelected.size === 0) {
        showToast('No players selected', 'warning');
        return;
    }
    
    const selected = Array.from(ADMIN_STATE.bulkSelected)
        .map(upid => ADMIN_STATE.allPlayers.find(p => p.upid === upid))
        .filter(p => p);
    
    const modal = document.getElementById('bulkGraduationModal');
    const listContainer = document.getElementById('bulkGraduationList');
    
    // Detect if any selected prospects have Blue Chip contracts
    const hasBCProspects = selected.some(p => 
        (p.contract_type || '').toLowerCase().includes('blue chip') ||
        (p.years_simple || '').toUpperCase().includes('BC')
    );
    const hasNonBCProspects = selected.some(p => 
        !(p.contract_type || '').toLowerCase().includes('blue chip') &&
        !(p.years_simple || '').toUpperCase().includes('BC')
    );

    listContainer.innerHTML = `
        <div class="bulk-preview-list">
            ${selected.map(p => {
                const isBC = (p.contract_type || '').toLowerCase().includes('blue chip') ||
                             (p.years_simple || '').toUpperCase().includes('BC');
                return `
                    <div class="bulk-preview-item">
                        <strong>${p.name}</strong>
                        <span>${p.team || 'FA'} ${p.position || 'N/A'}</span>
                        <span>Owner: ${p.manager || 'Unowned'}</span>
                        ${isBC ? '<span style="color: #64B5F6; font-weight: 700;">BC</span>' : ''}
                    </div>
                `;
            }).join('')}
        </div>
        ${hasBCProspects && hasNonBCProspects ? `
        <div class="bulk-graduation-options" style="margin-bottom: var(--space-md);">
            <div style="background: rgba(66,165,245,0.1); border: 1px solid rgba(66,165,245,0.3); border-radius: var(--radius-sm); padding: var(--space-md); margin-bottom: var(--space-md);">
                <i class="fas fa-info-circle" style="color: #64B5F6;"></i>
                <strong style="color: #64B5F6;">Mixed selection:</strong>
                <span style="color: var(--text-gray); font-size: var(--text-sm);">
                    BC prospects will graduate to TC-BC-1. Non-BC prospects will graduate to the tier you select below.
                </span>
            </div>
            <label>Non-BC prospects graduate to:</label>
            <select id="bulkGraduationContract" class="form-input">
                <option value="TC R">TC-R ($5)</option>
                <option value="TC 1">TC-1 ($15)</option>
                <option value="VC 1">VC-1 ($35)</option>
            </select>
        </div>
        ` : hasBCProspects ? `
        <div class="bulk-graduation-options">
            <div style="background: rgba(66,165,245,0.1); border: 1px solid rgba(66,165,245,0.3); border-radius: var(--radius-sm); padding: var(--space-md); margin-bottom: var(--space-md);">
                <i class="fas fa-star" style="color: #64B5F6;"></i>
                <strong style="color: #64B5F6;">Blue Chip graduates</strong>
                <span style="color: var(--text-gray); font-size: var(--text-sm);">
                    — will receive TC-BC-1 ($5, lasts 2 seasons per Constitution Art. 3 §04.5)
                </span>
            </div>
            <input type="hidden" id="bulkGraduationContract" value="TC BC-1">
        </div>
        ` : `
        <div class="bulk-graduation-options">
            <label>Graduate to:</label>
            <select id="bulkGraduationContract" class="form-input">
                <option value="TC R">TC-R ($5)</option>
                <option value="TC BC-1">TC-BC-1 ($5, Blue Chip graduate)</option>
                <option value="TC 1">TC-1 ($15)</option>
                <option value="VC 1">VC-1 ($35)</option>
            </select>
        </div>
        `}
    `;
    
    modal.classList.add('active');
}

/**
 * Confirm bulk graduation
 */
async function confirmBulkGraduation() {
    const defaultTier = document.getElementById('bulkGraduationContract').value;
    const upids = Array.from(ADMIN_STATE.bulkSelected);
    
    const session = authManager?.getSession();
    const token = session?.token;
    
    if (!token) {
        showToast('Session expired', 'error');
        return;
    }
    
    // Build per-player tier map: BC prospects → TC BC-1, others → selected tier
    const upidTierMap = {};
    upids.forEach(upid => {
        const player = ADMIN_STATE.allPlayers.find(p => String(p.upid) === String(upid));
        if (player) {
            const isBC = (player.contract_type || '').toLowerCase().includes('blue chip') ||
                         (player.years_simple || '').toUpperCase().includes('BC');
            upidTierMap[upid] = isBC ? 'TC BC-1' : defaultTier;
        } else {
            upidTierMap[upid] = defaultTier;
        }
    });
    
    const btn = document.getElementById('confirmBulkGraduationBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    
    try {
        const res = await fetch(`${AUTH_CONFIG.workerUrl}/api/admin/bulk-graduate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                admin: ADMIN_STATE.adminUser,
                upids,
                contract_tier: defaultTier,
                upid_tier_map: upidTierMap
            })
        });
        
        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.detail || 'Bulk graduation failed');
        }
        
        const result = await res.json();
        
        showToast(`✅ ${result.count} players graduated`, 'success');
        
        document.getElementById('bulkGraduationModal').classList.remove('active');
        clearBulkSelection();
        await reloadAllData();
        
    } catch (err) {
        console.error('Bulk graduation error:', err);
        showToast(`Bulk graduation failed: ${err.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check"></i> Confirm';
    }
}

/**
 * Show bulk contract update modal
 */
function showBulkContractModal() {
    if (ADMIN_STATE.bulkSelected.size === 0) {
        showToast('No players selected', 'warning');
        return;
    }
    
    const selected = Array.from(ADMIN_STATE.bulkSelected)
        .map(upid => ADMIN_STATE.allPlayers.find(p => p.upid === upid))
        .filter(p => p);
    
    const modal = document.getElementById('bulkContractModal');
    const listContainer = document.getElementById('bulkContractList');
    
    listContainer.innerHTML = `
        <div class="bulk-preview-list">
            ${selected.map(p => `
                <div class="bulk-preview-item">
                    <strong>${p.name}</strong>
                    <span>Current: ${p.years_simple || 'None'}</span>
                </div>
            `).join('')}
        </div>
        <div class="bulk-contract-options">
            <label>New Contract:</label>
            <select id="bulkContractType" class="form-input">
                ${YEARS_SIMPLE.map(y => `<option value="${y}">${y || '(None)'}</option>`).join('')}
            </select>
        </div>
    `;
    
    modal.classList.add('active');
}

/**
 * Confirm bulk contract update
 */
async function confirmBulkContract() {
    const newContract = document.getElementById('bulkContractType').value;
    const upids = Array.from(ADMIN_STATE.bulkSelected);
    
    const session = authManager?.getSession();
    const token = session?.token;
    
    if (!token) {
        showToast('Session expired', 'error');
        return;
    }
    
    const btn = document.getElementById('confirmBulkContractBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
    
    try {
        const res = await fetch(`${AUTH_CONFIG.workerUrl}/api/admin/bulk-update-contracts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                admin: ADMIN_STATE.adminUser,
                upids,
                new_contract: newContract
            })
        });
        
        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.detail || 'Bulk update failed');
        }
        
        const result = await res.json();
        
        showToast(`✅ ${result.count} contracts updated to ${newContract || '(None)'}`, 'success');
        
        document.getElementById('bulkContractModal').classList.remove('active');
        clearBulkSelection();
        await reloadAllData();
        
    } catch (err) {
        console.error('Bulk contract error:', err);
        showToast(`Bulk update failed: ${err.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check"></i> Confirm';
    }
}

/**
 * Show bulk release modal
 */
function showBulkReleaseModal() {
    if (ADMIN_STATE.bulkSelected.size === 0) {
        showToast('No players selected', 'warning');
        return;
    }
    
    const selected = Array.from(ADMIN_STATE.bulkSelected)
        .map(upid => ADMIN_STATE.allPlayers.find(p => p.upid === upid))
        .filter(p => p);
    
    const modal = document.getElementById('bulkReleaseModal');
    const listContainer = document.getElementById('bulkReleaseList');
    
    listContainer.innerHTML = `
        <div class="bulk-preview-list">
            ${selected.map(p => `
                <div class="bulk-preview-item">
                    <strong>${p.name}</strong>
                    <span>${p.manager || 'Unowned'}</span>
                    <span>${p.contract_type || 'No contract'}</span>
                </div>
            `).join('')}
        </div>
        <div class="bulk-release-warning">
            <i class="fas fa-exclamation-triangle"></i>
            <p>This will remove ownership and contracts from ${selected.length} player${selected.length !== 1 ? 's' : ''}</p>
        </div>
    `;
    
    modal.classList.add('active');
}

/**
 * Confirm bulk release
 */
async function confirmBulkRelease() {
    const upids = Array.from(ADMIN_STATE.bulkSelected);
    const reason = document.getElementById('bulkReleaseReason').value.trim();
    
    if (!reason) {
        showToast('Please provide a reason', 'error');
        return;
    }
    
    const session = authManager?.getSession();
    const token = session?.token;
    
    if (!token) {
        showToast('Session expired', 'error');
        return;
    }
    
    const btn = document.getElementById('confirmBulkReleaseBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Releasing...';
    
    try {
        const res = await fetch(`${AUTH_CONFIG.workerUrl}/api/admin/bulk-release`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                admin: ADMIN_STATE.adminUser,
                upids,
                reason
            })
        });
        
        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.detail || 'Bulk release failed');
        }
        
        const result = await res.json();
        
        showToast(`✅ ${result.count} players released`, 'success');
        
        document.getElementById('bulkReleaseModal').classList.remove('active');
        clearBulkSelection();
        await reloadAllData();
        
    } catch (err) {
        console.error('Bulk release error:', err);
        showToast(`Bulk release failed: ${err.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check"></i> Confirm';
    }
}

/**
 * Reload all data after changes
 */
async function reloadAllData() {
    await loadUPIDDatabase();
    await loadAllPlayers();
    displaySearchResults();
    updateAdminStats();
}

// ============================================
// SEARCH & DISPLAY (Enhanced with bulk checkboxes)
// ============================================

/**
 * Display search results with bulk selection checkboxes
 */
function displaySearchResults() {
    const container = document.getElementById('searchResults');
    const count = ADMIN_STATE.filteredPlayers.length;
    
    document.getElementById('searchResultsCount').textContent = `${count} player${count !== 1 ? 's' : ''} found`;
    
    // Show bulk action toolbar if results exist
    const bulkToolbar = document.getElementById('bulkActionToolbar');
    if (bulkToolbar) {
        bulkToolbar.style.display = count > 0 ? 'flex' : 'none';
    }
    
    if (count === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-search"></i><p>No players match your search</p></div>';
        return;
    }
    
    const displayPlayers = ADMIN_STATE.filteredPlayers.slice(0, 100);
    
    container.innerHTML = displayPlayers.map(p => {
        const isSelected = ADMIN_STATE.bulkSelected.has(p.upid);
        
        return `
            <div class="player-result-card">
                <div class="player-result-checkbox">
                    <input type="checkbox" 
                           class="bulk-checkbox" 
                           ${isSelected ? 'checked' : ''}
                           onchange="toggleBulkSelect('${p.upid}', this)">
                </div>
                <div class="player-result-info" onclick="selectPlayerForEdit('${p.upid}')">
                    <div class="player-result-name">${p.name}</div>
                    <div class="player-result-meta">
                        <span>UPID: ${p.upid}</span>
                        <span>${p.position || 'N/A'}</span>
                        <span>${p.team || 'FA'}</span>
                        ${p.age ? `<span>Age ${p.age}</span>` : ''}
                        <span>${p.manager || 'Unowned'}</span>
                        <span>${p.player_type || 'Unknown'}</span>
                        ${p.years_simple ? `<span>${p.years_simple}</span>` : ''}
                    </div>
                </div>
                <div class="player-result-actions">
                    <button class="btn-edit" onclick="selectPlayerForEdit('${p.upid}'); event.stopPropagation();">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                </div>
            </div>
        `;
    }).join('');
    
    if (count > 100) {
        container.innerHTML += `
            <div class="empty-state">
                <p>Showing first 100 of ${count} results. Refine your search to see more.</p>
            </div>
        `;
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Helper to populate dropdowns (same as before but with additions)
 */
function populateDropdowns() {
    const managerAbbrevs = Object.keys(ADMIN_STATE.managers).sort();
    
    // Owner filter options
    const ownerFilterOptions = '<option value="">All Owners</option>' + 
        managerAbbrevs.map(abbr => {
            const name = ADMIN_STATE.managers[abbr]?.name || abbr;
            return `<option value="${abbr}">${abbr} - ${name}</option>`;
        }).join('');
    
    ['searchOwnerFilter', 'editOwner', 'addPlayerOwner'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (id === 'searchOwnerFilter') {
                el.innerHTML = ownerFilterOptions;
            } else {
                el.innerHTML = '<option value="">Unowned</option>' + ownerFilterOptions.replace('<option value="">All Owners</option>', '');
            }
        }
    });
    
    // MLB teams
    const teamOptions = '<option value="">N/A</option>' + 
        MLB_TEAMS.map(t => `<option value="${t}">${t}</option>`).join('');
    
    ['editTeam', 'addPlayerTeam'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = teamOptions;
    });
    
    // Positions
    const posOptions = '<option value="">N/A</option>' + 
        POSITIONS.map(p => `<option value="${p}">${p}</option>`).join('');
    
    ['editPosition', 'addPlayerPosition'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = posOptions;
    });
    
    // Contracts
    const contractOptions = CONTRACT_TYPES.map(c => 
        `<option value="${c}">${c || 'None (Unowned)'}</option>`
    ).join('');
    
    ['editContract', 'addPlayerContract'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = contractOptions;
    });
    
    // Years
    const yearsOptions = YEARS_SIMPLE.map(y => 
        `<option value="${y}">${y || '(None)'}</option>`
    ).join('');
    
    ['editYears', 'addPlayerYears'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = yearsOptions;
    });
    
    // Levels
    const levelOptions = LEVELS.map(l => `<option value="${l}">${l}</option>`).join('');
    
    ['editLevel', 'addPlayerLevel'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = levelOptions;
    });
    
    // Update types
    const updateOptions = UPDATE_TYPES.map(u => `<option value="${u}">${u}</option>`).join('');
    
    const editUpdateType = document.getElementById('editUpdateType');
    if (editUpdateType) editUpdateType.innerHTML = updateOptions;
}

/**
 * Setup tabs (enhanced)
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
            
            if (targetTab === 'logs') loadRecentLogs();
            if (targetTab === 'wizbucks') loadTeamBalances();
        });
    });
    
    // Log filters
    const logTypeFilter = document.getElementById('logTypeFilter');
    const logLimitFilter = document.getElementById('logLimitFilter');
    
    if (logTypeFilter) logTypeFilter.addEventListener('change', loadRecentLogs);
    if (logLimitFilter) logLimitFilter.addEventListener('change', loadRecentLogs);
}

/**
 * Setup search (same as before)
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
            const matchesQuery = !query || 
                p.name.toLowerCase().includes(query) ||
                (p.upid || '').toLowerCase().includes(query) ||
                (p.team || '').toLowerCase().includes(query) ||
                (p.position || '').toLowerCase().includes(query);
            
            const matchesOwner = !owner || p.manager === owner;
            const matchesType = !type || p.player_type === type;
            const matchesContract = !contract || 
                (p.contract_type || '').toLowerCase().includes(contract.toLowerCase()) ||
                (p.years_simple || '').toLowerCase().includes(contract.toLowerCase());
            
            return matchesQuery && matchesOwner && matchesType && matchesContract;
        });
        
        displaySearchResults();
    };
    
    searchInput.addEventListener('input', performSearch);
    ownerFilter.addEventListener('change', performSearch);
    typeFilter.addEventListener('change', performSearch);
    contractFilter.addEventListener('change', performSearch);
    
    displaySearchResults();
}

/**
 * Update admin stats
 */
function updateAdminStats() {
    document.getElementById('totalPlayers').textContent = ADMIN_STATE.allPlayers.length;
    document.getElementById('pendingChanges').textContent = ADMIN_STATE.bulkSelected.size;
    
    // Recent logs count
    const logs = JSON.parse(localStorage.getItem('player_log') || '[]');
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentCount = logs.filter(log => new Date(log.timestamp) > dayAgo).length;
    document.getElementById('recentLogs').textContent = recentCount;
}

/**
 * Load recent logs (same as before)
 */
async function loadRecentLogs() {
    const typeFilter = document.getElementById('logTypeFilter')?.value || '';
    const limitFilter = parseInt(document.getElementById('logLimitFilter')?.value || '50');
    const container = document.getElementById('activityLog');
    if (!container) return;

    let logs = [];
    const session = authManager?.getSession();
    const token = session?.token;

    if (AUTH_CONFIG?.workerUrl && token) {
        try {
            const params = new URLSearchParams();
            params.set('limit', String(limitFilter));
            if (typeFilter) params.set('update_type', typeFilter);

            const res = await fetch(`${AUTH_CONFIG.workerUrl}/api/admin/player-log?${params}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) logs = data;
            }
        } catch (e) {
            console.warn('Failed to load logs via API', e);
        }
    }

    if (!logs.length) {
        const playerLog = JSON.parse(localStorage.getItem('player_log') || '[]');
        logs = [...playerLog].reverse();
        if (typeFilter) logs = logs.filter(log => log.update_type === typeFilter);
        logs = logs.slice(0, limitFilter);
    }

    if (!logs.length) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-clipboard-list"></i><p>No activity logs</p></div>';
        return;
    }

    container.innerHTML = logs.map(log => `
        <div class="log-entry ${log.update_type === 'Admin' ? 'admin-manual' : ''}">
            <div class="log-entry-header">
                <div class="log-entry-player">${log.player_name}</div>
                <div class="log-entry-date">${formatDateTime(log.timestamp)}</div>
            </div>
            <div class="log-entry-event">${log.event}</div>
            <div class="log-entry-meta">
                <span class="type-badge">${log.update_type}</span>
                ${log.owner ? `<span><i class="fas fa-user"></i> ${log.owner}</span>` : ''}
                ${log.admin ? `<span><i class="fas fa-shield-alt"></i> ${log.admin}</span>` : ''}
            </div>
        </div>
    `).join('');
}

/**
 * Load team balances (same as before)
 */
async function loadTeamBalances() {
    const container = document.getElementById('teamBalances');
    if (!container) return;

    const teams = Object.keys(ADMIN_STATE.managers).sort();
    let balances = {};

    const session = authManager?.getSession();
    const token = session?.token;

    if (AUTH_CONFIG?.workerUrl && token) {
        try {
            const res = await fetch(`${AUTH_CONFIG.workerUrl}/api/admin/wizbucks-balances`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                if (data?.balances) balances = data.balances;
            }
        } catch (e) {
            console.warn('Failed to load balances', e);
        }
    }

    container.innerHTML = teams.map(team => `
        <div class="team-balance-card">
            <span class="team-balance-name">${team}</span>
            <span class="team-balance-amount">$${balances[team] || 0}</span>
        </div>
    `).join('');
}

/**
 * Apply WizBucks adjustment (same as before)
 */
async function applyWBAdjustment() {
    const team = document.getElementById('wbTeam').value;
    const amount = parseInt(document.getElementById('wbAmount').value);
    const reason = document.getElementById('wbReason').value.trim();
    
    if (!team || isNaN(amount) || !reason) {
        showToast('All fields are required', 'error');
        return;
    }

    const session = authManager?.getSession();
    const token = session?.token;

    if (!token) {
        showToast('Session expired', 'error');
        return;
    }

    try {
        const res = await fetch(`${AUTH_CONFIG.workerUrl}/api/admin/wizbucks-adjustment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                season: new Date().getFullYear(),
                admin: ADMIN_STATE.adminUser,
                team,
                amount,
                reason
            })
        });

        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.detail || 'Adjustment failed');
        }

        document.getElementById('wbAdjustmentForm').reset();
        await loadTeamBalances();
        
        showToast(`✅ $${amount >= 0 ? '+' : ''}${amount} applied to ${team}`, 'success');
    } catch (err) {
        console.error('WB adjustment error', err);
        showToast(`Adjustment failed: ${err.message}`, 'error');
    }
}

// ============================================
// MODAL HELPERS
// ============================================

/**
 * Cancel/close the Add Player modal
 */
function cancelAddPlayer() {
    const modal = document.getElementById('addPlayerModal');
    if (modal) modal.classList.remove('active');
}

/**
 * Setup click-outside-to-close for all modals
 */
function setupModalCloseHandlers() {
    const modals = document.querySelectorAll('.confirmation-modal');
    modals.forEach(modal => {
        modal.addEventListener('click', (e) => {
            // Close if clicking the backdrop (not the content)
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });
}

// Initialize modal handlers when DOM is ready
document.addEventListener('DOMContentLoaded', setupModalCloseHandlers);

// ============================================
// HELPER FUNCTIONS
// ============================================

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

// Expose globally
window.initAdminPortal = initAdminPortal;
window.showAddPlayerModal = showAddPlayerModal;
window.checkAddPlayerDuplicates = checkAddPlayerDuplicates;
window.enrichPlayerData = enrichPlayerData;
window.submitAddPlayer = submitAddPlayer;
window.toggleBulkSelect = toggleBulkSelect;
window.selectAllFiltered = selectAllFiltered;
window.clearBulkSelection = clearBulkSelection;
window.showBulkGraduationModal = showBulkGraduationModal;
window.confirmBulkGraduation = confirmBulkGraduation;
window.showBulkContractModal = showBulkContractModal;
window.confirmBulkContract = confirmBulkContract;
window.showBulkReleaseModal = showBulkReleaseModal;
window.confirmBulkRelease = confirmBulkRelease;
window.applyWBAdjustment = applyWBAdjustment;
window.selectPlayerForEdit = selectPlayerForEdit;
window.clearSearch = clearSearch;
window.cancelAddPlayer = cancelAddPlayer;
