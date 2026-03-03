/**
 * FBP Hub - UPID Database Admin Tools
 * 
 * Provides:
 * - Alt-names tag UI for the Edit Player tab
 * - UPID Database tab (search, approved dupes filter, inline editing)
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

    // Prevent duplicates
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
// UPID Database Tab
// ---------------------------------------------------------------------------

/**
 * Execute UPID search from the UPID tab
 */
async function executeUpidSearch() {
    const input = document.getElementById('upidSearchInput');
    const dupesOnly = document.getElementById('upidDupesOnly')?.checked || false;
    const query = (input?.value || '').trim();

    if (!query) {
        showToast('Enter a name or UPID to search', 'warning');
        return;
    }

    const session = typeof authManager !== 'undefined' ? authManager.getSession() : null;
    const token = session?.token;
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

/**
 * Render a single UPID record card
 */
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

    return `
        <div class="upid-card" id="upid-card-${upid}">
            <div class="upid-card-header" onclick="toggleUpidDetail('${upid}')">
                <div class="upid-card-main">
                    <span class="upid-id">#${upid}</span>
                    <strong class="upid-name">${name}</strong>
                    <span class="upid-meta">${team} · ${pos}</span>
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
            </div>
        </div>
    `;
}

/**
 * Toggle detail expand/collapse for a UPID card
 */
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

// Store current alt_names per UPID card for inline editing
const _upidAltNamesCache = {};

/**
 * Add an alternate name inline from the UPID tab
 */
async function addUpidAltNameInline(upid) {
    const input = document.getElementById(`upid-alt-input-${upid}`);
    if (!input) return;

    const name = input.value.trim();
    if (!name) return;

    const session = typeof authManager !== 'undefined' ? authManager.getSession() : null;
    const token = session?.token;
    if (!token) { showToast('Session expired', 'error'); return; }

    // First get current alt_names
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

        // Re-render the tags
        const tagsEl = document.getElementById(`upid-alt-tags-${upid}`);
        if (tagsEl) {
            tagsEl.innerHTML = updated.map((n, i) => `
                <span class="alt-name-tag">${n}
                    <button type="button" class="alt-name-remove" onclick="removeUpidAltName('${upid}', ${i})" title="Remove">
                        <i class="fas fa-times"></i>
                    </button>
                </span>
            `).join('');
        }
        input.value = '';
        showToast(`Alt name "${name}" added`, 'success');
    } catch (err) {
        showToast('Failed to add alt name: ' + err.message, 'error');
    }
}

/**
 * Remove an alternate name from UPID tab inline
 */
async function removeUpidAltName(upid, idx) {
    const session = typeof authManager !== 'undefined' ? authManager.getSession() : null;
    const token = session?.token;
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

        const tagsEl = document.getElementById(`upid-alt-tags-${upid}`);
        if (tagsEl) {
            tagsEl.innerHTML = current.length > 0 
                ? current.map((n, i) => `
                    <span class="alt-name-tag">${n}
                        <button type="button" class="alt-name-remove" onclick="removeUpidAltName('${upid}', ${i})" title="Remove">
                            <i class="fas fa-times"></i>
                        </button>
                    </span>
                `).join('')
                : '<span style="color: var(--text-gray);">None</span>';
        }
        showToast(`Alt name "${removed}" removed`, 'success');
    } catch (err) {
        showToast('Failed to remove alt name: ' + err.message, 'error');
    }
}

/**
 * Toggle approved_dupes flag for a UPID record
 */
async function toggleUpidApprovedDupe(upid, isChecked) {
    const session = typeof authManager !== 'undefined' ? authManager.getSession() : null;
    const token = session?.token;
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
                admin: ADMIN_STATE?.adminUser || 'unknown',
            }),
        });

        if (!res.ok) throw new Error(`Status ${res.status}`);

        showToast(`UPID ${upid}: approved_dupes = ${isChecked ? 'TRUE' : 'FALSE'}`, 'success');
    } catch (err) {
        showToast('Failed to update approved_dupes: ' + err.message, 'error');
    }
}

// ---------------------------------------------------------------------------
// Enter key support for UPID search
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

    // Also support Enter on alt name input in Edit Player
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
