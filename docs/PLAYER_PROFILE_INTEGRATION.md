# Player Profile Integration Guide

## 🎯 Overview

The player profile page (`player-profile.html`) provides a comprehensive view of any player with:
- Complete stats and service time
- Full ownership history
- Transaction log (all WizBucks transactions)
- Timeline of all changes

## 🔗 Linking to Player Profiles

### From Slide-Out Panel

Update your existing slide-out panel to add a "View Full Profile" button:

```javascript
// In your slide-out panel code
function displayPlayerPanel(player) {
    const profileLink = createPlayerLink(player);
    
    // Add this button to your panel
    const fullProfileBtn = `
        <a href="${profileLink}" class="btn-primary" style="margin-top: var(--space-md);">
            <i class="fas fa-user"></i> View Full Profile
        </a>
    `;
    
    // Append to your panel content
}
```

### From Player Cards (players.html)

Update player cards to be clickable:

```javascript
// In js/players.js - update renderPlayerCard()
function renderPlayerCard(player) {
    const profileLink = createPlayerLink(player);
    
    return `
        <a href="${profileLink}" class="player-card-link">
            <div class="player-card">
                <h4>${player.name}</h4>
                <!-- rest of card content -->
            </div>
        </a>
    `;
}
```

### From Roster Lists

Make roster names clickable:

```javascript
// In roster display code
function formatPlayerName(player) {
    const profileLink = createPlayerLink(player);
    return `<a href="${profileLink}" class="player-link">${player.name}</a>`;
}
```

### From Transaction History

Link player names in transactions:

```javascript
// In transaction displays
function renderTransaction(txn) {
    if (txn.related_player) {
        const profileLink = createPlayerLink(txn.related_player);
        return `
            <div class="transaction">
                <!-- ... -->
                Player: <a href="${profileLink}">${txn.related_player.name}</a>
            </div>
        `;
    }
}
```

## 📊 URL Parameters

The profile page accepts two query parameters:

1. **By UPID (preferred):**
   ```
   player-profile.html?upid=12345
   ```

2. **By Name (fallback):**
   ```
   player-profile.html?name=Leo%20de%20Vries
   ```

## 🎨 CSS Additions Needed

Add these styles to make player links look good:

```css
/* In your main CSS file */
.player-card-link {
    text-decoration: none;
    color: inherit;
    display: block;
}

.player-link {
    color: var(--accent-yellow);
    text-decoration: none;
    font-weight: 700;
    transition: all var(--transition-fast);
}

.player-link:hover {
    color: var(--primary-red);
    text-decoration: underline;
}
```

## 🔧 Helper Function

The `createPlayerLink()` function is already exposed globally. Use it anywhere:

```javascript
// Example 1: In a click handler
function onPlayerClick(player) {
    const link = createPlayerLink(player);
    window.location.href = link;
}

// Example 2: In a template
const html = `
    <div onclick="window.location.href='${createPlayerLink(player)}'">
        ${player.name}
    </div>
`;

// Example 3: As a regular link
const html = `
    <a href="${createPlayerLink(player)}">${player.name}</a>
`;
```

## 📱 Mobile Responsive

The profile page is fully mobile-responsive:
- Photo and info stack vertically on mobile
- Tabs show icons only on small screens
- Stats grid adjusts from 4 → 2 → 1 columns
- Bottom navigation stays accessible

## 🎯 What Gets Displayed

### Overview Tab:
- Current season stats (from service_stats.json)
- Contract details with salary
- Ownership timeline with dates

### Stats Tab:
- Career statistics (from service_stats.json)
- Season-by-season breakdown (coming soon)

### History Tab:
- Complete player_log.json entries for this player
- Timeline visualization with major events highlighted
- Shows all field changes

### Transactions Tab:
- All WizBucks transactions related to this player
- Shows cost/refund amounts
- Links to balance changes

## 🚀 Quick Integration Checklist

- [ ] Add `player-profile.html` to website
- [ ] Add `css/player-profile.css` to website
- [ ] Add `js/player-profile.js` to website
- [ ] Update slide-out panel with "View Full Profile" button
- [ ] Make player cards clickable (optional)
- [ ] Add player links to rosters (optional)
- [ ] Test with various players (keepers, prospects, traded players)

## 💡 Future Enhancements

Once integrated, you can add:
- Edit player photo (for managers)
- Add notes/tags to players
- Compare with other players
- Export player history to PDF
- Share player profile links
- Player watchlist functionality

---

**The profile page works standalone - just link to it with UPID or name parameter!**
