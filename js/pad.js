/**
 * FBP Hub - PAD (Prospect Allocation Day)
 * Multi-step wizard with OAuth integration and submit-only transaction logging
 */

const PAD_SEASON = 2026;

let PAD_STATE = {
    team: null,
    currentStep: 0,
    // Final regular-season rank for 2025 (used to derive PAD bracket)
    final_rank_2025: null,
    // PAD installment based on prior-season bracket (100/120/140)
    installment: 0,
    // Max rollover that can be applied to PAD (capped at $25 and <= rolloverTotal)
    rolloverCapPAD: 0,
    // Total rollover available across installments (capped at $75)
    rolloverTotal: 0,
    // Explicit rollover amount the manager has chosen to add to PAD
    appliedRolloverPAD: 0,
    // Total PAD spending capacity = installment + appliedRolloverPAD
    totalAvailable: 0,
    // 2026: one-time free BC for non-legacy prospects
    freeBCUsed: false,
    
    // Allocations (draft mode - not committed until submit)
    myProspects: [],
    dcSlots: 0,
    bcSlots: [],  // Array of BC slot objects { id, number, cost }
    
    // Submission tracking
    submitted: false,
    submittedAt: null
};

// Cached map of Top 100 ranks by UPID for quick lookup in PAD.
let PAD_TOP100_MAP = null;

/**
 * Initialize PAD page
 */
async function initPADPage() {
    console.log('📅 Initializing PAD page...');
    
    // Check authentication
    if (typeof authManager === 'undefined' || !authManager.isAuthenticated()) {
        document.getElementById('authRequired').style.display = 'flex';
        return;
    }
    
    // Get user's team
    PAD_STATE.team = authManager.getTeam()?.abbreviation;
    if (!PAD_STATE.team) {
        showToast('Could not determine your team', 'error');
        return;
    }
    
    // Check if already submitted
    await checkSubmissionStatus();
    
    if (PAD_STATE.submitted) {
        showSubmittedView();
        return;
    }
    
    // Load PAD data
    await loadPADData();
    
    // Show PAD content
    document.getElementById('padContent').style.display = 'block';
    
    // Initialize displays
    updateWizBucksDisplay();
    displayProspects();
    displayBCSlots();
    
    // Setup sticky bar scroll behavior
    setupStickyBar();

    // Make progress steps clickable
    document.querySelectorAll('.progress-step').forEach(stepEl => {
        stepEl.addEventListener('click', () => {
            const stepIndex = parseInt(stepEl.dataset.step, 10);
            if (!Number.isNaN(stepIndex)) {
                goToStep(stepIndex);
            }
        });
    });
}

/**
 * Check if team already submitted PAD
 */
async function checkSubmissionStatus() {
    try {
        // In production: fetch from data/pad_submissions.json via API
        const response = await fetch('./data/pad_submissions.json');
        if (response.ok) {
            const submissions = await response.json();
            const teamSubmission = submissions[PAD_STATE.team];
            
            if (teamSubmission) {
                PAD_STATE.submitted = true;
                PAD_STATE.submittedAt = teamSubmission.timestamp;
                return;
            }
        }
    } catch (e) {
        console.log('No submission data found, continuing with form');
    }
}

/**
 * Build prospect list for a given team from combined_players.json
 */
function buildProspectsForTeam(teamAbbr) {
    if (typeof FBPHub === 'undefined' || !FBPHub.data?.players || !teamAbbr) return [];

    return FBPHub.data.players
        .filter(p => p.FBP_Team === teamAbbr && p.player_type === 'Farm')
        .map(p => ({
            upid: p.upid || '',
            name: p.name,
            team: p.team,
            position: p.position,
            age: p.age || null,
            level: p.level || 'Unknown',
            // PAD requirement: prospects should start unassigned in the PAD UI,
            // regardless of any existing contract_type in combined_players.json.
            contract_type: null,
            // Flag legacy DCs so they get special PAD treatment (e.g. free BC option).
            legacy_dc: p.contract_type === 'Development Cont.' || p.contract_type === 'Development Contract',
            top_100_rank: p.top_100_rank || null,
            // Has MLB service time (DC-ineligible). For now, accept either a
            // dedicated flag or a future service_time_days field.
            has_mlb_service: p.has_mlb_service || (p.service_time_days || 0) > 0,
            // Rookie eligibility flag from combined_players (default to true when
            // missing so prospects without MLB stats are treated as rookies).
            mlb_rookie: Object.prototype.hasOwnProperty.call(p, 'MLBRookie') ? !!p.MLBRookie : true
        }));
}

/**
 * Load Top 100 prospect ranks and cache as a UPID → rank map.
 */
async function loadTop100MapForPAD() {
    if (PAD_TOP100_MAP) return PAD_TOP100_MAP;

    try {
        const res = await fetch('./data/top100_prospects.json');
        if (!res.ok) {
            PAD_TOP100_MAP = {};
            return PAD_TOP100_MAP;
        }
        const data = await res.json();
        const map = {};
        data.forEach(p => {
            if (p.upid) {
                map[String(p.upid)] = Number(p.rank) || null;
            }
        });
        PAD_TOP100_MAP = map;
        return PAD_TOP100_MAP;
    } catch (e) {
        console.error('Failed to load Top 100 prospects for PAD:', e);
        PAD_TOP100_MAP = {};
        return PAD_TOP100_MAP;
    }
}

/**
 * Load PAD data for team
 */
async function loadPADData() {
    const team = PAD_STATE.team;

    // Read final 2025 rank from config/managers.json and derive bracket
    let finalRank = null;
    let managerName = null;
    try {
        const res = await fetch('./config/managers.json');
        if (res.ok) {
            const cfg = await res.json();
            const teamCfg = cfg?.teams?.[team];
            if (teamCfg) {
                finalRank = teamCfg.final_rank_2025 ?? null;
                managerName = teamCfg.name || null;
            }
        }
    } catch (e) {
        console.error('Failed to load managers config for PAD:', e);
    }

    if (typeof finalRank === 'number') {
        PAD_STATE.final_rank_2025 = finalRank;
    }

    let bracket;
    if (typeof finalRank === 'number') {
        if (finalRank >= 1 && finalRank <= 4) {
            bracket = 'championship';
        } else if (finalRank >= 5 && finalRank <= 8) {
            bracket = 'consolation';
        } else {
            bracket = 'elimination';
        }
    } else {
        // Fallback if rank is missing: treat as elimination bracket
        bracket = 'elimination';
    }

    let installment;
    if (bracket === 'championship') {
        installment = 100;
    } else if (bracket === 'consolation') {
        installment = 120;
    } else {
        installment = 140;
    }
    PAD_STATE.installment = installment;

    // Determine rollover totals from WizBucks balance
    const wizbucksBalances = FBPHub.data?.wizbucks || {};
    // WizBucks JSON is keyed by franchise name (e.g., "Weekend Warriors"),
    // while PAD_STATE.team is the team abbreviation (e.g., "WAR"). Prefer
    // the manager/franchise name from managers.json when available, but
    // fall back to the abbreviation if the data ever changes.
    let currentWB = 0;
    if (wizbucksBalances[team] != null) {
        currentWB = wizbucksBalances[team];
    } else if (typeof managerName === 'string' && wizbucksBalances[managerName] != null) {
        currentWB = wizbucksBalances[managerName];
    }
    // League rule: max $75 total rollover
    PAD_STATE.rolloverTotal = Math.min(75, currentWB);
    // PAD can use at most $25 of rollover
    PAD_STATE.rolloverCapPAD = Math.min(25, PAD_STATE.rolloverTotal);

    // Total PAD capacity = installment + any rollover the manager explicitly applies
    const savedDraft = localStorage.getItem(`pad_draft_${PAD_STATE.team}_2026`);
    let appliedFromDraft = 0;
    if (savedDraft) {
        try {
            const draft = JSON.parse(savedDraft);
            appliedFromDraft = typeof draft.appliedRolloverPAD === 'number' ? draft.appliedRolloverPAD : 0;
        } catch (e) {
            console.error('Failed to read applied rollover from draft:', e);
        }
    }
    PAD_STATE.appliedRolloverPAD = Math.min(PAD_STATE.rolloverCapPAD, Math.max(0, appliedFromDraft));
    PAD_STATE.totalAvailable = PAD_STATE.installment + PAD_STATE.appliedRolloverPAD;

    // Load team's prospects from combined_players.json
    PAD_STATE.myProspects = buildProspectsForTeam(PAD_STATE.team);

    // If no data loaded for some reason, fall back to mock data (dev only)
    if (!PAD_STATE.myProspects || PAD_STATE.myProspects.length === 0) {
        PAD_STATE.myProspects = getMockProspects();
    }
    
    // Check for saved draft (prospects, slots are still loaded here for backwards-compat)
    const savedDraft2 = localStorage.getItem(`pad_draft_${PAD_STATE.team}_2026`);
    if (savedDraft2) {
        try {
            const draft = JSON.parse(savedDraft2);
            // Only override prospects if the draft actually has some
            PAD_STATE.myProspects = (draft.prospects && draft.prospects.length)
                ? draft.prospects
                : PAD_STATE.myProspects;
            PAD_STATE.dcSlots = draft.dcSlots || 0;
            PAD_STATE.bcSlots = draft.bcSlots || [];
            if (typeof draft.appliedRolloverPAD === 'number') {
                PAD_STATE.appliedRolloverPAD = Math.min(
                    PAD_STATE.rolloverCapPAD,
                    Math.max(0, draft.appliedRolloverPAD)
                );
            }
            console.log('✅ Loaded saved draft');
        } catch (e) {
            console.error('Failed to load draft:', e);
        }
    }

    // Recompute totalAvailable now that applied rollover from draft is known
    PAD_STATE.totalAvailable = PAD_STATE.installment + PAD_STATE.appliedRolloverPAD;

    // Restore free BC flag from draft (if present)
    PAD_STATE.freeBCUsed = PAD_STATE.myProspects?.some(
        p => p.free_bc_special && p.contract_type === 'BC' && !p.legacy_dc
    ) || false;

    // Re-attach Top 100 rank from the latest pipeline data so that even
    // prospects loaded from an old saved draft get current Pipeline rank.
    try {
        const top100Map = await loadTop100MapForPAD();
        PAD_STATE.myProspects = PAD_STATE.myProspects.map(p => ({
            ...p,
            top_100_rank: top100Map[String(p.upid)] ?? p.top_100_rank ?? null
        }));
    } catch (e) {
        console.error('Failed to enrich PAD prospects with Top 100 rank:', e);
    }
}

/**
 * Mock prospects for testing
 */
function getMockProspects() {
    return [
        { upid: '12345', name: 'Leo de Vries', team: 'ATL', position: 'SS', age: 20, level: 'AAA', contract_type: null, has_mlb_service: false },
        { upid: '12346', name: 'Chase Burns', team: 'CIN', position: 'SP', age: 21, level: 'AAA', contract_type: 'BC', top_100_rank: 42, has_mlb_service: false },
        { upid: '12347', name: 'Jett Williams', team: 'NYM', position: '2B', age: 19, level: 'AA', contract_type: 'DC', has_mlb_service: false },
        { upid: '12348', name: 'Bryce Eldridge', team: 'SF', position: '1B', age: 19, level: 'A+', contract_type: 'PC', has_mlb_service: false },
        { upid: '12349', name: 'Dylan Beavers', team: 'BAL', position: 'OF', age: 22, level: 'AAA', contract_type: null, has_mlb_service: true },
        { upid: '12350', name: 'Marcelo Mayer', team: 'BOS', position: 'SS', age: 21, level: 'AAA', contract_type: null, has_mlb_service: false }
    ];
}

/**
 * Setup sticky bar scroll behavior
 */
function setupStickyBar() {
    const stickyBar = document.getElementById('wizBucksStickyBar');
    if (!stickyBar) return;
    
    const observer = new IntersectionObserver(
        ([entry]) => {
            if (!entry.isIntersecting) {
                stickyBar.classList.add('is-stuck');
            } else {
                stickyBar.classList.remove('is-stuck');
            }
        },
        { threshold: [1] }
    );
    
    observer.observe(stickyBar);

    // Initialize rollover meta text once data is loaded
    const metaEl = document.getElementById('rolloverMeta');
    if (metaEl) {
        updateRolloverMeta();
    }
}

/**
 * Navigation between steps
 */
function nextStep() {
    if (PAD_STATE.currentStep < 2) {
        goToStep(PAD_STATE.currentStep + 1);
    }
}

function prevStep() {
    if (PAD_STATE.currentStep > 0) {
        goToStep(PAD_STATE.currentStep - 1);
    }
}

function goToStep(stepIndex) {
    PAD_STATE.currentStep = stepIndex;
    
    // Update step visibility
    document.querySelectorAll('.pad-step').forEach((step, i) => {
        step.classList.toggle('active', i === stepIndex);
    });
    
    // Show prospect status bar only on Step 0
    const statusBar = document.getElementById('prospectStatusBar');
    if (statusBar) {
        statusBar.style.display = stepIndex === 0 ? 'grid' : 'none';
    }
    
    // Update progress indicator
    document.querySelectorAll('.progress-step').forEach((step, i) => {
        step.classList.remove('active', 'completed');
        if (i === stepIndex) step.classList.add('active');
        if (i < stepIndex) step.classList.add('completed');
    });
    
    // Update summary if landing on summary page
    if (stepIndex === 2) {
        updateSummary();
    }
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Auto-save draft
    saveDraft();
}

/**
 * Calculate total spend (draft mode - not yet committed)
 */
function calculateTotalSpend() {
    // 2026 transition: DC/PC/BC are FREE for legacy DC prospects
    const dcCost = PAD_STATE.myProspects.filter(p => 
        p.contract_type === 'DC' && !p.was_upgraded && !p.legacy_dc
    ).length * 5;
    
    const pcCost = PAD_STATE.myProspects.filter(p => 
        p.contract_type === 'PC' && !p.was_bc && !p.legacy_dc
    ).length * 10;
    
    // BC costs:
    // - Legacy DC: FREE in 2026 transition
    // - 2026 one-time free BC: FREE when prospect.free_bc_special
    // - All other BC contracts: $20
    const bcCost = PAD_STATE.myProspects.reduce((sum, p) => {
        if (p.contract_type !== 'BC') return sum;
        if (p.legacy_dc || p.free_bc_special) return sum;
        return sum + 20;
    }, 0);
    
    const dcSlotsCost = PAD_STATE.dcSlots * 5;
    const bcSlotsCost = PAD_STATE.bcSlots.length * 20;
    
    return dcCost + pcCost + bcCost + dcSlotsCost + bcSlotsCost;
}

/**
/**
 * Compute rollover amount that will be sent to KAP
 * - Based on unused PAD pool (installment + applied rollover)
 * - Capped at $30
 */
function computeRolloverToKAP(spentOverride) {
    const spent = typeof spentOverride === 'number' ? spentOverride : calculateTotalSpend();

    const padPool = PAD_STATE.installment + (PAD_STATE.appliedRolloverPAD || 0);
    const padRemaining = Math.max(0, padPool - spent);
    return Math.min(30, padRemaining);
}

/**
 * Update WizBucks display (sticky bar)
 */
function updateWizBucksDisplay() {
    const spent = calculateTotalSpend();
    const totalAvailable = PAD_STATE.installment + (PAD_STATE.appliedRolloverPAD || 0);
    PAD_STATE.totalAvailable = totalAvailable;
    const remaining = totalAvailable - spent;

    const rolloverToKAP = computeRolloverToKAP(spent);

    // Count DC/PC/BC contracts for Contracts display
    const contractsCount = PAD_STATE.myProspects
        ? PAD_STATE.myProspects.filter(p =>
            p.contract_type === 'DC' ||
            p.contract_type === 'PC' ||
            p.contract_type === 'BC'
        ).length
        : 0;

    // Update sticky bar
    document.getElementById('barCurrentSpend').textContent = `$${spent}`;
    document.getElementById('barRemainingBalance').textContent = `$${remaining}`;
    document.getElementById('barRolloverToKAP').textContent = `$${rolloverToKAP}`;
    const contractsEl = document.getElementById('barContractsCount');
    if (contractsEl) {
        contractsEl.textContent = contractsCount;
    }
}

/**
 * Update rollover helper text under the Add Rollover controls
 */
function updateRolloverMeta() {
    const metaEl = document.getElementById('rolloverMeta');
    if (!metaEl) return;

    const cap = PAD_STATE.rolloverCapPAD || 0;
    const applied = PAD_STATE.appliedRolloverPAD || 0;
    if (cap <= 0) {
        metaEl.textContent = 'No rollover available to apply to PAD.';
        return;
    }
    const remaining = Math.max(0, cap - applied);
    metaEl.textContent = `Rollover applied to PAD: $${applied} of $${cap} (max $25). Remaining available to add: $${remaining}.`;
}

/**
 * Update the prospect status bar (Unassigned / DC / PC / BC counts)
 */
function updateProspectStatusBar() {
    if (!PAD_STATE.myProspects || !PAD_STATE.myProspects.length) return;

    const unassigned = PAD_STATE.myProspects.filter(p => !p.contract_type).length;
    const dc = PAD_STATE.myProspects.filter(p => p.contract_type === 'DC').length;
    const pc = PAD_STATE.myProspects.filter(p => p.contract_type === 'PC').length;
    const bc = PAD_STATE.myProspects.filter(p => p.contract_type === 'BC').length;

    const unEl = document.getElementById('statusUnassigned');
    const dcEl = document.getElementById('statusDC');
    const pcEl = document.getElementById('statusPC');
    const bcEl = document.getElementById('statusBC');

    if (unEl) unEl.textContent = unassigned;
    if (dcEl) dcEl.textContent = dc;
    if (pcEl) pcEl.textContent = pc;
    if (bcEl) bcEl.textContent = bc;
}

/**
 * Apply a specific rollover amount typed into the input
 */
function applyRolloverAmount() {
    const input = document.getElementById('rolloverInput');
    if (!input) return;

    const cap = PAD_STATE.rolloverCapPAD || 0;
    const applied = PAD_STATE.appliedRolloverPAD || 0;
    const remainingCap = Math.max(0, cap - applied);
    if (remainingCap <= 0) {
        showToast('You have already applied the maximum rollover to PAD.', 'info');
        return;
    }

    let value = Number(input.value || 0);
    if (!Number.isFinite(value) || value <= 0) {
        showToast('Enter a positive rollover amount.', 'error');
        return;
    }

    value = Math.min(value, remainingCap);
    PAD_STATE.appliedRolloverPAD += value;

    updateRolloverMeta();
    updateWizBucksDisplay();
    saveDraft();
}

/**
 * Apply the maximum allowable rollover to PAD
 */
function applyRolloverMax() {
    const cap = PAD_STATE.rolloverCapPAD || 0;
    const applied = PAD_STATE.appliedRolloverPAD || 0;
    const remainingCap = Math.max(0, cap - applied);
    if (remainingCap <= 0) {
        showToast('You have already applied the maximum rollover to PAD.', 'info');
        return;
    }

    PAD_STATE.appliedRolloverPAD += remainingCap;

    updateRolloverMeta();
    updateWizBucksDisplay();
    saveDraft();
}

/**
 * Display prospects
 */
function displayProspects() {
    const container = document.getElementById('prospectList');
    
    // If prospects array is empty but data is loaded, rebuild from source
    if ((!PAD_STATE.myProspects || PAD_STATE.myProspects.length === 0) &&
        typeof FBPHub !== 'undefined' && FBPHub.data?.players?.length) {
        PAD_STATE.myProspects = buildProspectsForTeam(PAD_STATE.team);
    }

    if (!PAD_STATE.myProspects || PAD_STATE.myProspects.length === 0) {
        container.innerHTML = `
            <div class="empty-message">
                <i class="fas fa-inbox"></i>
                <p>No prospects from 2025</p>
            </div>
        `;
        updateProspectStatusBar();
        return;
    }
    
    // Update status counts before rendering list
    updateProspectStatusBar();

    // Sort prospects alphabetically by name for display
    const sortedProspects = [...PAD_STATE.myProspects].sort((a, b) => {
        return (a.name || '').localeCompare(b.name || '');
    });

    container.innerHTML = sortedProspects.map(p => {
        const hasContract = p.contract_type !== null;
        const contractClass = p.contract_type ? p.contract_type.toLowerCase() : 'unassigned';
        const contractLabel = p.contract_type || 'Unassigned';
        
        // 2026 transition: DC/PC/BC are FREE for legacy DC prospects
        const dcLabel = p.legacy_dc ? 'DC (FREE)' : 'DC ($5)';
        const pcLabel = p.legacy_dc ? 'PC (FREE)' : 'PC ($10)';
        const hasGlobalFreeBC = PAD_SEASON === 2026 && !PAD_STATE.freeBCUsed;
        // BC is free if:
        // - the prospect is a legacy DC (2026 transition), OR
        // - this prospect already holds the special free BC, OR
        // - the 2026 one-time free BC has not been used yet (first BC contract)
        const isFreeBC = p.legacy_dc || p.free_bc_special || (!p.legacy_dc && hasGlobalFreeBC);
        const bcCost = isFreeBC ? 0 : 20;
        let bcLabel;
        if (bcCost === 0 && !p.legacy_dc && !p.free_bc_special && hasGlobalFreeBC) {
            bcLabel = 'BC (FREE - 2026 First BC)';
        } else if (bcCost === 0) {
            bcLabel = 'BC (FREE)';
        } else {
            bcLabel = 'BC ($20)';
        }
        
        return `
            <div class="prospect-card ${hasContract ? 'has-contract' : ''}">
                <div class="prospect-info">
                    <div class="prospect-details">
                        <h4 class="prospect-name-line">
                            <span class="prospect-name">${p.name}</span>
                            <span class="prospect-inline-meta">
                                <span>${p.position}</span>
                                <span>${p.team}</span>
                                ${p.age != null ? `<span>Age ${p.age}</span>` : ''}
                                ${p.top_100_rank ? `<span>Top 100 #${p.top_100_rank}</span>` : ''}
                            </span>
                        </h4>
                    </div>
                    <div class="contract-badge ${contractClass}">${contractLabel}</div>
                </div>
                <div class="prospect-actions">
                    ${!hasContract ? (
                        p.has_mlb_service
                            ? `
                                <div class="prospect-service-note">
                                    <i class="fas fa-ban"></i>
                                    <span>Has MLB service time  DC ineligible</span>
                                </div>
                                <button class="btn-contract pc" onclick="assignContract('${p.upid}', 'PC')">
                                    <i class="fas fa-star"></i> ${pcLabel}
                                </button>
                                <button class="btn-contract bc" onclick="assignContract('${p.upid}', 'BC')">
                                    <i class="fas fa-crown"></i> ${bcLabel}
                                </button>
                              `
                            : `
                                <button class="btn-contract dc" onclick="assignContract('${p.upid}', 'DC')">
                                    <i class="fas fa-user-plus"></i> ${dcLabel}
                                </button>
                                <button class="btn-contract pc" onclick="assignContract('${p.upid}', 'PC')">
                                    <i class="fas fa-star"></i> ${pcLabel}
                                </button>
                                <button class="btn-contract bc" onclick="assignContract('${p.upid}', 'BC')">
                                    <i class="fas fa-crown"></i> ${bcLabel}
                                </button>
                              `
                    ) : ''}
                    ${hasContract ? `
                        <button class="btn-remove-contract" onclick="removeContract('${p.upid}')">
                            <i class="fas fa-times"></i> Remove
                        </button>
                    ` : ''}
                    ${hasContract && p.top_100_rank ? `
                        <div style="flex: 1; text-align: center; color: var(--success); font-weight: 700; font-size: var(--text-sm); padding: var(--space-sm);">
                            <i class="fas fa-check-circle"></i> ${p.legacy_dc ? 'FREE BC UPGRADE' : 'BC ASSIGNED'} (Top 100 #${p.top_100_rank})
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Assign contract to prospect
 */
function assignContract(upid, contractType) {
    const prospect = PAD_STATE.myProspects.find(p => p.upid === upid);
    if (!prospect) return;
    
    // Calculate cost
    let cost = 0;

    if (prospect.legacy_dc) {
        // 2026 transition: legacy DC prospects are FREE for DC/PC/BC
        cost = 0;
    } else if (contractType === 'BC') {
        // 2026: first non-legacy BC is free
        if (PAD_SEASON === 2026 && !PAD_STATE.freeBCUsed) {
            cost = 0;
            PAD_STATE.freeBCUsed = true;
            prospect.free_bc_special = true;
        } else {
            cost = 20;
        }
    } else if (contractType === 'DC') {
        cost = 5;
    } else if (contractType === 'PC') {
        cost = 10;
    }
    
    const remaining = PAD_STATE.totalAvailable - calculateTotalSpend();
    
    if (remaining < cost) {
        showToast(`Insufficient PAD balance ($${cost} required)`, 'error');
        return;
    }
    
    prospect.contract_type = contractType;
    
    updateWizBucksDisplay();
    displayProspects();
    saveDraft();
    
    let costMsg = '';
    if (cost === 0) {
        if (prospect.legacy_dc) {
            costMsg = ' (FREE - Legacy DC 2026 Transition)';
        } else if (prospect.free_bc_special && contractType === 'BC') {
            costMsg = ' (FREE - 2026 One-Time BC)';
        }
    } else {
        costMsg = ` ($${cost})`;
    }
    showToast(`${contractType} assigned to ${prospect.name}${costMsg}`, 'success');
}

/**
 * Upgrade prospect contract
 */
function upgradeContract(upid, targetContract) {
    const prospect = PAD_STATE.myProspects.find(p => p.upid === upid);
    if (!prospect) return;
    
    let cost = 0;
    if (prospect.legacy_dc) {
        // 2026 transition: upgrades for legacy DC prospects are free
        cost = 0;
    } else if (targetContract === 'PC') {
        cost = 5;
    } else if (targetContract === 'BC') {
        // 2026: first non-legacy BC is free, even via upgrade
        if (PAD_SEASON === 2026 && !PAD_STATE.freeBCUsed) {
            cost = 0;
            PAD_STATE.freeBCUsed = true;
            prospect.free_bc_special = true;
        } else {
            cost = 15;
        }
    }

    const remaining = PAD_STATE.totalAvailable - calculateTotalSpend();
    
    if (remaining < cost) {
        showToast(`Insufficient PAD balance ($${cost} required)`, 'error');
        return;
    }
    
    prospect.contract_type = targetContract;
    if (targetContract === 'PC') prospect.was_upgraded = true;
    if (targetContract === 'BC') prospect.was_bc = true;
    
    updateWizBucksDisplay();
    displayProspects();
    saveDraft();
    
    const extra = cost === 0 && targetContract === 'BC' && prospect.free_bc_special && !prospect.legacy_dc
        ? ' (FREE - 2026 One-Time BC)'
        : '';
    showToast(`Upgraded to ${targetContract}${extra}`, 'success');
}

/**
 * Remove contract from prospect
 */
function removeContract(upid) {
    const prospect = PAD_STATE.myProspects.find(p => p.upid === upid);
    if (!prospect || !prospect.contract_type) return;

    const wasFreeBC = prospect.contract_type === 'BC' && prospect.free_bc_special && !prospect.legacy_dc;
    
    prospect.contract_type = null;
    prospect.was_upgraded = false;
    prospect.was_bc = false;
    prospect.free_bc_special = false;

    if (wasFreeBC) {
        // If we removed the special free BC, allow it to be used again
        PAD_STATE.freeBCUsed = PAD_STATE.myProspects.some(p => p.free_bc_special && p.contract_type === 'BC');
    }
    
    updateWizBucksDisplay();
    displayProspects();
    saveDraft();
    
    showToast('Contract removed', 'success');
}

/**
 * Adjust DC slots
 */
function adjustDCSlots(delta) {
    const newCount = PAD_STATE.dcSlots + delta;
    
    if (newCount < 0) return;
    
    if (newCount > 15) {
        showToast('Maximum 15 DC slots', 'error');
        return;
    }
    
    if (delta > 0) {
        const remaining = PAD_STATE.totalAvailable - calculateTotalSpend();
        if (remaining < 5) {
            showToast('Insufficient PAD balance ($5 required)', 'error');
            return;
        }
    }
    
    PAD_STATE.dcSlots = newCount;
    
    document.getElementById('dcSlotsCount').textContent = newCount;
    document.getElementById('dcSlotsCost').textContent = `$${newCount * 5}`;
    
    updateWizBucksDisplay();
    saveDraft();
}

/**
 * Add BC slot
 */
function addBCSlot() {
    // Max 2 BC slots
    if (PAD_STATE.bcSlots.length >= 2) {
        showToast('Maximum 2 BC slots', 'error');
        return;
    }

    const remaining = PAD_STATE.totalAvailable - calculateTotalSpend();
    
    if (remaining < 20) {
        showToast('Insufficient PAD balance ($20 required)', 'error');
        return;
    }
    
    const slotNumber = PAD_STATE.bcSlots.length + 1;
    PAD_STATE.bcSlots.push({
        id: `bc_slot_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        number: slotNumber,
        cost: 20
    });
    
    updateWizBucksDisplay();
    displayBCSlots();
    saveDraft();
    
    showToast('BC slot added!', 'success');
}

/**
 * Remove BC slot
 */
function removeBCSlot(slotId) {
    PAD_STATE.bcSlots = PAD_STATE.bcSlots.filter(slot => slot.id !== slotId);
    
    // Renumber remaining slots
    PAD_STATE.bcSlots.forEach((slot, index) => {
        slot.number = index + 1;
    });
    
    updateWizBucksDisplay();
    displayBCSlots();
    saveDraft();
    
    showToast('BC slot removed', 'success');
}

/**
 * Display BC slots list
 */
function displayBCSlots() {
    const container = document.getElementById('bcSlotsList');
    
    if (PAD_STATE.bcSlots.length === 0) {
        container.innerHTML = '<div class="bc-slots-empty">No BC slots purchased yet</div>';
        return;
    }
    
    container.innerHTML = PAD_STATE.bcSlots.map(slot => `
        <div class="bc-slot-item">
            <div class="bc-slot-label">
                <i class="fas fa-star"></i>
                BC Slot #${slot.number}
            </div>
            <div class="bc-slot-right">
                <span class="bc-slot-cost">$20</span>
                <button class="btn-remove-bc" onclick="removeBCSlot('${slot.id}')">
                    <i class="fas fa-times"></i> Remove
                </button>
            </div>
        </div>
    `).join('');
}

/**
 * Update summary page
 */
function updateSummary() {
    // Prospect contracts summary
    const dcContracts = PAD_STATE.myProspects.filter(p => p.contract_type === 'DC' && !p.was_upgraded);
    const pcContracts = PAD_STATE.myProspects.filter(p => p.contract_type === 'PC');
    const bcContracts = PAD_STATE.myProspects.filter(p => p.contract_type === 'BC');
    // 2026 transition: all BCs for legacy DC prospects are free
    // Plus the 2026 one-time free BC (prospect.free_bc_special)
    const bcFree = bcContracts.filter(p => p.legacy_dc || p.free_bc_special);
    const bcPaid = bcContracts.filter(p => !p.legacy_dc && !p.free_bc_special);

    // Unassigned prospects (no PAD contract chosen)
    const unassigned = PAD_STATE.myProspects.filter(p => !p.contract_type);
    // Default missing mlb_rookie to true (no MLB stats => still rookie)
    const droppedProspects = unassigned.filter(p => p.mlb_rookie !== false);
    const tcRProspects = unassigned.filter(p => p.mlb_rookie === false);
    
    const prospectsHTML = [];
    
    if (dcContracts.length > 0) {
        prospectsHTML.push(`
            <div class="summary-item">
                <strong>DC Contracts (${dcContracts.length})</strong>
                <div style="margin-top: var(--space-xs); color: var(--text-gray); font-size: var(--text-sm);">
                    ${dcContracts.map(p => p.name).join(', ')}
                </div>
            </div>
        `);
    }
    
    if (pcContracts.length > 0) {
        prospectsHTML.push(`
            <div class="summary-item">
                <strong>PC Contracts (${pcContracts.length})</strong>
                <div style="margin-top: var(--space-xs); color: var(--text-gray); font-size: var(--text-sm);">
                    ${pcContracts.map(p => p.name).join(', ')}
                </div>
            </div>
        `);
    }
    
    if (bcPaid.length > 0) {
        prospectsHTML.push(`
            <div class="summary-item">
                <strong>BC Contracts (${bcPaid.length})</strong>
                <div style="margin-top: var(--space-xs); color: var(--text-gray); font-size: var(--text-sm);">
                    ${bcPaid.map(p => p.name).join(', ')}
                </div>
            </div>
        `);
    }
    
    if (bcFree.length > 0) {
        prospectsHTML.push(`
            <div class="summary-item bc-auto">
                <strong>BC Free Upgrades (${bcFree.length})</strong>
                <div style="margin-top: var(--space-xs); color: var(--text-gray); font-size: var(--text-sm);">
                    ${bcFree.map(p => {
                        if (p.legacy_dc) {
                            return p.top_100_rank
                                ? `${p.name} (Legacy DC, Top 100 #${p.top_100_rank})`
                                : `${p.name} (Legacy DC)`;
                        }
                        return `${p.name} (2026 One-Time BC)`;
                    }).join(', ')}
                </div>
            </div>
        `);
    }

    if (droppedProspects.length > 0) {
        prospectsHTML.push(`
            <div class="summary-item">
                <strong>Dropped Prospects (${droppedProspects.length})</strong>
                <div style="margin-top: var(--space-xs); color: var(--text-gray); font-size: var(--text-sm);">
                    ${droppedProspects.map(p => p.name).join(', ')}
                </div>
                <div style=\"margin-top: var(--space-xs); color: var(--text-gray); font-size: var(--text-xs); opacity: 0.8;\">
                    Still MLB rookie-eligible; if left uncontracted, these players will be dropped from your roster.
                </div>
            </div>
        `);
    }

    if (tcRProspects.length > 0) {
        prospectsHTML.push(`
            <div class="summary-item">
                <strong>Converted to TC-R (${tcRProspects.length})</strong>
                <div style="margin-top: var(--space-xs); color: var(--text-gray); font-size: var(--text-sm);">
                    ${tcRProspects.map(p => p.name).join(', ')}
                </div>
                <div style=\"margin-top: var(--space-xs); color: var(--text-gray); font-size: var(--text-xs); opacity: 0.8;\">
                    No longer MLB rookie-eligible; if left uncontracted, these players will be retained as TC-R.
                </div>
            </div>
        `);
    }
    
    if (prospectsHTML.length === 0) {
        prospectsHTML.push('<div class="summary-empty">No prospect contracts assigned</div>');
    }
    
    document.getElementById('summaryProspects').innerHTML = prospectsHTML.join('');
    
    // Draft slots summary
    const slotsHTML = [];
    
    if (PAD_STATE.bcSlots.length > 0) {
        slotsHTML.push(`
            <div class="summary-item">
                <strong>BC Slots: ${PAD_STATE.bcSlots.length}</strong>
                <div style="margin-top: var(--space-xs); color: var(--text-gray); font-size: var(--text-sm);">
                    Rounds 1-2 (FYPD)
                </div>
            </div>
        `);
    }
    
    if (PAD_STATE.dcSlots > 0) {
        slotsHTML.push(`
            <div class="summary-item">
                <strong>DC Slots: ${PAD_STATE.dcSlots}</strong>
                <div style="margin-top: var(--space-xs); color: var(--text-gray); font-size: var(--text-sm);">
                    Rounds 3+
                </div>
            </div>
        `);
    }
    
    if (slotsHTML.length === 0) {
        slotsHTML.push('<div class="summary-empty">No draft slots purchased</div>');
    }
    
    document.getElementById('summarySlots').innerHTML = slotsHTML.join('');
    
    // WizBucks table
    const tbody = document.getElementById('summaryWBTable');
    const rows = [];
    
    // Only charge for non-legacy DC prospects
    const dcPaidCount = dcContracts.filter(p => !p.legacy_dc).length;
    const pcPaidCount = pcContracts.filter(p => !p.legacy_dc).length;

    if (dcPaidCount > 0) rows.push(`<tr><td>DC Contracts (${dcPaidCount})</td><td>$${dcPaidCount * 5}</td></tr>`);
    if (pcPaidCount > 0) rows.push(`<tr><td>PC Contracts (${pcPaidCount})</td><td>$${pcPaidCount * 10}</td></tr>`);
    if (bcPaid.length > 0) rows.push(`<tr><td>BC Contracts (${bcPaid.length})</td><td>$${bcPaid.length * 20}</td></tr>`);
    if (bcFree.length > 0) rows.push(`<tr><td>BC Free Upgrades (${bcFree.length})</td><td style="color: var(--success);">FREE</td></tr>`);
    if (PAD_STATE.dcSlots > 0) rows.push(`<tr><td>DC Draft Slots (${PAD_STATE.dcSlots})</td><td>$${PAD_STATE.dcSlots * 5}</td></tr>`);
    if (PAD_STATE.bcSlots.length > 0) rows.push(`<tr><td>BC Draft Slots (${PAD_STATE.bcSlots.length})</td><td>$${PAD_STATE.bcSlots.length * 20}</td></tr>`);
    
    if (rows.length === 0) {
        rows.push('<tr><td colspan="2" style="text-align: center; color: var(--text-gray);">No allocations made</td></tr>');
    }
    
    tbody.innerHTML = rows.join('');
    
    const total = calculateTotalSpend();
    const remaining = PAD_STATE.totalAvailable - total;
    const rolloverToKAP = computeRolloverToKAP(total);
    
    document.getElementById('summaryTotal').textContent = `$${total}`;
    document.getElementById('summaryRemaining').textContent = `$${remaining}`;
    document.getElementById('summaryRollover').textContent = `$${rolloverToKAP}`;
}

/**
 * Show confirmation modal
 */
function showConfirmation() {
    const total = calculateTotalSpend();
    const remaining = PAD_STATE.totalAvailable - total;
    const rollover = computeRolloverToKAP(total);
    
    const dcContracts = PAD_STATE.myProspects.filter(p => p.contract_type === 'DC' && !p.was_upgraded);
    const pcContracts = PAD_STATE.myProspects.filter(p => p.contract_type === 'PC');
    const bcContracts = PAD_STATE.myProspects.filter(p => p.contract_type === 'BC' && !p.top_100_rank);
    const bcRetained = PAD_STATE.myProspects.filter(p => p.top_100_rank);
    
    const summaryHTML = `
        ${dcContracts.length > 0 || pcContracts.length > 0 || bcContracts.length > 0 || bcRetained.length > 0 ? `
            <div class="confirmation-section">
                <h4>Prospect Contracts</h4>
                <ul>
                    ${dcContracts.length > 0 ? `<li><strong>${dcContracts.length} DC:</strong> ${dcContracts.map(p => p.name).join(', ')}</li>` : ''}
                    ${pcContracts.length > 0 ? `<li><strong>${pcContracts.length} PC:</strong> ${pcContracts.map(p => p.name).join(', ')}</li>` : ''}
                    ${bcContracts.length > 0 ? `<li><strong>${bcContracts.length} BC:</strong> ${bcContracts.map(p => p.name).join(', ')}</li>` : ''}
                    ${bcRetained.length > 0 ? `<li style="color: var(--success);"><strong>${bcRetained.length} BC Auto-Retained:</strong> ${bcRetained.map(p => p.name).join(', ')}</li>` : ''}
                </ul>
            </div>
        ` : ''}
        
        ${PAD_STATE.bcSlots.length > 0 || PAD_STATE.dcSlots > 0 ? `
            <div class="confirmation-section">
                <h4>Draft Slots</h4>
                <ul>
                    ${PAD_STATE.bcSlots.length > 0 ? `<li><strong>${PAD_STATE.bcSlots.length} BC Slots</strong> (Rounds 1-2)</li>` : ''}
                    ${PAD_STATE.dcSlots > 0 ? `<li><strong>${PAD_STATE.dcSlots} DC Slots</strong> (Rounds 3+)</li>` : ''}
                </ul>
            </div>
        ` : ''}
        
        <div class="confirmation-totals">
            <div class="confirmation-totals-row">
                <span>Total Spend:</span>
                <strong style="color: var(--primary-red);">$${total}</strong>
            </div>
            <div class="confirmation-totals-row">
                <span>Remaining:</span>
                <strong style="color: var(--success);">$${remaining}</strong>
            </div>
            <div class="confirmation-totals-row total">
                <span>Rollover to KAP:</span>
                <strong style="color: var(--accent-yellow);">$${rollover}</strong>
            </div>
        </div>
    `;
    
    document.getElementById('confirmationSummary').innerHTML = summaryHTML;
    document.getElementById('confirmationModal').classList.add('active');
}

/**
 * Cancel submission
 */
function cancelSubmit() {
    document.getElementById('confirmationModal').classList.remove('active');
}

/**
 * Confirm and submit PAD - LOG ALL TRANSACTIONS ATOMICALLY
 */
async function confirmSubmit() {
    console.log('🚀 Submitting PAD - Logging all transactions atomically...');
    
    const total = calculateTotalSpend();
    const remaining = PAD_STATE.totalAvailable - total;
    const rollover = computeRolloverToKAP(total);
    
    // Track balance through all transactions
    let currentBalance = PAD_STATE.totalAvailable;
    
    // Log all prospect contract assignments
    PAD_STATE.myProspects.forEach(prospect => {
        if (!prospect.contract_type || prospect.top_100_rank) return;
        
        let cost = 0;
        let txnType = '';
        
        // 2026 transition: no WizBucks charged for legacy DC prospects
        if (!prospect.legacy_dc) {
            if (prospect.contract_type === 'DC' && !prospect.was_upgraded) {
                cost = 5;
                txnType = 'dc_purchase';
            } else if (prospect.contract_type === 'PC' && !prospect.was_bc) {
                cost = 10;
                txnType = 'pc_purchase';
            } else if (prospect.contract_type === 'BC') {
                cost = 20;
                txnType = 'bc_purchase';
            }
        }
        
        if (cost > 0) {
            const wbTxnId = logWizBucksTransaction({
                amount: -cost,
                transaction_type: txnType,
                description: `${prospect.contract_type} contract assigned to ${prospect.name}`,
                related_player: { upid: prospect.upid, name: prospect.name },
                balance_before: currentBalance,
                balance_after: currentBalance - cost
            });
            
            currentBalance -= cost;
            
            logPlayerChange({
                upid: prospect.upid,
                player_name: prospect.name,
                update_type: 'contract_assigned',
                changes: {
                    contract_type: { from: null, to: prospect.contract_type },
                    manager: { from: null, to: PAD_STATE.team },
                    player_type: { from: null, to: 'Farm' }
                },
                event: `Assigned ${prospect.contract_type} contract`,
                player_data: prospect,
                wizbucks_txn_id: wbTxnId
            });
        }
    });
    
    // Log BC auto-retentions (no cost)
    PAD_STATE.myProspects.filter(p => p.top_100_rank).forEach(prospect => {
        logPlayerChange({
            upid: prospect.upid,
            player_name: prospect.name,
            update_type: 'bc_retention',
            changes: {
                contract_type: { from: 'BC', to: 'BC' }
            },
            event: `BC auto-retained (Top 100 #${prospect.top_100_rank})`,
            player_data: prospect,
            wizbucks_txn_id: null
        });
    });
    
    // Log DC slot purchases
    for (let i = 0; i < PAD_STATE.dcSlots; i++) {
        logWizBucksTransaction({
            amount: -5,
            transaction_type: 'dc_slot_purchase',
            description: `DC draft slot #${i + 1}`,
            balance_before: currentBalance,
            balance_after: currentBalance - 5
        });
        currentBalance -= 5;
    }
    
    // Log BC slot purchases
    PAD_STATE.bcSlots.forEach((slot, index) => {
        logWizBucksTransaction({
            amount: -20,
            transaction_type: 'bc_slot_purchase',
            description: `BC draft slot #${index + 1}`,
            balance_before: currentBalance,
            balance_after: currentBalance - 20
        });
        currentBalance -= 20;
    });
    
    // Log rollover to KAP
    if (rollover > 0) {
        logWizBucksTransaction({
            amount: -rollover,
            transaction_type: 'rollover_to_kap',
            description: `Rollover $${rollover} from PAD to KAP`,
            balance_before: currentBalance,
            balance_after: currentBalance - rollover
        });
    }
    
    // Mark as submitted
    const submission = {
        team: PAD_STATE.team,
        timestamp: new Date().toISOString(),
        allocations: {
            prospects: PAD_STATE.myProspects.filter(p => p.contract_type).map(p => ({
                upid: p.upid,
                name: p.name,
                contract_type: p.contract_type
            })),
            dcSlots: PAD_STATE.dcSlots,
            bcSlots: PAD_STATE.bcSlots.length
        },
        spending: {
            total,
            remaining,
            rollover
        }
    };
    
    // In production: POST to /api/pad/submit
    // For now: save to localStorage
    const submissions = JSON.parse(localStorage.getItem('pad_submissions_2026') || '{}');
    submissions[PAD_STATE.team] = submission;
    localStorage.setItem('pad_submissions_2026', JSON.stringify(submissions));
    
    // Clear draft
    localStorage.removeItem(`pad_draft_${PAD_STATE.team}_2026`);
    
    // Close modal
    document.getElementById('confirmationModal').classList.remove('active');
    
    showToast('✅ PAD Submitted Successfully! Redirecting...', 'success');
    
    // Redirect to home after 2 seconds
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 2000);
}

/**
 * Save draft to localStorage
 */
function saveDraft() {
    const draft = {
        prospects: PAD_STATE.myProspects,
        dcSlots: PAD_STATE.dcSlots,
        bcSlots: PAD_STATE.bcSlots,
        appliedRolloverPAD: PAD_STATE.appliedRolloverPAD || 0,
        timestamp: new Date().toISOString()
    };
    
    localStorage.setItem(`pad_draft_${PAD_STATE.team}_2026`, JSON.stringify(draft));
}

/**
 * Log WizBucks transaction to ledger
 */
function logWizBucksTransaction(data) {
    const ledger = JSON.parse(localStorage.getItem('wizbucks_ledger') || '[]');
    
    const txn = {
        txn_id: `wb_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
        timestamp: new Date().toISOString(),
        team: PAD_STATE.team,
        installment: 'pad',
        amount: data.amount,
        balance_before: data.balance_before,
        balance_after: data.balance_after,
        transaction_type: data.transaction_type,
        description: data.description,
        related_player: data.related_player || null,
        metadata: {
            season: 2026,
            source: 'web_ui'
        }
    };
    
    ledger.push(txn);
    localStorage.setItem('wizbucks_ledger', JSON.stringify(ledger));
    
    console.log('💰 WB Transaction logged:', txn.txn_id);
    
    return txn.txn_id;
}

/**
 * Log player change to player log
 */
function logPlayerChange(data) {
    const playerLog = JSON.parse(localStorage.getItem('player_log') || '[]');
    
    const entry = {
        log_id: `player_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
        timestamp: new Date().toISOString(),
        season: 2026,
        source: 'web_ui',
        admin: '',
        
        upid: data.upid,
        player_name: data.player_name,
        team: data.player_data?.team || '',
        pos: data.player_data?.position || '',
        age: data.player_data?.age || null,
        level: data.player_data?.level || '',
        
        owner: PAD_STATE.team,
        update_type: data.update_type,
        
        changes: data.changes,
        event: data.event,
        
        related_transactions: {
            wizbucks_txn_id: data.wizbucks_txn_id || null
        }
    };
    
    playerLog.push(entry);
    localStorage.setItem('player_log', JSON.stringify(playerLog));
    
    console.log('📋 Player change logged:', entry.log_id);
    
    return entry.log_id;
}

/**
 * Show submitted view
 */
function showSubmittedView() {
    document.getElementById('submittedView').style.display = 'block';
    
    // In production: fetch from pad_submissions.json
    const submissions = JSON.parse(localStorage.getItem('pad_submissions_2026') || '{}');
    const submission = submissions[PAD_STATE.team];
    
    if (submission) {
        const date = new Date(submission.timestamp);
        document.getElementById('submittedDate').textContent = date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        
        // Display submission summary
        const summaryItems = [];
        
        if (submission.allocations.prospects.length > 0) {
            const byType = {};
            submission.allocations.prospects.forEach(p => {
                if (!byType[p.contract_type]) byType[p.contract_type] = [];
                byType[p.contract_type].push(p.name);
            });
            
            Object.entries(byType).forEach(([type, names]) => {
                summaryItems.push(`
                    <div class="summary-item">
                        <strong>${type} Contracts (${names.length})</strong>
                        <div style="margin-top: var(--space-xs); color: var(--text-gray); font-size: var(--text-sm);">
                            ${names.join(', ')}
                        </div>
                    </div>
                `);
            });
        }
        
        if (submission.allocations.bcSlots > 0) {
            summaryItems.push(`
                <div class="summary-item">
                    <strong>BC Draft Slots: ${submission.allocations.bcSlots}</strong>
                </div>
            `);
        }
        
        if (submission.allocations.dcSlots > 0) {
            summaryItems.push(`
                <div class="summary-item">
                    <strong>DC Draft Slots: ${submission.allocations.dcSlots}</strong>
                </div>
            `);
        }
        
        summaryItems.push(`
            <div class="summary-item" style="border-left-color: var(--accent-yellow);">
                <strong>Total Spend: $${submission.spending.total}</strong>
            </div>
            <div class="summary-item" style="border-left-color: var(--success);">
                <strong>Rollover to KAP: $${submission.spending.rollover}</strong>
            </div>
        `);
        
        document.getElementById('submittedSummary').innerHTML = summaryItems.join('');
    }
}

/**
 * Toast notifications
 */
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? 'check-circle' : 'exclamation-circle';
    
    toast.innerHTML = `
        <i class="fas fa-${icon}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 5000);
}

// Initialize on page load
window.initPADPage = initPADPage;

// Expose functions globally
window.nextStep = nextStep;
window.prevStep = prevStep;
window.assignContract = assignContract;
window.upgradeContract = upgradeContract;
window.removeContract = removeContract;
window.adjustDCSlots = adjustDCSlots;
window.addBCSlot = addBCSlot;
window.removeBCSlot = removeBCSlot;
window.showConfirmation = showConfirmation;
window.cancelSubmit = cancelSubmit;
window.confirmSubmit = confirmSubmit;
