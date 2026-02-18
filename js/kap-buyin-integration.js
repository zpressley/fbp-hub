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
 * Display buy-in cards
 */
function displayBuyinCards() {
    const container = document.getElementById('buyinCardsContainer');
    if (!container) return;
    
    container.innerHTML = '';
    
    [1, 2, 3].forEach(round => {
        const status = buyinStatus[round];
        const card = createBuyinCard(round, status);
        container.appendChild(card);
    });
}

/**
 * Create buy-in card
 */
function createBuyinCard(round, status) {
    const card = document.createElement('div');
    card.className = 'buyin-card';
    
    card.innerHTML = `
        <h3>Round ${round}</h3>
        <div class="buyin-cost">$${status.cost}</div>
        <div class="buyin-status">${status.purchased ? 'Already Purchased' : 'Not Purchased'}</div>
        ${status.purchased ? 
            '<button class="buyin-btn purchased" disabled><i class="fas fa-check-circle"></i> Purchased</button>' :
            `<button class="buyin-btn" onclick="purchaseBuyinFromKAP(${round}, ${status.cost})">
                <i class="fas fa-shopping-cart"></i> Purchase
            </button>`
        }
    `;
    
    return card;
}

/**
 * Purchase buy-in from KAP page
 */
window.purchaseBuyinFromKAP = async function(round, cost) {
    // Get current KAP balance
    const kapBalance = getKAPBalance();
    
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
                    <p>Your WizBucks Balance: <strong>$${kapBalance}</strong></p>
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
                'X-API-Key': FBPHub.config.apiKey
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
        
        // Success! Update local state
        buyinStatus[round].purchased = true;
        
        // Close modal
        closeBuyinModal();
        
        // Refresh display
        displayBuyinCards();
        
        // Update taxable spend display
        updateTaxableSpendFromBuyins();
        
        // Show success message
        showSuccessToast(`Round ${round} buy-in purchased successfully!`);
        
        // Reload draft order data for preview calculations
        await loadBuyinStatus();
        
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
    const buyinSpend = getTotalBuyinSpend();
    
    // Update the taxable spend counter at top of KAP page
    const taxableElement = document.getElementById('taxableSpend');
    if (taxableElement) {
        // Get other taxable items
        const otherTaxable = calculateOtherTaxableSpend(); // from main KAP form
        const total = buyinSpend + otherTaxable;
        
        taxableElement.textContent = `$${total}`;
        
        // Update tax bracket display
        updateTaxBracketDisplay(total);
    }
}

/**
 * Get WizBucks balance from wallet
 */
function getKAPBalance() {
    // Get current WizBucks from manager's wallet
    return window.kapState?.wizbucksBalance || 0;
}

/**
 * Calculate other taxable spend (to be implemented by main KAP form)
 */
function calculateOtherTaxableSpend() {
    // This should be implemented in the main KAP.js file
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
