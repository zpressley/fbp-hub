# WizBucks Wallet System

## Overview
The KAP system uses the manager's **WizBucks balance** directly - there is NO separate "KAP currency" or "KAP allotment". All purchases deduct from the same WizBucks wallet.

## Single Wallet Principle

### Manager's Wallet (`data/wizbucks.json`)
```json
{
  "Whiz Kids": 375,
  "Hammers": 15,
  "Rick Vaughn": 0,
  "Btwn2Jackies": 30,
  "Country Fried Lamb": 10,
  "The Damn Yankees": 15,
  "La Flama Blanca": 0,
  "Jepordizers!": 30,
  "The Bluke Blokes": 30,
  "Andromedans": 25,
  "not much of a donkey": 20,
  "Weekend Warriors": 0
}
```

**This single balance is used for:**
- Buy-in purchases
- Free agent signings
- Contract extensions
- Any other WizBucks transactions

## KAP Display

### What Users See
```
┌─────────────────────────────────┐
│  REMAINING    |    TAXABLE      │
│  $140         |    $235         │
└─────────────────────────────────┘
```

**Remaining** = Current WizBucks balance in wallet  
**Taxable** = Total taxable spend (buy-ins + FA + contracts + etc)

### Calculation
```javascript
// Load wallet from wizbucks.json
const wallet = await fetch('./data/wizbucks.json').then(r => r.json());
const teamName = getTeamFullName(teamAbbr); // e.g. "WIZ" -> "Whiz Kids"

// Remaining is just the wallet balance
const remaining = wallet[teamName];

// Taxable is sum of all taxable purchases
const taxable = buyinSpend + freeAgentSpend + contractSpend + ...;
```

## Buy-In Purchase Flow

### Before Purchase
```
Wallet Balance: $375
Buy-In Cost: $55
```

### After Purchase
```
Wallet Balance: $320 (375 - 55)
Taxable Spend: +$55
```

### Database Changes
**data/wizbucks.json:**
```json
{
  "Whiz Kids": 320  // Was 375
}
```

**draft_order_2026.json:**
```json
{
  "round": 1,
  "buyin_purchased": true,
  "buyin_purchased_at": "2026-02-18T...",
  "buyin_purchased_by": "username"
}
```

**wizbucks_transactions.json:**
```json
{
  "id": "uuid",
  "team": "WIZ",
  "amount": -55,
  "type": "draft_pick_buyin",
  "description": "Round 1 buy-in purchase",
  "timestamp": "2026-02-18T..."
}
```

## KAP Submission

When a manager submits their KAP:

1. **Validate spending**
   - Check if remaining balance ≥ 0
   - Check if taxable spend qualifies for tax bracket
   - Check if they have required draft picks

2. **Apply transactions**
   - All purchases already deducted from wallet
   - No additional balance changes needed
   - Just mark draft picks as taxed

3. **Finalize**
   - Lock KAP submission
   - Update draft_order_2026.json with taxed picks
   - Log final state

## Transaction Types

All transactions deduct from the same wallet:

### Buy-Ins (Taxable)
```
Amount: -$55, -$35, or -$10
Type: "draft_pick_buyin"
Effect: Immediate deduction
```

### Free Agent Signings (Taxable)
```
Amount: -$X (bid amount)
Type: "free_agent_signing"
Effect: Immediate deduction
```

### Contract Extensions (Taxable)
```
Amount: -$X (extension cost)
Type: "contract_extension"
Effect: Immediate deduction
```

### Other Purchases (Non-Taxable)
```
Amount: -$X
Type: "other"
Effect: Immediate deduction, not added to taxable spend
```

## Frontend Integration

### Load Balance
```javascript
async function loadWizBucksBalance(teamAbbr, teamName) {
    const wallet = await fetch('./data/wizbucks.json').then(r => r.json());
    const balance = wallet[teamName] || 0;
    
    // Update display
    document.getElementById('remainingBalance').textContent = `$${balance}`;
    
    // Store in state
    window.kapState = {
        teamAbbr: teamAbbr,
        teamName: teamName,
        wizbucksBalance: balance
    };
}
```

### Update After Purchase
```javascript
async function afterBuyinPurchase(cost) {
    // Backend already updated wallet
    // Just refresh display
    await loadWizBucksBalance(currentTeam);
    
    // Update taxable spend
    updateTaxableSpend();
}
```

### Validate Before Submission
```javascript
function validateKAPSubmission() {
    const balance = window.kapState.wizbucksBalance;
    const taxableSpend = calculateTotalTaxableSpend();
    
    if (balance < 0) {
        return {
            valid: false,
            error: 'Negative balance - you have overspent!'
        };
    }
    
    // Check tax bracket requirements...
    return { valid: true };
}
```

## Manual Wallet Management

Commissioners can manually adjust wallets in `managers.json`:

### Add WizBucks
Edit `data/wizbucks.json`:
```json
{
  "Whiz Kids": 475  // Was 375, increased by 100
}
```

### Transaction Log (Optional)
```json
{
  "id": "manual-adjustment-1",
  "team": "WIZ",
  "amount": 100,
  "type": "manual_adjustment",
  "description": "Commissioner bonus for winning challenge",
  "timestamp": "2026-02-18T...",
  "admin_user": "commissioner"
}
```

## Error States

### Insufficient Funds
```
Wallet Balance: $50
Buy-In Cost: $55

Error: "Insufficient WizBucks. You need $55 but only have $50."
```

### Negative Balance (Shouldn't Happen)
```
Wallet Balance: -$25

Warning: "Your wallet balance is negative! Contact commissioner."
```

### Missing Wallet Data
```
Error: "Could not load WizBucks balance. Please refresh."
```

## Summary

✅ **One wallet** - data/wizbucks.json
✅ **Immediate deductions** - all purchases happen now  
✅ **Taxable vs Non-Taxable** - calculated separately  
✅ **Manual management** - commissioners edit JSON directly  
✅ **Transaction log** - optional but recommended for transparency  

**Key Point:** KAP doesn't have its own currency system. It's just a UI for spending WizBucks during a specific period (Keeper Allocation Period).
