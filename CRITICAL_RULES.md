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

### (Add more as needed)

---

**Last Updated**: 2026-02-20
**Reason for Rule**: Balance discrepancies causing managers to see incorrect available funds
