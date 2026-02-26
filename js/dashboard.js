/**
 * FBP Hub - Dashboard JavaScript (Minimal Version)
 * Most dashboard logic moved to dashboard-tabs.js and lineup-builder.js
 * This file only handles auth guard and provides helper functions
 */

document.addEventListener('DOMContentLoaded', () => {
    // Require authentication
    if (!AuthUI.requireAuth()) {
        return;
    }
});

/**
 * Apply team color scheme using CSS variables
 */
function applyDashboardTeamTheme(team) {
    const root = document.documentElement;

    if (!team || typeof FBPHub === 'undefined') {
        root.style.removeProperty('--team-primary');
        root.style.removeProperty('--team-secondary');
        root.style.removeProperty('--team-accent-1');
        root.style.removeProperty('--team-accent-2');
        root.style.removeProperty('--team-accent-3');
        return;
    }

    const colors = FBPHub.data?.teamColors?.[team.abbreviation];
    if (colors && colors.primary) {
        const secondary = colors.secondary || '#FFB612';
        root.style.setProperty('--team-primary', colors.primary);
        root.style.setProperty('--team-secondary', secondary);
        if (colors.accent1) root.style.setProperty('--team-accent-1', colors.accent1);
        if (colors.accent2) root.style.setProperty('--team-accent-2', colors.accent2);
        if (colors.accent3) root.style.setProperty('--team-accent-3', colors.accent3);
    } else {
        root.style.removeProperty('--team-primary');
        root.style.removeProperty('--team-secondary');
        root.style.removeProperty('--team-accent-1');
        root.style.removeProperty('--team-accent-2');
        root.style.removeProperty('--team-accent-3');
    }
}

/**
 * Show toast notification
 */
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: 'check-circle',
        error: 'exclamation-circle',
        warning: 'exclamation-triangle'
    };
    
    toast.innerHTML = `
        <i class="fas fa-${icons[type]}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

/**
 * Contract purchase modal (legacy - still used by Quick Actions)
 */
async function showContractPurchaseModal() {
    // Check if self-service is enabled (after PAD deadline)
    const enabled = await isContractPurchaseEnabled();
    if (!enabled) {
        showToast('Contract purchases open after PAD deadline', 'warning');
        return;
    }
    
    const team = authManager.getTeam();
    if (!team) return;
    
    // Filter to prospects eligible for upgrade
    const teamPlayers = FBPHub.data.players.filter(p => 
        p.FBP_Team === team.abbreviation || p.manager === team.name
    );
    const prospects = teamPlayers.filter(p => p.player_type === 'Farm');
    
    const eligible = [];
    
    prospects.forEach(p => {
        const contract = (p.contract_type || '').toLowerCase();
        
        if (contract.includes('development')) {
            eligible.push({ ...p, upgradeCost: 5, upgradeType: 'DC → PC', newContract: 'Purchased Contract' });
            eligible.push({ ...p, upgradeCost: 15, upgradeType: 'DC → BC', newContract: 'Blue Chip Contract' });
        } else if (contract.includes('purchased')) {
            eligible.push({ ...p, upgradeCost: 10, upgradeType: 'PC → BC', newContract: 'Blue Chip Contract' });
        }
    });
    
    if (eligible.length === 0) {
        showToast('No prospects available for contract upgrade', 'warning');
        return;
    }
    
    // Get WizBucks balance
    const wizData = FBPHub.data.wizbucks || {};
    let balance = 0;
    if (team.name && wizData[team.name] !== undefined) {
        balance = wizData[team.name];
    } else if (wizData[team.abbreviation] !== undefined) {
        balance = wizData[team.abbreviation];
    }
    
    const modalHTML = `
        <div class="contract-purchase-modal active" id="contractPurchaseModal">
            <div class="contract-purchase-content">
                <div class="contract-purchase-header">
                    <h2><i class="fas fa-file-contract"></i> Purchase Contract Upgrades</h2>
                    <p>Upgrade your prospects to higher contract tiers</p>
                </div>
                
                <div class="balance-display">
                    <span class="balance-label">Your WizBucks Balance:</span>
                    <span class="balance-value">$${balance}</span>
                </div>
                
                <div class="contract-info-box">
                    <div class="info-row">
                        <span class="info-label">📄 DC → PC:</span>
                        <span class="info-value">$5</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">⭐ DC → BC:</span>
                        <span class="info-value">$15</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">⭐ PC → BC:</span>
                        <span class="info-value">$10</span>
                    </div>
                </div>
                
                <div class="upgrade-options">
                    <h4>Your Eligible Prospects:</h4>
                    <div class="upgrade-list">
                        ${eligible.map(p => {
                            const canAfford = balance >= p.upgradeCost;
                            return `
                                <div class="upgrade-option ${canAfford ? '' : 'insufficient-funds'}" 
                                     ${canAfford ? `onclick="selectContractUpgrade('${p.upid}', '${p.upgradeType}', ${p.upgradeCost}, '${p.newContract}')"` : ''}>
                                    <div class="upgrade-player-info">
                                        <div class="upgrade-player-name">${p.name}</div>
                                        <div class="upgrade-player-meta">${p.position || 'N/A'} - ${p.team || 'FA'}</div>
                                    </div>
                                    <div class="upgrade-action">
                                        <div class="upgrade-type">${p.upgradeType}</div>
                                        <div class="upgrade-cost ${canAfford ? '' : 'insufficient'}">
                                            $${p.upgradeCost}
                                            ${!canAfford ? '<span class="insufficient-badge">Insufficient</span>' : ''}
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
                
                <div class="contract-purchase-actions">
                    <button class="btn-secondary" onclick="closeContractPurchaseModal()">
                        <i class="fas fa-times"></i> Cancel
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function closeContractPurchaseModal() {
    const modal = document.getElementById('contractPurchaseModal');
    if (modal) modal.remove();
}

/**
 * Select a contract upgrade and show confirmation modal
 */
function selectContractUpgrade(upid, upgradeType, cost, newContract) {
    const player = FBPHub.data.players.find(p => p.upid === upid);
    if (!player) return;
    
    const currentContract = player.contract_type || 'None';
    
    const confirmHTML = `
        <div class="contract-confirm-modal active" id="contractConfirmModal">
            <div class="confirmation-content">
                <div class="confirmation-header">
                    <h2><i class="fas fa-check-circle"></i> Confirm Contract Purchase</h2>
                    <p>Review before purchasing</p>
                </div>
                
                <div class="confirmation-section">
                    <h4>Player: ${player.name}</h4>
                    <div style="margin-top: var(--space-md);">
                        <p><strong>Position:</strong> ${player.position || 'N/A'}</p>
                        <p><strong>MLB Team:</strong> ${player.team || 'FA'}</p>
                        <p><strong>Current Contract:</strong> ${currentContract}</p>
                    </div>
                </div>
                
                <div class="confirmation-section">
                    <h4>Purchase Details</h4>
                    <div class="upgrade-summary">
                        <div class="upgrade-summary-row">
                            <span>Contract Type:</span>
                            <span class="upgrade-type-display">${newContract}</span>
                        </div>
                        <div class="upgrade-summary-row">
                            <span>Cost:</span>
                            <span class="cost-display">$${cost}</span>
                        </div>
                    </div>
                </div>
                
                <div class="confirmation-warning">
                    <i class="fas fa-info-circle"></i>
                    <strong>This will deduct $${cost} from your WizBucks balance</strong>
                    <p>The contract purchase will be logged to your transaction history</p>
                </div>
                
                <div class="confirmation-actions">
                    <button class="btn-secondary" onclick="closeContractConfirmModal()">
                        <i class="fas fa-times"></i> Cancel
                    </button>
                    <button class="btn-primary" id="confirmPurchaseBtn" 
                            onclick="confirmContractPurchase('${upid}', '${upgradeType}', ${cost}, '${newContract}')">
                        <i class="fas fa-check"></i> Purchase for $${cost}
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', confirmHTML);
}

/**
 * Close contract confirmation modal
 */
function closeContractConfirmModal() {
    const modal = document.getElementById('contractConfirmModal');
    if (modal) modal.remove();
}

/**
 * Check if self-service contract purchases are enabled (after PAD deadline)
 */
async function isContractPurchaseEnabled() {
    try {
        const base = window.FBPHub?.config?.dataPath || './data/';
        const res = await fetch(base + 'season_dates.json');
        if (!res.ok) return true;
        const dates = await res.json();
        const padDate = dates.prospect_draft;
        if (!padDate) return true;
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const padDeadline = new Date(padDate + 'T00:00:00');
        
        return today > padDeadline;
    } catch (e) {
        console.warn('Could not check PAD deadline:', e);
        return true;
    }
}

/**
 * Confirm and execute contract purchase via API
 */
async function confirmContractPurchase(upid, upgradeType, cost, newContract) {
    const btn = document.getElementById('confirmPurchaseBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    }
    
    const session = typeof authManager !== 'undefined' ? authManager.getSession() : null;
    const token = session?.token;
    
    if (!token) {
        showToast('Your session has expired. Please log in again.', 'error');
        closeContractConfirmModal();
        return;
    }
    
    const team = authManager.getTeam();
    if (!team) {
        showToast('Could not determine your team', 'error');
        closeContractConfirmModal();
        return;
    }
    
    const player = FBPHub.data.players.find(p => p.upid === upid);
    if (!player) {
        showToast('Player not found', 'error');
        closeContractConfirmModal();
        return;
    }
    
    const currentSeason = new Date().getFullYear();
    
    const payload = {
        season: currentSeason,
        team: team.abbreviation,
        upid: upid,
        new_contract_type: newContract,
        log_source: 'Dashboard Self-Service'
    };
    
    try {
        const res = await fetch(`${AUTH_CONFIG.workerUrl}/api/manager/contract-purchase`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
        });
        
        if (!res.ok) {
            let detail = '';
            try {
                const body = await res.json();
                detail = body.detail || body.error || '';
            } catch (e) {}
            const baseMsg = `Contract purchase failed (status ${res.status})`;
            const fullMsg = detail ? `${baseMsg}: ${detail}` : baseMsg;
            showToast(fullMsg, 'error');
            
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-check"></i> Purchase for $' + cost;
            }
            return;
        }
        
        const result = await res.json();
        const chargedCost = (result.cost !== null && result.cost !== undefined) ? result.cost : cost;
        
        if (!result.player) {
            console.error('Contract purchase: unexpected response', result);
            showToast(`Contract purchase failed: Invalid response from server`, 'error');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-check"></i> Purchase for $' + chargedCost;
            }
            return;
        }
        
        // Update local player data
        const idx = FBPHub.data.players.findIndex(p => p.upid === upid);
        if (idx !== -1) {
            FBPHub.data.players[idx] = result.player;
        }
        
        // Update WizBucks balance locally
        if (result.wizbucks_balance !== null && result.wizbucks_balance !== undefined) {
            if (team.name && FBPHub.data.wizbucks[team.name] !== undefined) {
                FBPHub.data.wizbucks[team.name] = result.wizbucks_balance;
            } else if (FBPHub.data.wizbucks[team.abbreviation] !== undefined) {
                FBPHub.data.wizbucks[team.abbreviation] = result.wizbucks_balance;
            }
        }
        
        closeContractConfirmModal();
        closeContractPurchaseModal();
        
        const contractName = newContract === 'Purchased Contract' ? 'PC' : 'BC';
        showToast(`✅ ${player.name} - ${contractName} purchased! -$${chargedCost} WB`, 'success');
        
        // Reload lineup if available
        if (window.LineupBuilder?.reload) {
            window.LineupBuilder.reload();
        }
        
    } catch (err) {
        console.error('Contract purchase error', err);
        showToast(`Contract purchase failed: ${err.message || 'Network error'}`, 'error');
        
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-check"></i> Purchase for $' + cost;
        }
    }
}

// Expose functions globally
window.applyDashboardTeamTheme = applyDashboardTeamTheme;
window.showToast = showToast;
window.showContractPurchaseModal = showContractPurchaseModal;
window.closeContractPurchaseModal = closeContractPurchaseModal;
window.selectContractUpgrade = selectContractUpgrade;
window.closeContractConfirmModal = closeContractConfirmModal;
window.confirmContractPurchase = confirmContractPurchase;
window.isContractPurchaseEnabled = isContractPurchaseEnabled;
