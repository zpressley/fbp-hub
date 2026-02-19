/**
 * FBP Hub - KAP (Keeper Assignment Period)
 * Keeper selection with IL tags, Reduce-a-Tier, buy-ins, and draft tax calculations
 */

// Keeper salary constants
const KEEPER_SALARIES = {
    'TC-R': 5,
    'TC-BC-1': 5,
    'TC-BC-2': 5,
    'TC-1': 15,
    'TC-2': 25,
    'VC-1': 35,
    'VC-2': 55,
    'FC-1': 85,
    'FC-2': 125,
    'FC-2+': 125
};

// IL Tag discounts
const IL_DISCOUNTS = {
    'TC': 10,
    'VC': 15,
    'FC': 35
};

// Contract advancement rules
// Progression: TC-R → TC-1 → TC-2 → VC-1 → VC-2 → FC-1 → FC-2+
// Blue Chip exception: TC-BC-1 → TC-BC-2 → TC-1 (then follows normal progression)
const CONTRACT_ADVANCEMENT = {
    'TC-R': 'TC-1',
    'TC-BC-1': 'TC-BC-2',  // Blue Chip year 1
    'TC-BC-2': 'TC-1',     // Blue Chip year 2 → enters normal progression
    'TC-1': 'TC-2',
    'TC-2': 'VC-1',
    'VC-1': 'VC-2',
    'VC-2': 'FC-1',
    'FC-1': 'FC-2+',
    'FC-2+': 'FC-2+'       // Terminal tier
};

// RaT tier reduction
const RAT_REDUCTION = {
    'FC-2+': 'VC-2',
    'FC-2': 'VC-2',
    'FC-1': 'VC-2',
    'VC-2': 'VC-1',
    'VC-1': null // Can't reduce VC-1 (would go to TC)
};

// Draft tax brackets
const TAX_BRACKETS = [
    { min: 421, max: 435, rounds: [4, 5, 6, 7, 8] },
    { min: 401, max: 420, rounds: [5, 6, 7] },
    { min: 376, max: 400, rounds: [6, 7, 8] },
    { min: 351, max: 375, rounds: [7, 8, 9] },
    { min: 326, max: 350, rounds: [8, 9, 10] },
    { min: 0, max: 325, rounds: [] }
];

let KAP_STATE = {
    team: null,
    currentStep: 0,
    
    // Budget
    kapAllotment: 375,
    rolloverFromPAD: 0,
    totalAvailable: 375,
    
    // Season dates / submission window
    seasonDates: null,
    kapOpenDate: null,
    kapEndDate: null,
    
    // Players
    mlbPlayers: [],  // All MLB players on team
    selectedKeepers: [],  // Players marked as keepers
    
    // Salary tools
    ilTags: { TC: null, VC: null, FC: null },  // { player, discount }
    ratApplications: [],  // [{ player, fromTier, toTier, cost: 75 }]
    
    // Buy-ins
    buyIns: { 1: false, 2: false, 3: false },
    
    // Submission
    submitted: false,
    submittedAt: null
};

/**
 * Load season_dates.json from local data/ for KAP submission window control.
 */
async function loadSeasonDates() {
    try {
        const res = await fetch('./data/season_dates.json', { cache: 'no-store' });
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        console.warn('Failed to load season_dates.json for KAP:', e);
        return null;
    }
}

/**
 * Initialize KAP page
 */
async function initKAPPage() {
    console.log('🏆 Initializing KAP page...');
    
    // Check authentication
    if (typeof authManager === 'undefined' || !authManager.isAuthenticated()) {
        document.getElementById('authRequired').style.display = 'flex';
        return;
    }
    
    // Get user's team
    KAP_STATE.team = authManager.getTeam()?.abbreviation;
    if (!KAP_STATE.team) {
        showToast('Could not determine your team', 'error');
        return;
    }

    // Load season dates (for KAP submission window)
    KAP_STATE.seasonDates = await loadSeasonDates();
    if (KAP_STATE.seasonDates?.kap_open_date) {
        KAP_STATE.kapOpenDate = new Date(KAP_STATE.seasonDates.kap_open_date + 'T00:00:00');
    }
    if (KAP_STATE.seasonDates?.kap_end_date) {
        KAP_STATE.kapEndDate = new Date(KAP_STATE.seasonDates.kap_end_date + 'T23:59:59');
    }
    
    // Check if already submitted
    await checkSubmissionStatus();
    
    if (KAP_STATE.submitted) {
        showSubmittedView();
        return;
    }
    
    // Load KAP data
    await loadKAPData();
    
    // Show KAP content
    document.getElementById('kapContent').style.display = 'block';
    
    // Initialize displays
    updateKAPBudgetDisplay();
    displayKeepers();
    displayILTags();
    displayRaT();
    
    // Initialize buy-ins (loads from draft_order_2026.json)
    if (typeof initKAPBuyins === 'function') {
        await initKAPBuyins(KAP_STATE.team);
    }
    
    // Make step circles clickable
    document.querySelectorAll('.progress-step').forEach((stepEl, index) => {
        stepEl.addEventListener('click', () => {
            goToStep(index);
        });
    });
    
    // Setup sticky bar
    setupStickyBar();
}

/**
 * Check if team already submitted
 */
async function checkSubmissionStatus() {
    try {
        const response = await fetch('./data/kap_submissions.json');
        if (response.ok) {
            const submissions = await response.json();
            const teamSubmission = submissions[KAP_STATE.team];
            
            if (teamSubmission) {
                KAP_STATE.submitted = true;
                KAP_STATE.submittedAt = teamSubmission.timestamp;
            }
        }
    } catch (e) {
        console.log('No submission data found');
    }
}

/**
 * Load KAP data
 */
async function loadKAPData() {
    // Load KAP budget + PAD→KAP rollover from managers.json so the UI
    // matches the constitution and per-team WizBucks config.
    try {
        const res = await fetch('./config/managers.json');
        if (res.ok) {
            const cfg = await res.json();
            const teamCfg = cfg?.teams?.[KAP_STATE.team];

            // 1) Base KAP allotment comes from wizbucks[2026].allotments.KAP.total
            //    which already includes bracket bonuses and any carry that
            //    should be available at KAP. Fallback to the constitutional
            //    baseline of 375 if the config is missing.
            const seasonCfg = teamCfg?.wizbucks?.["2026"];
            const kapAllot = seasonCfg?.allotments?.KAP?.total;
            if (typeof kapAllot === 'number' && kapAllot > 0) {
                KAP_STATE.kapAllotment = kapAllot;
            } else {
                KAP_STATE.kapAllotment = 375;
            }

            // 2) PAD→KAP rollover from PAD submissions (kap_rollover_2026),
            //    clamped to $30 per the constitution.
            if (teamCfg && typeof teamCfg.kap_rollover_2026 === 'number') {
                KAP_STATE.rolloverFromPAD = Math.max(0, Math.min(30, teamCfg.kap_rollover_2026));
            } else {
                KAP_STATE.rolloverFromPAD = 0;
            }
        } else {
            // managers.json missing/unreachable: fallback to 375 with no rollover
            KAP_STATE.kapAllotment = 375;
            KAP_STATE.rolloverFromPAD = 0;
        }
    } catch (e) {
        console.error('Failed to load KAP config from managers.json:', e);
        KAP_STATE.kapAllotment = 375;
        KAP_STATE.rolloverFromPAD = 0;
    }
    KAP_STATE.totalAvailable = KAP_STATE.kapAllotment + KAP_STATE.rolloverFromPAD;
    
    // Load MLB players from combined_players.json via FBPHub, using years_simple
    // as the canonical contract/status field for KAP salary math. Two-way
    // players (e.g. Shohei Ohtani) are treated as a single payable unit but
    // still consume two roster slots.
    if (typeof FBPHub !== 'undefined' && FBPHub.data?.players) {
        const rawPlayers = FBPHub.data.players
            .filter(p => p.FBP_Team === KAP_STATE.team && p.player_type === 'MLB');

        const seenTwoWay = new Set();
        KAP_STATE.mlbPlayers = [];

        rawPlayers.forEach(p => {
            const upid = (p.upid || '').toString();
            if (!upid) return;

            const partnerUpid = (p["2wayplayer"] || '').toString();
            if (partnerUpid) {
                // Canonicalize the pair so we only create one combined entry.
                const pairKey = [upid, partnerUpid].sort().join('-');
                if (seenTwoWay.has(pairKey)) {
                    return;
                }
                seenTwoWay.add(pairKey);

                const partner = rawPlayers.find(other => (other.upid || '').toString() === partnerUpid);
                const contract = normalizeYearsSimpleToContract(p.years_simple, p.contract_type);

                let baseName = p.name || '';
                baseName = baseName.replace(' (Batter)', '').replace(' (Pitcher)', '').trim();
                const displayName = `${baseName || p.name} (2 Way player - Counts as 2 roster slots)`;

                const positions = [];
                if (p.position) positions.push(p.position);
                if (partner && partner.position) positions.push(partner.position);
                const combinedPosition = Array.from(new Set(positions)).join(',');

                KAP_STATE.mlbPlayers.push({
                    upid,
                    name: displayName,
                    team: p.team,
                    position: combinedPosition || p.position,
                    age: p.age || (partner && partner.age) || null,
                    // Canonical KAP contract code (e.g. "TC-1", "VC-2", "FC-2+")
                    contract,
                    // Raw display string from combined_players
                    years: p.years_simple || (p.contract_type || ''),
                    isKeeper: false,
                    hasILTag: false,
                    hasRaT: false,
                    ilDiscount: 0,
                    effectiveContract: contract,
                    rosterSlots: 2,
                    isTwoWay: true,
                    twoWayPartnerUpid: partnerUpid
                });
            } else {
                const contract = normalizeYearsSimpleToContract(p.years_simple, p.contract_type);
                KAP_STATE.mlbPlayers.push({
                    upid,
                    name: p.name,
                    team: p.team,
                    position: p.position,
                    age: p.age || null,
                    // Canonical KAP contract code (e.g. "TC-1", "VC-2", "FC-2+")
                    contract,
                    // Raw display string from combined_players
                    years: p.years_simple || (p.contract_type || ''),
                    isKeeper: false,
                    hasILTag: false,
                    hasRaT: false,
                    ilDiscount: 0,
                    effectiveContract: contract,
                    rosterSlots: 1,
                    isTwoWay: false,
                    twoWayPartnerUpid: null
                });
            }
        });
    } else {
        // Mock data
        KAP_STATE.mlbPlayers = getMockMLBPlayers();
    }
    
    // Load purchased buy-ins from draft order (permanent purchases)
    try {
        const draftRes = await fetch('./data/draft_order_2026.json');
        if (draftRes.ok) {
            const draftData = await draftRes.json();
            const keeperPicks = draftData.filter(p => p.draft === 'keeper' && p.current_owner === KAP_STATE.team);
            
            // Check which buy-ins have been permanently purchased
            [1, 2, 3].forEach(round => {
                const pick = keeperPicks.find(p => p.round === round);
                if (pick && pick.buyin_purchased) {
                    KAP_STATE.buyIns[round] = true;
                    console.log(`✅ Round ${round} buy-in already purchased`);
                }
            });
        }
    } catch (e) {
        console.warn('Could not load draft order for buy-ins:', e);
    }
    
    // Load saved draft (will not override purchased buy-ins)
    const savedDraft = localStorage.getItem(`kap_draft_${KAP_STATE.team}_2026`);
    if (savedDraft) {
        try {
            const draft = JSON.parse(savedDraft);
            KAP_STATE.selectedKeepers = (draft.selectedKeepers || [])
                // Drop any legacy keeper entries that no longer exist (e.g. old
                // two-way partner UPIDs now represented by a single entry).
                .filter(keeperUPID => KAP_STATE.mlbPlayers.some(p => p.upid === keeperUPID));
            KAP_STATE.ilTags = draft.ilTags || { TC: null, VC: null, FC: null };
            KAP_STATE.ratApplications = draft.ratApplications || [];
            // Merge localStorage buy-ins with permanent purchases (permanent takes precedence)
            const localBuyIns = draft.buyIns || { 1: false, 2: false, 3: false };
            [1, 2, 3].forEach(round => {
                if (!KAP_STATE.buyIns[round]) {
                    KAP_STATE.buyIns[round] = localBuyIns[round];
                }
            });
            
            // Restore keeper flags
            KAP_STATE.selectedKeepers.forEach(keeperUPID => {
                const player = KAP_STATE.mlbPlayers.find(p => p.upid === keeperUPID);
                if (player) player.isKeeper = true;
            });
            
            console.log('✅ Loaded saved draft');
        } catch (e) {
            console.error('Failed to load draft:', e);
        }
    }
}

/**
 * Normalize combined_players.years_simple (or legacy contract_type) into a
 * canonical KAP contract code that matches KEEPER_SALARIES keys.
 *
 * Examples:
 *   "TC 1"  → "TC-1"
 *   "VC 2"  → "VC-2"
 *   "FC 2+" → "FC-2+"
 *   "R-4"   → "TC-R" (rookie tender)
 */
function normalizeYearsSimpleToContract(yearsSimple, contractType) {
    // Prefer years_simple; fall back to contract_type if needed
    const raw = (yearsSimple || contractType || '').toString().trim();
    if (!raw) {
        return 'TC-1'; // conservative default
    }

    const upper = raw.toUpperCase();

    // If it's already a direct key in KEEPER_SALARIES, use it as-is
    if (KEEPER_SALARIES[upper] !== undefined) {
        return upper;
    }

    // Common form in combined_players is "TC 1", "VC 2", "FC 2+".
    const dashNormalized = upper.replace(/\s+/g, '-');
    if (KEEPER_SALARIES[dashNormalized] !== undefined) {
        return dashNormalized;
    }

    // Handle compact forms like "TC1" or "VC2+" → "TC-1", "VC-2+"
    const compactMatch = upper.match(/^([A-Z]+)[-]?([0-9]+\+?)$/);
    if (compactMatch) {
        const candidate = `${compactMatch[1]}-${compactMatch[2]}`;
        if (KEEPER_SALARIES[candidate] !== undefined) {
            return candidate;
        }
    }

    // Rookies / rookie years (e.g. "R", "R-4") map to TC-R in KAP salary table
    if (upper === 'R' || upper.startsWith('R-') || upper === 'ROOKIE') {
        if (KEEPER_SALARIES['TC-R'] !== undefined) {
            return 'TC-R';
        }
    }

    // Bridge contracts in text form such as "TC BC 1" → "TC-BC-1"
    if (upper.includes('TC') && upper.includes('BC')) {
        const num = (upper.match(/(\d+)/) || [null, '1'])[1];
        const candidate = `TC-BC-${num}`;
        if (KEEPER_SALARIES[candidate] !== undefined) {
            return candidate;
        }
    }

    // Fallback: if it at least starts with TC/VC/FC, try mapping to "X-1" or "X-2"
    if (upper.startsWith('TC')) {
        return 'TC-1';
    }
    if (upper.startsWith('VC')) {
        return 'VC-1';
    }
    if (upper.startsWith('FC')) {
        return 'FC-1';
    }

    // Absolute fallback
    return 'TC-1';
}

/**
 * Mock MLB players
 */
function getMockMLBPlayers() {
    return [
        { upid: '10001', name: 'Bobby Witt Jr.', team: 'KC', position: 'SS', age: 24, contract: 'VC-2', years: 'VC-2', isKeeper: false, rosterSlots: 1 },
        { upid: '10002', name: 'Kyle Schwarber', team: 'PHI', position: 'OF', age: 31, contract: 'FC-1', years: 'FC-1', isKeeper: false, rosterSlots: 1 },
        { upid: '10003', name: 'Jackson Chourio', team: 'MIL', position: 'OF', age: 20, contract: 'TC-R', years: 'R-4', isKeeper: false, rosterSlots: 1 },
        { upid: '10004', name: 'Corbin Carroll', team: 'ARI', position: 'OF', age: 23, contract: 'VC-1', years: 'VC-1', isKeeper: false, rosterSlots: 1 },
        { upid: '10005', name: 'Jazz Chisholm Jr.', team: 'NYY', position: '3B', age: 26, contract: 'TC-2', years: 'TC-2', isKeeper: false, rosterSlots: 1 },
        { upid: '10006', name: 'Jordan Westburg', team: 'BAL', position: '2B', age: 25, contract: 'TC-1', years: 'TC-1', isKeeper: false, rosterSlots: 1 }
    ];
}

/**
 * Setup sticky bar
 * - Keeps the KAP bar pinned just below the main nav
 * - Adds a stronger shadow when it "sticks" while scrolling
 * - Mirrors PAD's sticky bar behavior so the nav/header and bar move together
 */
function setupStickyBar() {
    const stickyBar = document.getElementById('kapStickyBar');
    if (!stickyBar) return;

    const nav = document.querySelector('.mobile-nav');

    // Dynamically match the nav height so the bar never hides underneath it.
    const updateOffset = () => {
        if (!nav) return;
        const navRect = nav.getBoundingClientRect();
        // When the nav is hidden (scrolled away), treat its height as 0 so
        // the KAP sticky bar can slide all the way up to the top of the
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
 * Navigation
 */
function nextStep() {
    if (KAP_STATE.currentStep < 3) {
        goToStep(KAP_STATE.currentStep + 1);
    }
}

function prevStep() {
    if (KAP_STATE.currentStep > 0) {
        goToStep(KAP_STATE.currentStep - 1);
    }
}

function goToStep(stepIndex) {
    KAP_STATE.currentStep = stepIndex;
    
    document.querySelectorAll('.kap-step').forEach((step, i) => {
        step.classList.toggle('active', i === stepIndex);
    });
    
    document.querySelectorAll('.progress-step').forEach((step, i) => {
        step.classList.remove('active', 'completed');
        if (i === stepIndex) step.classList.add('active');
        if (i < stepIndex) step.classList.add('completed');
    });
    
    // Update displays
    if (stepIndex === 1) {
        displayILTags();
        displayRaT();
    } else if (stepIndex === 3) {
        updateSummary();
    }
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
    saveDraft();
}

/**
 * Calculate costs
 */
function calculateKeeperSalaryCost() {
    let total = 0;
    
    KAP_STATE.selectedKeepers.forEach(upid => {
        const player = KAP_STATE.mlbPlayers.find(p => p.upid === upid);
        if (!player) return;
        
        const baseCost = KEEPER_SALARIES[player.contract] || 0;
        const ilDiscount = player.hasILTag ? (IL_DISCOUNTS[getContractTier(player.contract)] || 0) : 0;
        const finalCost = baseCost - ilDiscount;
        
        total += finalCost;
    });
    
    return total;
}

// Helper: compute total roster slots consumed by selected keepers,
// treating two-way players as 2 slots but 1 salary.
function getSelectedKeeperSlots() {
    let total = 0;
    KAP_STATE.selectedKeepers.forEach(upid => {
        const player = KAP_STATE.mlbPlayers.find(p => p.upid === upid);
        if (!player) return;
        const slots = (typeof player.rosterSlots === 'number' && player.rosterSlots > 0) ? player.rosterSlots : 1;
        total += slots;
    });
    return total;
}

function calculateTaxableSpend() {
    const salaryCost = calculateKeeperSalaryCost();
    
    // Get buy-in cost from kap-buyin-integration.js if available
    const buyInCost = (typeof getTotalBuyinSpend === 'function') 
        ? getTotalBuyinSpend() 
        : (KAP_STATE.buyIns[1] ? 55 : 0) + (KAP_STATE.buyIns[2] ? 35 : 0) + (KAP_STATE.buyIns[3] ? 10 : 0);
    
    return salaryCost + buyInCost;
}

function calculateTaxFreeSpend() {
    return KAP_STATE.ratApplications.length * 75;
}

function calculateTotalSpend() {
    return calculateTaxableSpend() + calculateTaxFreeSpend();
}

function calculateTaxBracket(taxableSpend) {
    for (const bracket of TAX_BRACKETS) {
        if (taxableSpend >= bracket.min && taxableSpend <= bracket.max) {
            return bracket;
        }
    }
    return { min: 0, max: 325, rounds: [] };
}

/**
 * Update budget display
 */
function updateKAPBudgetDisplay() {
    const taxableSpend = calculateTaxableSpend();
    const taxFreeSpend = calculateTaxFreeSpend();
    const totalSpend = taxableSpend + taxFreeSpend;
    const remaining = KAP_STATE.totalAvailable - totalSpend;
    const taxBracket = calculateTaxBracket(taxableSpend);
    const salaryCost = calculateKeeperSalaryCost();
    
    const remainingEl = document.getElementById('barRemaining');
    const salaryEl = document.getElementById('barSalaryCost');
    const taxableEl = document.getElementById('barTaxableSpend');
    const keepersEl = document.getElementById('barKeepersSelected');
    const bracketEl = document.getElementById('barTaxBracket');
    const roundsEl = document.getElementById('barTaxRounds');
    
    if (remainingEl) remainingEl.textContent = `$${remaining}`;
    if (salaryEl) salaryEl.textContent = `$${salaryCost}`;
    if (taxableEl) taxableEl.textContent = `$${taxableSpend}`;
    if (keepersEl) keepersEl.textContent = String(getSelectedKeeperSlots());
    
    if (taxBracket.rounds.length > 0) {
        if (bracketEl) bracketEl.textContent = `$${taxBracket.min}-${taxBracket.max}`;
        if (roundsEl) roundsEl.textContent = `Lose: ${taxBracket.rounds.join(', ')}`;
    } else {
        if (bracketEl) bracketEl.textContent = 'None';
        if (roundsEl) roundsEl.textContent = '';
    }
}

/**
 * Display keepers
 */
function displayKeepers() {
    const container = document.getElementById('keeperList');
    
    if (KAP_STATE.mlbPlayers.length === 0) {
        container.innerHTML = '<div class="empty-message"><i class="fas fa-inbox"></i><p>No MLB players</p></div>';
        return;
    }
    
    container.innerHTML = KAP_STATE.mlbPlayers.map(p => {
        const baseCost = KEEPER_SALARIES[p.contract] || 0;
        const ilDiscount = p.hasILTag ? (IL_DISCOUNTS[getContractTier(p.contract)] || 0) : 0;
        const finalCost = baseCost - ilDiscount;
        const nextContract = CONTRACT_ADVANCEMENT[p.contract] || p.contract;
        const contractTier = getContractTier(p.contract);
        const profileLink = window.createPlayerLink ? createPlayerLink({ upid: p.upid, name: p.name }) : '#';
        
        return `
            <div class="keeper-card ${p.isKeeper ? 'selected' : ''}">
                <div class="keeper-header">
                    <div class="keeper-info">
                        <h4><a href="${profileLink}" class="player-link">${p.name}</a></h4>
                        <div class="keeper-meta">
                            <span>${p.position}</span>
                            <span>${p.team}</span>
                            <span>Age ${p.age || '?'}</span>
                        </div>
                    </div>
                    <div class="keeper-checkbox ${p.isKeeper ? 'checked' : ''}" onclick="toggleKeeper('${p.upid}')">
                        <i class="fas fa-check"></i>
                    </div>
                </div>
                <div class="keeper-salary-row">
                    <div class="contract-display">
                        <div class="contract-tier ${contractTier.toLowerCase()}">${p.contract}</div>
                        <div class="contract-advancement">→ ${nextContract}</div>
                    </div>
                    <div style="text-align: right;">
                        <div class="salary-amount ${ilDiscount > 0 ? 'discounted' : ''}">
                            $${finalCost}
                        </div>
                        ${ilDiscount > 0 ? `
                            <div class="salary-breakdown">
                                $${baseCost} - $${ilDiscount} IL
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    // Update summary card
    const salaryCard = document.getElementById('salaryCost');
    if (salaryCard) {
        salaryCard.textContent = `$${calculateKeeperSalaryCost()}`;
    }
}

/**
 * Toggle keeper selection
 */
function toggleKeeper(upid) {
    const player = KAP_STATE.mlbPlayers.find(p => p.upid === upid);
    if (!player) return;
    
    const isCurrentlySelected = KAP_STATE.selectedKeepers.includes(upid);
    
    if (isCurrentlySelected) {
        // Remove keeper
        KAP_STATE.selectedKeepers = KAP_STATE.selectedKeepers.filter(id => id !== upid);
        player.isKeeper = false;
        
        // Remove IL tag if present
        Object.keys(KAP_STATE.ilTags).forEach(tier => {
            if (KAP_STATE.ilTags[tier]?.upid === upid) {
                KAP_STATE.ilTags[tier] = null;
                player.hasILTag = false;
            }
        });
        
        // Remove RaT if present
        KAP_STATE.ratApplications = KAP_STATE.ratApplications.filter(rat => rat.upid !== upid);
        player.hasRaT = false;
    } else {
        // Add keeper
        const currentSlots = getSelectedKeeperSlots();
        const slotsForPlayer = (typeof player.rosterSlots === 'number' && player.rosterSlots > 0) ? player.rosterSlots : 1;
        if (currentSlots + slotsForPlayer > 26) {
            showToast('Maximum 26 keepers (roster slots) exceeded', 'error');
            return;
        }
        
        KAP_STATE.selectedKeepers.push(upid);
        player.isKeeper = true;
    }
    
    updateKAPBudgetDisplay();
    displayKeepers();
    saveDraft();
}

/**
 * Display IL Tags
 */
function displayILTags() {
    const container = document.getElementById('ilTagsGrid');
    
    const tiers = ['TC', 'VC', 'FC'];
    
    container.innerHTML = tiers.map(tier => {
        const ilTag = KAP_STATE.ilTags[tier];
        const discount = IL_DISCOUNTS[tier];
        
        return `
            <div class="il-tag-slot ${ilTag ? 'used' : ''}">
                <div class="il-tag-label">${tier} IL Tag</div>
                <div class="il-tag-discount">-$${discount}</div>
                <div class="il-tag-player ${ilTag ? 'active' : ''}">
                    ${ilTag ? ilTag.name : 'Available'}
                </div>
                ${ilTag ? `
                    <button class="btn-secondary" style="margin-top: var(--space-sm); width: 100%;" onclick="removeILTag('${tier}')">
                        <i class="fas fa-times"></i> Remove
                    </button>
                ` : `
                    <select class="filter-select" style="margin-top: var(--space-sm); width: 100%;" onchange="applyILTag('${tier}', this.value)">
                        <option value="">Select player...</option>
                        ${getILEligiblePlayers(tier).map(p => `
                            <option value="${p.upid}">${p.name}</option>
                        `).join('')}
                    </select>
                `}
            </div>
        `;
    }).join('');
}

/**
 * Get IL eligible players for tier
 */
function getILEligiblePlayers(tier) {
    return KAP_STATE.mlbPlayers.filter(p => {
        // Must be selected as keeper
        if (!p.isKeeper) return false;
        
        // Can't be TC-R or TC-BC
        if (p.contract === 'TC-R' || p.contract.startsWith('TC-BC')) return false;
        
        // Must match tier
        if (getContractTier(p.contract) !== tier) return false;
        
        // Can't already have IL tag
        if (p.hasILTag) return false;
        
        return true;
    });
}

/**
 * Apply IL tag
 */
function applyILTag(tier, upid) {
    if (!upid) return;
    
    const player = KAP_STATE.mlbPlayers.find(p => p.upid === upid);
    if (!player) return;
    
    KAP_STATE.ilTags[tier] = {
        upid: player.upid,
        name: player.name,
        contract: player.contract,
        discount: IL_DISCOUNTS[tier]
    };
    
    player.hasILTag = true;
    player.ilDiscount = IL_DISCOUNTS[tier];
    
    updateKAPBudgetDisplay();
    displayKeepers();
    displayILTags();
    saveDraft();
    
    showToast(`IL Tag applied to ${player.name}`, 'success');
}

/**
 * Remove IL tag
 */
function removeILTag(tier) {
    const ilTag = KAP_STATE.ilTags[tier];
    if (!ilTag) return;
    
    const player = KAP_STATE.mlbPlayers.find(p => p.upid === ilTag.upid);
    if (player) {
        player.hasILTag = false;
        player.ilDiscount = 0;
    }
    
    KAP_STATE.ilTags[tier] = null;
    
    updateKAPBudgetDisplay();
    displayKeepers();
    displayILTags();
    saveDraft();
    
    showToast('IL Tag removed', 'success');
}

/**
 * Display RaT options
 */
function displayRaT() {
    const container = document.getElementById('ratList');
    
    // Get eligible players (VC and FC only, must be keepers)
    const eligible = KAP_STATE.mlbPlayers.filter(p => {
        if (!p.isKeeper) return false;
        const tier = getContractTier(p.contract);
        return tier === 'VC' || tier === 'FC';
    });
    
    document.getElementById('ratUsedCount').textContent = KAP_STATE.ratApplications.length;
    document.getElementById('ratTotalCost').textContent = `$${KAP_STATE.ratApplications.length * 75}`;
    
    if (eligible.length === 0) {
        container.innerHTML = '<div class="summary-empty">No VC or FC keepers selected</div>';
        return;
    }
    
    container.innerHTML = eligible.map(p => {
        const hasRaT = KAP_STATE.ratApplications.some(rat => rat.upid === p.upid);
        const reducedContract = RAT_REDUCTION[p.contract];
        const canReduce = reducedContract !== null && reducedContract !== undefined;
        
        if (!canReduce) {
            return `
                <div class="rat-eligible-player">
                    <div class="rat-player-info">
                        <div class="rat-player-name">${p.name}</div>
                        <div class="rat-contract-change">
                            ${p.contract} → Cannot reduce (would go to TC)
                        </div>
                    </div>
                    <button class="btn-rat" disabled>
                        Not Eligible
                    </button>
                </div>
            `;
        }
        
        return `
            <div class="rat-eligible-player ${hasRaT ? 'applied' : ''}">
                <div class="rat-player-info">
                    <div class="rat-player-name">${p.name}</div>
                    <div class="rat-contract-change">
                        <span class="from">${p.contract}</span>
                        <span class="arrow">→</span>
                        <span class="to">${reducedContract}</span>
                    </div>
                </div>
                <button class="btn-rat ${hasRaT ? 'applied' : ''}" onclick="toggleRaT('${p.upid}')">
                    ${hasRaT ? '<i class="fas fa-check"></i> Applied' : '<i class="fas fa-arrow-down"></i> Apply ($75)'}
                </button>
            </div>
        `;
    }).join('');
}

/**
 * Toggle RaT application
 */
function toggleRaT(upid) {
    const player = KAP_STATE.mlbPlayers.find(p => p.upid === upid);
    if (!player) return;
    
    const hasRaT = KAP_STATE.ratApplications.some(rat => rat.upid === upid);
    
    if (hasRaT) {
        // Remove RaT
        KAP_STATE.ratApplications = KAP_STATE.ratApplications.filter(rat => rat.upid !== upid);
        player.hasRaT = false;
        player.effectiveContract = player.contract;
    } else {
        // Check budget
        const remaining = KAP_STATE.totalAvailable - calculateTotalSpend();
        if (remaining < 75) {
            showToast('Insufficient KAP balance ($75 required)', 'error');
            return;
        }
        
        // Apply RaT
        const reducedContract = RAT_REDUCTION[player.contract];
        KAP_STATE.ratApplications.push({
            upid: player.upid,
            name: player.name,
            fromContract: player.contract,
            toContract: reducedContract,
            cost: 75
        });
        
        player.hasRaT = true;
        player.effectiveContract = reducedContract;
    }
    
    updateKAPBudgetDisplay();
    displayKeepers();
    displayRaT();
    saveDraft();
}

/**
 * Display buy-ins - DEPRECATED
 * Now handled by kap-buyin-integration.js
 */
function displayBuyIns() {
    // This function is deprecated - buy-ins are now handled by initKAPBuyins()
    // Kept for backwards compatibility during transition
}

/**
 * Load and display draft picks summary
 */
async function loadDraftPicksSummary() {
    const container = document.getElementById('summaryDraftPicks');
    if (!container) return;
    
    try {
        const response = await fetch('./data/draft_order_2026.json');
        const draftData = await response.json();
        
        // Filter for keeper draft and current team
        const teamPicks = draftData.filter(p => 
            p.draft === 'keeper' && 
            p.current_owner === KAP_STATE.team &&
            !p._comment
        );
        
        if (teamPicks.length === 0) {
            container.innerHTML = '<div class="summary-empty">No draft picks found</div>';
            return;
        }
        
        // Sort by round
        teamPicks.sort((a, b) => a.round - b.round);
        
        // Display in compact list format: R# - P# (Overall) [Status]
        const picksHTML = teamPicks.map(pick => {
            const isEliminated = pick.taxed_out || false;
            const traded = pick.traded || (pick.current_owner !== pick.original_owner);
            
            let statusClass = '';
            let statusText = '';
            
            if (isEliminated) {
                statusClass = 'eliminated';
                statusText = 'Taxed Out';
            } else if (traded) {
                statusClass = 'traded';
                statusText = `from ${pick.original_owner}`;
            }
            
            return `
                <div class="pick-summary-row ${statusClass}">
                    <span class="pick-summary-label">R${pick.round} - P${pick.pick}</span>
                    ${statusText ? `<span class="pick-summary-status">${statusText}</span>` : ''}
                </div>
            `;
        }).join('');
        
        container.innerHTML = `
            <div class="picks-summary-list">
                ${picksHTML}
            </div>
            <div class="picks-summary-footer">
                <strong>Total Picks:</strong> ${teamPicks.filter(p => !p.taxed_out).length} available
            </div>
        `;
        
    } catch (error) {
        console.error('Error loading draft picks:', error);
        container.innerHTML = '<div class="summary-empty">Error loading draft picks</div>';
    }
}

/**
 * Toggle buy-in - DEPRECATED
 * Now handled by kap-buyin-integration.js
 */
function toggleBuyIn(round, cost) {
    // This function is deprecated - buy-ins are now handled by kap-buyin-integration.js
    // Click handlers are attached in initKAPBuyins()
    console.warn('toggleBuyIn() called but is deprecated - use kap-buyin-integration.js');
}

/**
 * Update summary
 */
function updateSummary() {
    // Keepers list
    const keepersHTML = KAP_STATE.selectedKeepers.map(upid => {
        const player = KAP_STATE.mlbPlayers.find(p => p.upid === upid);
        if (!player) return '';
        
        const baseCost = KEEPER_SALARIES[player.contract] || 0;
        const ilDiscount = player.hasILTag ? (IL_DISCOUNTS[getContractTier(player.contract)] || 0) : 0;
        const finalCost = baseCost - ilDiscount;
        const profileLink = window.createPlayerLink ? createPlayerLink({ upid: player.upid, name: player.name }) : '#';
        
        return `
            <div class="summary-item">
                <strong><a href="${profileLink}" class="player-link">${player.name}</a></strong> (${player.position} - ${player.team})
                <div style="margin-top: var(--space-xs); font-family: var(--font-mono); font-size: var(--text-sm);">
                    ${player.contract} → $${finalCost}
                    ${player.hasILTag ? ' <span style="color: var(--success);">(IL Tag)</span>' : ''}
                    ${player.hasRaT ? ' <span style="color: #2196F3;">(RaT Applied)</span>' : ''}
                </div>
            </div>
        `;
    }).join('');
    
    document.getElementById('summaryKeepers').innerHTML = keepersHTML || '<div class="summary-empty">No keepers selected</div>';
    document.getElementById('summaryKeeperCount').textContent = getSelectedKeeperSlots();
    
    // Keep banner in sync
    updateKAPBudgetDisplay();
    
    // Tools summary
    const toolsHTML = [];
    
    Object.entries(KAP_STATE.ilTags).forEach(([tier, tag]) => {
        if (tag) {
            toolsHTML.push(`
                <div class="summary-item">
                    <strong>${tier} IL Tag:</strong> ${tag.name} (-$${tag.discount})
                </div>
            `);
        }
    });
    
    KAP_STATE.ratApplications.forEach(rat => {
        toolsHTML.push(`
            <div class="summary-item">
                <strong>RaT:</strong> ${rat.name} (${rat.fromContract} → ${rat.toContract}) - $75
            </div>
        `);
    });
    
    document.getElementById('summaryTools').innerHTML = toolsHTML.length > 0 ? toolsHTML.join('') : '<div class="summary-empty">No tools used</div>';
    
    // Buy-ins summary
    const buyInsHTML = [];
    
    if (KAP_STATE.buyIns[1]) buyInsHTML.push('<div class="summary-item"><strong>Round 1:</strong> $55</div>');
    if (KAP_STATE.buyIns[2]) buyInsHTML.push('<div class="summary-item"><strong>Round 2:</strong> $35</div>');
    if (KAP_STATE.buyIns[3]) buyInsHTML.push('<div class="summary-item"><strong>Round 3:</strong> $10</div>');
    
    document.getElementById('summaryBuyIns').innerHTML = buyInsHTML.length > 0 ? buyInsHTML.join('') : '<div class="summary-empty">No buy-ins purchased</div>';
    
    // Draft picks summary
    loadDraftPicksSummary();
    
    // Budget table
    const tbody = document.getElementById('summaryBudgetTable');
    const rows = [];
    
    const salaryCost = calculateKeeperSalaryCost();
    const buyInCost = (KAP_STATE.buyIns[1] ? 55 : 0) + (KAP_STATE.buyIns[2] ? 35 : 0) + (KAP_STATE.buyIns[3] ? 10 : 0);
    
    if (salaryCost > 0) rows.push(`<tr><td>Keeper Salaries</td><td>$${salaryCost}</td></tr>`);
    if (buyInCost > 0) rows.push(`<tr><td>Round Buy-Ins</td><td>$${buyInCost}</td></tr>`);
    
    tbody.innerHTML = rows.join('');
    
    const taxableSpend = calculateTaxableSpend();
    const taxFreeSpend = calculateTaxFreeSpend();
    const remaining = KAP_STATE.totalAvailable - (taxableSpend + taxFreeSpend);
    const taxBracket = calculateTaxBracket(taxableSpend);
    
    document.getElementById('summaryTaxableTotal').textContent = `$${taxableSpend}`;
    document.getElementById('summaryTaxFreeTotal').textContent = `$${taxFreeSpend}`;
    document.getElementById('summaryTaxPicks').textContent = taxBracket.rounds.length > 0 ? `Rounds ${taxBracket.rounds.join(', ')}` : 'None';
    document.getElementById('summaryRollover').textContent = `$${Math.min(remaining, 100)}`;
    
    // Validation
    validateKAP();
}

/**
 * Validate KAP submission
 */
function validateKAP() {
    const warnings = [];
    const warningsEl = document.getElementById('validationWarnings');
    const submitBtn = document.getElementById('submitKAPBtn');
    const submitBtnTop = document.getElementById('submitKAPBtnTop');
    
    // Check keeper count (roster slots)
    if (getSelectedKeeperSlots() > 26) {
        warnings.push('Maximum 26 keepers (roster slots) exceeded');
    }
    
    // Check taxable spend limit
    const taxableSpend = calculateTaxableSpend();
    if (taxableSpend > 435) {
        warnings.push(`Taxable spend ($${taxableSpend}) exceeds maximum $435`);
    }
    
    // Check budget
    const totalSpend = calculateTotalSpend();
    if (totalSpend > KAP_STATE.totalAvailable) {
        warnings.push(`Total spend ($${totalSpend}) exceeds available budget ($${KAP_STATE.totalAvailable})`);
    }

    // Enforce KAP submission window
    const windowMessages = [];
    const now = new Date();
    if (KAP_STATE.kapOpenDate && now < KAP_STATE.kapOpenDate) {
        const formatted = typeof formatDate === 'function' ? formatDate(KAP_STATE.kapOpenDate) : KAP_STATE.kapOpenDate.toISOString().slice(0, 10);
        windowMessages.push(`KAP submissions open on ${formatted}. You can continue editing your draft until then.`);
    } else if (KAP_STATE.kapEndDate && now > KAP_STATE.kapEndDate) {
        windowMessages.push('The KAP submission window has closed. You can no longer submit changes.');
    }

    const allMessages = warnings.concat(windowMessages);
    if (allMessages.length > 0) {
        warningsEl.classList.add('has-warnings');
        warningsEl.innerHTML = `
            <h4><i class="fas fa-exclamation-triangle"></i> Validation Errors</h4>
            <ul>${allMessages.map(w => `<li>• ${w}</li>`).join('')}</ul>
        `;
        submitBtn.disabled = true;
        if (submitBtnTop) submitBtnTop.disabled = true;
    } else {
        warningsEl.classList.remove('has-warnings');
        warningsEl.innerHTML = '';
        submitBtn.disabled = false;
        if (submitBtnTop) submitBtnTop.disabled = false;
    }
}

/**
 * Show confirmation modal
 */
function showConfirmation() {
    // Enforce KAP submission window before showing confirmation
    const now = new Date();
    if (KAP_STATE.kapOpenDate && now < KAP_STATE.kapOpenDate) {
        const formatted = typeof formatDate === 'function' ? formatDate(KAP_STATE.kapOpenDate) : KAP_STATE.kapOpenDate.toISOString().slice(0, 10);
        showToast(`KAP submissions open on ${formatted}. You can continue editing your draft until then.`, 'error');
        return;
    }
    if (KAP_STATE.kapEndDate && now > KAP_STATE.kapEndDate) {
        showToast('The KAP submission window has closed. You can no longer submit changes.', 'error');
        return;
    }

    const taxableSpend = calculateTaxableSpend();
    const taxFreeSpend = calculateTaxFreeSpend();
    const totalSpend = taxableSpend + taxFreeSpend;
    const remaining = KAP_STATE.totalAvailable - totalSpend;
    const rollover = Math.min(remaining, 100);
    const taxBracket = calculateTaxBracket(taxableSpend);
    
    const summaryHTML = `
        <div class="confirmation-section">
            <h4>Keepers (${getSelectedKeeperSlots()})</h4>
            <ul>
                ${KAP_STATE.selectedKeepers.map(upid => {
                    const p = KAP_STATE.mlbPlayers.find(pl => pl.upid === upid);
                    return `<li>${p ? p.name : upid} - ${p ? p.contract : ''}</li>`;
                }).join('')}
            </ul>
        </div>
        
        <div class="confirmation-totals">
            <div class="confirmation-totals-row">
                <span>Taxable Spend:</span>
                <strong style="color: var(--primary-red);">$${taxableSpend}</strong>
            </div>
            <div class="confirmation-totals-row">
                <span>Tax-Free (RaT):</span>
                <strong style="color: #2196F3;">$${taxFreeSpend}</strong>
            </div>
            <div class="confirmation-totals-row total">
                <span>Total Spend:</span>
                <strong style="color: var(--accent-yellow);">$${totalSpend}</strong>
            </div>
            <div class="confirmation-totals-row">
                <span>Draft Tax:</span>
                <strong style="color: #FF9800;">${taxBracket.rounds.length > 0 ? `Rounds ${taxBracket.rounds.join(', ')}` : 'None'}</strong>
            </div>
            <div class="confirmation-totals-row">
                <span>Rollover to APA:</span>
                <strong style="color: var(--success);">$${rollover}</strong>
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
 * Confirm and submit KAP
 */
async function confirmSubmit() {
    console.log('🚀 Submitting KAP - Logging all transactions...');

    // Double-check submission window in case dates changed while page was open
    const now = new Date();
    if (KAP_STATE.kapOpenDate && now < KAP_STATE.kapOpenDate) {
        const formatted = typeof formatDate === 'function' ? formatDate(KAP_STATE.kapOpenDate) : KAP_STATE.kapOpenDate.toISOString().slice(0, 10);
        showToast(`KAP submissions open on ${formatted}. You can continue editing your draft until then.`, 'error');
        cancelSubmit();
        return;
    }
    if (KAP_STATE.kapEndDate && now > KAP_STATE.kapEndDate) {
        showToast('The KAP submission window has closed. You can no longer submit changes.', 'error');
        cancelSubmit();
        return;
    }
    
    const taxableSpend = calculateTaxableSpend();
    const taxFreeSpend = calculateTaxFreeSpend();
    const totalSpend = taxableSpend + taxFreeSpend;
    const remaining = KAP_STATE.totalAvailable - totalSpend;
    const rollover = Math.min(remaining, 100);
    
    let currentBalance = KAP_STATE.totalAvailable;
    
    // Log keeper selections
    KAP_STATE.selectedKeepers.forEach(upid => {
        const player = KAP_STATE.mlbPlayers.find(p => p.upid === upid);
        if (!player) return;
        
        const baseCost = KEEPER_SALARIES[player.contract] || 0;
        const ilDiscount = player.hasILTag ? (IL_DISCOUNTS[getContractTier(player.contract)] || 0) : 0;
        const finalCost = baseCost - ilDiscount;
        
        const wbTxnId = logWizBucksTransaction({
            amount: -finalCost,
            transaction_type: player.hasILTag ? 'keeper_salary_il' : 'keeper_salary',
            description: `Keeper salary: ${player.name} - ${player.contract}${player.hasILTag ? ' (IL)' : ''}`,
            related_player: { upid: player.upid, name: player.name },
            balance_before: currentBalance,
            balance_after: currentBalance - finalCost
        });
        
        currentBalance -= finalCost;
        
        logPlayerChange({
            upid: player.upid,
            player_name: player.name,
            update_type: 'keeper_selected',
            changes: {
                status: { from: 'Rostered', to: 'Keeper' },
                contract: { from: player.contract, to: CONTRACT_ADVANCEMENT[player.contract] }
            },
            event: `Selected as keeper - ${player.contract}${player.hasILTag ? ' with IL Tag' : ''}`,
            player_data: player,
            wizbucks_txn_id: wbTxnId
        });
    });
    
    // Log RaT applications
    KAP_STATE.ratApplications.forEach(rat => {
        const wbTxnId = logWizBucksTransaction({
            amount: -75,
            transaction_type: 'reduce_tier',
            description: `Reduce-a-Tier: ${rat.name} (${rat.fromContract} → ${rat.toContract})`,
            related_player: { upid: rat.upid, name: rat.name },
            balance_before: currentBalance,
            balance_after: currentBalance - 75
        });
        
        currentBalance -= 75;
        
        logPlayerChange({
            upid: rat.upid,
            player_name: rat.name,
            update_type: 'tier_reduced',
            changes: {
                effective_contract: { from: rat.fromContract, to: rat.toContract }
            },
            event: `Tier reduced via RaT (${rat.fromContract} → ${rat.toContract})`,
            player_data: KAP_STATE.mlbPlayers.find(p => p.upid === rat.upid),
            wizbucks_txn_id: wbTxnId
        });
    });
    
    // Log buy-ins
    Object.entries(KAP_STATE.buyIns).forEach(([round, purchased]) => {
        if (!purchased) return;
        
        const costs = { 1: 55, 2: 35, 3: 10 };
        const cost = costs[round];
        
        logWizBucksTransaction({
            amount: -cost,
            transaction_type: 'round_buyin',
            description: `Round ${round} buy-in`,
            balance_before: currentBalance,
            balance_after: currentBalance - cost
        });
        
        currentBalance -= cost;
    });
    
    // Log rollover
    if (rollover > 0) {
        logWizBucksTransaction({
            amount: -rollover,
            transaction_type: 'rollover_to_apa',
            description: `Rollover $${rollover} from KAP to APA`,
            balance_before: currentBalance,
            balance_after: currentBalance - rollover
        });
    }
    
    // Mark as submitted
    const submission = {
        team: KAP_STATE.team,
        timestamp: new Date().toISOString(),
        keepers: KAP_STATE.selectedKeepers.map(upid => {
            const p = KAP_STATE.mlbPlayers.find(pl => pl.upid === upid);
            return { upid: p.upid, name: p.name, contract: p.contract };
        }),
        spending: { taxable: taxableSpend, taxFree: taxFreeSpend, total: totalSpend, rollover },
        taxBracket: taxBracket.rounds
    };
    
    const submissions = JSON.parse(localStorage.getItem('kap_submissions_2026') || '{}');
    submissions[KAP_STATE.team] = submission;
    localStorage.setItem('kap_submissions_2026', JSON.stringify(submissions));
    
    localStorage.removeItem(`kap_draft_${KAP_STATE.team}_2026`);
    
    document.getElementById('confirmationModal').classList.remove('active');
    showToast('✅ KAP Submitted! Redirecting...', 'success');
    
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 2000);
}

/**
 * Helper functions
 */
function getContractTier(contract) {
    if (contract.startsWith('TC')) return 'TC';
    if (contract.startsWith('VC')) return 'VC';
    if (contract.startsWith('FC')) return 'FC';
    return 'TC';
}

function saveDraft() {
    const draft = {
        selectedKeepers: KAP_STATE.selectedKeepers,
        ilTags: KAP_STATE.ilTags,
        ratApplications: KAP_STATE.ratApplications,
        buyIns: KAP_STATE.buyIns,
        timestamp: new Date().toISOString()
    };
    
    localStorage.setItem(`kap_draft_${KAP_STATE.team}_2026`, JSON.stringify(draft));
}

function logWizBucksTransaction(data) {
    const ledger = JSON.parse(localStorage.getItem('wizbucks_ledger') || '[]');
    
    const txn = {
        txn_id: `wb_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
        timestamp: new Date().toISOString(),
        team: KAP_STATE.team,
        installment: 'kap',
        amount: data.amount,
        balance_before: data.balance_before,
        balance_after: data.balance_after,
        transaction_type: data.transaction_type,
        description: data.description,
        related_player: data.related_player || null,
        metadata: { season: 2026, source: 'web_ui' }
    };
    
    ledger.push(txn);
    localStorage.setItem('wizbucks_ledger', JSON.stringify(ledger));
    return txn.txn_id;
}

function logPlayerChange(data) {
    const playerLog = JSON.parse(localStorage.getItem('player_log') || '[]');
    
    const entry = {
        log_id: `player_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
        timestamp: new Date().toISOString(),
        season: 2026,
        source: 'web_ui',
        upid: data.upid,
        player_name: data.player_name,
        team: data.player_data?.team || '',
        pos: data.player_data?.position || '',
        owner: KAP_STATE.team,
        update_type: data.update_type,
        changes: data.changes,
        event: data.event,
        related_transactions: { wizbucks_txn_id: data.wizbucks_txn_id }
    };
    
    playerLog.push(entry);
    localStorage.setItem('player_log', JSON.stringify(playerLog));
    return entry.log_id;
}

function showSubmittedView() {
    document.getElementById('submittedView').style.display = 'block';
    
    const submissions = JSON.parse(localStorage.getItem('kap_submissions_2026') || '{}');
    const submission = submissions[KAP_STATE.team];
    
    if (submission) {
        document.getElementById('submittedDate').textContent = new Date(submission.timestamp).toLocaleString();
        
        const summaryHTML = `
            <div class="summary-list">
                <div class="summary-item">
                    <strong>Keepers Selected:</strong> ${submission.keepers.length}
                </div>
                <div class="summary-item">
                    <strong>Total Spend:</strong> $${submission.spending.total}
                </div>
                <div class="summary-item">
                    <strong>Draft Tax:</strong> ${submission.taxBracket.length > 0 ? `Rounds ${submission.taxBracket.join(', ')}` : 'None'}
                </div>
                <div class="summary-item">
                    <strong>Rollover to APA:</strong> $${submission.spending.rollover}
                </div>
            </div>
        `;
        
        document.getElementById('submittedSummary').innerHTML = summaryHTML;
    }
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? 'check-circle' : 'exclamation-circle';
    toast.innerHTML = `<i class="fas fa-${icon}"></i><span>${message}</span>`;
    document.body.appendChild(toast);

    const removeToast = () => {
        if (!toast.isConnected) return;
        toast.remove();
        document.removeEventListener('click', onDocumentClick);
    };

    const onDocumentClick = (event) => {
        // Any click (on toast or elsewhere) dismisses the toast
        removeToast();
    };

    toast.addEventListener('click', (e) => {
        e.stopPropagation();
        removeToast();
    });

    // Attach document listener on next tick so we don't instantly consume
    // the click that triggered the toast.
    setTimeout(() => {
        document.addEventListener('click', onDocumentClick, { once: true });
    }, 0);

    setTimeout(removeToast, 5000);
}

// Expose functions
window.initKAPPage = initKAPPage;
window.nextStep = nextStep;
window.prevStep = prevStep;
window.toggleKeeper = toggleKeeper;
window.applyILTag = applyILTag;
window.removeILTag = removeILTag;
window.toggleRaT = toggleRaT;
window.toggleBuyIn = toggleBuyIn;
window.showConfirmation = showConfirmation;
window.cancelSubmit = cancelSubmit;
window.confirmSubmit = confirmSubmit;
