/**
 * FBP Hub - PAD (Prospect Allocation Day)
 * Multi-step wizard with OAuth integration and submit-only transaction logging
 */

const PAD_SEASON = 2026;

let PAD_STATE = {
    team: null,
    teamName: null,
    currentStep: 0,
    // Total PAD spending capacity for this season (derived from WizBucks wallet balance)
    totalAvailable: 0,
    // Season dates / submission window
    seasonDates: null,
    padOpenDate: null,
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
 * Load season_dates.json from local data/ for PAD submission window control.
 */
async function loadSeasonDates() {
    try {
        const res = await fetch('./data/season_dates.json', { cache: 'no-store' });
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        console.warn('Failed to load season_dates.json for PAD:', e);
        return null;
    }
}

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
    
    // Get user's team (abbreviation + full name)
    const teamInfo = authManager.getTeam();
    PAD_STATE.team = teamInfo?.abbreviation;
    PAD_STATE.teamName = teamInfo?.name || null;
    if (!PAD_STATE.team) {
        showToast('Could not determine your team', 'error');
        return;
    }
    
    // Load season dates (for PAD submission window)
    PAD_STATE.seasonDates = await loadSeasonDates();
    if (PAD_STATE.seasonDates?.pad_open_date) {
        PAD_STATE.padOpenDate = new Date(PAD_STATE.seasonDates.pad_open_date + 'T00:00:00');
    }

    // Check if already submitted
    await checkSubmissionStatus();
    
    // In normal mode, once a team has submitted PAD we show the submitted
    // summary view and block further edits. In test mode (global flag or
    // admin/commissioner), we *do not* short-circuit here so that test
    // users can re-run PAD end-to-end.
    if (PAD_STATE.submitted && !isPadTestMode()) {
        showSubmittedView();
        return;
    }
    
    // Load PAD data
    await loadPADData();

    // Ensure DC slots UI reflects any restored draft state
    syncDcSlotsUI();
    
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
 *
 * Primary source is localStorage (client remembers successful submissions).
 * We keep the function async so we can later add a remote status check if
 * needed without changing callers.
 */
async function checkSubmissionStatus() {
    // Fast path: local submission cache
    try {
        const cached = JSON.parse(localStorage.getItem('pad_submissions_2026') || '{}');
        const teamSubmission = cached[PAD_STATE.team];
        if (teamSubmission) {
            PAD_STATE.submitted = true;
            PAD_STATE.submittedAt = teamSubmission.timestamp;
            return;
        }
    } catch (e) {
        console.warn('Failed to read local PAD submission cache:', e);
    }

    // Fallback: no remote status check yet. The backend also enforces
    // one-and-done semantics, so a second submit will be rejected with
    // HTTP 409 even if localStorage was cleared or a different browser
    // is used. For now we just let the form load in that case.
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
            // PAD DC eligibility is driven solely by the unified `debuted` flag
            // added to combined_players.json by the debut pipeline.
            // debuted === true -> DC not available in the UI.
            debuted: !!p.debuted,
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

    // Read PAD total directly from the WizBucks wallet (wizbucks.json) via
    // FBPHub.data.wizbucks instead of using static PAD allotments in
    // config/managers.json. The wallet is the single source of truth.
    let padTotal = 0;
    try {
        const wizData = FBPHub?.data?.wizbucks || {};
        let teamName = PAD_STATE.teamName || null;

        // If we don't already know the full team name, derive it either from the
        // TEAM_NAMES map (auth.js) or, as a final fallback, from config/managers.json.
        if (!teamName) {
            if (typeof TEAM_NAMES !== 'undefined' && TEAM_NAMES && TEAM_NAMES[team]) {
                teamName = TEAM_NAMES[team];
            } else {
                try {
                    const res = await fetch('./config/managers.json');
                    if (res.ok) {
                        const cfg = await res.json();
                        const teamCfg = cfg?.teams?.[team];
                        if (teamCfg && teamCfg.name) {
                            teamName = teamCfg.name;
                        }
                    }
                } catch (err) {
                    console.warn('PAD: failed to load managers.json for team mapping', err);
                }
            }
        }

        if (teamName && Object.prototype.hasOwnProperty.call(wizData, teamName)) {
            padTotal = wizData[teamName];
        } else if (Object.prototype.hasOwnProperty.call(wizData, team)) {
            padTotal = wizData[team];
        }
    } catch (e) {
        console.error('PAD: failed to derive PAD total from WizBucks wallet:', e);
    }

    if (!Number.isFinite(padTotal)) {
        padTotal = 0;
    }

    PAD_STATE.totalAvailable = padTotal;

    // Load team's prospects from combined_players.json
    PAD_STATE.myProspects = buildProspectsForTeam(PAD_STATE.team);

    // IMPORTANT: Do NOT fall back to mock prospects in production. If a team
    // truly has no Farm players, show the "no prospects" message instead of
    // injecting sample data.

    // Attempt to restore a saved draft from localStorage and merge it into
    // the canonical prospect list. This lets managers resume where they left off.
    try {
        const draftKey = `pad_draft_${team}_2026`;
        const rawDraft = localStorage.getItem(draftKey);
        if (rawDraft) {
            const draft = JSON.parse(rawDraft);

            const draftPros = Array.isArray(draft.prospects) ? draft.prospects : [];

            // Build a quick lookup map for canonical prospects by UPID.
            const byUpid = new Map();
            PAD_STATE.myProspects.forEach(p => {
                if (p.upid) {
                    byUpid.set(String(p.upid), p);
                }
            });

            draftPros.forEach(dp => {
                const upidKey = dp.upid ? String(dp.upid) : null;
                let target = upidKey ? byUpid.get(upidKey) : null;
                if (!target) {
                    const nameLower = (dp.name || '').toLowerCase();
                    target = PAD_STATE.myProspects.find(p => (p.name || '').toLowerCase() === nameLower);
                }
                if (!target) return;
                // Only carry over contract choice flags; keep all canonical fields
                if (dp.contract_type) target.contract_type = dp.contract_type;
                if (dp.was_upgraded) target.was_upgraded = dp.was_upgraded;
                if (dp.was_bc) target.was_bc = dp.was_bc;
                if (dp.free_bc_special) target.free_bc_special = dp.free_bc_special;
            });

            PAD_STATE.dcSlots = typeof draft.dcSlots === 'number' ? draft.dcSlots : PAD_STATE.dcSlots;
            PAD_STATE.bcSlots = Array.isArray(draft.bcSlots) ? draft.bcSlots : PAD_STATE.bcSlots;
            console.log('✅ Loaded saved draft (merged into canonical prospects)');
        }
    } catch (e) {
        console.error('Failed to load draft:', e);
    }

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
 * Ensure the DC slots UI (count + cost) reflects the current PAD_STATE.
 * This is particularly important when restoring a saved draft from
 * localStorage, so the UI doesn't show 0 slots while PAD_STATE.dcSlots
 * still holds a non-zero value.
 */
function syncDcSlotsUI() {
    const countEl = document.getElementById('dcSlotsCount');
    const costEl = document.getElementById('dcSlotsCost');
    if (!countEl || !costEl) return;

    const count = Number(PAD_STATE.dcSlots) || 0;
    countEl.textContent = count;
    costEl.textContent = `$${count * 5}`;
}

/**
 * Mock prospects for testing
 */
function getMockProspects() {
    return [
        { upid: '12345', name: 'Leo de Vries', team: 'ATL', position: 'SS', age: 20, level: 'AAA', contract_type: null, debuted: false },
        { upid: '12346', name: 'Chase Burns', team: 'CIN', position: 'SP', age: 21, level: 'AAA', contract_type: 'BC', top_100_rank: 42, debuted: false },
        { upid: '12347', name: 'Jett Williams', team: 'NYM', position: '2B', age: 19, level: 'AA', contract_type: 'DC', debuted: false },
        { upid: '12348', name: 'Bryce Eldridge', team: 'SF', position: '1B', age: 19, level: 'A+', contract_type: 'PC', debuted: false },
        { upid: '12349', name: 'Dylan Beavers', team: 'BAL', position: 'OF', age: 22, level: 'AAA', contract_type: null, debuted: true },
        { upid: '12350', name: 'Marcelo Mayer', team: 'BOS', position: 'SS', age: 21, level: 'AAA', contract_type: null, debuted: false }
    ];
}

/**
 * Setup sticky bar scroll behavior
 * - Keeps the bar pinned just below the main nav on all viewports
 * - Adds a stronger shadow when it "sticks" while scrolling
 */
function setupStickyBar() {
    const stickyBar = document.getElementById('wizBucksStickyBar');
    if (!stickyBar) return;

    const nav = document.querySelector('.mobile-nav');

    // Dynamically match the nav height so the bar never hides underneath it.
    const updateOffset = () => {
        if (!nav) return;
        const navRect = nav.getBoundingClientRect();
        // When the nav is hidden (scrolled away), treat its height as 0 so
        // the PAD sticky bar can slide all the way up to the top of the
        // viewport. Otherwise, keep it parked just below the visible nav.
        const isNavHidden = nav.classList.contains('nav-hidden');
        const navHeight = isNavHidden ? 0 : (navRect.height || 0);
        // Small gap so the red nav border and bar border don't visually merge
        const offset = navHeight + 8;
        stickyBar.style.top = `${offset}px`;
    };

    updateOffset();

    // Recalculate offset on resize/orientation change and while scrolling,
    // so changes in nav-hidden state are reflected immediately.
    const debouncedUpdate = typeof debounce === 'function' ? debounce(updateOffset, 75) : updateOffset;
    window.addEventListener('resize', debouncedUpdate);
    window.addEventListener('scroll', debouncedUpdate);
    
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

    const padPool = PAD_STATE.totalAvailable || 0;
    const padRemaining = Math.max(0, padPool - spent);
    return Math.min(30, padRemaining);
}

/**
 * Update WizBucks display (sticky bar)
 */
function updateWizBucksDisplay() {
    const spent = calculateTotalSpend();
    const totalAvailable = PAD_STATE.totalAvailable || 0;
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
        const profileLink = window.createPlayerLink ? createPlayerLink(p) : '#';
        
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
                            <span class="prospect-name">
                                <a href="${profileLink}" class="player-link">${p.name}</a>
                            </span>
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
                        p.debuted
                            ? `
                                <button class="btn-contract dc" disabled aria-disabled="true">
                                    <i class="fas fa-ban"></i> Debuted \u2013 DC not available
                                </button>
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
                    ${hasContract && p.contract_type === 'BC' && p.top_100_rank ? `
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
 * Determine whether PAD is in test mode for the current session.
 *
 * Test mode is expected to be driven by the backend via a flag exposed on
 * FBPHub.config.padTestMode, which in turn can be wired to the
 * PAD_TEST_MODE environment variable in Render.
 *
 * As a secondary escape hatch, commissioners/admins are always treated as
 * test-mode users so they can re-run scenarios.
 */
function isPadTestMode() {
    const cfgFlag = !!(window.FBPHub && FBPHub.config && FBPHub.config.padTestMode);

    if (cfgFlag) return true;
    if (typeof authManager === 'undefined') return false;

    const isCommissioner = typeof authManager.isCommissioner === 'function' && authManager.isCommissioner();
    const isAdmin = typeof authManager.isAdmin === 'function' && authManager.isAdmin();
    return isCommissioner || isAdmin;
}

/**
 * Show confirmation modal
 */
function showConfirmation() {
    // Block re-submission in normal mode once PAD is marked submitted.
    if (PAD_STATE.submitted && !isPadTestMode()) {
        showToast('PAD has already been submitted for this team. Please contact the commissioner for changes.', 'error');
        showSubmittedView();
        return;
    }

    // Enforce PAD open date: managers can mock PAD anytime but cannot submit before pad_open_date.
    const padOpenIso = PAD_STATE.seasonDates?.pad_open_date;
    if (padOpenIso) {
        const openDate = PAD_STATE.padOpenDate || new Date(padOpenIso + 'T00:00:00');
        const now = new Date();
        const isPrivileged =
            typeof authManager !== 'undefined' &&
            ((typeof authManager.isCommissioner === 'function' && authManager.isCommissioner()) ||
             (typeof authManager.isAdmin === 'function' && authManager.isAdmin()));

        if (now < openDate && !isPrivileged) {
            const formatted = typeof formatDate === 'function' ? formatDate(openDate) : openDate.toISOString().slice(0, 10);
            showToast(`PAD submissions open on ${formatted}. You can continue editing your draft until then.`, 'error');
            return;
        }
    }

    const total = calculateTotalSpend();
    const remaining = PAD_STATE.totalAvailable - total;
    const rollover = computeRolloverToKAP(total);
    
    const dcContracts = PAD_STATE.myProspects.filter(p => p.contract_type === 'DC' && !p.was_upgraded);
    const pcContracts = PAD_STATE.myProspects.filter(p => p.contract_type === 'PC');
    const bcContracts = PAD_STATE.myProspects.filter(p => p.contract_type === 'BC');

    const unassigned = PAD_STATE.myProspects.filter(p => !p.contract_type);
    const droppedProspects = unassigned.filter(p => p.mlb_rookie !== false);
    const tcRProspects = unassigned.filter(p => p.mlb_rookie === false);
    
    const summaryHTML = `
        ${dcContracts.length > 0 || pcContracts.length > 0 || bcContracts.length > 0 ? `
            <div class="confirmation-section">
                <h4>Prospect Contracts</h4>
                <ul>
                    ${dcContracts.length > 0 ? `<li><strong>${dcContracts.length} DC:</strong> ${dcContracts.map(p => p.name).join(', ')}</li>` : ''}
                    ${pcContracts.length > 0 ? `<li><strong>${pcContracts.length} PC:</strong> ${pcContracts.map(p => p.name).join(', ')}</li>` : ''}
                    ${bcContracts.length > 0 ? `<li><strong>${bcContracts.length} BC:</strong> ${bcContracts.map(p => p.name).join(', ')}</li>` : ''}
                </ul>
            </div>
        ` : ''}

        ${droppedProspects.length > 0 || tcRProspects.length > 0 ? `
            <div class="confirmation-section">
                <h4>Unassigned Prospects</h4>
                <ul>
                    ${droppedProspects.length > 0 ? `<li><strong>Dropped (${droppedProspects.length}):</strong> ${droppedProspects.map(p => p.name).join(', ')}</li>` : ''}
                    ${tcRProspects.length > 0 ? `<li><strong>Convert to TC-R (${tcRProspects.length}):</strong> ${tcRProspects.map(p => p.name).join(', ')}</li>` : ''}
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
 * Build the payload expected by the bot's /api/pad/submit endpoint.
 */
function buildPadSubmissionPayload() {
    const total = calculateTotalSpend();

    function mapProspects(contractType) {
        return PAD_STATE.myProspects
            .filter(p => p.contract_type === contractType)
            .map(p => {
                const ref = { name: p.name };
                if (p.upid) {
                    ref.upid = String(p.upid);
                }
                return ref;
            });
    }

    return {
        season: PAD_SEASON,
        team: PAD_STATE.team,
        dc_players: mapProspects('DC'),
        pc_players: mapProspects('PC'),
        bc_players: mapProspects('BC'),
        dc_slots: PAD_STATE.dcSlots,
        bc_slots: PAD_STATE.bcSlots.length,
        total_spend: total,
        total_available: PAD_STATE.totalAvailable
    };
}

/**
 * Helper to toggle submitting state on the confirmation button.
 */
function setPadSubmitting(isSubmitting) {
    const btn = document.getElementById('confirmPadBtn');
    if (!btn) return;

    if (isSubmitting) {
        if (!btn.dataset.originalHtml) {
            btn.dataset.originalHtml = btn.innerHTML;
        }
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
    } else {
        btn.disabled = false;
        if (btn.dataset.originalHtml) {
            btn.innerHTML = btn.dataset.originalHtml;
            delete btn.dataset.originalHtml;
        }
    }
}

/**
 * Confirm and submit PAD via the bot API.
 */
async function confirmSubmit() {
    console.log('🚀 Submitting PAD to backend...');

    // Block duplicate submits in normal mode; test mode users can resubmit.
    if (PAD_STATE.submitted && !isPadTestMode()) {
        showToast('PAD has already been submitted for this team. Please contact the commissioner for changes.', 'error');
        cancelSubmit();
        return;
    }

    setPadSubmitting(true);

    // Double-check PAD open date in case the window changed while the page was open.
    const padOpenIso = PAD_STATE.seasonDates?.pad_open_date;
    if (padOpenIso) {
        const openDate = PAD_STATE.padOpenDate || new Date(padOpenIso + 'T00:00:00');
        const now = new Date();
        const isPrivileged =
            typeof authManager !== 'undefined' &&
            ((typeof authManager.isCommissioner === 'function' && authManager.isCommissioner()) ||
             (typeof authManager.isAdmin === 'function' && authManager.isAdmin()));

        if (now < openDate && !isPrivileged) {
            const formatted = typeof formatDate === 'function' ? formatDate(openDate) : openDate.toISOString().slice(0, 10);
            showToast(`PAD submissions open on ${formatted}. You can continue editing your draft until then.`, 'error');
            cancelSubmit();
            setPadSubmitting(false);
            return;
        }
    }

    const total = calculateTotalSpend();
    const remaining = PAD_STATE.totalAvailable - total;
    const rollover = computeRolloverToKAP(total);

    if (total > PAD_STATE.totalAvailable) {
        showToast('PAD spend exceeds available balance. Please adjust your allocations.', 'error');
        setPadSubmitting(false);
        return;
    }

    const apiBase = window.FBPHub?.config?.apiBase || null;
    const payload = buildPadSubmissionPayload();

    if (!apiBase) {
        console.warn('No API base configured; PAD submit will be stored locally only.');
    }

    try {
        if (apiBase) {
            const url = new URL('/api/pad/submit', apiBase);
            const response = await fetch(url.toString(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                    // BOT_API_KEY is injected by the Cloudflare Worker; the
                    // browser never sees it.
                },
                body: JSON.stringify(payload)
            });

            if (response.status === 409) {
                showToast('PAD has already been submitted for this team. Please contact the commissioner for changes.', 'error');
                PAD_STATE.submitted = true;
                PAD_STATE.submittedAt = null;
                document.getElementById('confirmationModal').classList.remove('active');
                showSubmittedView();
                setPadSubmitting(false);
                return;
            }

            if (!response.ok) {
                let errorText = '';
                try {
                    errorText = await response.text();
                } catch (e) {
                    errorText = '';
                }

                console.error('PAD submit failed', {
                    status: response.status,
                    statusText: response.statusText,
                    body: errorText,
                });

                let detail = '';
                try {
                    const parsed = JSON.parse(errorText);
                    if (parsed && parsed.detail) {
                        detail = String(parsed.detail);
                    }
                } catch (_) {
                    // non-JSON error body; ignore
                }

                const baseMsg = `Failed to submit PAD (status ${response.status})`;
                const fullMsg = detail ? `${baseMsg}: ${detail}` : baseMsg;
                showToast(fullMsg, 'error');
                setPadSubmitting(false);
                return;
            }

            const data = await response.json().catch(() => ({}));
            const timestamp = data.timestamp || new Date().toISOString();

            // Cache a human-readable summary locally for the submitted view.
            const submission = {
                team: PAD_STATE.team,
                timestamp,
                allocations: {
                    prospects: PAD_STATE.myProspects
                        .filter(p => p.contract_type)
                        .map(p => ({
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

            const submissions = JSON.parse(localStorage.getItem('pad_submissions_2026') || '{}');
            submissions[PAD_STATE.team] = submission;
            localStorage.setItem('pad_submissions_2026', JSON.stringify(submissions));

            // Clear draft cache now that PAD is locked in.
            localStorage.removeItem(`pad_draft_${PAD_STATE.team}_2026`);

            PAD_STATE.submitted = true;
            PAD_STATE.submittedAt = timestamp;
        }

        // Close modal and flip UI into submitted state.
        document.getElementById('confirmationModal').classList.remove('active');
        showSubmittedView();
        showToast('✅ PAD submitted! Changes will be reflected in your roster soon.', 'success');
    } catch (e) {
        console.error('Error submitting PAD:', e);
        showToast('Unexpected error while submitting PAD. Please try again.', 'error');
    } finally {
        setPadSubmitting(false);
    }
}

/**
 * Save draft to localStorage
 */
function saveDraft() {
    const draft = {
        prospects: PAD_STATE.myProspects,
        dcSlots: PAD_STATE.dcSlots,
        bcSlots: PAD_STATE.bcSlots,
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
    // Once submitted, hide the wizard so the submitted page fully replaces it
    // instead of being appended beneath step 3.
    const padContent = document.getElementById('padContent');
    if (padContent) {
        padContent.style.display = 'none';
    }

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
 *
 * For PAD we want:
 * - Toast pinned to the right on desktop (handled in pad.css)
 * - No auto-timeout; message stays until the next toast or user click
 */
let PAD_ACTIVE_TOAST = null;

function showToast(message, type = 'success') {
    // Remove any existing PAD toast so we only ever show one
    if (PAD_ACTIVE_TOAST) {
        PAD_ACTIVE_TOAST.remove();
        PAD_ACTIVE_TOAST = null;
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? 'check-circle' : 'exclamation-circle';
    
    toast.innerHTML = `
        <i class="fas fa-${icon}"></i>
        <span>${message}</span>
    `;
    
    // Allow user to dismiss by clicking on the toast
    toast.addEventListener('click', () => {
        toast.remove();
        if (PAD_ACTIVE_TOAST === toast) {
            PAD_ACTIVE_TOAST = null;
        }
    });

    document.body.appendChild(toast);
    PAD_ACTIVE_TOAST = toast;
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
