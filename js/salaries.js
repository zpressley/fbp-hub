/**
 * FBP Hub - Keeper Salary Calculator
 * Calculates keeper salaries, tax brackets, and IL tag discounts
 */

// Salary constants
const SALARY_CONFIG = {
    contracts: {
        'TC(R)': 5,
        'TC-R': 5,
        'R-4': 5,
        'R-3': 5,
        'R-2': 5,
        'R-1': 5,
        'TC(1)': 15,
        'TC-1': 15,
        '(3)': 15,
        'TC(2)': 25,
        'TC-2': 25,
        '(2)': 15,  // Standard contracts
        '(1)': 15,
        '(0)': 15,
        'VC(1)': 35,
        'VC-1': 35,
        'VC(2)': 55,
        'VC-2': 55,
        'FC(1)': 85,
        'FC-1': 85,
        'F1': 85,
        'FC(2+)': 125,
        'FC-2+': 125,
        'F2': 125,
        'F3': 125,
        'F3+': 125
    },
    ilDiscounts: {
        'TC': 10,
        'VC': 15,
        'FC': 35
    },
    taxBrackets: [
        { min: 421, max: Infinity, rounds: [4,5,6,7,8], label: '$421+' },
        { min: 401, max: 420, rounds: [5,6,7], label: '$401-$420' },
        { min: 376, max: 400, rounds: [6,7,8], label: '$376-$400' },
        { min: 351, max: 375, rounds: [7,8,9], label: '$351-$375' },
        { min: 326, max: 350, rounds: [8,9,10], label: '$326-$350' },
        { min: 0, max: 325, rounds: [], label: '≤$325' }
    ]
};

// Page state
let currentTeam = null;
let teamKeepers = [];
let totalSalary = 0;

/**
 * Initialize salaries page
 */
function initSalariesPage() {
    console.log('💵 Initializing keeper salaries page...');
    
    setupTeamSelector();
    setupSimulator();
}

/**
 * Setup team selector
 */
function setupTeamSelector() {
    const teamSelect = document.getElementById('teamSelect');
    if (!teamSelect) return;
    
    // Populate teams
    const teams = {
        'HAM': 'Hammers',
        'RV': 'Rick Vaughn',
        'B2J': 'Btwn2Jackies',
        'CFL': 'Country Fried Lamb',
        'LAW': 'Law-Abiding Citizens',
        'LFB': 'La Flama Blanca',
        'JEP': 'Jepordizers!',
        'TBB': 'The Bluke Blokes',
        'WIZ': 'Whiz Kids',
        'DRO': 'Andromedans',
        'SAD': 'not much of a donkey',
        'WAR': 'Weekend Warriors'
    };
    
    Object.entries(teams).forEach(([abbr, name]) => {
        const option = document.createElement('option');
        option.value = abbr;
        option.textContent = `${abbr} - ${name}`;
        teamSelect.appendChild(option);
    });
    
    // If authenticated, pre-select user's team
    if (typeof authManager !== 'undefined' && authManager.isAuthenticated()) {
        const userTeam = authManager.getTeam();
        if (userTeam) {
            teamSelect.value = userTeam.abbreviation;
            loadTeamSalaries(userTeam.abbreviation);
        }
    }
    
    teamSelect.addEventListener('change', (e) => {
        const team = e.target.value;
        if (team) {
            loadTeamSalaries(team);
        } else {
            hideAllSections();
        }
    });
}

/**
 * Load salaries for selected team
 */
function loadTeamSalaries(team) {
    console.log(`💰 Loading salaries for ${team}...`);
    
    currentTeam = team;
    
    // Get team's MLB players (keepers) by FBP_Team abbreviation
    teamKeepers = FBPHub.data.players.filter(p => 
        p.FBP_Team === team && p.player_type === 'MLB'
    );
    
    if (teamKeepers.length === 0) {
        showEmptyState('No keepers found for this team');
        return;
    }
    
    // Calculate salaries
    calculateTeamSalary();
    
    // Display everything
    displaySalarySummary();
    displayContractBreakdown();
    displayKeeperList();
    
    hideEmptyState();
}

/**
 * Calculate total team salary
 */
function calculateTeamSalary() {
    totalSalary = 0;
    
    teamKeepers.forEach(keeper => {
        const salary = getPlayerSalary(keeper);
        keeper.calculatedSalary = salary;
        totalSalary += salary.netSalary;
    });
    
    console.log(`✅ Total salary for ${currentTeam}: $${totalSalary}`);
}

/**
 * Get salary for individual player
 */
function getPlayerSalary(player) {
    const contract = player.years_simple || player.contract_type || '';
    
    // Get base salary
    let baseSalary = SALARY_CONFIG.contracts[contract] || 0;
    
    // If not found, try to parse contract type
    if (baseSalary === 0) {
        const contractType = getContractType(contract);
        baseSalary = SALARY_CONFIG.contracts[contractType] || 0;
    }
    
    // Check for IL tag (this would come from a separate data file in production)
    const hasILTag = false; // TODO: Load from data/il_tags.json
    
    // Calculate IL discount
    let ilDiscount = 0;
    if (hasILTag) {
        const tier = getContractTier(contract);
        ilDiscount = SALARY_CONFIG.ilDiscounts[tier] || 0;
    }
    
    return {
        baseSalary: baseSalary,
        ilDiscount: ilDiscount,
        netSalary: baseSalary - ilDiscount,
        hasILTag: hasILTag,
        contract: contract
    };
}

/**
 * Get contract tier (TC, VC, or FC)
 */
function getContractTier(contract) {
    if (contract.startsWith('TC') || contract.startsWith('R')) return 'TC';
    if (contract.startsWith('VC')) return 'VC';
    if (contract.startsWith('FC') || contract.startsWith('F')) return 'FC';
    if (contract.match(/^\(\d\)$/)) return 'TC'; // Standard contracts like (3), (2), (1)
    return 'TC'; // Default
}

/**
 * Get standardized contract type
 */
function getContractType(contract) {
    // Handle various formats
    if (contract.includes('R-') || contract === 'R') return 'TC(R)';
    if (contract.includes('TC(1)') || contract === 'TC-1') return 'TC(1)';
    if (contract.includes('TC(2)') || contract === 'TC-2') return 'TC(2)';
    if (contract.includes('VC(1)') || contract === 'VC-1') return 'VC(1)';
    if (contract.includes('VC(2)') || contract === 'VC-2') return 'VC(2)';
    if (contract.includes('FC(1)') || contract === 'FC-1' || contract === 'F1') return 'FC(1)';
    if (contract.includes('FC(2') || contract.includes('F2') || contract.includes('F3')) return 'FC(2+)';
    
    // Standard contracts
    if (contract === '(3)') return 'TC(1)';
    if (contract === '(2)') return 'TC(1)';
    if (contract === '(1)') return 'TC(1)';
    if (contract === '(0)') return 'VC(1)';
    
    return contract;
}

/**
 * Calculate tax bracket
 */
function getTaxBracket(salary) {
    for (const bracket of SALARY_CONFIG.taxBrackets) {
        if (salary >= bracket.min && salary <= bracket.max) {
            return bracket;
        }
    }
    return SALARY_CONFIG.taxBrackets[SALARY_CONFIG.taxBrackets.length - 1];
}

/**
 * Display salary summary
 */
function displaySalarySummary() {
    const summarySection = document.getElementById('salarySummary');
    if (!summarySection) return;
    
    summarySection.style.display = 'block';
    
    // Total salary
    document.getElementById('totalSalary').textContent = `$${totalSalary}`;
    document.getElementById('keeperCount').textContent = teamKeepers.length;
    
    // Tax bracket
    const bracket = getTaxBracket(totalSalary);
    document.getElementById('taxBracket').textContent = bracket.label;
    
    if (bracket.rounds.length > 0) {
        const roundsText = `Rounds ${bracket.rounds.join(', ')}`;
        document.getElementById('taxRounds').textContent = roundsText;
        document.getElementById('taxRounds').style.color = '#F44336';
    } else {
        document.getElementById('taxRounds').textContent = 'No tax - spend freely!';
        document.getElementById('taxRounds').style.color = '#4CAF50';
    }
    
    // Roster cap
    const rosterCount = teamKeepers.length;
    document.getElementById('rosterCount').textContent = rosterCount;
    
    const rosterStatus = document.getElementById('rosterStatus');
    if (rosterCount > 26) {
        rosterStatus.textContent = `Over limit by ${rosterCount - 26}`;
        rosterStatus.style.color = '#F44336';
    } else if (rosterCount === 26) {
        rosterStatus.textContent = 'At maximum';
        rosterStatus.style.color = '#FFC107';
    } else {
        rosterStatus.textContent = `${26 - rosterCount} spots available`;
        rosterStatus.style.color = '#4CAF50';
    }
    
    // IL tags (would need actual data from il_tags.json)
    const ilTagsUsed = teamKeepers.filter(k => k.calculatedSalary?.hasILTag).length;
    document.getElementById('ilTagsUsed').textContent = ilTagsUsed;
    document.getElementById('ilTagsAvailable').textContent = `${3 - ilTagsUsed} of 3 available`;
}

/**
 * Display contract tier breakdown
 */
function displayContractBreakdown() {
    const breakdownSection = document.getElementById('contractBreakdown');
    if (!breakdownSection) return;
    
    breakdownSection.style.display = 'block';
    
    // Group by tier
    const tiers = {
        TC: { players: [], total: 0 },
        VC: { players: [], total: 0 },
        FC: { players: [], total: 0 }
    };
    
    teamKeepers.forEach(keeper => {
        const tier = getContractTier(keeper.years_simple || keeper.contract_type || '');
        if (tiers[tier]) {
            tiers[tier].players.push(keeper);
            tiers[tier].total += keeper.calculatedSalary?.netSalary || 0;
        }
    });
    
    // Update TC card
    const tcCard = document.getElementById('tcCard');
    if (tcCard) {
        tcCard.querySelector('.tier-count').textContent = `${tiers.TC.players.length} players`;
        tcCard.querySelector('.tier-salary').textContent = `$${tiers.TC.total} total`;
    }
    
    // Update VC card
    const vcCard = document.getElementById('vcCard');
    if (vcCard) {
        vcCard.querySelector('.tier-count').textContent = `${tiers.VC.players.length} players`;
        vcCard.querySelector('.tier-salary').textContent = `$${tiers.VC.total} total`;
    }
    
    // Update FC card
    const fcCard = document.getElementById('fcCard');
    if (fcCard) {
        fcCard.querySelector('.tier-count').textContent = `${tiers.FC.players.length} players`;
        fcCard.querySelector('.tier-salary').textContent = `$${tiers.FC.total} total`;
    }
}

/**
 * Display keeper list table
 */
function displayKeeperList() {
    const keeperList = document.getElementById('keeperList');
    const tbody = document.getElementById('keepersBody');
    const footer = document.getElementById('totalSalaryFooter');
    
    if (!keeperList || !tbody) return;
    
    keeperList.style.display = 'block';
    
    // Sort by salary (highest first)
    const sorted = [...teamKeepers].sort((a, b) => 
        (b.calculatedSalary?.netSalary || 0) - (a.calculatedSalary?.netSalary || 0)
    );
    
    const rows = sorted.map(keeper => {
        const salary = keeper.calculatedSalary;
        const ilTagIcon = salary.hasILTag ? '<i class="fas fa-medkit il-tag-icon"></i>' : '';
        
        return `
            <tr>
                <td>
                    <div class="player-name-cell">
                        <strong>${keeper.name}</strong>
                        <span class="player-team-mini">${keeper.team || 'FA'}</span>
                    </div>
                </td>
                <td>${createPositionBadge(keeper.position)}</td>
                <td><span class="contract-display">${keeper.years_simple || 'N/A'}</span></td>
                <td class="salary-cell">$${salary.baseSalary}</td>
                <td class="il-cell">
                    ${ilTagIcon}
                    ${salary.ilDiscount > 0 ? `-$${salary.ilDiscount}` : '—'}
                </td>
                <td class="net-salary-cell">$${salary.netSalary}</td>
            </tr>
        `;
    }).join('');
    
    tbody.innerHTML = rows;
    
    if (footer) {
        footer.textContent = `$${totalSalary}`;
    }
}

/**
 * Setup simulator modal
 */
function setupSimulator() {
    const toggleBtn = document.getElementById('toggleSimulator');
    const modal = document.getElementById('simulatorModal');
    const closeBtn = document.getElementById('closeSimulator');
    
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            openSimulator();
        });
    }
    
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }
    
    // Close on outside click
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    }
}

/**
 * Open salary simulator
 */
function openSimulator() {
    const modal = document.getElementById('simulatorModal');
    const body = document.getElementById('simulatorBody');
    
    if (!modal || !body) return;
    
    body.innerHTML = `
        <div class="simulator-content">
            <p class="simulator-intro">
                <i class="fas fa-info-circle"></i>
                Add or remove keepers to see how it affects your salary and tax bracket
            </p>
            
            <div class="simulator-current">
                <h4>Current Scenario</h4>
                <div class="sim-stat-row">
                    <span>Total Salary:</span>
                    <span class="sim-value">$${totalSalary}</span>
                </div>
                <div class="sim-stat-row">
                    <span>Tax Bracket:</span>
                    <span class="sim-value">${getTaxBracket(totalSalary).label}</span>
                </div>
                <div class="sim-stat-row">
                    <span>Keepers:</span>
                    <span class="sim-value">${teamKeepers.length} / 26</span>
                </div>
            </div>
            
            <div class="simulator-tools">
                <h4>What-If Scenarios</h4>
                <p class="text-muted">Coming soon: Interactive salary simulator</p>
                <ul class="feature-list">
                    <li>Add/remove keepers</li>
                    <li>Toggle IL tags</li>
                    <li>See instant tax bracket changes</li>
                    <li>Compare multiple scenarios</li>
                </ul>
            </div>
        </div>
    `;
    
    modal.style.display = 'flex';
}

/**
 * Hide all sections
 */
function hideAllSections() {
    document.getElementById('salarySummary').style.display = 'none';
    document.getElementById('contractBreakdown').style.display = 'none';
    document.getElementById('keeperList').style.display = 'none';
    document.getElementById('emptyState').style.display = 'block';
}

/**
 * Hide empty state
 */
function hideEmptyState() {
    document.getElementById('emptyState').style.display = 'none';
}

/**
 * Show empty state
 */
function showEmptyState(message) {
    const emptyState = document.getElementById('emptyState');
    emptyState.style.display = 'block';
    emptyState.innerHTML = `
        <i class="fas fa-inbox"></i>
        <p>${message}</p>
    `;
    
    hideAllSections();
}

// Make function available globally
window.initSalariesPage = initSalariesPage;
