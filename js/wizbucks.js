/**
 * FBP Hub - WizBucks Ledger JavaScript
 * Displays transaction history with running balances
 */

// Page state
let allTransactions = [];
let displayedTransactions = [];
let currentFilters = {
    manager: '',
    action: '',
    search: ''
};
let displayCount = 50;
const LOAD_INCREMENT = 50;

/**
 * Initialize WizBucks page
 */
function initWizBucksPage() {
    console.log('💰 Initializing WizBucks ledger...');
    
    // Load transactions
    loadTransactions();
    
    // Display current balances
    displayBalances();
    
    // Setup filters
    setupFilters();
    
    // Setup search
    setupSearch();
    
    // Setup load more
    setupLoadMore();
    
    // Setup export
    setupExport();
}

/**
 * Load transaction data
 */
async function loadTransactions() {
    try {
        const response = await fetch('./data/wizbucks_transactions.json');
        
        if (response.ok) {
            const raw = await response.json();
            allTransactions = normalizeTransactions(raw || []);
        } else {
            // Generate sample data from current balances
            allTransactions = generateSampleTransactions();
        }
        
        console.log(`✅ Loaded ${allTransactions.length} transactions`);
        displayLedger();
        
    } catch (error) {
        console.error('Error loading transactions:', error);
        // Use sample data as fallback
        allTransactions = generateSampleTransactions();
        displayLedger();
    }
}

/**
 * Normalize transactions from either the legacy 2025 hub schema
 * (id/action/note/date/credit/debit/manager/balance) or the newer
 * 2026+ trade-bot schema (txn_id/timestamp/team/amount/...).
 */
function normalizeTransactions(raw) {
    if (!Array.isArray(raw)) return [];
    if (raw.length === 0) return [];

    const first = raw[0] || {};

    // New 2026+ schema from fbp-trade-bot
    if (Object.prototype.hasOwnProperty.call(first, 'txn_id')) {
        return raw.map((t) => {
            const amount = Number(t.amount || 0);
            const credit = amount > 0 ? amount : 0;
            const debit = amount < 0 ? -amount : 0;
            const managerAbbr = (t.team || '').toString().toUpperCase();
            const balanceAfter = Number(t.balance_after ?? t.balance ?? 0);
            const ts = t.timestamp || '';

            return {
                action: t.transaction_type || 'WB',
                note: t.description || '',
                date: ts,
                credit,
                debit,
                manager: managerAbbr || getTeamAbbreviationFromName(managerAbbr),
                balance: balanceAfter,
                related_player: t.related_player || null,
            };
        });
    }

    // Legacy 2025 schema used by the old hub / Sheets export
    return raw.map((t) => {
        const managerAbbr = getTeamAbbreviationFromName(t.manager || '');
        return {
            action: t.action || '',
            note: t.note || '',
            date: t.date || '',
            credit: Number(t.credit || 0),
            debit: Number(t.debit || 0),
            manager: managerAbbr,
            balance: Number(t.balance || 0),
            related_player: null,
        };
    });
}

/**
 * Generate sample transactions for demo
 */
function generateSampleTransactions() {
    const sample = [
        {
            id: 1,
            action: 'Admin Add',
            note: 'Pre-season CB Reward',
            date: '2025-01-28',
            credit: 120,
            debit: 0,
            manager: 'HAM',
            balance: 120
        },
        {
            id: 2,
            action: 'PC',
            note: 'PAD - 8 PC Purchased',
            date: '2025-02-11',
            credit: 0,
            debit: 80,
            manager: 'HAM',
            balance: 40
        },
        // Add more sample transactions here
    ];
    
    return sample;
}

/** Helper: map full team name from wizbucks.json → FBP abbreviation */
function getTeamAbbreviationFromName(name) {
    if (typeof TEAM_NAMES === 'undefined') return name;
    for (const [abbr, fullName] of Object.entries(TEAM_NAMES)) {
        if (fullName === name) return abbr;
    }
    return name;
}

/**
 * Display current balances
 */
function displayBalances() {
    const grid = document.getElementById('balancesGrid');
    const totalEl = document.getElementById('totalWB');
    
    if (!grid || !FBPHub.data.wizbucks) return;
    
    const balances = FBPHub.data.wizbucks;
    
    // Calculate total
    const total = Object.values(balances).reduce((sum, val) => sum + val, 0);
    if (totalEl) totalEl.textContent = `$${total.toLocaleString()}`;
    
    // Build list with abbreviations and sort by balance (highest first)
    const sorted = Object.entries(balances)
        .map(([name, balance]) => {
            const abbr = getTeamAbbreviationFromName(name);
            return { name, abbr, balance };
        })
        .sort((a, b) => b.balance - a.balance);
    
    // Create balance cards
    const cards = sorted.map(({ name, abbr, balance }) => {
        // Count PCs for this team using abbreviation
        const pcCount = FBPHub.data.players.filter(p => 
            p.FBP_Team === abbr && 
            p.player_type === 'Farm' && 
            (p.years_simple?.includes('PC') || p.contract_type?.includes('Purchased'))
        ).length;
        
        return `
            <div class="balance-card" data-team="${abbr}">
                <div class="balance-team">${abbr}</div>
                <div class="balance-amount">$${balance}</div>
                <div class="balance-pc-count">${pcCount} PCs</div>
            </div>
        `;
    }).join('');
    
    grid.innerHTML = cards;
    
    // Add click handlers to filter by team (using abbreviation)
    document.querySelectorAll('.balance-card').forEach(card => {
        card.addEventListener('click', () => {
            const team = card.dataset.team;
            const managerFilter = document.getElementById('managerFilter');
            
            if (managerFilter) {
                managerFilter.value = team;
                currentFilters.manager = team;
                
                // Highlight selected card
                document.querySelectorAll('.balance-card').forEach(c => 
                    c.classList.remove('selected')
                );
                card.classList.add('selected');
                
                displayCount = LOAD_INCREMENT;
                displayLedger();
            }
        });
    });
}

/**
 * Setup filter dropdowns
 */
function setupFilters() {
    const managerFilter = document.getElementById('managerFilter');
    
    if (managerFilter) {
        // Populate manager options using abbreviations for compact display
        const teams = Object.keys(FBPHub.data.wizbucks || {})
            .map(name => getTeamAbbreviationFromName(name))
            .sort();
        teams.forEach(teamAbbr => {
            const option = document.createElement('option');
            option.value = teamAbbr;
            option.textContent = teamAbbr;
            managerFilter.appendChild(option);
        });
        
        managerFilter.addEventListener('change', (e) => {
            currentFilters.manager = e.target.value;
            displayCount = LOAD_INCREMENT;
            displayLedger();
            
            // Update balance card selection
            document.querySelectorAll('.balance-card').forEach(card => {
                card.classList.toggle('selected', card.dataset.team === e.target.value);
            });
        });
    }
    
    const actionFilter = document.getElementById('actionFilter');
    if (actionFilter) {
        actionFilter.addEventListener('change', (e) => {
            currentFilters.action = e.target.value;
            displayCount = LOAD_INCREMENT;
            displayLedger();
        });
    }
    
    const clearBtn = document.getElementById('clearFilters');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            currentFilters = { manager: '', action: '', search: '' };
            document.getElementById('managerFilter').value = '';
            document.getElementById('actionFilter').value = '';
            document.getElementById('ledgerSearch').value = '';
            document.querySelectorAll('.balance-card').forEach(c => 
                c.classList.remove('selected')
            );
            displayCount = LOAD_INCREMENT;
            displayLedger();
        });
    }
    
    const reverseOrder = document.getElementById('reverseOrder');
    if (reverseOrder) {
        reverseOrder.addEventListener('change', () => {
            displayLedger();
        });
    }
}

/**
 * Setup search
 */
function setupSearch() {
    const searchInput = document.getElementById('ledgerSearch');
    const clearBtn = document.getElementById('clearSearch');
    
    if (!searchInput) return;
    
    const debouncedSearch = debounce((value) => {
        currentFilters.search = value;
        displayCount = LOAD_INCREMENT;
        displayLedger();
    }, 300);
    
    searchInput.addEventListener('input', (e) => {
        const value = e.target.value;
        
        if (clearBtn) {
            clearBtn.style.display = value ? 'flex' : 'none';
        }
        
        debouncedSearch(value);
    });
    
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            currentFilters.search = '';
            clearBtn.style.display = 'none';
            displayCount = LOAD_INCREMENT;
            displayLedger();
        });
    }
}

/**
 * Setup load more
 */
function setupLoadMore() {
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    
    if (!loadMoreBtn) return;
    
    loadMoreBtn.addEventListener('click', () => {
        displayCount += LOAD_INCREMENT;
        displayLedger();
    });
}

/**
 * Setup export
 */
function setupExport() {
    const exportBtn = document.getElementById('exportLedger');
    
    if (!exportBtn) return;
    
    exportBtn.addEventListener('click', () => {
        exportToCSV();
    });
}

/**
 * Display ledger with filters
 */
function displayLedger() {
    const tbody = document.getElementById('ledgerBody');
    const countEl = document.getElementById('transactionCount');
    const loadMoreContainer = document.getElementById('loadMoreContainer');
    
    if (!tbody) return;
    
    // Filter transactions
    let filtered = [...allTransactions];
    
    if (currentFilters.manager) {
        filtered = filtered.filter(t => t.manager === currentFilters.manager);
    }
    
    if (currentFilters.action) {
        filtered = filtered.filter(t => t.action === currentFilters.action);
    }
    
    if (currentFilters.search) {
        const search = currentFilters.search.toLowerCase();
        filtered = filtered.filter(t => 
            t.note.toLowerCase().includes(search) ||
            t.action.toLowerCase().includes(search)
        );
    }
    
    // Sort by date
    const reverseOrder = document.getElementById('reverseOrder');
    const isReversed = reverseOrder?.checked ?? true;
    
    filtered.sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        return isReversed ? dateB - dateA : dateA - dateB;
    });
    
    displayedTransactions = filtered;
    
    // Update count
    if (countEl) {
        const showing = Math.min(displayCount, filtered.length);
        countEl.textContent = `Showing ${showing} of ${filtered.length} transactions`;
    }
    
    // Show/hide load more
    if (loadMoreContainer) {
        loadMoreContainer.style.display = filtered.length > displayCount ? 'block' : 'none';
    }
    
    // Display rows
    const toShow = filtered.slice(0, displayCount);
    
    if (toShow.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-ledger">
                    <i class="fas fa-search"></i>
                    <p>No transactions found</p>
                </td>
            </tr>
        `;
        return;
    }
    
    const rows = toShow.map(t => {
        const actionClass = getActionClass(t.action);
        const creditDisplay = t.credit > 0 ? `$${t.credit}` : '—';
        const debitDisplay = t.debit > 0 ? `$${t.debit}` : '—';
        
        let playerHTML = '';
        if (t.related_player && window.createPlayerLink) {
            const link = createPlayerLink(t.related_player);
            const name = t.related_player.name || t.related_player.player_name || '';
            if (name) {
                playerHTML = `<div class="transaction-player">Player: <a href="${link}" class="player-link">${name}</a></div>`;
            }
        }

        return `
            <tr>
                <td class="col-action">
                    <span class="action-badge ${actionClass}">${t.action}</span>
                </td>
                <td class="col-note">
                    <span class="transaction-note">${t.note}</span>
                    ${playerHTML}
                </td>
                <td class="col-date">${formatDate(t.date)}</td>
                <td class="col-credit ${t.credit > 0 ? 'credit-amount' : ''}">${creditDisplay}</td>
                <td class="col-debit ${t.debit > 0 ? 'debit-amount' : ''}">${debitDisplay}</td>
                <td class="col-manager">${createTeamBadge(t.manager)}</td>
                <td class="col-balance balance-amount-cell">$${t.balance}</td>
            </tr>
        `;
    }).join('');
    
    tbody.innerHTML = rows;
}

/**
 * Get CSS class for action type
 */
function getActionClass(action) {
    const classes = {
        'PC': 'action-pc',
        'DC Slot': 'action-dc',
        'Trade': 'action-trade',
        'Waiver': 'action-waiver',
        'Refund': 'action-refund',
        'Buy-In RD': 'action-buy-in',
        'Admin Add': 'action-admin'
    };
    
    // Check for partial matches
    for (const [key, value] of Object.entries(classes)) {
        if (action.includes(key)) return value;
    }
    
    return 'action-badge';
}

/**
 * Export ledger to CSV
 */
function exportToCSV() {
    const headers = ['Action', 'Note', 'Date', 'Credit', 'Debit', 'Manager', 'Balance'];
    const rows = displayedTransactions.map(t => [
        t.action,
        t.note,
        t.date,
        t.credit || 0,
        t.debit || 0,
        t.manager,
        t.balance
    ]);
    
    const csv = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fbp-wizbucks-ledger-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast('Ledger exported to CSV!');
}

// Make function available globally
window.initWizBucksPage = initWizBucksPage;
