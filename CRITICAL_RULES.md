# CRITICAL RULES - DO NOT VIOLATE

## ⚠️ WIZBUCKS BALANCE SOURCE OF TRUTH

### THE RULE
**ALL balance calculations MUST use `data/wizbucks.json` as the source of truth.**

### What This Means

#### ✅ CORRECT - Use WizBucks Wallet
```javascript
// Load balance from data/wizbucks.json
const balance = FBPHub.data.wizbucks[teamName];
```

#### ❌ WRONG - Do NOT use managers.json
```javascript
// NEVER DO THIS
const balance = managers.wizbucks[2026].allotments.KAP.total;
```

### Why This Rule Exists

1. **`data/wizbucks.json`** = Current wallet balance (THE TRUTH)
   - Updated by all transactions (trades, buy-ins, purchases)
   - This is what managers actually have

2. **`config/managers.json`** = Allocation tracking only
   - Shows what was originally given
   - NOT updated by transactions
   - ONLY for reference/tracking

### Where This Applies

- **KAP Form** (`js/kap.js`): Load balance from wizbucks.json
- **PAD Form** (`js/pad.js`): Load balance from wizbucks.json  
- **Buy-In Purchases** (`js/kap-buyin-integration.js`): Load balance from wizbucks.json
- **Trade Form** (`js/trade.js`): Load balance from wizbucks.json
- **Auction Portal**: Load balance from wizbucks.json
- **Any purchase/transaction**: Load balance from wizbucks.json

### Enforcement

If you see code loading balance from `managers.json`:
1. **STOP immediately**
2. Fix it to use `FBPHub.data.wizbucks` 
3. Add a comment referencing this file

### Example (Correct Pattern)
```javascript
async function loadBalance() {
    // CRITICAL: Use WizBucks wallet (see CRITICAL_RULES.md)
    if (!FBPHub.data.wizbucks) {
        throw new Error('WizBucks data not loaded');
    }
    
    // Get team's full name for wallet lookup
    const teamName = getFullTeamName(teamAbbr); // e.g., "Rick Vaughn"
    
    // Load balance from wallet
    const balance = FBPHub.data.wizbucks[teamName];
    
    if (typeof balance !== 'number') {
        throw new Error(`No balance found for ${teamName}`);
    }
    
    return balance;
}
```

---

## 🔒 Other Critical Rules

### ⚠️ RAT (REDUCE-A-TIER) CALCULATION

**THE RULE**: When RaT is applied, use `player.effectiveContract` for salary calculations, NOT `player.contract`

#### Constitution Reference (Article 2, Section 03)
> "Manager spends $75 WB on FC-1 ($85) player to reduce his contract to VC-2 ($55). Player is kept at only a **$55 tax hit**"

#### How RaT Works:
1. Manager pays $75 (tax-free)
2. Player's contract tier is reduced (FC-1 → VC-2)
3. Manager is charged the **REDUCED** salary ($55), not original ($85)

#### ✅ CORRECT Implementation:
```javascript
// Use effectiveContract if RaT applied
const contractToUse = player.hasRaT ? player.effectiveContract : player.contract;
const baseCost = KEEPER_SALARIES[contractToUse];
```

#### ❌ WRONG Implementation:
```javascript
// This charges FC-1 price ($85) even after RaT!
const baseCost = KEEPER_SALARIES[player.contract]; // WRONG
```

#### Where This Applies:
- `calculateKeeperSalaryCost()` - Total salary calculation
- `displayKeepers()` - Individual player display
- Summary views
- KAP submission payload

---

**Last Updated**: 2026-02-20  
**Reason for Rules**:  
- WizBucks: Balance discrepancies causing managers to see incorrect available funds
- RaT: Manager charged $85 + $75 instead of $55 + $75, shorting them $30
