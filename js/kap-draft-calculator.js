/**
 * KAP Draft Pick Tax Calculator
 * Validates spending brackets and calculates final draft picks
 */

const TAX_BRACKETS = [
    { min: 421, max: 435, taxedRounds: [4, 5, 6, 7, 8], label: 'Lose Rounds 4-8' },
    { min: 401, max: 420, taxedRounds: [5, 6, 7], label: 'Lose Rounds 5-7' },
    { min: 376, max: 400, taxedRounds: [6, 7, 8], label: 'Lose Rounds 6-8' },
    { min: 351, max: 375, taxedRounds: [7, 8, 9], label: 'Lose Rounds 7-9' },
    { min: 326, max: 350, taxedRounds: [8, 9, 10], label: 'Lose Rounds 8-10' },
    { min: 0, max: 325, taxedRounds: [], label: 'No Tax' }
];

const ROSTER_SIZE = 26;

/**
 * Load keeper draft picks for a team
 */
async function loadTeamDraftPicks(team) {
    const response = await fetch('./data/draft_order_2026.json');
    const allPicks = await response.json();
    
    return allPicks
        .filter(pick => 
            pick.draft === 'keeper' && 
            pick.current_owner === team &&
            !pick.taxed_out
        )
        .sort((a, b) => a.round - b.round);
}

/**
 * Get tax bracket for spending amount
 */
function getTaxBracket(taxableSpend) {
    return TAX_BRACKETS.find(b => taxableSpend >= b.min && taxableSpend <= b.max);
}

/**
 * Validate if team can spend in this bracket
 */
function validateTaxBracket(teamPicks, taxableSpend) {
    const bracket = getTaxBracket(taxableSpend);
    
    if (!bracket) {
        return { valid: false, error: 'Invalid spending amount' };
    }
    
    // No tax = always valid
    if (bracket.taxedRounds.length === 0) {
        return { valid: true, bracket };
    }
    
    // Check if team has ALL required picks
    const teamRounds = teamPicks.map(p => p.round);
    const missingRounds = bracket.taxedRounds.filter(round => !teamRounds.includes(round));
    
    if (missingRounds.length > 0) {
        // Find highest allowed bracket
        const allowedBracket = findHighestAllowedBracket(teamRounds);
        
        return {
            valid: false,
            bracket,
            missing: missingRounds,
            hasRounds: bracket.taxedRounds.filter(r => teamRounds.includes(r)),
            maxAllowed: allowedBracket ? allowedBracket.max : 325,
            maxBracket: allowedBracket,
            error: `Cannot spend $${taxableSpend}. Missing required picks in rounds: ${missingRounds.join(', ')}`
        };
    }
    
    return { valid: true, bracket };
}

/**
 * Find highest spending bracket team qualifies for
 */
function findHighestAllowedBracket(teamRounds) {
    // Check from highest to lowest (excluding no-tax)
    for (let i = 0; i < TAX_BRACKETS.length - 1; i++) {
        const bracket = TAX_BRACKETS[i];
        const hasAll = bracket.taxedRounds.every(round => teamRounds.includes(round));
        if (hasAll) return bracket;
    }
    return null;
}

/**
 * Count buy-ins purchased by team
 */
function countBuyins(teamPicks) {
    // Check rounds 1-3 for purchased buy-ins
    const buyinRounds = [1, 2, 3];
    let buyinCount = 0;
    
    buyinRounds.forEach(round => {
        const pick = teamPicks.find(p => p.round === round);
        if (pick && pick.buyin_purchased) {
            buyinCount++;
        }
    });
    
    return buyinCount;
}

/**
 * Calculate final draft picks after KAP submission
 */
function calculateFinalDraftPicks(teamPicks, keeperCount, taxableSpend) {
    // Step 1: Calculate buy-in penalty (each buy-in removes 1 round from the end)
    const buyinCount = countBuyins(teamPicks);
    const maxRound = 29 - buyinCount; // 29, 28, 27, or 26 depending on buy-ins
    
    // Step 2: Filter picks to only those within max round
    const buyinFilteredPicks = teamPicks.filter(p => p.round <= maxRound);
    const buyinRemovedPicks = teamPicks.filter(p => p.round > maxRound);
    
    // Step 3: Calculate picks needed
    const picksNeeded = ROSTER_SIZE - keeperCount;
    
    // Step 4: Take first N picks (remove excess from the end)
    const availablePicks = buyinFilteredPicks.slice(0, picksNeeded);
    const rosterRemovedPicks = buyinFilteredPicks.slice(picksNeeded);
    
    // Step 5: Apply tax to available picks
    const bracket = getTaxBracket(taxableSpend);
    const taxedPicks = [];
    const finalPicks = [];
    
    availablePicks.forEach(pick => {
        if (bracket && bracket.taxedRounds.includes(pick.round)) {
            taxedPicks.push({ ...pick, taxed_out: true });
        } else {
            finalPicks.push(pick);
        }
    });
    
    return {
        keeperCount,
        picksNeeded,
        totalPicks: teamPicks.length,
        buyinCount,
        maxRound,
        buyinRemovedPicks,
        rosterRemovedPicks,
        availablePicks,
        taxedPicks,
        finalPicks,
        finalPickCount: finalPicks.length,
        bracket
    };
}

/**
 * Display draft pick calculation preview
 */
function displayDraftPickPreview(calculation) {
    const container = document.createElement('div');
    container.className = 'draft-pick-preview';
    
    container.innerHTML = `
        <div class="preview-header">
            <h3><i class="fas fa-calculator"></i> Draft Pick Calculation</h3>
        </div>
        
        <div class="roster-math">
            <div class="math-row">
                <span class="label">Roster Size:</span>
                <span class="value">${ROSTER_SIZE}</span>
            </div>
            <div class="math-row">
                <span class="label">Keepers:</span>
                <span class="value">-${calculation.keeperCount}</span>
            </div>
            <div class="math-row total">
                <span class="label">Picks Needed:</span>
                <span class="value">${calculation.picksNeeded}</span>
            </div>
            ${calculation.buyinCount > 0 ? `
                <div class="math-row buyin-penalty">
                    <span class="label">Buy-Ins Purchased:</span>
                    <span class="value">${calculation.buyinCount}</span>
                </div>
                <div class="math-row buyin-penalty">
                    <span class="label">Max Available Round:</span>
                    <span class="value">Round ${calculation.maxRound}</span>
                </div>
            ` : ''}
        </div>
        
        ${calculation.buyinRemovedPicks.length > 0 ? `
        <div class="picks-section removed">
            <h4><i class="fas fa-shopping-cart"></i> Picks Removed (Buy-In Penalty)</h4>
            <div class="picks-list">
                ${calculation.buyinRemovedPicks.map(pick => `
                    <div class="pick-row removed">
                        <span class="pick-label">Round ${pick.round} - Pick #${pick.pick}</span>
                        <span class="status-badge">BUY-IN PENALTY</span>
                    </div>
                `).join('')}
            </div>
            <p class="section-note">${calculation.buyinRemovedPicks.length} pick(s) removed - each buy-in purchased eliminates 1 round from the end</p>
        </div>
        ` : ''}
        
        ${calculation.rosterRemovedPicks.length > 0 ? `
        <div class="picks-section removed">
            <h4><i class="fas fa-times-circle"></i> Picks Removed (Roster Limit)</h4>
            <div class="picks-list">
                ${calculation.rosterRemovedPicks.map(pick => `
                    <div class="pick-row removed">
                        <span class="pick-label">Round ${pick.round} - Pick #${pick.pick}</span>
                        <span class="status-badge">ROSTER LIMIT</span>
                    </div>
                `).join('')}
            </div>
            <p class="section-note">${calculation.rosterRemovedPicks.length} pick(s) removed to match roster size (${calculation.picksNeeded} picks needed)</p>
        </div>
        ` : ''}
        
        ${calculation.taxedPicks.length > 0 ? `
        <div class="picks-section taxed">
            <h4><i class="fas fa-exclamation-triangle"></i> Picks Taxed (${calculation.bracket.label})</h4>
            <div class="picks-list">
                ${calculation.taxedPicks.map(pick => `
                    <div class="pick-row taxed">
                        <span class="pick-label">Round ${pick.round} - Pick #${pick.pick}</span>
                        <span class="status-badge eliminated">TAXED</span>
                    </div>
                `).join('')}
            </div>
            <p class="section-note">${calculation.taxedPicks.length} pick(s) lost to draft pick tax</p>
        </div>
        ` : ''}
        
        <div class="picks-section final">
            <h4><i class="fas fa-check-circle"></i> Final Draft Picks</h4>
            <div class="picks-list">
                ${calculation.finalPicks.map(pick => `
                    <div class="pick-row final">
                        <span class="pick-label">Round ${pick.round} - Pick #${pick.pick}</span>
                        <span class="team-tag" style="background: ${getTeamColor(pick.current_owner)}">${pick.current_owner}</span>
                    </div>
                `).join('')}
            </div>
            <div class="final-summary">
                <strong>${calculation.finalPickCount} draft picks</strong> available for ${ROSTER_SIZE - calculation.keeperCount} roster spots
            </div>
        </div>
    `;
    
    return container;
}

/**
 * Show confirmation modal with draft pick preview
 */
async function showKAPConfirmation(team, kapData, taxableSpend) {
    // Load team's picks
    const teamPicks = await loadTeamDraftPicks(team);
    
    // Validate tax bracket
    const validation = validateTaxBracket(teamPicks, taxableSpend);
    if (!validation.valid) {
        showTaxBracketError(validation, taxableSpend);
        return false;
    }
    
    // Calculate final picks
    const keeperCount = kapData.keepers.length; // from KAP form
    const calculation = calculateFinalDraftPicks(teamPicks, keeperCount, taxableSpend);
    
    // Build confirmation modal
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'kapConfirmModal';
    
    modal.innerHTML = `
        <div class="modal-content large">
            <div class="modal-header">
                <h2>Confirm KAP Submission</h2>
                <button class="modal-close" onclick="closeKAPConfirmModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <div class="kap-summary">
                    <h3>Spending Summary</h3>
                    <div class="spend-row">
                        <span>Taxable Spend:</span>
                        <strong>$${taxableSpend}</strong>
                    </div>
                    ${validation.bracket.taxedRounds.length > 0 ? `
                        <div class="spend-row tax">
                            <span>Tax Bracket:</span>
                            <strong>${validation.bracket.label}</strong>
                        </div>
                    ` : ''}
                </div>
                
                <div id="draftPickPreview"></div>
                
                <div class="confirmation-warning">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>This action cannot be undone. Your draft picks will be permanently updated.</p>
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn-secondary" onclick="closeKAPConfirmModal()">
                    <i class="fas fa-arrow-left"></i> Go Back
                </button>
                <button class="btn-primary" onclick="confirmKAPSubmission()">
                    <i class="fas fa-check"></i> Confirm Submission
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Insert draft pick preview
    const preview = displayDraftPickPreview(calculation);
    document.getElementById('draftPickPreview').appendChild(preview);
    
    // Store calculation for submission
    window.kapSubmissionData = {
        kapData,
        calculation,
        taxableSpend
    };
    
    return true;
}

/**
 * Show tax bracket error
 */
function showTaxBracketError(validation, taxableSpend) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'taxErrorModal';
    
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header error">
                <h2><i class="fas fa-exclamation-circle"></i> Cannot Submit KAP</h2>
            </div>
            <div class="modal-body">
                <div class="error-message">
                    <p><strong>Taxable Spend: $${taxableSpend}</strong></p>
                    <p>${validation.error}</p>
                </div>
                
                <div class="picks-status">
                    <h4>Required Picks for ${validation.bracket.label}:</h4>
                    <ul class="picks-checklist">
                        ${validation.bracket.taxedRounds.map(round => `
                            <li class="${validation.hasRounds.includes(round) ? 'has-pick' : 'missing-pick'}">
                                ${validation.hasRounds.includes(round) ? '✅' : '❌'} 
                                Round ${round}
                            </li>
                        `).join('')}
                    </ul>
                </div>
                
                <div class="solution-options">
                    <h4>Options:</h4>
                    <ol>
                        <li>
                            <strong>Reduce spending to $${validation.maxAllowed} or less</strong>
                            ${validation.maxBracket ? 
                                `<br><small>You qualify for: ${validation.maxBracket.label}</small>` : 
                                `<br><small>No tax (you don't qualify for any tax brackets)</small>`
                            }
                        </li>
                        <li>
                            <strong>Acquire missing picks through trade:</strong>
                            <ul>
                                ${validation.missing.map(r => `<li>Round ${r} pick</li>`).join('')}
                            </ul>
                        </li>
                    </ol>
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn-primary" onclick="closeTaxErrorModal()">
                    <i class="fas fa-arrow-left"></i> Return to KAP Form
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

/**
 * Close modals
 */
function closeKAPConfirmModal() {
    document.getElementById('kapConfirmModal')?.remove();
}

function closeTaxErrorModal() {
    document.getElementById('taxErrorModal')?.remove();
}

/**
 * Confirm and submit KAP
 */
async function confirmKAPSubmission() {
    const { kapData, calculation, taxableSpend } = window.kapSubmissionData;
    
    try {
        // Send to backend with draft pick updates
        const response = await fetch('/api/kap/submit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': FBPHub.config.apiKey
            },
            body: JSON.stringify({
                ...kapData,
                taxableSpend,
                draftPickUpdates: {
                    buyinRemoved: calculation.buyinRemovedPicks.map(p => p.pick),
                    rosterRemoved: calculation.rosterRemovedPicks.map(p => p.pick),
                    taxed: calculation.taxedPicks.map(p => p.pick)
                }
            })
        });
        
        if (!response.ok) {
            throw new Error('KAP submission failed');
        }
        
        closeKAPConfirmModal();
        showSuccessMessage('KAP submitted successfully!');
        
        // Redirect to confirmation page
        window.location.href = 'kap-confirmation.html';
        
    } catch (error) {
        console.error('KAP submission error:', error);
        alert('Failed to submit KAP. Please try again.');
    }
}

/**
 * Get team color helper
 */
function getTeamColor(team) {
    return FBPHub?.data?.teamColors?.[team]?.primary || '#666';
}
