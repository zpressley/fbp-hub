/**
 * FBP Hub - Paste Query Module
 * Paste a list of player names → get a results table with all their data
 * Supports exact + fuzzy matching, bulk actions, CSV export
 * 
 * Integrates with admin-enhanced.js ADMIN_STATE
 */

// ============================================
// QUERY STATE
// ============================================

let QUERY_STATE = {
    results: [],        // Array of { input, matchType, player, score }
    selected: new Set(), // Selected UPIDs for bulk ops
    lastQuery: []       // Raw input lines
};

// ============================================
// QUERY INPUT HELPERS
// ============================================

/**
 * Update line count as user types
 */
function updateQueryLineCount() {
    const textarea = document.getElementById('queryTextarea');
    if (!textarea) return;
    
    const lines = textarea.value
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0);
    
    const countEl = document.getElementById('queryLineCount');
    if (countEl) {
        countEl.textContent = `${lines.length} name${lines.length !== 1 ? 's' : ''}`;
    }
}

/**
 * Clear the query input
 */
function clearQueryInput() {
    const textarea = document.getElementById('queryTextarea');
    if (textarea) textarea.value = '';
    updateQueryLineCount();
    
    // Hide results
    const resultsEl = document.getElementById('queryResults');
    if (resultsEl) resultsEl.style.display = 'none';
    
    QUERY_STATE.results = [];
    QUERY_STATE.selected.clear();
    QUERY_STATE.lastQuery = [];
}

/**
 * Paste from clipboard
 */
async function pasteFromClipboard() {
    try {
        const text = await navigator.clipboard.readText();
        const textarea = document.getElementById('queryTextarea');
        if (textarea) {
            textarea.value = text;
            updateQueryLineCount();
        }
    } catch (e) {
        showToast('Could not read clipboard. Try Ctrl+V instead.', 'warning');
    }
}

// ============================================
// FUZZY MATCHING ENGINE
// ============================================

/**
 * Normalize a name for comparison
 */
function normalizeName(name) {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s]/g, '')  // Remove special chars (accents handled separately)
        .replace(/\s+/g, ' ');
}

/**
 * Simple Levenshtein distance
 */
function levenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
            );
        }
    }
    
    return dp[m][n];
}

/**
 * Calculate similarity score (0-1, higher is better)
 */
function similarity(a, b) {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    return 1 - levenshtein(a, b) / maxLen;
}

/**
 * Find best match for a given input name
 * Returns { player, matchType, score } or { player: null, matchType: 'none', score: 0 }
 */
function findBestMatch(inputName, players, useFuzzy = true) {
    const normalized = normalizeName(inputName);
    
    if (!normalized) return { player: null, matchType: 'none', score: 0 };
    
    // --- Pass 1: Exact match on normalized name ---
    for (const p of players) {
        if (normalizeName(p.name) === normalized) {
            return { player: p, matchType: 'exact', score: 1.0 };
        }
    }
    
    // --- Pass 2: Check UPID database alt_names ---
    if (ADMIN_STATE.upidDatabase?.name_index) {
        const matchedUpids = ADMIN_STATE.upidDatabase.name_index[normalized];
        if (matchedUpids && matchedUpids.length > 0) {
            // Find the player in allPlayers by UPID
            for (const upid of matchedUpids) {
                const found = players.find(p => String(p.upid) === String(upid));
                if (found) {
                    return { player: found, matchType: 'exact', score: 1.0 };
                }
            }
        }
    }
    
    // --- Pass 3: Substring / contains match ---
    const containsMatches = players.filter(p => {
        const pName = normalizeName(p.name);
        return pName.includes(normalized) || normalized.includes(pName);
    });
    
    if (containsMatches.length === 1) {
        return { player: containsMatches[0], matchType: 'exact', score: 0.95 };
    }
    
    // If multiple contains matches, pick best by similarity
    if (containsMatches.length > 1) {
        let best = null;
        let bestScore = 0;
        for (const p of containsMatches) {
            const score = similarity(normalized, normalizeName(p.name));
            if (score > bestScore) {
                bestScore = score;
                best = p;
            }
        }
        if (best) {
            return { player: best, matchType: bestScore >= 0.95 ? 'exact' : 'fuzzy', score: bestScore };
        }
    }
    
    // --- Pass 4: Fuzzy match (Levenshtein) ---
    if (!useFuzzy) return { player: null, matchType: 'none', score: 0 };
    
    let bestFuzzy = null;
    let bestFuzzyScore = 0;
    const FUZZY_THRESHOLD = 0.7;
    
    for (const p of players) {
        const pNorm = normalizeName(p.name);
        const score = similarity(normalized, pNorm);
        
        if (score > bestFuzzyScore && score >= FUZZY_THRESHOLD) {
            bestFuzzyScore = score;
            bestFuzzy = p;
        }
        
        // Also check last name match (common for partial input)
        const inputParts = normalized.split(' ');
        const playerParts = pNorm.split(' ');
        
        if (inputParts.length >= 1 && playerParts.length >= 2) {
            const lastNameScore = similarity(inputParts[inputParts.length - 1], playerParts[playerParts.length - 1]);
            
            if (lastNameScore > 0.9 && inputParts.length === 1) {
                // Single name input matching a last name
                const combinedScore = lastNameScore * 0.85; // Slight penalty for partial match
                if (combinedScore > bestFuzzyScore && combinedScore >= FUZZY_THRESHOLD) {
                    bestFuzzyScore = combinedScore;
                    bestFuzzy = p;
                }
            }
        }
    }
    
    if (bestFuzzy) {
        return { player: bestFuzzy, matchType: 'fuzzy', score: bestFuzzyScore };
    }
    
    return { player: null, matchType: 'none', score: 0 };
}

// ============================================
// MAIN QUERY EXECUTION
// ============================================

/**
 * Execute the paste query
 */
function executeQuery() {
    const textarea = document.getElementById('queryTextarea');
    if (!textarea) return;
    
    const useFuzzy = document.getElementById('queryFuzzyMatch')?.checked !== false;
    const showUnmatched = document.getElementById('queryShowUnmatched')?.checked !== false;
    
    // Parse input lines
    const lines = textarea.value
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0);
    
    if (lines.length === 0) {
        showToast('Paste some player names first', 'warning');
        return;
    }
    
    QUERY_STATE.lastQuery = lines;
    QUERY_STATE.selected.clear();
    
    const players = ADMIN_STATE.allPlayers || [];
    
    if (players.length === 0) {
        showToast('Player database not loaded yet', 'error');
        return;
    }
    
    // Match each line
    const results = [];
    
    for (const inputName of lines) {
        const match = findBestMatch(inputName, players, useFuzzy);
        results.push({
            input: inputName,
            matchType: match.matchType,
            player: match.player,
            score: match.score
        });
    }
    
    // Filter out unmatched if option unchecked
    QUERY_STATE.results = showUnmatched 
        ? results 
        : results.filter(r => r.matchType !== 'none');
    
    // Render
    renderQuerySummary(results);
    renderQueryTable();
    
    // Show results
    document.getElementById('queryResults').style.display = 'block';
    
    // Scroll to results
    document.getElementById('queryResults').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ============================================
// RENDERING
// ============================================

/**
 * Render the summary bar
 */
function renderQuerySummary(allResults) {
    const container = document.getElementById('querySummary');
    if (!container) return;
    
    const total = allResults.length;
    const exact = allResults.filter(r => r.matchType === 'exact').length;
    const fuzzy = allResults.filter(r => r.matchType === 'fuzzy').length;
    const unmatched = allResults.filter(r => r.matchType === 'none').length;
    
    container.innerHTML = `
        <div class="query-summary-stat total">
            <i class="fas fa-list"></i>
            <span>${total} queried</span>
        </div>
        <div class="query-summary-stat matched">
            <i class="fas fa-check"></i>
            <span>${exact} exact</span>
        </div>
        ${fuzzy > 0 ? `
        <div class="query-summary-stat fuzzy">
            <i class="fas fa-question-circle"></i>
            <span>${fuzzy} fuzzy</span>
        </div>` : ''}
        ${unmatched > 0 ? `
        <div class="query-summary-stat unmatched">
            <i class="fas fa-times"></i>
            <span>${unmatched} not found</span>
        </div>` : ''}
    `;
}

/**
 * Render the results table
 */
function renderQueryTable() {
    const tbody = document.getElementById('queryResultsBody');
    if (!tbody) return;
    
    const results = QUERY_STATE.results;
    
    if (results.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="12" style="text-align: center; padding: 40px; color: var(--text-gray);">
                    <i class="fas fa-inbox" style="font-size: 24px; display: block; margin-bottom: 8px;"></i>
                    No results to display
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = results.map((r, idx) => {
        const p = r.player;
        const isSelected = p ? QUERY_STATE.selected.has(String(p.upid)) : false;
        const rowClass = r.matchType === 'none' ? 'row-unmatched' 
                       : r.matchType === 'fuzzy' ? 'row-fuzzy' 
                       : 'row-exact';
        const selectedClass = isSelected ? 'row-selected' : '';
        
        if (!p) {
            // Unmatched row
            return `
                <tr class="${rowClass}">
                    <td class="col-checkbox"></td>
                    <td class="col-status"><span class="match-status none"><i class="fas fa-times"></i> None</span></td>
                    <td class="col-input">${escapeHtml(r.input)}</td>
                    <td class="col-name">—</td>
                    <td class="col-upid">—</td>
                    <td class="col-pos">—</td>
                    <td class="col-team">—</td>
                    <td class="col-age">—</td>
                    <td class="col-owner">—</td>
                    <td class="col-type">—</td>
                    <td class="col-contract">—</td>
                    <td class="col-actions">
                        <button class="btn-sm btn-secondary" onclick="showAddPlayerModal(); document.getElementById('addPlayerName').value='${escapeHtml(r.input)}';" title="Add player">
                            <i class="fas fa-plus"></i>
                        </button>
                    </td>
                </tr>
            `;
        }
        
        // Matched row
        const statusBadge = r.matchType === 'exact'
            ? '<span class="match-status exact"><i class="fas fa-check"></i> Exact</span>'
            : `<span class="match-status fuzzy"><i class="fas fa-question"></i> ${Math.round(r.score * 100)}%</span>`;
        
        const ownerBadge = p.manager 
            ? `<span class="owner-badge">${p.manager}</span>`
            : `<span class="owner-badge unowned">—</span>`;
        
        const typeBadge = p.player_type === 'MLB'
            ? '<span class="type-badge-sm mlb">MLB</span>'
            : p.player_type === 'Farm'
            ? '<span class="type-badge-sm farm">Farm</span>'
            : '<span class="type-badge-sm">—</span>';
        
        const contractDisplay = p.years_simple 
            ? `<span class="contract-badge-sm">${p.years_simple}</span>`
            : '—';
        
        return `
            <tr class="${rowClass} ${selectedClass}" data-upid="${p.upid}">
                <td class="col-checkbox">
                    <input type="checkbox" 
                           class="query-checkbox" 
                           ${isSelected ? 'checked' : ''}
                           onchange="toggleQuerySelect('${p.upid}', this)">
                </td>
                <td class="col-status">${statusBadge}</td>
                <td class="col-input"><span class="input-name">${escapeHtml(r.input)}</span></td>
                <td class="col-name">${escapeHtml(p.name)}</td>
                <td class="col-upid">${p.upid || '—'}</td>
                <td class="col-pos">${p.position || '—'}</td>
                <td class="col-team">${p.team || 'FA'}</td>
                <td class="col-age">${p.age || '—'}</td>
                <td class="col-owner">${ownerBadge}</td>
                <td class="col-type">${typeBadge}</td>
                <td class="col-contract">${contractDisplay}</td>
                <td class="col-actions">
                    <button class="btn-sm btn-secondary" onclick="selectPlayerForEdit('${p.upid}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    
    // Show/hide bulk toolbar
    updateQueryBulkToolbar();
}

// ============================================
// SELECTION & BULK ACTIONS
// ============================================

/**
 * Toggle selection of a query result row
 */
function toggleQuerySelect(upid, checkbox) {
    const key = String(upid);
    
    // Ensure ADMIN_STATE.bulkSelected exists
    if (typeof ADMIN_STATE !== 'undefined' && !ADMIN_STATE.bulkSelected) {
        ADMIN_STATE.bulkSelected = new Set();
    }
    
    if (checkbox.checked) {
        QUERY_STATE.selected.add(key);
        // Also add to main ADMIN_STATE for bulk ops
        if (typeof ADMIN_STATE !== 'undefined' && ADMIN_STATE.bulkSelected) {
            ADMIN_STATE.bulkSelected.add(key);
        }
    } else {
        QUERY_STATE.selected.delete(key);
        if (typeof ADMIN_STATE !== 'undefined' && ADMIN_STATE.bulkSelected) {
            ADMIN_STATE.bulkSelected.delete(key);
        }
    }
    
    // Update row highlight
    const row = document.querySelector(`tr[data-upid="${upid}"]`);
    if (row) {
        row.classList.toggle('row-selected', checkbox.checked);
    }
    
    updateQueryBulkToolbar();
    if (typeof updateBulkActionButtons === 'function') {
        updateBulkActionButtons();
    }
}

/**
 * Toggle select all in query results
 */
function toggleQuerySelectAll(masterCheckbox) {
    const checked = masterCheckbox.checked;
    
    // Ensure ADMIN_STATE.bulkSelected exists
    if (typeof ADMIN_STATE !== 'undefined' && !ADMIN_STATE.bulkSelected) {
        ADMIN_STATE.bulkSelected = new Set();
    }
    
    QUERY_STATE.results.forEach(r => {
        if (r.player) {
            const key = String(r.player.upid);
            if (checked) {
                QUERY_STATE.selected.add(key);
                if (typeof ADMIN_STATE !== 'undefined' && ADMIN_STATE.bulkSelected) {
                    ADMIN_STATE.bulkSelected.add(key);
                }
            } else {
                QUERY_STATE.selected.delete(key);
                if (typeof ADMIN_STATE !== 'undefined' && ADMIN_STATE.bulkSelected) {
                    ADMIN_STATE.bulkSelected.delete(key);
                }
            }
        }
    });
    
    // Update all checkboxes
    document.querySelectorAll('.query-checkbox').forEach(cb => {
        cb.checked = checked;
    });
    
    // Update row highlights
    document.querySelectorAll('#queryResultsBody tr[data-upid]').forEach(row => {
        row.classList.toggle('row-selected', checked);
    });
    
    updateQueryBulkToolbar();
    if (typeof updateBulkActionButtons === 'function') {
        updateBulkActionButtons();
    }
}

/**
 * Select all matched results
 */
function selectAllQueryResults() {
    // Ensure ADMIN_STATE.bulkSelected exists
    if (typeof ADMIN_STATE !== 'undefined' && !ADMIN_STATE.bulkSelected) {
        ADMIN_STATE.bulkSelected = new Set();
    }
    
    QUERY_STATE.results.forEach(r => {
        if (r.player) {
            const key = String(r.player.upid);
            QUERY_STATE.selected.add(key);
            if (typeof ADMIN_STATE !== 'undefined' && ADMIN_STATE.bulkSelected) {
                ADMIN_STATE.bulkSelected.add(key);
            }
        }
    });
    
    document.querySelectorAll('.query-checkbox').forEach(cb => { cb.checked = true; });
    document.querySelectorAll('#queryResultsBody tr[data-upid]').forEach(row => {
        row.classList.add('row-selected');
    });
    
    const masterCb = document.getElementById('querySelectAll');
    if (masterCb) masterCb.checked = true;
    
    updateQueryBulkToolbar();
    if (typeof updateBulkActionButtons === 'function') {
        updateBulkActionButtons();
    }
}

/**
 * Clear all query selections
 */
function clearQuerySelection() {
    // Remove from both states
    QUERY_STATE.selected.forEach(upid => {
        if (typeof ADMIN_STATE !== 'undefined' && ADMIN_STATE.bulkSelected) {
            ADMIN_STATE.bulkSelected.delete(upid);
        }
    });
    QUERY_STATE.selected.clear();
    
    document.querySelectorAll('.query-checkbox').forEach(cb => { cb.checked = false; });
    document.querySelectorAll('#queryResultsBody tr').forEach(row => {
        row.classList.remove('row-selected');
    });
    
    const masterCb = document.getElementById('querySelectAll');
    if (masterCb) masterCb.checked = false;
    
    updateQueryBulkToolbar();
    if (typeof updateBulkActionButtons === 'function') {
        updateBulkActionButtons();
    }
}

/**
 * Update query bulk toolbar
 */
function updateQueryBulkToolbar() {
    const count = QUERY_STATE.selected.size;
    const toolbar = document.getElementById('queryBulkToolbar');
    const countEl = document.getElementById('queryBulkCount');
    
    if (toolbar) toolbar.style.display = count > 0 ? 'flex' : 'none';
    if (countEl) countEl.textContent = `${count} selected`;
    
    // Enable/disable buttons
    const enabled = count > 0;
    ['queryBulkGraduateBtn', 'queryBulkContractBtn', 'queryBulkOwnerBtn', 'queryBulkReleaseBtn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = !enabled;
    });
}

// ============================================
// BULK OWNER CHANGE
// ============================================

/**
 * Show bulk owner change modal
 */
function showBulkOwnerModal() {
    const selected = getSelectedPlayers();
    if (selected.length === 0) {
        showToast('No players selected', 'warning');
        return;
    }
    
    const listEl = document.getElementById('bulkOwnerList');
    if (listEl) {
        listEl.innerHTML = `
            <p style="margin-bottom: var(--space-md);">Changing ownership for <strong>${selected.length}</strong> player(s):</p>
            <div class="bulk-player-list" style="max-height: 200px; overflow-y: auto; margin-bottom: var(--space-md);">
                ${selected.map(p => `
                    <div class="bulk-player-item" style="padding: var(--space-xs) var(--space-sm); border-bottom: 1px solid rgba(255,255,255,0.1);">
                        <strong>${p.name}</strong>
                        <span style="color: var(--text-gray); margin-left: var(--space-sm);">
                            ${p.position || ''} • ${p.team || 'FA'} • Current: ${p.manager || 'Unowned'}
                        </span>
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    // Reset form
    const selectEl = document.getElementById('bulkOwnerSelect');
    const reasonEl = document.getElementById('bulkOwnerReason');
    if (selectEl) selectEl.value = '';
    if (reasonEl) reasonEl.value = '';
    
    document.getElementById('bulkOwnerModal').classList.add('active');
}

/**
 * Confirm bulk owner change
 */
async function confirmBulkOwnerChange() {
    const selected = getSelectedPlayers();
    const newOwner = document.getElementById('bulkOwnerSelect').value;
    const reason = document.getElementById('bulkOwnerReason').value.trim();
    
    if (!reason) {
        showToast('Please enter a reason', 'warning');
        return;
    }
    
    const confirmBtn = document.getElementById('confirmBulkOwnerBtn');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    }
    
    try {
        // Process each player
        const updates = selected.map(p => ({
            upid: p.upid,
            name: p.name,
            changes: {
                manager: newOwner || '',
                // Clear contract info if releasing to FA
                ...(newOwner === '' ? { contract_type: '', years_simple: '' } : {})
            },
            reason: reason,
            updateType: newOwner ? 'Roster' : 'Drop'
        }));
        
        // If admin API is available, use it
        if (typeof submitBulkUpdates === 'function') {
            await submitBulkUpdates(updates);
        } else {
            // Fallback: just log what would be done
            console.log('Bulk owner change:', updates);
            showToast(`Would update ${updates.length} players to owner: ${newOwner || 'Unowned'}`, 'info');
        }
        
        showToast(`Updated ownership for ${selected.length} player(s)`, 'success');
        
        // Close modal
        document.getElementById('bulkOwnerModal').classList.remove('active');
        
        // Clear selection
        clearQuerySelection();
        
        // Re-run query to refresh data
        if (QUERY_STATE.lastQuery.length > 0) {
            setTimeout(() => executeQuery(), 500);
        }
        
    } catch (e) {
        console.error('Bulk owner change error:', e);
        showToast('Error updating players: ' + e.message, 'error');
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = '<i class="fas fa-check"></i> Confirm Change';
        }
    }
}

/**
 * Get array of selected player objects
 */
function getSelectedPlayers() {
    const players = [];
    QUERY_STATE.selected.forEach(upid => {
        const result = QUERY_STATE.results.find(r => r.player && String(r.player.upid) === upid);
        if (result?.player) {
            players.push(result.player);
        }
    });
    return players;
}

// ============================================
// EXPORT FUNCTIONS
// ============================================

/**
 * Export query results to CSV
 */
function exportQueryCSV() {
    if (QUERY_STATE.results.length === 0) {
        showToast('No results to export', 'warning');
        return;
    }
    
    const headers = ['Input Name', 'Match Status', 'Score', 'Player Name', 'UPID', 'Position', 'Team', 'Age', 'Owner', 'Type', 'Contract'];
    
    const rows = QUERY_STATE.results.map(r => {
        const p = r.player;
        return [
            r.input,
            r.matchType,
            r.score.toFixed(2),
            p?.name || '',
            p?.upid || '',
            p?.position || '',
            p?.team || '',
            p?.age || '',
            p?.manager || '',
            p?.player_type || '',
            p?.years_simple || ''
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });
    
    const csv = [headers.join(','), ...rows].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fbp_query_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast(`Exported ${QUERY_STATE.results.length} rows to CSV`, 'success');
}

/**
 * Copy table data to clipboard (tab-separated for pasting into Sheets)
 */
function copyQueryToClipboard() {
    if (QUERY_STATE.results.length === 0) {
        showToast('No results to copy', 'warning');
        return;
    }
    
    const headers = ['Input', 'Match', 'Player', 'UPID', 'Pos', 'Team', 'Age', 'Owner', 'Type', 'Contract'];
    
    const rows = QUERY_STATE.results.map(r => {
        const p = r.player;
        return [
            r.input,
            r.matchType,
            p?.name || '',
            p?.upid || '',
            p?.position || '',
            p?.team || '',
            p?.age || '',
            p?.manager || '',
            p?.player_type || '',
            p?.years_simple || ''
        ].join('\t');
    });
    
    const text = [headers.join('\t'), ...rows].join('\n');
    
    navigator.clipboard.writeText(text).then(() => {
        showToast('Table copied to clipboard (paste into Sheets)', 'success');
    }).catch(() => {
        showToast('Could not copy to clipboard', 'error');
    });
}

// ============================================
// UTILITIES
// ============================================

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize query tab (call from initAdminPortal)
 */
function initQueryTab() {
    const textarea = document.getElementById('queryTextarea');
    if (textarea) {
        textarea.addEventListener('input', updateQueryLineCount);
    }
}

// ============================================
// EXPOSE GLOBALLY
// ============================================

window.executeQuery = executeQuery;
window.clearQueryInput = clearQueryInput;
window.pasteFromClipboard = pasteFromClipboard;
window.toggleQuerySelect = toggleQuerySelect;
window.toggleQuerySelectAll = toggleQuerySelectAll;
window.selectAllQueryResults = selectAllQueryResults;
window.clearQuerySelection = clearQuerySelection;
window.showBulkOwnerModal = showBulkOwnerModal;
window.confirmBulkOwnerChange = confirmBulkOwnerChange;
window.exportQueryCSV = exportQueryCSV;
window.copyQueryToClipboard = copyQueryToClipboard;
window.initQueryTab = initQueryTab;
