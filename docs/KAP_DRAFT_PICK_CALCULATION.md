# KAP Draft Pick Calculation System

## Complete Calculation Flow

### Step-by-Step Process

**1. Buy-In Penalty (Rounds Lost)**
- Each buy-in purchased removes 1 round from the end
- 0 buy-ins: Rounds 1-29 available (29 picks)
- 1 buy-in: Rounds 1-28 available (28 picks)
- 2 buy-ins: Rounds 1-27 available (27 picks)
- 3 buy-ins: Rounds 1-26 available (26 picks)

**2. Roster Math**
- Calculate: 26 - keeper_count = picks_needed

**3. Roster Limit Filter**
- Take first N picks from available rounds
- Remove excess picks from the end

**4. Tax Bracket Validation**
- Verify team has ALL required picks for their spending tier
- BLOCK submission if missing required picks

**5. Draft Pick Tax**
- Remove picks in taxed rounds based on spending

## Example Walkthrough

### Scenario
- **Team**: WIZ
- **Buy-ins**: 2 (purchased R1 and R2)
- **Keepers**: 10 players kept
- **Spending**: $410 (tax rounds 5-7)

### Calculation

#### Step 1: Buy-In Penalty
```
Starting picks: Rounds 1-29 (29 picks)
Buy-ins: 2
Max round: 29 - 2 = 27

Removed by buy-ins:
- Round 28 - Pick #331
- Round 29 - Pick #343

Available after buy-ins: Rounds 1-27 (27 picks)
```

#### Step 2: Roster Math
```
Roster size: 26
Keepers: -10
Picks needed: 16
```

#### Step 3: Roster Limit Filter
```
Available: Rounds 1-27 (27 picks)
Needed: 16 picks
Take: Rounds 1-16

Removed by roster limit:
- Round 17 - Pick #199
- Round 18 - Pick #211
- ... (through Round 27)

Available after roster limit: Rounds 1-16 (16 picks)
```

#### Step 4: Tax Bracket Validation
```
Spending: $410
Required picks: Rounds 5, 6, 7

Team has:
✅ Round 5 - Pick #55
✅ Round 6 - Pick #67
✅ Round 7 - Pick #79

STATUS: ✅ ALLOWED (has all required picks)
```

#### Step 5: Draft Pick Tax
```
Tax bracket: $401-$420 (Lose Rounds 5-7)
Available: Rounds 1-16 (16 picks)

Taxed picks:
- Round 5 - Pick #55 → TAXED
- Round 6 - Pick #67 → TAXED
- Round 7 - Pick #79 → TAXED

Final picks: Rounds 1-4, 8-16 (13 picks)
```

### Final Summary
```
Roster: 26 spots
Keepers: 10
Draft Picks: 13

Total picks removed: 16
- Buy-in penalty: 2
- Roster limit: 11
- Draft pick tax: 3
```

## Tax Bracket Requirements

### $421-$435 (Lose Rounds 4-8)
**Required**: Must have picks in rounds 4, 5, 6, 7, AND 8
**Penalty**: Lose all 5 picks

### $401-$420 (Lose Rounds 5-7)
**Required**: Must have picks in rounds 5, 6, AND 7
**Penalty**: Lose all 3 picks

### $376-$400 (Lose Rounds 6-8)
**Required**: Must have picks in rounds 6, 7, AND 8
**Penalty**: Lose all 3 picks

### $351-$375 (Lose Rounds 7-9)
**Required**: Must have picks in rounds 7, 8, AND 9
**Penalty**: Lose all 3 picks

### $326-$350 (Lose Rounds 8-10)
**Required**: Must have picks in rounds 8, 9, AND 10
**Penalty**: Lose all 3 picks

### ≤$325
**Required**: None
**Penalty**: None

## Error Scenarios

### Missing Required Pick
```
Spending: $410
Required: Rounds 5, 6, 7

Team has:
✅ Round 5 - Pick #55
❌ Round 6 - MISSING
✅ Round 7 - Pick #79

STATUS: ❌ BLOCKED

Options:
1. Reduce spending to $325 or less
2. Acquire a Round 6 pick
```

### Insufficient Picks After Buy-Ins
```
Buy-ins: 3 (max round = 26)
Keepers: 0
Picks needed: 26
Available: Rounds 1-26 (26 picks)

Spending: $410 (tax rounds 5-7)

After tax: 23 picks remaining
STATUS: ⚠️ WARNING - Will have 23 picks for 26 spots
```

## UI Preview Display

### Confirmation Modal Structure
```
┌─────────────────────────────────────────┐
│  Confirm KAP Submission                 │
├─────────────────────────────────────────┤
│                                         │
│  Spending Summary                       │
│  Taxable Spend: $410                    │
│  Tax Bracket: Lose Rounds 5-7           │
│                                         │
│  Draft Pick Calculation                 │
│  ┌───────────────────────────────────┐  │
│  │ Roster Size: 26                   │  │
│  │ Keepers: -10                      │  │
│  │ ─────────────────────────────     │  │
│  │ Picks Needed: 16                  │  │
│  │                                   │  │
│  │ Buy-Ins Purchased: 2              │  │
│  │ Max Available Round: 27           │  │
│  └───────────────────────────────────┘  │
│                                         │
│  🛒 Picks Removed (Buy-In Penalty)      │
│  • Round 28 - Pick #331                 │
│  • Round 29 - Pick #343                 │
│                                         │
│  ❌ Picks Removed (Roster Limit)        │
│  • Round 17 - Pick #199                 │
│  • Round 18 - Pick #211                 │
│  ... (11 picks total)                   │
│                                         │
│  ⚠️ Picks Taxed (Lose Rounds 5-7)       │
│  • Round 5 - Pick #55                   │
│  • Round 6 - Pick #67                   │
│  • Round 7 - Pick #79                   │
│                                         │
│  ✅ Final Draft Picks                   │
│  • Round 1 - Pick #7                    │
│  • Round 2 - Pick #19                   │
│  • Round 3 - Pick #31                   │
│  • Round 4 - Pick #43                   │
│  • Round 8 - Pick #91                   │
│  ... (13 picks total)                   │
│                                         │
│  13 draft picks for 16 roster spots    │
│                                         │
│  ⚠️ This cannot be undone               │
│                                         │
│  [Go Back]  [Confirm Submission]        │
└─────────────────────────────────────────┘
```

## Backend Integration

### API Payload
```json
{
  "team": "WIZ",
  "keepers": [...],
  "taxableSpend": 410,
  "draftPickUpdates": {
    "buyinRemoved": [331, 343],
    "rosterRemoved": [199, 211, 223, ...],
    "taxed": [55, 67, 79]
  }
}
```

### Draft Order Updates
Backend should update `draft_order_2026.json`:
- Set `taxed_out: true` for taxed picks (55, 67, 79)
- No changes needed for removed picks (they simply won't be used)

## Strategic Implications

### Buy-In Decision
- Each buy-in costs WizBucks AND removes a late-round pick
- R1 buy-in: $55 + lose R29
- R2 buy-in: $35 + lose R28
- R3 buy-in: $10 + lose R27

### Tax Bracket Planning
- Teams must carefully manage picks in rounds 4-10
- Trading away a taxed round pick = lose access to that spending tier
- Acquiring extra picks in key rounds = more spending flexibility

### Roster Construction
- More keepers = fewer draft picks needed
- Fewer draft picks = more rounds available for roster limit filter
- Strategic tension between keeping players vs. drafting
