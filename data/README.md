

# FBP Hub - Fantasy Baseball Pantheon Web Interface

**Mobile-first website for FBP league management and player tracking**

## 🎯 Project Overview

FBP Hub is a free, mobile-optimized web interface for Fantasy Baseball Pantheon league members to:
- Search and browse all league players and prospects
- View keeper and prospect rosters by team
- Track standings and current matchups
- Monitor WizBucks balances
- Access player stats and prospect graduation data (age + MLB usage)

Built with vanilla JavaScript and hosted on GitHub Pages for zero-cost hosting with automatic updates.

## 📱 Features (Phase 1 - COMPLETE)

### ✅ Homepage
- Current standings display
- This week's matchups
- Upcoming deadline banner
- Quick stats overview
- Recent activity feed (coming soon)

### ✅ Player Database
- Search by player name
- Filter by position, team, manager, player type
- Card and list view options
- Mobile-optimized layout
- Load more pagination

### ✅ Keeper Rosters
- View all 12 team rosters
- Grouped by position (C, IF, OF, SP, RP)
- Contract status indicators
- Individual team selection
- Roster summaries

### ✅ Prospect Rosters
- View all prospect systems
- Contract types (FC, PC, DC)
- Status tracking
- Position grouping
- Contract breakdowns

## 🚀 Quick Start

### Prerequisites
- Modern web browser
- Git installed
- GitHub account

### Local Development

```bash
# Clone the repository
git clone https://github.com/yourusername/fbp-hub.git
cd fbp-hub

# Open in browser (no build step required!)
open index.html

# Or use a simple HTTP server
python3 -m http.server 8000
# Visit http://localhost:8000
```

### Data Files Required

The site expects these JSON files in the `data/` directory:

```
data/
├── combined_players.json  # All player data
├── standings.json         # Current standings & matchups
├── wizbucks.json         # WizBucks balances
├── player_log.json       # Append-only log of player transactions/events
```

**Data Structure Examples:**

**combined_players.json:**
```json
[
  {
    "name": "Player Name",
    "team": "NYY",
    "position": "SS",
    "manager": "WIZ",
    "player_type": "MLB",
    "contract_type": "Standard",
    "status": "Active",
    "years_simple": "VC(2)",
    "yahoo_id": "12345",
    "upid": "P-123456"
  }
]
```

**standings.json:**
```json
{
  "date": "2025-12-19",
  "standings": [
    {
      "rank": 1,
      "team": "WIZ",
      "record": "85-60-5",
      "win_pct": 0.583
    }
  ],
  "matchups": [
    "WIZ 7 vs B2J 6",
    "HAM 5 vs CFL 8"
  ]
}
```

**wizbucks.json:**
```json
{
  "WIZ": 140,
  "B2J": 120,
  "CFL": 135
}
```

## 🎨 Customization

### Annual Color Scheme Updates

The FBP color scheme changes each season. Update in `css/styles.css`:

```css
:root {
    /* Season 13 (2025) - Dark + Orange */
    --color-primary: #FF8C42;
    --color-background: #1A1A1A;
    --color-surface: #2A2A2A;
    /* Update colors here for next season */
}
```

### Team Colors

Individual team colors can be customized in `js/main.js`:

```javascript
const teamColors = {
    'WIZ': '#FF8C42',
    'B2J': '#4ECDC4',
    // Add/update team colors here
};
```

## 📂 Project Structure

```
fbp-hub/
├── index.html              # Homepage
├── players.html            # Player database
├── rosters.html           # Team rosters
├── css/
│   ├── styles.css         # Global styles
│   ├── players.css        # Players page styles
│   └── rosters.css        # Rosters page styles
├── js/
│   ├── main.js            # Core functionality
│   ├── homepage.js        # Homepage logic
│   ├── players.js         # Player search/filter
│   └── rosters.js         # Roster display
├── data/                  # JSON data files
│   ├── combined_players.json
│   ├── standings.json
│   └── wizbucks.json
└── README.md
```

## 🔄 Auto-Updates with GitHub Actions

### Setup GitHub Actions Deployment

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy FBP Hub

on:
  push:
    branches: [ main ]
  schedule:
    - cron: '0 10 * * *'  # Daily at 10 AM UTC

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - name: Checkout
      uses: actions/checkout@v3
      
    - name: Update data files
      run: |
        # Your data pipeline commands here
        # e.g., python3 data_pipeline/update_all.py
        
    - name: Commit changes
      run: |
        git config --local user.email "action@github.com"
        git config --local user.name "GitHub Action"
        git add data/
        git commit -m "Auto-update data files" || echo "No changes"
        git push
```

### Enable GitHub Pages

1. Go to repository Settings → Pages
2. Source: Deploy from a branch
3. Branch: `main`, Folder: `/` (root)
4. Save

Your site will be available at:
`https://yourusername.github.io/fbp-hub/`

## 🔧 Development Tips

### Testing on Mobile

1. **Chrome DevTools**: Open DevTools, click device icon, select mobile viewport
2. **Real Device**: Connect device to same WiFi, visit `http://your-ip:8000`
3. **BrowserStack**: Use for testing on multiple devices

### Performance

- All assets are vanilla JS/CSS (no frameworks = fast load)
- Images should be optimized (use WebP when possible)
- Lazy load data (pagination implemented on players page)

### Browser Support

Tested on:
- Chrome/Edge (latest)
- Safari (iOS 14+)
- Firefox (latest)

## 📊 Data Pipeline Integration

The site works with your existing Discord bot data pipeline:

```bash
# Your existing bot updates data
python3 data_pipeline/update_all.py

# Generates JSON files
data/combined_players.json
data/standings.json
data/wizbucks.json

# Commit to fbp-hub repo
cd ../fbp-hub
cp ../fbp-trade-bot/data/*.json data/
git add data/
git commit -m "Update data"
git push

# GitHub Pages auto-deploys
```

## 🗺️ Roadmap

### Phase 2 (Planned)
- [ ] Service time progress bars
- [ ] Transaction history log
- [ ] Draft pick tracker
- [ ] MLB stats integration

### Phase 3 (Planned)
- [ ] Discord OAuth login
- [ ] Manager dashboards
- [ ] Self-service transactions
- [ ] Photo upload tool

### Phase 4 (Planned)
- [ ] Weekly auction portal
- [ ] Keeper deadline forms
- [ ] WizBucks management
- [ ] Commissioner admin panel

## 🐛 Known Issues

- [ ] None yet! Report issues on GitHub

## 📝 License

MIT License - Free to use and modify

## 🙏 Acknowledgments

Built for Fantasy Baseball Pantheon League  
Season 13 - 2025

---

**Questions?** Open an issue on GitHub or ask in the FBP Discord!