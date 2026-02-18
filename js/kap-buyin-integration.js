/**
 * KAP Buy-In Integration
 * Handles immediate buy-in purchases during KAP process
 * Synced with draft-picks.html purchases
 */

const BUYIN_COSTS = {
    1: 55,
    2: 35,
    3: 10
};

let currentTeam = null;
let buyinStatus = {
    1: { purchased: false, cost: 55 },
    2: { purchased: false, cost: 35 },
    3: { purchased: false, cost: 10 }
};

/**
 * Initialize buy-in section in KAP
 */
async function initKAPBuyins(team) {
    currentTeam = team;
    
    // Load current buy-in status
    await loadBuyinStatus();
    
    // Display buy-in cards
    displayBuyinCards();
    
    // Update taxable spend if buy-ins already purchased
    updateTaxableSpendFromBuyins();
}

/**
 * Load buy-in status from draft order
 */
async function loadBuyinStatus() {
    try {
        const response = await fetch('./data/draft_order_2026.json');
        const draftOrder = await response.json();
        
        // Check rounds 1-3 for this team's buy-in status
        [1, 2, 3].forEach(round => {
            const pick = draftOrder.find(p => 
                p.draft === 'keeper' && 
                p.round === round && 
                p.current_owner === currentTeam
            );
            
            if (pick) {
                buyinStatus[round].purchased = pick.buyin_purchased || false;
            }
        });
        
        console.log('✅ Buy-in status loaded:', buyinStatus);
    } catch (error) {
        console.error('Error loading buy-in status:', error);
    }
}

/**
 * Display buy-in cards - Updates existing HTML elements
 */
function displayBuyinCards() {
    [1, 2, 3].forEach(round => {
        const status = buyinStatus[round];
        const statusEl = document.getElementById(`buyin${round}Status`);
        const btnEl = document.getElementById(`buyin${round}Btn`);
        const cardEl = btnEl?.closest('.buyin-card');

        if (!statusEl || !btnEl) return;

        // Ensure these never behave like form submits
        try { btnEl.type = 'button'; } catch (e) {}

        if (status.purchased) {
            statusEl.textContent = 'Already Purchased';
            statusEl.classList.add('active');
            btnEl.classList.add('purchased');
            btnEl.disabled = true;
            btnEl.innerHTML = '<i class="fas fa-check-circle"></i> Purchased';
            cardEl?.classList.add('purchased');
            btnEl.onclick = null;
        } else {
            statusEl.textContent = 'Not Purchased';
            statusEl.classList.remove('active');
            btnEl.classList.remove('purchased');
            btnEl.disabled = false;
            btnEl.innerHTML = '<i class="fas fa-shopping-cart"></i> Purchase';
            cardEl?.classList.remove('purchased');

            // Attach click handler
            btnEl.onclick = (e) => {
                try { e?.preventDefault?.(); } catch (err) {}
                try { e?.stopPropagation?.(); } catch (err) {}
                if (typeof window.purchaseBuyinFromKAP === 'function') {
                    window.purchaseBuyinFromKAP(round, status.cost);
                }
            };
        }
    });
}

/**
 * Purchase buy-in from KAP page
 */
function _buyinAuthHeaders() {
    const headers = {};

    // Prefer Discord auth token (Cloudflare Worker allows Authorization header).
    try {
        const session = (typeof authManager !== 'undefined' && authManager.getSession)
            ? authManager.getSession()
            : null;
        if (session?.token) {
            headers['Authorization'] = `Bearer ${session.token}`;
        }
    } catch (e) {}

    // Local dev fallback: allow direct-to-bot key usage when running on localhost.
    try {
        const host = (window.location.hostname || '').toLowerCase();
        const isLocal = host === 'localhost' || host === '127.0.0.1';
        if (isLocal && FBPHub?.config?.apiKey) {
            headers['X-API-Key'] = FBPHub.config.apiKey;
        }
    } catch (e) {}

    return headers;
}

function getKAPPurchaseBalance() {
    // Buy-in API validates against managers.json KAP balance (allotments.KAP.total)
    try {
        if (typeof KAP_STATE !== 'undefined' && typeof KAP_STATE.kapAllotment === 'number') {
            return KAP_STATE.kapAllotment;
        }
    } catch (e) {}

    return getKAPBalance();
}

window.purchaseBuyinFromKAP = async function(round, cost) {
    // Get current KAP balance
    const kapBalance = getKAPPurchaseBalance();

    // Show confirmation modal
    showBuyinConfirmationModal(round, cost, kapBalance);
};

/**
 * Show buy-in confirmation modal
 */
function showBuyinConfirmationModal(round, cost, kapBalance) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'kapBuyinModal';
    
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2><i class="fas fa-exclamation-triangle"></i> Confirm Buy-In Purchase</h2>
            </div>
            <div class="modal-body">
                <div class="modal-warning">
                    <strong>⚠️ This purchase is immediate and NON-REFUNDABLE</strong>
                    <p>The buy-in will be purchased now, not when you submit KAP.</p>
                </div>
                
                <div class="modal-info">
                    <p><strong>Round ${round} Buy-In</strong></p>
                    <p>Cost: <strong>$${cost}</strong> (taxable)</p>
                    <p>Your KAP Balance: <strong>$${kapBalance}</strong></p>
                    <p>Remaining After Purchase: <strong>$${kapBalance - cost}</strong></p>
                </div>
                
                <div class="buyin-effects">
                    <h4>Effects:</h4>
                    <ul>
                        <li><i class="fas fa-minus-circle"></i> Deducted from WizBucks wallet immediately</li>
                        <li><i class="fas fa-plus-circle"></i> Added to taxable spend</li>
                        <li><i class="fas fa-lock-open"></i> Enables trading picks in Round ${round}</li>
                        <li><i class="fas fa-exclamation"></i> Removes Round ${29 - getTotalBuyins() - 1} from available picks</li>
                    </ul>
                </div>
                
                ${kapBalance < cost ? `
                    <div class="modal-error">
                        <strong>❌ Insufficient WizBucks</strong>
                        <p>You need $${cost} but only have $${kapBalance} available.</p>
                    </div>
                ` : ''}
            </div>
            <div class="modal-actions">
                <button class="btn-secondary" onclick="closeBuyinModal()">
                    <i class="fas fa-times"></i> Cancel
                </button>
                <button class="btn-primary" ${kapBalance < cost ? 'disabled' : ''} 
                        onclick="confirmBuyinPurchase(${round}, ${cost})">
                    <i class="fas fa-check"></i> Confirm Purchase
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

/**
 * Confirm buy-in purchase
 */
window.confirmBuyinPurchase = async function(round, cost) {
    try {
        // Call buy-in API (same endpoint as draft-picks page)
        const response = await fetch(`${FBPHub.config.apiBase}/api/buyin/purchase`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ..._buyinAuthHeaders(),
            },
            body: JSON.stringify({
                team: currentTeam,
                round: round,
                cost: cost,
                purchased_by: authManager.getUser().username
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Purchase failed');
        }
        
        const result = await response.json();

        // Success! Update local state
        buyinStatus[round].purchased = true;

        // If KAP page state is present, reflect new backend balance immediately.
        try {
            if (typeof KAP_STATE !== 'undefined') {
                if (typeof result?.new_balance === 'number') {
                    KAP_STATE.kapAllotment = result.new_balance;
                    KAP_STATE.totalAvailable = KAP_STATE.kapAllotment + (KAP_STATE.rolloverFromPAD || 0);
                }
                if (KAP_STATE.buyIns && typeof KAP_STATE.buyIns === 'object') {
                    KAP_STATE.buyIns[round] = true;
                }
            }
        } catch (e) {}

        // Close modal
        closeBuyinModal();

        // Reload draft order data for preview calculations
        await loadBuyinStatus();

        // Refresh display
        displayBuyinCards();

        // Refresh KAP UI displays
        updateTaxableSpendFromBuyins();
        try { if (typeof saveDraft === 'function') saveDraft(); } catch (e) {}

        // Show success message
        showSuccessToast(`Round ${round} buy-in purchased successfully!`);
        
    } catch (error) {
        console.error('Buy-in purchase error:', error);
        alert(`Failed to purchase buy-in: ${error.message}`);
    }
};

/**
 * Close buy-in modal
 */
window.closeBuyinModal = function() {
    document.getElementById('kapBuyinModal')?.remove();
};

/**
 * Get total buy-ins purchased
 */
function getTotalBuyins() {
    return Object.values(buyinStatus).filter(s => s.purchased).length;
}

/**
 * Get total buy-in spend
 */
function getTotalBuyinSpend() {
    return Object.entries(buyinStatus)
        .filter(([_, status]) => status.purchased)
        .reduce((sum, [_, status]) => sum + status.cost, 0);
}

/**
 * Update taxable spend display to include buy-ins
 */
function updateTaxableSpendFromBuyins() {
    // KAP page derives taxable spend via calculateTaxableSpend(), which calls
    // getTotalBuyinSpend() from this integration file.
    try {
        if (typeof updateKAPBudgetDisplay === 'function') {
            updateKAPBudgetDisplay();
        }

        // If user is on the review step, refresh the summary too.
        if (typeof KAP_STATE !== 'undefined' && KAP_STATE.currentStep === 3 && typeof updateSummary === 'function') {
            updateSummary();
        }
    } catch (e) {
        console.warn('Failed to refresh KAP totals after buy-in update:', e);
    }
}

/**
 * Get WizBucks balance from wallet
 */
function getKAPBalance() {
    // Try to get from KAP_STATE first
    if (typeof KAP_STATE !== 'undefined' && KAP_STATE.totalAvailable) {
        return KAP_STATE.totalAvailable;
    }
    // Fallback to window.kapState
    return window.kapState?.wizbucksBalance || 0;
}

/**
 * Calculate other taxable spend (to be implemented by main KAP form)
 */
function calculateOtherTaxableSpend() {
    // Get from KAP_STATE if available
    if (typeof KAP_STATE !== 'undefined' && typeof calculateTaxableSpend === 'function') {
        return calculateTaxableSpend() - getTotalBuyinSpend(); // Exclude buy-ins already counted
    }
    // Returns taxable spend from other sources (FA, contracts, etc.)
    return window.kapState?.otherTaxableSpend || 0;
}

/**
 * Show success toast notification
 */
function showSuccessToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification success';
    toast.innerHTML = `
        <i class="fas fa-check-circle"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('show');
    }, 100);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Export buy-in status for draft pick calculator
 */
window.getKAPBuyinStatus = function() {
    return {
        total: getTotalBuyins(),
        spend: getTotalBuyinSpend(),
        rounds: Object.entries(buyinStatus)
            .filter(([_, status]) => status.purchased)
            .map(([round, _]) => parseInt(round))
    };
};
