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
const CONTRACT_ADVANCEMENT = {
    'TC-R': 'TC-1',
    'TC-BC-1': 'TC-BC-2',
    'TC-BC-2': 'TC-1',
    'TC-1': 'TC-2',
    'TC-2': 'TC-2', // Stays
    'VC-1': 'VC-2',
    'VC-2': 'VC-2', // Stays
    'FC-1': 'FC-2',
    'FC-2': 'FC-2+',
    'FC-2+': 'FC-2+'
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
    rolloverFromPAD: 30,
    totalAvailable: 405,
    
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
    displayBuyIns();
    
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
    // Load WizBucks from PAD rollover
    // In production: fetch from wizbucks_ledger.json
    KAP_STATE.rolloverFromPAD = 30; // Mock
    KAP_STATE.totalAvailable = KAP_STATE.kapAllotment + KAP_STATE.rolloverFromPAD;
    
    // Load MLB players
    if (typeof FBPHub !== 'undefined' && FBPHub.data?.players) {
        KAP_STATE.mlbPlayers = FBPHub.data.players.filter(p => 
            p.manager === KAP_STATE.team && 
            p.player_type === 'MLB'
        ).map(p => ({
            upid: p.upid || '',
            name: p.name,
            team: p.team,
            position: p.position,
            age: p.age || null,
            contract: p.contract_type || 'TC-1',
            years: p.years_simple || '',
            isKeeper: false,
            hasILTag: false,
            hasRaT: false,
            ilDiscount: 0,
            effectiveContract: p.contract_type || 'TC-1'
        }));
    } else {
        // Mock data
        KAP_STATE.mlbPlayers = getMockMLBPlayers();
    }
    
    // Load saved draft
    const savedDraft = localStorage.getItem(`kap_draft_${KAP_STATE.team}_2026`);
    if (savedDraft) {
        try {
            const draft = JSON.parse(savedDraft);
            KAP_STATE.selectedKeepers = draft.selectedKeepers || [];
            KAP_STATE.ilTags = draft.ilTags || { TC: null, VC: null, FC: null };
            KAP_STATE.ratApplications = draft.ratApplications || [];
            KAP_STATE.buyIns = draft.buyIns || { 1: false, 2: false, 3: false };
            
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
 * Mock MLB players
 */
function getMockMLBPlayers() {
    return [
        { upid: '10001', name: 'Bobby Witt Jr.', team: 'KC', position: 'SS', age: 24, contract: 'VC-2', years: 'VC-2', isKeeper: false },
        { upid: '10002', name: 'Kyle Schwarber', team: 'PHI', position: 'OF', age: 31, contract: 'FC-1', years: 'FC-1', isKeeper: false },
        { upid: '10003', name: 'Jackson Chourio', team: 'MIL', position: 'OF', age: 20, contract: 'TC-R', years: 'R-4', isKeeper: false },
        { upid: '10004', name: 'Corbin Carroll', team: 'ARI', position: 'OF', age: 23, contract: 'VC-1', years: 'VC-1', isKeeper: false },
        { upid: '10005', name: 'Jazz Chisholm Jr.', team: 'NYY', position: '3B', age: 26, contract: 'TC-2', years: 'TC-2', isKeeper: false },
        { upid: '10006', name: 'Jordan Westburg', team: 'BAL', position: '2B', age: 25, contract: 'TC-1', years: 'TC-1', isKeeper: false }
    ];
}

/**
 * Setup sticky bar
 */
function setupStickyBar() {
    const stickyBar = document.getElementById('kapStickyBar');
    if (!stickyBar) return;
    
    const observer = new IntersectionObserver(
        ([entry]) => {
            stickyBar.classList.toggle('is-stuck', !entry.isIntersecting);
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

function calculateTaxableSpend() {
    const salaryCost = calculateKeeperSalaryCost();
    const buyInCost = (KAP_STATE.buyIns[1] ? 55 : 0) + (KAP_STATE.buyIns[2] ? 35 : 0) + (KAP_STATE.buyIns[3] ? 10 : 0);
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
    
    document.getElementById('barTotalKAP').textContent = `$${KAP_STATE.totalAvailable}`;
    document.getElementById('barTaxableSpend').textContent = `$${taxableSpend}`;
    document.getElementById('barTaxFreeSpend').textContent = `$${taxFreeSpend}`;
    document.getElementById('barRemaining').textContent = `$${remaining}`;
    
    if (taxBracket.rounds.length > 0) {
        document.getElementById('barTaxBracket').textContent = `$${taxBracket.min}-${taxBracket.max}`;
        document.getElementById('barTaxRounds').textContent = `Lose: ${taxBracket.rounds.join(', ')}`;
    } else {
        document.getElementById('barTaxBracket').textContent = 'None';
        document.getElementById('barTaxRounds').textContent = '';
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
        
        return `
            <div class="keeper-card ${p.isKeeper ? 'selected' : ''}">
                <div class="keeper-header">
                    <div class="keeper-info">
                        <h4>${p.name}</h4>
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
    
    // Update summary cards
    document.getElementById('keepersSelected').textContent = KAP_STATE.selectedKeepers.length;
    document.getElementById('salaryCost').textContent = `$${calculateKeeperSalaryCost()}`;
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
        if (KAP_STATE.selectedKeepers.length >= 26) {
            showToast('Maximum 26 keepers', 'error');
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
                <div class="il-tag-label">${tier} Tag</div>
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
 * Display buy-ins
 */
function displayBuyIns() {
    [1, 2, 3].forEach(round => {
        const isPurchased = KAP_STATE.buyIns[round];
        const statusEl = document.getElementById(`buyin${round}Status`);
        const btnEl = document.getElementById(`buyin${round}Btn`);
        
        if (isPurchased) {
            statusEl.textContent = 'Purchased';
            statusEl.classList.add('active');
            btnEl.classList.add('purchased');
            btnEl.innerHTML = '<i class="fas fa-check"></i> Purchased (Click to Remove)';
        } else {
            statusEl.textContent = 'Not Purchased';
            statusEl.classList.remove('active');
            btnEl.classList.remove('purchased');
            btnEl.innerHTML = '<i class="fas fa-shopping-cart"></i> Purchase';
        }
        
        const card = btnEl.closest('.buyin-card');
        card.classList.toggle('purchased', isPurchased);
    });
}

/**
 * Toggle buy-in
 */
function toggleBuyIn(round, cost) {
    const isPurchased = KAP_STATE.buyIns[round];
    
    if (!isPurchased) {
        // Purchase
        const remaining = KAP_STATE.totalAvailable - calculateTotalSpend();
        if (remaining < cost) {
            showToast(`Insufficient KAP balance ($${cost} required)`, 'error');
            return;
        }
        
        KAP_STATE.buyIns[round] = true;
        showToast(`Round ${round} buy-in purchased`, 'success');
    } else {
        // Remove
        KAP_STATE.buyIns[round] = false;
        showToast(`Round ${round} buy-in removed`, 'success');
    }
    
    updateKAPBudgetDisplay();
    displayBuyIns();
    saveDraft();
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
        
        return `
            <div class="summary-item">
                <strong>${player.name}</strong> (${player.position} - ${player.team})
                <div style="margin-top: var(--space-xs); font-family: var(--font-mono); font-size: var(--text-sm);">
                    ${player.contract} → $${finalCost}
                    ${player.hasILTag ? ' <span style="color: var(--success);">(IL Tag)</span>' : ''}
                    ${player.hasRaT ? ' <span style="color: #2196F3;">(RaT Applied)</span>' : ''}
                </div>
            </div>
        `;
    }).join('');
    
    document.getElementById('summaryKeepers').innerHTML = keepersHTML || '<div class="summary-empty">No keepers selected</div>';
    document.getElementById('summaryKeeperCount').textContent = KAP_STATE.selectedKeepers.length;
    
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
    
    // Check keeper count
    if (KAP_STATE.selectedKeepers.length > 26) {
        warnings.push('Maximum 26 keepers exceeded');
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
    
    if (warnings.length > 0) {
        warningsEl.classList.add('has-warnings');
        warningsEl.innerHTML = `
            <h4><i class="fas fa-exclamation-triangle"></i> Validation Errors</h4>
            <ul>${warnings.map(w => `<li>• ${w}</li>`).join('')}</ul>
        `;
        submitBtn.disabled = true;
    } else {
        warningsEl.classList.remove('has-warnings');
        warningsEl.innerHTML = '';
        submitBtn.disabled = false;
    }
}

/**
 * Show confirmation modal
 */
function showConfirmation() {
    const taxableSpend = calculateTaxableSpend();
    const taxFreeSpend = calculateTaxFreeSpend();
    const totalSpend = taxableSpend + taxFreeSpend;
    const remaining = KAP_STATE.totalAvailable - totalSpend;
    const rollover = Math.min(remaining, 100);
    const taxBracket = calculateTaxBracket(taxableSpend);
    
    const summaryHTML = `
        <div class="confirmation-section">
            <h4>Keepers (${KAP_STATE.selectedKeepers.length})</h4>
            <ul>
                ${KAP_STATE.selectedKeepers.map(upid => {
                    const p = KAP_STATE.mlbPlayers.find(pl => pl.upid === upid);
                    return `<li>${p.name} - ${p.contract}</li>`;
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
    setTimeout(() => toast.remove(), 5000);
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
