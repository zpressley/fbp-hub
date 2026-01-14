# Team Colors System - Implementation Guide

## 🎨 **Overview**

Managers can customize 5 team colors that affect their entire dashboard experience:
- **Primary:** Main team color (borders, headers, badges)
- **Secondary:** Secondary color (accents, gradients)
- **Accent 1-3:** Optional colors (charts, highlights, special elements)

---

## 📁 **Files Created**

### **Settings Page:**
- `settings.html` - Settings interface
- `css/settings.css` - Settings page styles
- `js/settings.js` - Color management logic

---

## 💾 **Data Structure**

### **Storage Format (localStorage):**

```json
{
  "team_colors": {
    "WIZ": {
      "primary": "#EF3E42",
      "secondary": "#FFB612",
      "accent1": "#1E88C7",
      "accent2": "#4CAF50",
      "accent3": "#9C27B0"
    },
    "HAM": {
      "primary": "#003278",
      "secondary": "#C0111F",
      "accent1": "#FFFFFF",
      "accent2": null,
      "accent3": null
    }
  }
}
```

### **Production Storage (JSON file):**

Create `data/team_colors.json`:

```json
{
  "WIZ": {
    "primary": "#EF3E42",
    "secondary": "#FFB612",
    "accent1": "#1E88C7",
    "accent2": "#4CAF50",
    "accent3": "#9C27B0"
  },
  "B2J": {
    "primary": "#003278",
    "secondary": "#C0111F",
    "accent1": null,
    "accent2": null,
    "accent3": null
  }
}
```

---

## 🔧 **Implementation Steps**

### **Step 1: Load Team Colors Globally**

Add to `js/main.js` in the FBPHub initialization:

```javascript
// Load team colors
FBPHub.loadTeamColors = function() {
    try {
        // In production: fetch('data/team_colors.json')
        const colors = JSON.parse(localStorage.getItem('team_colors') || '{}');
        FBPHub.data.teamColors = colors;
        console.log('🎨 Loaded team colors for', Object.keys(colors).length, 'teams');
    } catch (e) {
        console.log('⚠️ Could not load team colors');
        FBPHub.data.teamColors = {};
    }
};

// Call during initialization
FBPHub.on('ready', () => {
    FBPHub.loadTeamColors();
});
```

### **Step 2: Apply Colors on Page Load**

Add to every page's initialization (dashboard, rosters, etc.):

```javascript
// In dashboard.js, rosters.js, etc.
function applyUserTeamColors() {
    const team = authManager.getTeam();
    if (!team) return;
    
    const colors = FBPHub.data.teamColors?.[team.abbreviation];
    if (!colors) return;
    
    const root = document.documentElement;
    
    // Apply as CSS variables
    root.style.setProperty('--team-primary', colors.primary);
    root.style.setProperty('--team-secondary', colors.secondary);
    
    if (colors.accent1) root.style.setProperty('--team-accent-1', colors.accent1);
    if (colors.accent2) root.style.setProperty('--team-accent-2', colors.accent2);
    if (colors.accent3) root.style.setProperty('--team-accent-3', colors.accent3);
    
    console.log(`🎨 Applied ${team.abbreviation} colors`);
}

// Call after auth check
if (authManager.isAuthenticated()) {
    applyUserTeamColors();
}
```

---

## 🎯 **Using Team Colors in CSS**

### **Method 1: Use CSS Variables (Recommended)**

Update `css/dashboard.css`:

```css
.dashboard-header {
    border-color: var(--team-primary, var(--primary-red));
}

.stat-card-large {
    border-color: var(--team-primary, var(--primary-red));
}

.stat-card-large .stat-icon {
    background-color: var(--team-primary, var(--primary-red));
}

.stat-value-large {
    color: var(--team-secondary, var(--accent-yellow));
}

/* Use accents if available */
.accent-element {
    color: var(--team-accent-1, var(--primary-red));
}
```

### **Method 2: Dynamic Inline Styles**

For player badges and team flags:

```javascript
function createTeamBadge(teamAbbr, playerName) {
    const colors = FBPHub.data.teamColors?.[teamAbbr];
    
    if (colors) {
        return `
            <span class="team-badge" style="
                background-color: ${colors.primary};
                color: white;
                border: 2px solid ${colors.secondary};
            ">
                ${teamAbbr}
            </span>
        `;
    }
    
    // Fallback to default
    return `<span class="team-badge">${teamAbbr}</span>`;
}
```

---

## 🏷️ **Player Badge Implementation**

### **Update Player Cards to Use Team Colors:**

In `js/players.js` or wherever you render player cards:

```javascript
function createPlayerCard(player) {
    const ownerTeam = player.FBP_Team || player.manager;
    const teamColors = FBPHub.data.teamColors?.[ownerTeam];
    
    const teamBadgeStyle = teamColors 
        ? `background-color: ${teamColors.primary}; color: white; border: 2px solid ${teamColors.secondary};`
        : '';
    
    return `
        <div class="player-card">
            <div class="player-header">
                <span class="position-badge">${player.position}</span>
                <span class="team-badge" style="${teamBadgeStyle}">
                    ${ownerTeam}
                </span>
            </div>
            <div class="player-name">${player.name}</div>
            <!-- rest of card -->
        </div>
    `;
}
```

### **Team Flag/Logo Implementation:**

Create a team flag component:

```javascript
function createTeamFlag(teamAbbr, size = 'medium') {
    const colors = FBPHub.data.teamColors?.[teamAbbr];
    
    if (!colors) {
        return `<div class="team-flag ${size}">${teamAbbr}</div>`;
    }
    
    // Create gradient flag
    return `
        <div class="team-flag ${size}" style="
            background: linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%);
            border: 2px solid ${colors.primary};
            color: white;
            text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
        ">
            ${teamAbbr}
        </div>
    `;
}
```

### **CSS for Team Flags:**

```css
.team-flag {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-title);
    font-weight: 900;
    border-radius: var(--radius-sm);
    letter-spacing: 1px;
}

.team-flag.small {
    width: 40px;
    height: 30px;
    font-size: 12px;
}

.team-flag.medium {
    width: 60px;
    height: 40px;
    font-size: 16px;
}

.team-flag.large {
    width: 80px;
    height: 60px;
    font-size: 20px;
}
```

---

## 📊 **Dashboard Color Integration**

### **Update Dashboard Stats Cards:**

In `js/dashboard.js`:

```javascript
function loadTeamStats(team) {
    const colors = FBPHub.data.teamColors?.[team.abbreviation];
    
    const iconColor = colors?.primary || 'var(--primary-red)';
    const valueColor = colors?.secondary || 'var(--accent-yellow)';
    
    statsGrid.innerHTML = `
        <div class="stat-card-large">
            <div class="stat-icon" style="background-color: ${iconColor};">
                <i class="fas fa-trophy"></i>
            </div>
            <div class="stat-content">
                <div class="stat-label">League Rank</div>
                <div class="stat-value-large" style="color: ${valueColor};">#${rank}</div>
            </div>
        </div>
        <!-- repeat for other stats -->
    `;
}
```

### **Update Dashboard Header:**

```javascript
function updateWelcomeMessage(user, team) {
    const colors = FBPHub.data.teamColors?.[team.abbreviation];
    
    const borderColor = colors?.primary || 'var(--primary-red)';
    const textColor = colors?.secondary || 'var(--accent-yellow)';
    
    header.style.borderColor = borderColor;
    
    header.innerHTML = `
        <div class="welcome-message">
            <h2 style="color: ${borderColor};">Good evening, ${team.name}!</h2>
            <p>Welcome to your FBP Hub dashboard</p>
        </div>
        <div class="user-badge">
            <div class="team-name" style="color: ${textColor};">${team.abbreviation}</div>
        </div>
    `;
}
```

---

## 🎨 **Player Profile Page Integration**

### **Update Player Profile Header:**

In `js/player-profile.js`:

```javascript
function displayPlayerHeader() {
    const player = PLAYER_DATA.player;
    const ownerTeam = player.manager;
    const colors = FBPHub.data.teamColors?.[ownerTeam];
    
    // Apply team colors to ownership badge
    const ownershipBadge = document.getElementById('ownershipBadge');
    if (colors) {
        ownershipBadge.style.backgroundColor = `rgba(${hexToRgb(colors.primary)}, 0.15)`;
        ownershipBadge.style.borderColor = colors.primary;
        ownershipBadge.style.color = colors.primary;
    }
    
    // Apply to stat cards
    const statCards = document.querySelectorAll('.stat-card');
    statCards.forEach(card => {
        if (colors) {
            card.style.borderColor = colors.primary;
            const icon = card.querySelector('.stat-icon');
            if (icon) icon.style.backgroundColor = colors.primary;
        }
    });
}

// Helper function
function hexToRgb(hex) {
    const r = parseInt(hex.substr(1, 2), 16);
    const g = parseInt(hex.substr(3, 2), 16);
    const b = parseInt(hex.substr(5, 2), 16);
    return `${r}, ${g}, ${b}`;
}
```

---

## 🏳️ **Team Flags on Roster Pages**

### **Update Roster Display:**

In `js/rosters.js`:

```javascript
function createTeamRosterCard(teamAbbr, detailed = false) {
    const teamName = TEAM_NAMES[teamAbbr];
    const colors = FBPHub.data.teamColors?.[teamAbbr];
    
    // Apply team colors to roster card
    let cardStyle = '';
    if (colors) {
        cardStyle = `border-color: ${colors.primary};`;
    }
    
    return `
        <div class="team-roster-card" style="${cardStyle}">
            <div class="team-roster-header">
                ${createTeamFlag(teamAbbr, 'medium')}
                <div class="team-name" style="color: ${colors?.primary || 'var(--primary-red)'};">
                    ${teamAbbr} - ${teamName}
                </div>
            </div>
            <!-- rest of roster -->
        </div>
    `;
}
```

---

## 🔄 **Complete Integration Checklist**

### **Phase 1: Core Setup**
- [ ] Add settings page to website
- [ ] Create `data/team_colors.json` with default colors
- [ ] Update `js/main.js` to load team colors
- [ ] Test color picker functionality

### **Phase 2: Apply to Dashboard**
- [ ] Update dashboard header with team colors
- [ ] Update stat cards with team colors
- [ ] Update roster preview with team colors
- [ ] Test color changes on dashboard

### **Phase 3: Apply to Player Elements**
- [ ] Update player badges with owner team colors
- [ ] Update team flags with gradient backgrounds
- [ ] Update player profile ownership badges
- [ ] Test on various players

### **Phase 4: Apply to Roster Pages**
- [ ] Update roster cards with team borders
- [ ] Add team flags to headers
- [ ] Apply colors to position group headers
- [ ] Test all 12 teams

### **Phase 5: Polish**
- [ ] Add settings link to dashboard
- [ ] Add settings link to user menu
- [ ] Create default colors for all 12 teams
- [ ] Test mobile responsiveness

---

## 🎯 **Quick Implementation Examples**

### **Example 1: Team Badge with Colors**

```javascript
// Wherever you display team ownership
function renderOwnerBadge(teamAbbr) {
    const colors = FBPHub.data.teamColors?.[teamAbbr];
    
    if (colors) {
        return `
            <span class="owner-badge" style="
                background: linear-gradient(135deg, ${colors.primary}, ${colors.secondary});
                color: white;
                border: 2px solid ${colors.primary};
            ">
                <i class="fas fa-trophy"></i> ${teamAbbr}
            </span>
        `;
    }
    
    return `<span class="owner-badge">${teamAbbr}</span>`;
}
```

### **Example 2: Dashboard with Team Colors**

```javascript
function initDashboard() {
    const team = authManager.getTeam();
    const colors = FBPHub.data.teamColors?.[team.abbreviation];
    
    if (colors) {
        // Apply globally via CSS variables
        const root = document.documentElement;
        root.style.setProperty('--team-primary', colors.primary);
        root.style.setProperty('--team-secondary', colors.secondary);
        
        // Now all CSS using var(--team-primary) will use this color
    }
    
    // Continue with normal dashboard init
}
```

### **Example 3: Player Card with Owner Colors**

```javascript
function createPlayerCard(player) {
    const ownerTeam = player.FBP_Team || player.manager;
    const ownerColors = FBPHub.data.teamColors?.[ownerTeam];
    
    let ownerBadgeStyle = '';
    if (ownerColors) {
        ownerBadgeStyle = `
            background-color: ${ownerColors.primary};
            color: white;
            border: 2px solid ${ownerColors.secondary};
        `;
    }
    
    return `
        <div class="player-card">
            <div class="player-badges">
                <span class="team-badge" style="${ownerBadgeStyle}">
                    ${ownerTeam}
                </span>
            </div>
            <!-- rest of card -->
        </div>
    `;
}
```

---

## 🎨 **CSS Variable Strategy**

### **Add to `css/styles.css` (root variables):**

```css
:root {
    /* Default FBP colors */
    --primary-red: #EF3E42;
    --accent-yellow: #FFB612;
    
    /* Team color overrides (set dynamically) */
    --team-primary: var(--primary-red);
    --team-secondary: var(--accent-yellow);
    --team-accent-1: #1E88C7;
    --team-accent-2: #4CAF50;
    --team-accent-3: #9C27B0;
}
```

### **Use in Components:**

```css
/* Dashboard header uses team colors */
.dashboard-header {
    border-color: var(--team-primary);
}

.welcome-message h2 {
    color: var(--team-primary);
}

.team-name {
    color: var(--team-secondary);
}

/* Stat cards use team colors */
.stat-card-large {
    border-color: var(--team-primary);
}

.stat-icon {
    background-color: var(--team-primary);
}

.stat-value-large {
    color: var(--team-secondary);
}
```

---

## 🏳️ **Team Flag Component**

### **Create Reusable Team Flag:**

Add to `js/main.js`:

```javascript
// Global team flag creator
window.createTeamFlag = function(teamAbbr, options = {}) {
    const size = options.size || 'medium';
    const colors = FBPHub.data.teamColors?.[teamAbbr];
    
    if (!colors) {
        return `<span class="team-flag ${size}">${teamAbbr}</span>`;
    }
    
    const gradient = `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%)`;
    
    return `
        <span class="team-flag ${size}" style="
            background: ${gradient};
            border: 2px solid ${colors.primary};
            color: white;
            text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.7);
        ">
            ${teamAbbr}
        </span>
    `;
};
```

### **CSS for Team Flags:**

```css
.team-flag {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-title);
    font-weight: 900;
    border-radius: var(--radius-sm);
    letter-spacing: 1px;
}

.team-flag.small {
    width: 50px;
    height: 30px;
    font-size: 12px;
}

.team-flag.medium {
    width: 70px;
    height: 45px;
    font-size: 16px;
}

.team-flag.large {
    width: 100px;
    height: 60px;
    font-size: 22px;
}
```

---

## 📱 **Usage Examples**

### **Dashboard:**
```javascript
// Auto-apply team's colors to entire dashboard
applyUserTeamColors();
// All borders, icons, values use team colors
```

### **Rosters Page:**
```javascript
// Each team roster shows with that team's colors
teams.forEach(team => {
    const card = createTeamRosterCard(team); // Uses that team's colors
});
```

### **Player Profile:**
```javascript
// Player owned by WIZ shows WIZ colors
const ownershipBadge = createTeamFlag(player.manager, { size: 'large' });
// Shows WIZ's custom colors
```

### **Player Search Results:**
```javascript
// Player cards show owner's team colors
players.forEach(player => {
    const ownerBadge = createTeamFlag(player.manager, { size: 'small' });
    // Each owner has their own colors
});
```

---

## 🚀 **Deployment Steps**

### **1. Add Files to Website:**
```bash
cp settings.html /path/to/fbp-hub/
cp css/settings.css /path/to/fbp-hub/css/
cp js/settings.js /path/to/fbp-hub/js/
```

### **2. Create Default Team Colors:**

Create `data/team_colors.json`:

```json
{
  "WIZ": {"primary": "#EF3E42", "secondary": "#FFB612", "accent1": "#1E88C7", "accent2": null, "accent3": null},
  "HAM": {"primary": "#003278", "secondary": "#C0111F", "accent1": null, "accent2": null, "accent3": null},
  "B2J": {"primary": "#EF3E42", "secondary": "#FFB612", "accent1": null, "accent2": null, "accent3": null},
  "CFL": {"primary": "#EF3E42", "secondary": "#FFB612", "accent1": null, "accent2": null, "accent3": null},
  "LAW": {"primary": "#EF3E42", "secondary": "#FFB612", "accent1": null, "accent2": null, "accent3": null},
  "LFB": {"primary": "#EF3E42", "secondary": "#FFB612", "accent1": null, "accent2": null, "accent3": null},
  "JEP": {"primary": "#EF3E42", "secondary": "#FFB612", "accent1": null, "accent2": null, "accent3": null},
  "TBB": {"primary": "#EF3E42", "secondary": "#FFB612", "accent1": null, "accent2": null, "accent3": null},
  "DRO": {"primary": "#EF3E42", "secondary": "#FFB612", "accent1": null, "accent2": null, "accent3": null},
  "RV": {"primary": "#EF3E42", "secondary": "#FFB612", "accent1": null, "accent2": null, "accent3": null},
  "SAD": {"primary": "#EF3E42", "secondary": "#FFB612", "accent1": null, "accent2": null, "accent3": null},
  "WAR": {"primary": "#EF3E42", "secondary": "#FFB612", "accent1": null, "accent2": null, "accent3": null}
}
```

### **3. Update main.js:**

Add team color loading:

```javascript
FBPHub.loadTeamColors = async function() {
    try {
        const response = await fetch('data/team_colors.json');
        if (response.ok) {
            FBPHub.data.teamColors = await response.json();
        }
    } catch (e) {
        FBPHub.data.teamColors = {};
    }
};
```

### **4. Add Settings Link:**

Update dashboard and user menu:

```html
<a href="settings.html" class="action-card">
    <i class="fas fa-palette"></i>
    <span>TEAM COLORS</span>
</a>
```

---

## 💡 **Advanced Features (Future)**

### **Saved Color Schemes:**
```javascript
// Let managers save multiple color schemes
{
  "WIZ": {
    "active": "home",
    "schemes": {
      "home": { "primary": "#EF3E42", "secondary": "#FFB612" },
      "away": { "primary": "#FFFFFF", "secondary": "#EF3E42" },
      "alt": { "primary": "#1E88C7", "secondary": "#FFB612" }
    }
  }
}
```

### **Team Logos:**
```javascript
// Upload custom team logo
{
  "WIZ": {
    "colors": { /* ... */ },
    "logo_url": "images/teams/wiz-logo.png"
  }
}
```

### **Gradient Patterns:**
```javascript
// Different gradient styles
{
  "gradient_type": "linear", // or "radial", "conic"
  "gradient_angle": "135deg",
  "gradient_stops": ["0%", "100%"]
}
```

---

## ✅ **Testing Checklist**

- [ ] Open settings page while logged in
- [ ] Change primary color → see preview update
- [ ] Change secondary color → see preview update
- [ ] Add accent colors → see preview update
- [ ] Click preset → colors change
- [ ] Save colors → redirects to dashboard
- [ ] Dashboard shows new colors
- [ ] Player badges show owner team colors
- [ ] Roster cards show team colors
- [ ] Player profiles show owner colors

---

**The settings page is ready! Managers can customize their colors and the entire site will reflect their team identity.**
