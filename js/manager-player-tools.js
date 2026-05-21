/**
 * FBP Hub - Manager Player Tools
 * Shared Add/Edit player modal flows for manager-facing pages.
 */

(function () {
    const UPPERCASE_FIELDS = new Set(['team', 'position', 'bats', 'throws', 'mlb_primary_position']);
    const NUMERIC_FIELDS = new Set(['age', 'mlb_id', 'weight']);
    const DATE_FIELDS = new Set(['birth_date', 'debut_date']);

    const EDIT_FIELD_CONFIG = [
        { field: 'name', label: 'Name', type: 'text', required: true },
        { field: 'team', label: 'MLB Team', type: 'text' },
        { field: 'position', label: 'Position', type: 'text' },
        { field: 'mlb_primary_position', label: 'Primary Position', type: 'text' },
        { field: 'age', label: 'Age', type: 'number' },
        { field: 'bats', label: 'Bats', type: 'text' },
        { field: 'throws', label: 'Throws', type: 'text' },
        { field: 'height', label: 'Height', type: 'text' },
        { field: 'weight', label: 'Weight', type: 'number' },
        { field: 'birth_date', label: 'Birth Date', type: 'date' },
        { field: 'debut_date', label: 'Debut Date', type: 'date' },
        { field: 'debuted', label: 'Debuted', type: 'select' },
        { field: 'mlb_id', label: 'MLB ID', type: 'number' },
        { field: 'yahoo_id', label: 'Yahoo ID', type: 'text' },
    ];

    let currentEditPlayerRef = null;
    let currentEditSnapshot = null;
    let activeModalId = null;

    function canManagePlayers() {
        if (typeof authManager === 'undefined' || !authManager.isAuthenticated()) {
            return false;
        }
        const team = authManager.getTeam?.();
        return Boolean(team?.abbreviation);
    }

    function getAuthToken() {
        if (typeof authManager === 'undefined') return null;
        return authManager.getSession?.()?.token || null;
    }

    function showManagerToast(message, type = 'success') {
        if (typeof showProfileToast === 'function') {
            showProfileToast(message, type);
            return;
        }
        if (typeof showToast === 'function') {
            showToast(message);
            return;
        }
        console.log(message);
    }

    function parseAltNames(raw) {
        if (!raw) return [];
        const entries = Array.isArray(raw) ? raw : String(raw).split(/[\n,]+/);
        const result = [];
        const seen = new Set();
        entries.forEach(entry => {
            const value = String(entry || '').trim();
            const key = value.toLowerCase();
            if (!value || seen.has(key)) return;
            seen.add(key);
            result.push(value);
        });
        return result;
    }

    function normalizeForCompare(field, value) {
        if (value === undefined) return null;

        if (NUMERIC_FIELDS.has(field)) {
            if (value === null || value === '') return null;
            const num = Number(value);
            return Number.isFinite(num) ? num : null;
        }

        if (field === 'debuted') {
            if (value === null || value === '' || value === undefined) return null;
            if (typeof value === 'boolean') return value;
            const raw = String(value).trim().toLowerCase();
            if (raw === 'true' || raw === 'yes' || raw === '1') return true;
            if (raw === 'false' || raw === 'no' || raw === '0') return false;
            return null;
        }

        if (DATE_FIELDS.has(field)) {
            const raw = String(value ?? '').trim();
            return raw || null;
        }

        const text = String(value ?? '').trim();
        if (UPPERCASE_FIELDS.has(field)) {
            return text.toUpperCase();
        }
        return text;
    }

    function ensureModals() {
        if (document.getElementById('managerAddPlayerModal') && document.getElementById('managerEditPlayerModal')) {
            return;
        }

        const modalHtml = `
            <div class="manager-player-modal" id="managerAddPlayerModal">
                <div class="manager-player-modal-content">
                    <div class="manager-player-modal-header">
                        <h3>ADD PLAYER REQUEST</h3>
                        <button type="button" class="manager-player-modal-close" data-close-modal="managerAddPlayerModal">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <p class="manager-player-subtle">
                        Requests go to admins for approval in Discord.
                    </p>
                    <form id="managerAddPlayerForm" class="manager-player-form">
                        <div class="manager-player-grid two-col">
                            <label class="manager-player-field">
                                <span>Name *</span>
                                <input type="text" id="managerAddName" required>
                            </label>
                            <label class="manager-player-field">
                                <span>Player Type</span>
                                <select id="managerAddPlayerType">
                                    <option value="Farm">Farm</option>
                                    <option value="MLB">MLB</option>
                                </select>
                            </label>
                            <label class="manager-player-field">
                                <span>Team</span>
                                <input type="text" id="managerAddTeam" placeholder="SD">
                            </label>
                            <label class="manager-player-field">
                                <span>Position</span>
                                <input type="text" id="managerAddPosition" placeholder="SP">
                            </label>
                            <label class="manager-player-field">
                                <span>Primary Position</span>
                                <input type="text" id="managerAddPrimaryPosition" placeholder="P">
                            </label>
                            <label class="manager-player-field">
                                <span>Age</span>
                                <input type="number" id="managerAddAge" min="0">
                            </label>
                            <label class="manager-player-field">
                                <span>Bats</span>
                                <input type="text" id="managerAddBats" placeholder="R">
                            </label>
                            <label class="manager-player-field">
                                <span>Throws</span>
                                <input type="text" id="managerAddThrows" placeholder="R">
                            </label>
                            <label class="manager-player-field">
                                <span>Height</span>
                                <input type="text" id="managerAddHeight" placeholder="6' 2&quot;">
                            </label>
                            <label class="manager-player-field">
                                <span>Weight</span>
                                <input type="number" id="managerAddWeight" min="0">
                            </label>
                            <label class="manager-player-field">
                                <span>Birth Date</span>
                                <input type="date" id="managerAddBirthDate">
                            </label>
                            <label class="manager-player-field">
                                <span>Debut Date</span>
                                <input type="date" id="managerAddDebutDate">
                            </label>
                            <label class="manager-player-field">
                                <span>Debuted</span>
                                <select id="managerAddDebuted">
                                    <option value="">Unknown</option>
                                    <option value="true">Yes</option>
                                    <option value="false">No</option>
                                </select>
                            </label>
                            <label class="manager-player-field">
                                <span>MLB ID</span>
                                <input type="number" id="managerAddMlbId" min="0">
                            </label>
                            <label class="manager-player-field">
                                <span>Yahoo ID</span>
                                <input type="text" id="managerAddYahooId">
                            </label>
                            <label class="manager-player-field manager-player-field-full">
                                <span>Proof URL *</span>
                                <input type="url" id="managerAddProofUrl" required placeholder="https://www.baseball-reference.com/...">
                            </label>
                            <label class="manager-player-field manager-player-field-full">
                                <span>Alternate Names (comma or newline separated)</span>
                                <textarea id="managerAddAltNames" rows="3" placeholder="e.g. Bobby Witt Jr., Robert Witt Jr."></textarea>
                            </label>
                        </div>
                        <div class="manager-player-actions">
                            <button type="button" class="btn-secondary" data-close-modal="managerAddPlayerModal">Cancel</button>
                            <button type="submit" class="btn-primary" id="managerAddPlayerSubmit">Submit Request</button>
                        </div>
                    </form>
                </div>
            </div>

            <div class="manager-player-modal" id="managerEditPlayerModal">
                <div class="manager-player-modal-content">
                    <div class="manager-player-modal-header">
                        <h3>EDIT PLAYER</h3>
                        <button type="button" class="manager-player-modal-close" data-close-modal="managerEditPlayerModal">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <p class="manager-player-subtle">
                        Editable fields are limited to player info. Ownership/contract fields are locked.
                    </p>
                    <form id="managerEditPlayerForm" class="manager-player-form">
                        <input type="hidden" id="managerEditUpid">
                        <div class="manager-player-grid two-col">
                            <label class="manager-player-field">
                                <span>Name *</span>
                                <input type="text" id="managerEditName" required>
                            </label>
                            <label class="manager-player-field">
                                <span>Team</span>
                                <input type="text" id="managerEditTeam">
                            </label>
                            <label class="manager-player-field">
                                <span>Position</span>
                                <input type="text" id="managerEditPosition">
                            </label>
                            <label class="manager-player-field">
                                <span>Primary Position</span>
                                <input type="text" id="managerEditPrimaryPosition">
                            </label>
                            <label class="manager-player-field">
                                <span>Age</span>
                                <input type="number" id="managerEditAge" min="0">
                            </label>
                            <label class="manager-player-field">
                                <span>Bats</span>
                                <input type="text" id="managerEditBats">
                            </label>
                            <label class="manager-player-field">
                                <span>Throws</span>
                                <input type="text" id="managerEditThrows">
                            </label>
                            <label class="manager-player-field">
                                <span>Height</span>
                                <input type="text" id="managerEditHeight">
                            </label>
                            <label class="manager-player-field">
                                <span>Weight</span>
                                <input type="number" id="managerEditWeight" min="0">
                            </label>
                            <label class="manager-player-field">
                                <span>Birth Date</span>
                                <input type="date" id="managerEditBirthDate">
                            </label>
                            <label class="manager-player-field">
                                <span>Debut Date</span>
                                <input type="date" id="managerEditDebutDate">
                            </label>
                            <label class="manager-player-field">
                                <span>Debuted</span>
                                <select id="managerEditDebuted">
                                    <option value="">Unknown</option>
                                    <option value="true">Yes</option>
                                    <option value="false">No</option>
                                </select>
                            </label>
                            <label class="manager-player-field">
                                <span>MLB ID</span>
                                <input type="number" id="managerEditMlbId" min="0">
                            </label>
                            <label class="manager-player-field">
                                <span>Yahoo ID</span>
                                <input type="text" id="managerEditYahooId">
                            </label>
                            <label class="manager-player-field manager-player-field-full">
                                <span>Add Alternate Names (comma or newline separated)</span>
                                <textarea id="managerEditAltNamesToAdd" rows="3" placeholder="Only new names are added to UPID"></textarea>
                            </label>
                        </div>
                        <div class="manager-player-actions">
                            <button type="button" class="btn-secondary" data-close-modal="managerEditPlayerModal">Cancel</button>
                            <button type="submit" class="btn-primary" id="managerEditPlayerSubmit">Save Changes</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        document.querySelectorAll('[data-close-modal]').forEach(btn => {
            btn.addEventListener('click', () => {
                const modalId = btn.getAttribute('data-close-modal');
                closeModal(modalId);
            });
        });

        document.querySelectorAll('.manager-player-modal').forEach(modal => {
            modal.addEventListener('click', event => {
                if (event.target === modal) {
                    closeModal(modal.id);
                }
            });
        });

        const addForm = document.getElementById('managerAddPlayerForm');
        if (addForm) {
            addForm.addEventListener('submit', submitAddPlayerRequest);
        }

        const editForm = document.getElementById('managerEditPlayerForm');
        if (editForm) {
            editForm.addEventListener('submit', submitEditPlayer);
        }
    }

    function openModal(modalId) {
        ensureModals();
        const modal = document.getElementById(modalId);
        if (!modal) return;
        modal.classList.add('active');
        activeModalId = modalId;
    }

    function closeModal(modalId) {
        const id = modalId || activeModalId;
        if (!id) return;
        const modal = document.getElementById(id);
        if (!modal) return;
        modal.classList.remove('active');
        if (activeModalId === id) {
            activeModalId = null;
        }
    }

    function fillAddFormDefaults() {
        const addForm = document.getElementById('managerAddPlayerForm');
        if (addForm) addForm.reset();
    }

    function getEditInputValue(field) {
        const map = {
            name: 'managerEditName',
            team: 'managerEditTeam',
            position: 'managerEditPosition',
            mlb_primary_position: 'managerEditPrimaryPosition',
            age: 'managerEditAge',
            bats: 'managerEditBats',
            throws: 'managerEditThrows',
            height: 'managerEditHeight',
            weight: 'managerEditWeight',
            birth_date: 'managerEditBirthDate',
            debut_date: 'managerEditDebutDate',
            debuted: 'managerEditDebuted',
            mlb_id: 'managerEditMlbId',
            yahoo_id: 'managerEditYahooId',
        };
        const input = document.getElementById(map[field]);
        if (!input) return null;

        if (field === 'debuted') {
            const raw = String(input.value || '').trim().toLowerCase();
            if (!raw) return null;
            return raw === 'true';
        }

        if (NUMERIC_FIELDS.has(field)) {
            const raw = String(input.value || '').trim();
            if (!raw) return null;
            const num = Number(raw);
            return Number.isFinite(num) ? num : null;
        }

        if (DATE_FIELDS.has(field)) {
            const raw = String(input.value || '').trim();
            return raw || null;
        }

        let value = String(input.value || '').trim();
        if (UPPERCASE_FIELDS.has(field)) {
            value = value.toUpperCase();
        }
        return value;
    }

    function populateEditForm(player) {
        const set = (id, value) => {
            const input = document.getElementById(id);
            if (!input) return;
            input.value = value ?? '';
        };

        set('managerEditUpid', player.upid || '');
        set('managerEditName', player.name || '');
        set('managerEditTeam', player.team || '');
        set('managerEditPosition', player.position || '');
        set('managerEditPrimaryPosition', player.mlb_primary_position || '');
        set('managerEditAge', player.age ?? '');
        set('managerEditBats', player.bats || '');
        set('managerEditThrows', player.throws || '');
        set('managerEditHeight', player.height || '');
        set('managerEditWeight', player.weight ?? '');
        set('managerEditBirthDate', player.birth_date || '');
        set('managerEditDebutDate', player.debut_date || '');
        set('managerEditMlbId', player.mlb_id ?? '');
        set('managerEditYahooId', player.yahoo_id || '');
        set('managerEditAltNamesToAdd', '');

        const debutedInput = document.getElementById('managerEditDebuted');
        if (debutedInput) {
            if (player.debuted === true) debutedInput.value = 'true';
            else if (player.debuted === false) debutedInput.value = 'false';
            else debutedInput.value = '';
        }
    }

    function buildEditSnapshot(player) {
        const snapshot = {};
        EDIT_FIELD_CONFIG.forEach(cfg => {
            snapshot[cfg.field] = normalizeForCompare(cfg.field, player[cfg.field]);
        });
        return snapshot;
    }

    function openAddPlayerRequestModal() {
        if (!canManagePlayers()) {
            showManagerToast('Please log in as a manager first.', 'error');
            return;
        }
        fillAddFormDefaults();
        openModal('managerAddPlayerModal');
    }

    function openEditPlayerModal(player) {
        if (!canManagePlayers()) {
            showManagerToast('Please log in as a manager first.', 'error');
            return;
        }
        if (!player || !player.upid) {
            showManagerToast('Could not determine player for edit.', 'error');
            return;
        }

        currentEditPlayerRef = player;
        currentEditSnapshot = buildEditSnapshot(player);
        populateEditForm(player);
        openModal('managerEditPlayerModal');
    }

    function buildAddPayloadFromForm() {
        const read = id => String(document.getElementById(id)?.value || '').trim();
        const readInt = id => {
            const raw = read(id);
            if (!raw) return null;
            const num = Number(raw);
            return Number.isFinite(num) ? num : null;
        };

        const debutedRaw = read('managerAddDebuted').toLowerCase();
        const debuted = debutedRaw === 'true' ? true : debutedRaw === 'false' ? false : null;

        const playerData = {
            name: read('managerAddName'),
            player_type: read('managerAddPlayerType') || 'Farm',
            team: read('managerAddTeam').toUpperCase(),
            position: read('managerAddPosition').toUpperCase(),
            mlb_primary_position: read('managerAddPrimaryPosition').toUpperCase(),
            age: readInt('managerAddAge'),
            bats: read('managerAddBats').toUpperCase(),
            throws: read('managerAddThrows').toUpperCase(),
            height: read('managerAddHeight'),
            weight: readInt('managerAddWeight'),
            birth_date: read('managerAddBirthDate') || null,
            debut_date: read('managerAddDebutDate') || null,
            debuted: debuted,
            mlb_id: readInt('managerAddMlbId'),
            yahoo_id: read('managerAddYahooId'),
            proof_url: read('managerAddProofUrl'),
            alt_names: parseAltNames(read('managerAddAltNames')),
        };

        return playerData;
    }

    async function parseErrorResponse(response) {
        let detail = '';
        try {
            const body = await response.json();
            detail = body?.detail || body?.error || '';
        } catch (error) {
            detail = '';
        }
        return detail || `Request failed (${response.status})`;
    }

    async function submitAddPlayerRequest(event) {
        event.preventDefault();

        if (!canManagePlayers()) {
            showManagerToast('Please log in as a manager first.', 'error');
            return;
        }

        const token = getAuthToken();
        if (!token) {
            showManagerToast('Your session has expired. Please log in again.', 'error');
            return;
        }

        const playerData = buildAddPayloadFromForm();
        if (!playerData.name) {
            showManagerToast('Player name is required.', 'error');
            return;
        }
        if (!playerData.proof_url) {
            showManagerToast('Proof URL is required.', 'error');
            return;
        }

        const submitBtn = document.getElementById('managerAddPlayerSubmit');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
        }

        try {
            const response = await fetch(`${AUTH_CONFIG.workerUrl}/api/manager/add-player-request`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ player_data: playerData }),
            });

            if (!response.ok) {
                const detail = await parseErrorResponse(response);
                showManagerToast(detail, 'error');
                return;
            }

            const data = await response.json();
            const requestId = data?.request_id ? ` (${data.request_id})` : '';
            showManagerToast(`Add player request submitted${requestId}.`, 'success');
            closeModal('managerAddPlayerModal');
            fillAddFormDefaults();
        } catch (error) {
            showManagerToast(`Failed to submit request: ${error.message || 'network error'}`, 'error');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Submit Request';
            }
        }
    }

    function buildEditPayloadFromForm() {
        const upid = String(document.getElementById('managerEditUpid')?.value || '').trim();
        const changes = {};

        EDIT_FIELD_CONFIG.forEach(cfg => {
            const nextValue = normalizeForCompare(cfg.field, getEditInputValue(cfg.field));
            const prevValue = currentEditSnapshot ? currentEditSnapshot[cfg.field] : null;
            if (nextValue !== prevValue) {
                changes[cfg.field] = nextValue;
            }
        });

        const altNamesToAdd = parseAltNames(document.getElementById('managerEditAltNamesToAdd')?.value || '');

        return { upid, changes, alt_names_to_add: altNamesToAdd };
    }

    async function submitEditPlayer(event) {
        event.preventDefault();

        if (!canManagePlayers()) {
            showManagerToast('Please log in as a manager first.', 'error');
            return;
        }

        const token = getAuthToken();
        if (!token) {
            showManagerToast('Your session has expired. Please log in again.', 'error');
            return;
        }

        const payload = buildEditPayloadFromForm();
        if (!payload.upid) {
            showManagerToast('Missing UPID for edit.', 'error');
            return;
        }
        if (!Object.keys(payload.changes).length && !payload.alt_names_to_add.length) {
            showManagerToast('No changes to save.', 'warning');
            return;
        }

        const submitBtn = document.getElementById('managerEditPlayerSubmit');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        }

        try {
            const response = await fetch(`${AUTH_CONFIG.workerUrl}/api/manager/player-update`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const detail = await parseErrorResponse(response);
                showManagerToast(detail, 'error');
                return;
            }

            const data = await response.json();
            const updatedPlayer = data?.player || null;

            if (updatedPlayer && currentEditPlayerRef) {
                Object.assign(currentEditPlayerRef, updatedPlayer);
            }

            if (updatedPlayer) {
                window.dispatchEvent(new CustomEvent('manager-player-updated', { detail: { player: updatedPlayer } }));
            }

            showManagerToast('Player updated.', 'success');
            closeModal('managerEditPlayerModal');
        } catch (error) {
            showManagerToast(`Failed to update player: ${error.message || 'network error'}`, 'error');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Save Changes';
            }
        }
    }

    window.ManagerPlayerTools = {
        canManagePlayers,
        openAddPlayerRequestModal,
        openEditPlayerModal,
    };

    window.openManagerAddPlayerModal = openAddPlayerRequestModal;
    window.openManagerEditPlayerModal = openEditPlayerModal;
})();
