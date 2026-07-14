# Cache Busting Strategy for FBP Hub

> **Update (2026-07-13): this is now automated.** `.github/workflows/cache-bust.yml`
> runs `scripts/add-cache-busting.sh` automatically on every push to `main`
> that touches `**/*.html`, `js/**`, or `css/**`, and pushes the version
> bump back itself. You no longer need to run the script by hand — the
> manual steps below are kept for reference/local testing only.

## Problem
Browser caching causes users to load old JavaScript/CSS files after updates are deployed, leading to broken functionality.

## Solutions (In Order of Effectiveness)

### ✅ Solution 1: Automated Version Query Parameters (RECOMMENDED)

**What it does**: Adds `?v=YYYYMMDD` to all JS/CSS file references in HTML
**When to use**: Every deployment with JS/CSS changes
**Effectiveness**: 100% - Forces immediate reload

#### Usage:
```bash
# Run before commit when you've updated JS/CSS files
./scripts/add-cache-busting.sh

# Or manually specify version
./scripts/add-cache-busting.sh 20260220
```

#### How it works:
- Scans all HTML files
- Updates all `<script src="js/file.js">` → `<script src="js/file.js?v=20260220">`
- Updates all `<link href="css/file.css">` → `<link href="css/file.css?v=20260220">`
- Browser treats `file.js?v=20260220` as a different file than `file.js?v=20260219`

---

### ✅ Solution 2: Manual Version for Critical Files (CURRENT)

**What it does**: Manually add `?v=VERSION` to specific files that changed
**When to use**: Quick fixes for specific file issues
**Effectiveness**: 100% for those specific files

#### Example:
```html
<!-- Before -->
<script src="js/kap-buyin-integration.js"></script>

<!-- After -->
<script src="js/kap-buyin-integration.js?v=20260220b"></script>
```

**Pros**: Quick, targeted
**Cons**: Manual, easy to forget

---

### 📋 Solution 3: GitHub Pages Headers (NOT AVAILABLE)

GitHub Pages doesn't support custom cache-control headers, so this option isn't available.

---

### 🔄 Solution 4: Service Worker (ADVANCED - Optional)

**What it does**: Programmatically manages cache and forces updates
**When to use**: If we want advanced offline support
**Effectiveness**: 95% (requires user to reload once)

We've created `sw.js` (service worker) but it's **not currently registered**. To enable:

1. Add to `index.html` and other pages:
```html
<script>
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then(reg => console.log('SW registered'))
    .catch(err => console.log('SW registration failed'));
}
</script>
```

2. Update `CACHE_VERSION` in `sw.js` when deploying changes

**Pros**: Automatic cache management, offline support
**Cons**: Complex, requires maintenance, doesn't help first-time users

---

## Current Workflow

### For Regular Updates:
```bash
# 1. Make your changes to JS/CSS files
vim js/kap-buyin-integration.js

# 2. Run cache-busting script
./scripts/add-cache-busting.sh

# 3. Commit and push
git add .
git commit -m "Fix: Updated buy-in logic"
git push
```

### For Emergency Fixes:
If users report issues with cached files:

1. **Quick fix** - Add `?v=YYYYMMDD` to the affected file in HTML
2. **Tell users** - Ask them to hard refresh (Cmd+Shift+R / Ctrl+Shift+R)

---

## Best Practices

1. **Always run cache-busting script** before committing JS/CSS changes
2. **Increment version** on each deploy (use date: YYYYMMDD format)
3. **Test in incognito** before telling users about new features
4. **Document breaking changes** in commit messages

---

## File Versions

Keep track of major file version updates:

- `2026-02-20`: Added multiple pick support for buy-ins
- `2026-02-19`: Fixed KAP draft pick preview calculations

---

## Troubleshooting

### User still seeing old code?
1. Check GitHub Pages deploy status (usually takes 1-2 minutes)
2. Verify the version query param is in the HTML file on GitHub
3. Ask user to:
   - Hard refresh (Cmd+Shift+R or Ctrl+Shift+R)
   - Clear site data (DevTools → Application → Clear storage)
   - Try incognito/private window

### File not updating in HTML?
Run the cache-busting script again:
```bash
./scripts/add-cache-busting.sh
git add .
git commit -m "Update cache-busting version"
git push
```
