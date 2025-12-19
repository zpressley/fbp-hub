# FBP Hub - Complete Setup Guide

## 📋 Pre-Flight Checklist

Before starting, ensure you have:
- [ ] GitHub account
- [ ] Git installed locally
- [ ] Your fbp-trade-bot repository with data pipeline working
- [ ] Modern web browser for testing
- [ ] Terminal/command line access

## 🚀 Step-by-Step Deployment

### Step 1: Create GitHub Repository

1. Go to https://github.com/new
2. Repository settings:
   - **Name**: `fbp-hub` (or `fbp-prospect-hub`)
   - **Description**: "FBP Fantasy Baseball Hub - Player Database & Manager Tools"
   - **Visibility**: Public (required for free GitHub Pages)
   - **Initialize**: ✅ Check "Add a README file"
   - **Gitignore**: None (we'll create custom)
   - **License**: MIT (optional)
3. Click "Create repository"

### Step 2: Clone and Setup Locally

```bash
# Clone your new repository
git clone https://github.com/yourusername/fbp-hub.git
cd fbp-hub

# Copy all Phase 1 files from this project
# (You should have all files in /home/claude/fbp-hub/)

# Verify structure
ls -la
# Should see:
# index.html
# players.html
# rosters.html
# css/
# js/
# data/
# README.md
# .gitignore
```

### Step 3: Add Initial Data Files

```bash
# Copy data from your bot repository
cp ../fbp-trade-bot/data/combined_players.json data/
cp ../fbp-trade-bot/data/standings.json data/
cp ../fbp-trade-bot/data/wizbucks.json data/

# Verify data files exist
ls data/
# Should see:
# combined_players.json
# standings.json
# wizbucks.json
# README.md
```

### Step 4: Test Locally

```bash
# Start a local server
python3 -m http.server 8000

# Open browser
open http://localhost:8000
# Or visit manually: http://localhost:8000
```

**Test Checklist:**
- [ ] Homepage loads with standings
- [ ] Player search works
- [ ] Filters work on players page
- [ ] Keeper rosters display
- [ ] Prospect rosters display
- [ ] Mobile menu works (resize browser to <768px)
- [ ] No console errors

### Step 5: Initial Commit

```bash
# Add all files
git add .

# Commit
git commit -m "Initial Phase 1 deployment - Homepage, Players, Rosters"

# Push to GitHub
git push origin main
```

### Step 6: Enable GitHub Pages

1. Go to your repository on GitHub
2. Click **Settings** tab
3. Scroll to **Pages** section (left sidebar)
4. Under "Build and deployment":
   - **Source**: Deploy from a branch
   - **Branch**: `main`
   - **Folder**: `/` (root)
5. Click **Save**

GitHub will build and deploy your site. This takes 1-2 minutes.

### Step 7: Verify Deployment

1. GitHub will show your site URL at the top of the Pages settings:
   ```
   Your site is live at https://yourusername.github.io/fbp-hub/
   ```

2. Visit the URL and verify:
   - [ ] Site loads
   - [ ] All pages accessible
   - [ ] Data displays correctly
   - [ ] Mobile responsive

3. Test on mobile device:
   - Visit URL on phone
   - Check navigation works
   - Verify layout adapts

## 🔄 Setting Up Auto-Updates

### Option 1: Manual Updates (Simple)

Create a script in your bot repository:

```bash
# File: fbp-trade-bot/update_hub.sh
#!/bin/bash

echo "🔄 Updating FBP Hub data..."

# Run data pipeline
python3 data_pipeline/update_all.py

# Copy to hub
cp data/combined_players.json ../fbp-hub/data/
cp data/standings.json ../fbp-hub/data/
cp data/wizbucks.json ../fbp-hub/data/

# Commit to hub
cd ../fbp-hub
git add data/
git commit -m "Auto-update data - $(date +%Y-%m-%d)"
git push

echo "✅ FBP Hub updated!"
```

Make executable:
```bash
chmod +x update_hub.sh
```

Run daily:
```bash
./update_hub.sh
```

### Option 2: GitHub Actions (Automated)

Create `.github/workflows/update-data.yml` in fbp-hub:

```yaml
name: Update FBP Hub Data

on:
  schedule:
    # Run daily at 10 AM UTC (5 AM EST)
    - cron: '0 10 * * *'
  workflow_dispatch:  # Allow manual trigger

jobs:
  update-data:
    runs-on: ubuntu-latest
    
    steps:
    - name: Checkout fbp-hub
      uses: actions/checkout@v3
      with:
        repository: yourusername/fbp-hub
        token: ${{ secrets.GH_PAT }}
        
    - name: Checkout fbp-trade-bot
      uses: actions/checkout@v3
      with:
        repository: yourusername/fbp-trade-bot
        path: bot
        token: ${{ secrets.GH_PAT }}
    
    - name: Set up Python
      uses: actions/setup-python@v4
      with:
        python-version: '3.10'
        
    - name: Install dependencies
      run: |
        cd bot
        pip install -r requirements.txt
        
    - name: Run data pipeline
      env:
        GOOGLE_CREDS_JSON: ${{ secrets.GOOGLE_CREDS_JSON }}
        YAHOO_TOKEN_JSON: ${{ secrets.YAHOO_TOKEN_JSON }}
      run: |
        cd bot
        echo "$GOOGLE_CREDS_JSON" > google_creds.json
        echo "$YAHOO_TOKEN_JSON" > token.json
        python3 data_pipeline/update_all.py
        
    - name: Copy data files
      run: |
        cp bot/data/combined_players.json data/
        cp bot/data/standings.json data/
        cp bot/data/wizbucks.json data/
        
    - name: Commit changes
      run: |
        git config user.name "GitHub Actions"
        git config user.email "actions@github.com"
        git add data/
        git commit -m "Auto-update data - $(date +%Y-%m-%d)" || echo "No changes"
        git push
```

**Setup GitHub Secrets:**

1. Go to fbp-hub repository Settings
2. Secrets and variables → Actions
3. Add repository secrets:
   - `GH_PAT`: Personal Access Token (create at github.com/settings/tokens)
   - `GOOGLE_CREDS_JSON`: Contents of google_creds.json
   - `YAHOO_TOKEN_JSON`: Contents of token.json

## 🎨 Customization for Your League

### Update Team Names

Edit `js/rosters.js`:

```javascript
const TEAM_NAMES = {
    'WIZ': 'Whiz Kids',
    'B2J': 'Btwn2Jackies',
    // Update these to match your teams
};
```

### Update Season Information

Edit `index.html`, `players.html`, `rosters.html`:

```html
<p class="season-year">Season 13 - 2025</p>
<!-- Change to current season -->
```

### Update Color Scheme

Edit `css/styles.css`:

```css
:root {
    --color-primary: #FF8C42;  /* Main accent color */
    --color-background: #1A1A1A;  /* Background */
    /* Update for new season */
}
```

### Update Deadlines

Edit `js/homepage.js`:

```javascript
const deadlines = [
    { name: 'Prospect Draft', date: new Date('2025-02-17') },
    // Update dates for new season
];
```

## 🐛 Troubleshooting

### Site Not Loading
- Check GitHub Pages is enabled in Settings
- Verify branch is set to `main` and folder is `/`
- Wait 2-3 minutes after enabling Pages
- Check Actions tab for deployment errors

### Data Not Showing
- Verify data files exist in `data/` directory
- Check JSON files are valid (no syntax errors)
- Open browser console (F12) for JavaScript errors
- Verify file paths are correct

### Mobile Navigation Not Working
- Ensure Font Awesome CDN is loading
- Check browser console for errors
- Test in different browsers

### GitHub Actions Failing
- Check secrets are set correctly
- Verify repository names are correct
- Check Actions tab for error logs
- Ensure bot repository is accessible

## 📱 Mobile Testing

### Testing on Physical Device

1. **Find your local IP:**
   ```bash
   # Mac/Linux
   ipconfig getifaddr en0
   # Or
   hostname -I
   ```

2. **Start server:**
   ```bash
   python3 -m http.server 8000
   ```

3. **On phone browser:**
   ```
   http://YOUR-IP-ADDRESS:8000
   ```

4. **Ensure devices on same WiFi network**

### Browser Dev Tools (Chrome)

1. Open DevTools (F12)
2. Click device icon (or Ctrl+Shift+M)
3. Select device from dropdown
4. Test all pages and features

## 📊 Analytics (Optional)

Add Google Analytics to track usage:

1. Create GA4 property at analytics.google.com
2. Add to `<head>` of all HTML files:

```html
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

## ✅ Launch Checklist

Before sharing with league:

- [ ] All data files populated
- [ ] Local testing complete
- [ ] GitHub Pages enabled
- [ ] Site loads at public URL
- [ ] Mobile responsive verified
- [ ] All navigation links work
- [ ] Search and filters functional
- [ ] Team names updated
- [ ] Season information current
- [ ] Color scheme matches current year
- [ ] Auto-update system configured
- [ ] Tested on multiple devices

## 🎉 You're Live!

Share your new FBP Hub with the league:

```
🎉 FBP Hub is now live!

Check it out: https://yourusername.github.io/fbp-hub/

Features:
✅ Player database with search
✅ Keeper & prospect rosters
✅ Current standings
✅ Mobile-optimized

Data updates automatically daily!
```

## 🆘 Need Help?

- Check GitHub Issues in your repository
- Review console errors (F12 in browser)
- Test with sample data
- Verify all file paths
- Check GitHub Actions logs

---

**Next Steps:** Move to Phase 2 for additional features!
