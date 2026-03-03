/**
 * FBP Hub - UPID Database Admin Tools
 * 
 * Provides:
 * - Alt-names tag UI for the Edit Player tab
 * - UPID Database tab (search, CRUD, approved dupes, inline editing, merge)
 */

// ---------------------------------------------------------------------------
// Alt-Names helpers (used by Edit Player tab in admin.js)
// ---------------------------------------------------------------------------

/**
 * Load alt_names from UPID API for a given UPID
 */
async function loadUpidAltNames(upid) {
    try {
        const session = typeof authManager !== 'undefined' ? authManager.getSession() : null;
        const token = session?.token;
        if (!token) return;

        const res = await fetch(`${AUTH_CONFIG.workerUrl}/api/upid/search?q=${encodeURIComponent(upid)}`, {
            headers: { 'X-API-Key': token }
        });

        if (!res.ok) return;

        const data = await res.json();
        const results = data.results || [];
        if (results.length > 0) {
            const rec = results[0];
            const altNames = rec.alt_names || [];
            ADMIN_STATE.currentAltNames = [...altNames];
            ADMIN_STATE.originalAltNames = [...altNames];
            renderAltNameTags(altNames);
        }
    } catch (err) {
        console.warn('Failed to load UPID alt names:', err);
    }
}

/**
 * Render alt_names as removable tag chips
 */
function renderAltNameTags(altNames) {
    const container = document.getElementById('altNamesTags');
    if (!container) return;

    if (!altNames || altNames.length === 0) {
        container.innerHTML = '<span style="color: var(--text-gray); font-size: var(--text-sm);">No alternate names</span>';
        return;
    }

    container.innerHTML = altNames.map((name, idx) => `
        <span class="alt-name-tag">
            ${name}
            <button type="button" class="alt-name-remove" onclick="removeAltName(${idx})" title="Remove">
                <i class="fas fa-times"></i>
            </button>
        </span>
    `).join('');
}

/**
 * Add a new alternate name
 */
function addAltName() {
    const input = document.getElementById('altNameInput');
    if (!input) return;

    const name = input.value.trim();
    if (!name) return;

    if (!ADMIN_STATE.currentAltNames) {
        ADMIN_STATE.currentAltNames = [];
    }

    if (ADMIN_STATE.currentAltNames.some(n => n.toLowerCase() === name.toLowerCase())) {
        showToast('That alternate name already exists', 'warning');
        return;
    }

    ADMIN_STATE.currentAltNames.push(name);
    renderAltNameTags(ADMIN_STATE.currentAltNames);
    input.value = '';
}

/**
 * Remove an alternate name by index
 */
function removeAltName(idx) {
    if (!ADMIN_STATE.currentAltNames) return;
    ADMIN_STATE.currentAltNames.splice(idx, 1);
    renderAltNameTags(ADMIN_STATE.currentAltNames);
}

/**
 * Save alt_names to UPID API
 */
async function saveUpidAltNames(upid, altNames, token) {
    const res = await fetch(`${AUTH_CONFIG.workerUrl}/api/upid/${encodeURIComponent(upid)}/alt-names`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': token,
        },
        body: JSON.stringify({
            alt_names: altNames,
            admin: ADMIN_STATE.adminUser || 'unknown',
        }),
    });

    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Status ${res.status}`);
    }

    return await res.json();
}


// ---------------------------------------------------------------------------
// Helper: get auth token
// ---------------------------------------------------------------------------
function _getToken() {
    const session = typeof authManager !== 'undefined' ? authManager.getSession() : null;
    return session?.token || null;
}

function _getAdmin() {
    return (typeof ADMIN_STATE !== 'undefined' && ADMIN_STATE.adminUser) || 'unknown';
}


// ---------------------------------------------------------------------------
// UPID Database Tab - Search
// ---------------------------------------------------------------------------

async function executeUpidSearch() {
    const input = document.getElementById('upidSearchInput');
    const dupesOnly = document.getElementById('upidDupesOnly')?.checked || false;
    const query = (input?.value || '').trim();

    if (!query) {
        showToast('Enter a name or UPID to search', 'warning');
        return;
    }

    const token = _getToken();
    if (!token) {
        showToast('Session expired. Please log in again.', 'error');
        return;
    }

    const resultsEl = document.getElementById('upidResults');
    const countEl = document.getElementById('upidResultsCount');
    resultsEl.innerHTML = '<div style="text-align:center; padding: var(--space-lg);"><i class="fas fa-spinner fa-spin"></i> Searching...</div>';

    try {
        const params = new URLSearchParams({ q: query });
        if (dupesOnly) params.set('dupes_only', 'true');

        const res = await fetch(`${AUTH_CONFIG.workerUrl}/api/upid/search?${params}`, {
            headers: { 'X-API-Key': token }
        });

        if (!res.ok) {
            throw new Error(`Status ${res.status}`);
        }

        const data = await res.json();
        const results = data.results || [];
        countEl.textContent = `${results.length} record${results.length !== 1 ? 's' : ''} found`;

        if (results.length === 0) {
            resultsEl.innerHTML = '<div style="text-align:center; padding: var(--space-lg); color: var(--text-gray);">No UPID records found</div>';
            return;
        }

        resultsEl.innerHTML = results.map(rec => renderUpidCard(rec)).join('');
    } catch (err) {
        console.error('UPID search failed:', err);
        resultsEl.innerHTML = `<div style="color: var(--danger); padding: var(--space-md);">Search failed: ${err.message}</div>`;
    }
}


// ---------------------------------------------------------------------------
// UPID Card Rendering
// ---------------------------------------------------------------------------

function renderUpidCard(rec) {
    const upid = rec.upid || '?';
    const name = rec.name || 'Unknown';
    const team = rec.team || 'N/A';
    const pos = rec.pos || 'N/A';
    const altNames = rec.alt_names || [];
    const isDupe = (rec.approved_dupes || '').toUpperCase() === 'TRUE';

    const altBadge = altNames.length > 0 
        ? `<span class="upid-badge alt-badge">${altNames.length} alt name${altNames.length > 1 ? 's' : ''}</span>`
        : '';
    const dupeBadge = isDupe 
        ? '<span class="upid-badge dupe-badge">Approved Dupe</span>'
        : '';

    // Escape single quotes for onclick attributes
    const eName = name.replace(/'/g, "\\'");
    const eTeam = team.replace(/'/g, "\\'");
    const ePos = pos.replace(/'/g, "\\'");

    return `
        <div class="upid-card" id="upid-card-${upid}">
            <div class="upid-card-header" onclick="toggleUpidDetail('${upid}')">
                <div class="upid-card-main">
                    <span class="upid-id">#${upid}</span>
                    <strong class="upid-name" id="upid-name-display-${upid}">${name}</strong>
                    <span class="upid-meta" id="upid-meta-display-${upid}">${team} · ${pos}</span>
                    ${altBadge}${dupeBadge}
                </div>
                <i class="fas fa-chevron-down upid-expand-icon" id="upid-icon-${upid}"></i>
            </div>
            <div class="upid-card-detail" id="upid-detail-${upid}" style="display: none;">
                <div class="upid-detail-section">
                    <h5>Alternate Names</h5>
                    <div class="upid-alt-tags" id="upid-alt-tags-${upid}">
                        ${altNames.map((n, i) => `
                            <span class="alt-name-tag">
                                ${n}
                                <button type="button" class="alt-name-remove" onclick="removeUpidAltName('${upid}', ${i})" title="Remove">
                                    <i class="fas fa-times"></i>
                                </button>
                            </span>
                        `).join('') || '<span style="color: var(--text-gray);">None</span>'}
                    </div>
                    <div class="upid-alt-add">
                        <input type="text" id="upid-alt-input-${upid}" class="form-input" placeholder="Add alternate name..." style="flex:1;">
                        <button class="btn-sm btn-secondary" onclick="addUpidAltNameInline('${upid}')">
                            <i class="fas fa-plus"></i> Add
                        </button>
                    </div>
                </div>
                <div class="upid-detail-section">
                    <h5>Approved Duplicate</h5>
                    <label class="checkbox-label">
                        <input type="checkbox" ${isDupe ? 'checked' : ''} onchange="toggleUpidApprovedDupe('${upid}', this.checked)">
                        <span>Mark as approved duplicate</span>
                    </label>
                </div>
                <div class="upid-card-actions" id="upid-actions-${upid}">
                    <button class="btn-sm btn-secondary" onclick="startUpidEdit('${upid}', '${eName}', '${eTeam}', '${ePos}')">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="btn-sm btn-warning" onclick="startUpidMerge('${upid}', '${eName}')">
                        <i class="fas fa-compress-arrows-alt"></i> Merge
                    </button>
                    <button class="btn-sm btn-danger" onclick="confirmUpidDelete('${upid}', '${eName}')">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
                <!-- Inline edit form (hidden) -->
                <div class="upid-edit-form" id="upid-edit-form-${upid}" style="display: none;">
                    <h5>Edit Record</h5>
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Name</label>
                            <input type="text" id="upid-edit-name-${upid}" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Team</label>
                            <input type="text" id="upid-edit-team-${upid}" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Position</label>
                            <input type="text" id="upid-edit-pos-${upid}" class="form-input">
                        </div>
                    </div>
                    <div class="upid-edit-actions">
                        <button class="btn-sm btn-secondary" onclick="cancelUpidEdit('${upid}')">
                            <i class="fas fa-times"></i> Cancel
                        </button>
                        <button class="btn-sm btn-primary" onclick="saveUpidEdit('${upid}')">
                            <i class="fas fa-save"></i> Save
                        </button>
                    </div>
                </div>
                <!-- Inline merge form (hidden) -->
                <div class="upid-merge-search" id="upid-merge-form-${upid}" style="display: none;">
                    <h5>Merge Into Another Record</h5>
                    <p style="font-size: var(--text-sm); color: var(--text-gray); margin-bottom: var(--space-sm);">
                        This record's name and alt-names will be added to the target. This record will be deleted.
                    </p>
                    <div class="upid-merge-input-row">
                        <input type="text" id="upid-merge-input-${upid}" class="form-input" placeholder="Search target by name or UPID...">
                        <button class="btn-sm btn-primary" onclick="searchUpidMergeTarget('${upid}')">
                            <i class="fas fa-search"></i>
                        </button>
                    </div>
                    <div class="upid-merge-results" id="upid-merge-results-${upid}"></div>
                    <div class="upid-edit-actions">
                        <button class="btn-sm btn-secondary" onclick="cancelUpidMerge('${upid}')">
                            <i class="fas fa-times"></i> Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}


// ---------------------------------------------------------------------------
// Toggle detail expand/collapse
// ---------------------------------------------------------------------------

function toggleUpidDetail(upid) {
    const detail = document.getElementById(`upid-detail-${upid}`);
    const icon = document.getElementById(`upid-icon-${upid}`);
    if (!detail) return;

    const isVisible = detail.style.display !== 'none';
    detail.style.display = isVisible ? 'none' : 'block';
    if (icon) {
        icon.classList.toggle('fa-chevron-down', isVisible);
        icon.classList.toggle('fa-chevron-up', !isVisible);
    }
}


// ---------------------------------------------------------------------------
// Inline Alt-Name editing (UPID tab cards)
// ---------------------------------------------------------------------------

async function addUpidAltNameInline(upid) {
    const input = document.getElementById(`upid-alt-input-${upid}`);
    if (!input) return;

    const name = input.value.trim();
    if (!name) return;

    const token = _getToken();
    if (!token) { showToast('Session expired', 'error'); return; }

    try {
        const searchRes = await fetch(`${AUTH_CONFIG.workerUrl}/api/upid/search?q=${encodeURIComponent(upid)}`, {
            headers: { 'X-API-Key': token }
        });
        const searchData = await searchRes.json();
        const rec = (searchData.results || [])[0];
        if (!rec) { showToast('UPID not found', 'error'); return; }

        const current = rec.alt_names || [];
        if (current.some(n => n.toLowerCase() === name.toLowerCase())) {
            showToast('Name already exists', 'warning');
            return;
        }

        const updated = [...current, name];
        await saveUpidAltNames(upid, updated, token);

        _renderInlineAltTags(upid, updated);
        input.value = '';
        showToast(`Alt name "${name}" added`, 'success');
    } catch (err) {
        showToast('Failed to add alt name: ' + err.message, 'error');
    }
}

async function removeUpidAltName(upid, idx) {
    const token = _getToken();
    if (!token) { showToast('Session expired', 'error'); return; }

    try {
        const searchRes = await fetch(`${AUTH_CONFIG.workerUrl}/api/upid/search?q=${encodeURIComponent(upid)}`, {
            headers: { 'X-API-Key': token }
        });
        const searchData = await searchRes.json();
        const rec = (searchData.results || [])[0];
        if (!rec) return;

        const current = [...(rec.alt_names || [])];
        const removed = current.splice(idx, 1)[0];
        await saveUpidAltNames(upid, current, token);

        _renderInlineAltTags(upid, current);
        showToast(`Alt name "${removed}" removed`, 'success');
    } catch (err) {
        showToast('Failed to remove alt name: ' + err.message, 'error');
    }
}

function _renderInlineAltTags(upid, altNames) {
    const tagsEl = document.getElementById(`upid-alt-tags-${upid}`);
    if (!tagsEl) return;
    tagsEl.innerHTML = altNames.length > 0
        ? altNames.map((n, i) => `
            <span class="alt-name-tag">${n}
                <button type="button" class="alt-name-remove" onclick="removeUpidAltName('${upid}', ${i})" title="Remove">
                    <i class="fas fa-times"></i>
                </button>
            </span>
        `).join('')
        : '<span style="color: var(--text-gray);">None</span>';
}


// ---------------------------------------------------------------------------
// Approved Dupes toggle
// ---------------------------------------------------------------------------

async function toggleUpidApprovedDupe(upid, isChecked) {
    const token = _getToken();
    if (!token) { showToast('Session expired', 'error'); return; }

    try {
        const res = await fetch(`${AUTH_CONFIG.workerUrl}/api/upid/${encodeURIComponent(upid)}/approved-dupes`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': token,
            },
            body: JSON.stringify({
                approved_dupes: isChecked ? 'TRUE' : 'FALSE',
                admin: _getAdmin(),
            }),
        });

        if (!res.ok) throw new Error(`Status ${res.status}`);

        showToast(`UPID ${upid}: approved_dupes = ${isChecked ? 'TRUE' : 'FALSE'}`, 'success');
    } catch (err) {
        showToast('Failed to update approved_dupes: ' + err.message, 'error');
    }
}


// ---------------------------------------------------------------------------
// Add UPID Record
// ---------------------------------------------------------------------------

function toggleUpidAddForm() {
    const form = document.getElementById('upidAddForm');
    if (!form) return;
    const visible = form.style.display !== 'none';
    form.style.display = visible ? 'none' : 'block';
    if (!visible) {
        document.getElementById('upidAddName').value = '';
        document.getElementById('upidAddTeam').value = '';
        document.getElementById('upidAddPos').value = '';
        document.getElementById('upidAddName').focus();
    }
}

async function createUpidRecord() {
    const name = (document.getElementById('upidAddName')?.value || '').trim();
    const team = (document.getElementById('upidAddTeam')?.value || '').trim();
    const pos = (document.getElementById('upidAddPos')?.value || '').trim();

    if (!name) {
        showToast('Name is required', 'warning');
        return;
    }

    const token = _getToken();
    if (!token) { showToast('Session expired', 'error'); return; }

    try {
        const res = await fetch(`${AUTH_CONFIG.workerUrl}/api/upid`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': token,
            },
            body: JSON.stringify({ name, team, pos, admin: _getAdmin() }),
        });

        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.detail || `Status ${res.status}`);
        }

        const data = await res.json();
        showToast(`Created UPID #${data.upid}: ${name}`, 'success');
        toggleUpidAddForm();

        // Add the new card to results
        const resultsEl = document.getElementById('upidResults');
        if (resultsEl && data.record) {
            resultsEl.insertAdjacentHTML('afterbegin', renderUpidCard(data.record));
        }
    } catch (err) {
        showToast('Failed to create UPID: ' + err.message, 'error');
    }
}


// ---------------------------------------------------------------------------
// Edit UPID Record (inline)
// ---------------------------------------------------------------------------

function startUpidEdit(upid, name, team, pos) {
    const form = document.getElementById(`upid-edit-form-${upid}`);
    const actions = document.getElementById(`upid-actions-${upid}`);
    if (!form) return;

    document.getElementById(`upid-edit-name-${upid}`).value = name;
    document.getElementById(`upid-edit-team-${upid}`).value = team;
    document.getElementById(`upid-edit-pos-${upid}`).value = pos;
    form.style.display = 'block';
    if (actions) actions.style.display = 'none';

    // Hide merge form if open
    const mergeForm = document.getElementById(`upid-merge-form-${upid}`);
    if (mergeForm) mergeForm.style.display = 'none';
}

function cancelUpidEdit(upid) {
    const form = document.getElementById(`upid-edit-form-${upid}`);
    const actions = document.getElementById(`upid-actions-${upid}`);
    if (form) form.style.display = 'none';
    if (actions) actions.style.display = '';
}

async function saveUpidEdit(upid) {
    const name = (document.getElementById(`upid-edit-name-${upid}`)?.value || '').trim();
    const team = (document.getElementById(`upid-edit-team-${upid}`)?.value || '').trim();
    const pos = (document.getElementById(`upid-edit-pos-${upid}`)?.value || '').trim();

    if (!name) {
        showToast('Name is required', 'warning');
        return;
    }

    const token = _getToken();
    if (!token) { showToast('Session expired', 'error'); return; }

    try {
        const res = await fetch(`${AUTH_CONFIG.workerUrl}/api/upid/${encodeURIComponent(upid)}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': token,
            },
            body: JSON.stringify({
                changes: { name, team, pos },
                admin: _getAdmin(),
            }),
        });

        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.detail || `Status ${res.status}`);
        }

        showToast(`UPID #${upid} updated`, 'success');

        // Update card header display
        const nameEl = document.getElementById(`upid-name-display-${upid}`);
        const metaEl = document.getElementById(`upid-meta-display-${upid}`);
        if (nameEl) nameEl.textContent = name;
        if (metaEl) metaEl.textContent = `${team || 'N/A'} · ${pos || 'N/A'}`;

        cancelUpidEdit(upid);
    } catch (err) {
        showToast('Failed to save: ' + err.message, 'error');
    }
}


// ---------------------------------------------------------------------------
// Delete UPID Record
// ---------------------------------------------------------------------------

async function confirmUpidDelete(upid, name) {
    if (!confirm(`Delete UPID #${upid} (${name})?\n\nThis cannot be undone.`)) return;

    const token = _getToken();
    if (!token) { showToast('Session expired', 'error'); return; }

    try {
        const res = await fetch(`${AUTH_CONFIG.workerUrl}/api/upid/${encodeURIComponent(upid)}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': token,
            },
            body: JSON.stringify({ admin: _getAdmin() }),
        });

        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.detail || `Status ${res.status}`);
        }

        showToast(`UPID #${upid} (${name}) deleted`, 'success');

        // Remove card from DOM
        const card = document.getElementById(`upid-card-${upid}`);
        if (card) card.remove();
    } catch (err) {
        showToast('Failed to delete: ' + err.message, 'error');
    }
}


// ---------------------------------------------------------------------------
// Merge UPID Records
// ---------------------------------------------------------------------------

function startUpidMerge(upid, name) {
    const form = document.getElementById(`upid-merge-form-${upid}`);
    const actions = document.getElementById(`upid-actions-${upid}`);
    if (!form) return;

    form.style.display = 'block';
    if (actions) actions.style.display = 'none';

    // Hide edit form if open
    const editForm = document.getElementById(`upid-edit-form-${upid}`);
    if (editForm) editForm.style.display = 'none';

    // Clear previous search
    const input = document.getElementById(`upid-merge-input-${upid}`);
    const results = document.getElementById(`upid-merge-results-${upid}`);
    if (input) { input.value = ''; input.focus(); }
    if (results) results.innerHTML = '';
}

function cancelUpidMerge(upid) {
    const form = document.getElementById(`upid-merge-form-${upid}`);
    const actions = document.getElementById(`upid-actions-${upid}`);
    if (form) form.style.display = 'none';
    if (actions) actions.style.display = '';
}

async function searchUpidMergeTarget(sourceUpid) {
    const input = document.getElementById(`upid-merge-input-${sourceUpid}`);
    const resultsEl = document.getElementById(`upid-merge-results-${sourceUpid}`);
    const query = (input?.value || '').trim();

    if (!query) {
        showToast('Enter a name or UPID to search', 'warning');
        return;
    }

    const token = _getToken();
    if (!token) { showToast('Session expired', 'error'); return; }

    resultsEl.innerHTML = '<div style="padding: var(--space-sm); color: var(--text-gray);"><i class="fas fa-spinner fa-spin"></i> Searching...</div>';

    try {
        const res = await fetch(`${AUTH_CONFIG.workerUrl}/api/upid/search?q=${encodeURIComponent(query)}`, {
            headers: { 'X-API-Key': token }
        });
        const data = await res.json();
        const results = (data.results || []).filter(r => String(r.upid) !== String(sourceUpid));

        if (results.length === 0) {
            resultsEl.innerHTML = '<div style="padding: var(--space-sm); color: var(--text-gray);">No matching records (excluding self)</div>';
            return;
        }

        resultsEl.innerHTML = results.map(rec => `
            <div class="upid-merge-target" onclick="executeUpidMerge('${sourceUpid}', '${rec.upid}', '${(rec.name || '').replace(/'/g, "\\'")}')">
                <span class="upid-id">#${rec.upid}</span>
                <strong>${rec.name || 'Unknown'}</strong>
                <span class="upid-meta">${rec.team || 'N/A'} · ${rec.pos || 'N/A'}</span>
            </div>
        `).join('');
    } catch (err) {
        resultsEl.innerHTML = `<div style="color: var(--danger);">Search failed: ${err.message}</div>`;
    }
}

async function executeUpidMerge(sourceUpid, targetUpid, targetName) {
    if (!confirm(`Merge UPID #${sourceUpid} INTO #${targetUpid} (${targetName})?\n\nSource record will be deleted. Its names will become alt-names on the target.`)) return;

    const token = _getToken();
    if (!token) { showToast('Session expired', 'error'); return; }

    try {
        const res = await fetch(`${AUTH_CONFIG.workerUrl}/api/upid/merge`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': token,
            },
            body: JSON.stringify({
                source_upid: sourceUpid,
                target_upid: targetUpid,
                admin: _getAdmin(),
            }),
        });

        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.detail || `Status ${res.status}`);
        }

        showToast(`Merged UPID #${sourceUpid} → #${targetUpid}`, 'success');

        // Remove source card
        const sourceCard = document.getElementById(`upid-card-${sourceUpid}`);
        if (sourceCard) sourceCard.remove();

        // Refresh target card if visible
        const targetCard = document.getElementById(`upid-card-${targetUpid}`);
        if (targetCard) {
            const searchRes = await fetch(`${AUTH_CONFIG.workerUrl}/api/upid/search?q=${encodeURIComponent(targetUpid)}`, {
                headers: { 'X-API-Key': token }
            });
            const searchData = await searchRes.json();
            const updatedRec = (searchData.results || [])[0];
            if (updatedRec) {
                targetCard.outerHTML = renderUpidCard(updatedRec);
            }
        }
    } catch (err) {
        showToast('Merge failed: ' + err.message, 'error');
    }
}


// ---------------------------------------------------------------------------
// Enter key support
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('upidSearchInput');
    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                executeUpidSearch();
            }
        });
    }

    const altInput = document.getElementById('altNameInput');
    if (altInput) {
        altInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addAltName();
            }
        });
    }
});
