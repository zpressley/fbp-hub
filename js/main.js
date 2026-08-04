/**
 * FBP Hub - Main JavaScript
 * Handles data loading, navigation, and global utilities
 */

// ---------------------------------------------------------------------
// Global client-error reporter
// ---------------------------------------------------------------------
// Ships uncaught JS errors, unhandled promise rejections, and console.error()
// calls to the bot backend (via the Cloudflare Worker) so they show up in
// Railway's log stream instead of only being visible in a manager's own
// browser console. This is intentionally the very first thing in main.js —
// main.js loads before every other page script on every page — so it
// catches as much as possible.
//
// See docs/CLOUDFLARE_WORKER_REFERENCE.md for the Worker route
// (/api/log/client-error -> proxied to the bot) and
// fbp-trade-bot/api_client_log.py for the backend side.
(function () {
    const REPORT_URL = 'https://fbp-auth.zpressley.workers.dev/api/log/client-error';
    const MAX_REPORTS_PER_LOAD = 25; // hard cap so a page stuck in a retry/error loop can't spam the endpoint
    const host = window.location.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1';
    let reportCount = 0;

    function currentTeam() {
        try {
            return localStorage.getItem('fbp_team') || (window.FBPHub && window.FBPHub._currentTeam) || null;
        } catch (e) {
            return null;
        }
    }

    function send(payload) {
        if (isLocal || reportCount >= MAX_REPORTS_PER_LOAD) return;
        reportCount++;
        try {
            fetch(REPORT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                keepalive: true,
            }).catch(() => {}); // reporting an error must never itself throw
        } catch (e) {
            // swallow — a broken error-reporter shouldn't break the page
        }
    }

    function report(kind, message, extra) {
        send(Object.assign(
            {
                kind: kind,
                message: String(message == null ? '(no message)' : message).slice(0, 2000),
                source: window.location.href,
                userAgent: navigator.userAgent,
                team: currentTeam(),
                timestamp: new Date().toISOString(),
            },
            extra || {}
        ));
    }

    window.addEventListener('error', function (event) {
        report('onerror', event.message, {
            lineno: event.lineno,
            colno: event.colno,
            stack: event.error && event.error.stack ? String(event.error.stack).slice(0, 4000) : undefined,
        });
    });

    window.addEventListener('unhandledrejection', function (event) {
        const reason = event.reason;
        const message = reason && reason.message ? reason.message : String(reason);
        report('unhandledrejection', message, {
            stack: reason && reason.stack ? String(reason.stack).slice(0, 4000) : undefined,
        });
    });

    // A lot of this codebase logs failures via console.error(...) instead of
    // throwing (e.g. failed fetches with a .catch()) — those never reach
    // window.onerror at all, so mirror console.error too.
    const originalConsoleError = console.error.bind(console);
    console.error = function (...args) {
        originalConsoleError(...args);
        try {
            const message = args
                .map((a) => {
                    if (a instanceof Error) return a.stack || a.message;
                    if (typeof a === 'string') return a;
                    try {
                        return JSON.stringify(a);
                    } catch (e) {
                        return String(a);
                    }
                })
                .join(' ');
            report('console.error', message);
        } catch (e) {
            // ignore — see comment above
        }
    };
})();

// Global state
const FBPHub = {
    data: {
        players: [],
        standings: null,
        wizbucks: null,
        managers: null,
        teamColors: {}
    },
    config: {
        // Local/static JSON path (used for most data files)
        dataPath: './data/',
        // GitHub raw fallback for data when running on GitHub Pages
        githubRaw: 'https://raw.githubusercontent.com/zpressley/fbp-hub/main/data/',
        // Base URL for dynamic APIs (Cloudflare Worker → bot FastAPI)
        // Used by draft.html and js/draft.js for /api/draft/* endpoints.
        apiBase: 'https://fbp-auth.zpressley.workers.dev',
        // API key for backend authentication (should match BOT_API_KEY in fbp-trade-bot)
        apiKey: 'tRXTQC42CJQNnKNPOyqzb5jQrVFq3S-7kTey9CgL8QQ'
    },
    cache: {
        lastUpdate: null
    },
    _events: {}
};

// Simple event system so pages can wait for core data load
FBPHub.on = function(eventName, handler) {
    if (!FBPHub._events[eventName]) {
        FBPHub._events[eventName] = [];
    }
    FBPHub._events[eventName].push(handler);
};

FBPHub.emit = function(eventName, payload) {
    const listeners = FBPHub._events[eventName] || [];
    listeners.forEach(fn => {
        try {
            fn(payload);
        } catch (err) {
            console.error(`Error in FBPHub listener for ${eventName}:`, err);
        }
    });
};

// ---------------------------------------------------------------------
// Website Theme
// ---------------------------------------------------------------------
// 5 predefined palettes, covering both CSS variable systems on the site:
// the legacy styles.css tokens (--bg-charcoal, --primary-red, etc. -- every
// page except Team Planner/Team Builder) and the team-planner.css /
// team-builder.css tokens (--bg0-4, --red, --gold, etc). Applied by setting
// custom properties directly on <html>, mirroring the existing
// --team-primary/--team-secondary pattern from Team Colors (js/settings.js
// applyTeamColorsGlobally). Saving a theme requires login (see
// js/settings.js saveSiteTheme + fbp-trade-bot/api_settings.py
// set_site_theme) -- this just handles *applying* whatever's already saved.
const THEME_PALETTES = {
    'red-gold': {
        legacy: { bgPage: '#1C1C1C', panel: '#2B2B2B', accent: '#EF3E42', accent2: '#FFB612', text: '#EEEEEE', muted: '#999999', row: '#262626', rowAlt: '#212121', highlight: '#2F3A2B', buy: '#2F6B3A', sell: '#7A2B2B', hold: '#5C5C1F', watch: '#2B4A6B' },
        planner: { bg0: '#1C1C1C', bg1: '#262626', bg2: '#2B2B2B', bg3: '#212121', bg4: '#2B2B2B', red: '#EF3E42', gold: '#FFB612', white: '#EEEEEE', dim: '#999999', highlight: '#2F3A2B', buy: '#2F6B3A', sell: '#7A2B2B', hold: '#5C5C1F', watch: '#2B4A6B' }
    },
    'diamond-dusk': {
        legacy: { bgPage: '#12161F', panel: '#1B2230', accent: '#C97A3D', accent2: '#4FA8D8', text: '#E8ECF1', muted: '#7C8AA0', row: '#1A2029', rowAlt: '#161B23', highlight: '#223327', buy: '#2F6B4A', sell: '#7A3535', hold: '#6B5A2B', watch: '#2B4A6B' },
        planner: { bg0: '#12161F', bg1: '#1A2029', bg2: '#1B2230', bg3: '#161B23', bg4: '#1B2230', red: '#C97A3D', gold: '#4FA8D8', white: '#E8ECF1', dim: '#7C8AA0', highlight: '#223327', buy: '#2F6B4A', sell: '#7A3535', hold: '#6B5A2B', watch: '#2B4A6B' }
    },
    'turf-green': {
        legacy: { bgPage: '#10160F', panel: '#1A2318', accent: '#6FBF3F', accent2: '#D9E86B', text: '#EAF0E6', muted: '#8A9A82', row: '#182014', rowAlt: '#131A10', highlight: '#2A3D1F', buy: '#3D7A2F', sell: '#7A3A2B', hold: '#7A6B1F', watch: '#2B5A5A' },
        planner: { bg0: '#10160F', bg1: '#182014', bg2: '#1A2318', bg3: '#131A10', bg4: '#1A2318', red: '#6FBF3F', gold: '#D9E86B', white: '#EAF0E6', dim: '#8A9A82', highlight: '#2A3D1F', buy: '#3D7A2F', sell: '#7A3A2B', hold: '#7A6B1F', watch: '#2B5A5A' }
    },
    'ballpark-cream': {
        legacy: { bgPage: '#F4ECD8', panel: '#FFFAF0', accent: '#A3352B', accent2: '#1C3D5A', text: '#2B241A', muted: '#7A6F5C', row: '#FBF4E4', rowAlt: '#F4ECD8', highlight: '#D9E4D0', buy: '#4A6A3A', sell: '#A3352B', hold: '#8A6C1A', watch: '#1C3D5A' },
        planner: { bg0: '#F4ECD8', bg1: '#FBF4E4', bg2: '#FFFAF0', bg3: '#F4ECD8', bg4: '#FFFAF0', red: '#A3352B', gold: '#1C3D5A', white: '#2B241A', dim: '#7A6F5C', highlight: '#D9E4D0', buy: '#4A6A3A', sell: '#A3352B', hold: '#8A6C1A', watch: '#1C3D5A' }
    },
    'steel-cyan': {
        legacy: { bgPage: '#0B0F14', panel: '#131A22', accent: '#00B8D9', accent2: '#FF6B35', text: '#D6E4EE', muted: '#5C7285', row: '#101720', rowAlt: '#0C1219', highlight: '#163024', buy: '#1F6B4A', sell: '#8A2B2B', hold: '#6B5A1F', watch: '#1F4A6B' },
        planner: { bg0: '#0B0F14', bg1: '#101720', bg2: '#131A22', bg3: '#0C1219', bg4: '#131A22', red: '#00B8D9', gold: '#FF6B35', white: '#D6E4EE', dim: '#5C7285', highlight: '#163024', buy: '#1F6B4A', sell: '#8A2B2B', hold: '#6B5A1F', watch: '#1F4A6B' }
    }
};
const DEFAULT_THEME = 'red-gold';
const THEME_STORAGE_KEY = 'fbp_site_theme';

function applyTheme(themeId) {
    const resolvedId = THEME_PALETTES[themeId] ? themeId : DEFAULT_THEME;
    const theme = THEME_PALETTES[resolvedId];
    const root = document.documentElement;
    const L = theme.legacy, P = theme.planner;

    // Legacy system (styles.css) -- every page except Team Planner/Builder
    root.style.setProperty('--bg-page', L.bgPage);
    root.style.setProperty('--bg-charcoal', L.panel);
    root.style.setProperty('--row-bg', L.row);
    root.style.setProperty('--row-alt-bg', L.rowAlt);
    root.style.setProperty('--highlight-bg', L.highlight);
    root.style.setProperty('--primary-red', L.accent);
    root.style.setProperty('--accent-yellow', L.accent2);
    root.style.setProperty('--text-white', L.text);
    root.style.setProperty('--text-gray', L.muted);
    root.style.setProperty('--success', L.buy);
    root.style.setProperty('--warning', L.hold);
    root.style.setProperty('--danger', L.sell);
    root.style.setProperty('--info', L.watch);

    // team-planner.css / team-builder.css system
    root.style.setProperty('--bg0', P.bg0);
    root.style.setProperty('--bg1', P.bg1);
    root.style.setProperty('--bg2', P.bg2);
    root.style.setProperty('--bg3', P.bg3);
    root.style.setProperty('--bg4', P.bg4);
    root.style.setProperty('--red', P.red);
    root.style.setProperty('--gold', P.gold);
    root.style.setProperty('--white', P.white);
    root.style.setProperty('--dim', P.dim);
    root.style.setProperty('--highlight', P.highlight);
    root.style.setProperty('--status-buy', P.buy);
    root.style.setProperty('--status-sell', P.sell);
    root.style.setProperty('--status-hold', P.hold);
    root.style.setProperty('--status-watch', P.watch);

    root.setAttribute('data-theme', resolvedId);
    FBPHub._currentTheme = resolvedId;
}

// Instant paint: apply whatever theme localStorage remembers (or the
// default) immediately, at script-execution time -- well before
// DOMContentLoaded, so pages don't sit on the default palette while the
// rest of the page boots.
(function () {
    let saved = null;
    try { saved = localStorage.getItem(THEME_STORAGE_KEY); } catch (e) {}
    applyTheme(saved || DEFAULT_THEME);
})();

/**
 * Reconcile with the git-committed backend value for a logged-in manager
 * (data/site_theme.json, synced from fbp-trade-bot the same way
 * team_colors.json is). Deliberately NOT called at main.js's own top level:
 * auth.js loads after main.js (see each page's closing <script> tags), so
 * `authManager` doesn't exist yet at that point -- this runs from the
 * DOMContentLoaded handler below instead, by which time every earlier
 * <script src> tag (main.js, auth.js, the page's own script) has already
 * run. Only ever narrows/confirms the instant-paint value above; never
 * causes a visible flash back to default.
 */
FBPHub.loadSiteTheme = async function () {
    let team = null;
    try {
        team = (typeof authManager !== 'undefined' && authManager.isAuthenticated?.())
            ? authManager.getTeam?.()?.abbreviation
            : null;
    } catch (e) { team = null; }
    if (!team) return;

    let localTheme = null;
    try { localTheme = localStorage.getItem(THEME_STORAGE_KEY); } catch (e) {}
    if (localTheme) return; // last save already reflected locally; synced copy can only lag behind it

    try {
        const response = await fetch(`${FBPHub.config.dataPath}site_theme.json`, { cache: 'no-store' });
        if (!response.ok) return;
        const synced = await response.json();
        const savedTheme = synced?.[team];
        if (savedTheme && THEME_PALETTES[savedTheme]) {
            applyTheme(savedTheme);
            try { localStorage.setItem(THEME_STORAGE_KEY, savedTheme); } catch (e) {}
        }
    } catch (e) {
        console.warn('Site theme: no synced data/site_theme.json yet, using default');
    }
};

/**
 * Initialize the application
 */
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 FBP Hub initializing...');

    // Reconcile the instant-paint theme (localStorage) with the logged-in
    // manager's saved theme, if any -- see FBPHub.loadSiteTheme above.
    FBPHub.loadSiteTheme();

    // Setup navigation
    setupNavigation();

    // Load initial data
    await loadAllData();
    
    // Initialize page-specific functionality
    const pageName = getPageName();
    initializePage(pageName);
    
    console.log('✅ FBP Hub ready');
});

/**
 * Setup navigation for mobile & desktop
 */
function setupNavigation() {
    const navMenu = document.getElementById('navMenu');
    
    if (navMenu) {
        const navToggle = document.getElementById('navToggle');
        const bottomMenuToggle = document.getElementById('bottomMenuToggle');

        const toggleMenu = () => {
            navMenu.classList.toggle('active');
        };

        // Allow either the legacy header toggle or the bottom nav toggle
        if (navToggle) {
            navToggle.addEventListener('click', toggleMenu);
        }
        if (bottomMenuToggle) {
            bottomMenuToggle.addEventListener('click', toggleMenu);
        }
        
        // Close menu when clicking a link on mobile
        const navLinks = navMenu.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                if (window.innerWidth < 768) {
                    navMenu.classList.remove('active');
                }
            });
        });
    }
    
    // Setup user menu
    setupUserMenu();
    
    // Setup dropdown menus
    setupDraftDropdown();
    setupFrontOfficeDropdown();
    
    // Highlight active page
    highlightActivePage();

    // Enable scroll-based header behavior
    setupHeaderScrollBehavior();
}

/**
 * Setup user menu dropdown
 */
function setupUserMenu() {
    const userMenuToggle = document.getElementById('userMenuToggle');
    const userMenuDropdown = document.getElementById('userMenuDropdown');
    const userMenu = document.getElementById('userMenu');
    
    if (!userMenuToggle || !userMenuDropdown) return;
    
    // Toggle dropdown
    userMenuToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        userMenuDropdown.classList.toggle('active');
    });
    
    // Close on outside click
    document.addEventListener('click', (e) => {
        if (userMenu && !userMenu.contains(e.target)) {
            userMenuDropdown.classList.remove('active');
        }
    });
    
    // Update menu if authenticated
    if (typeof authManager !== 'undefined' && authManager.isAuthenticated()) {
        updateUserMenuForAuth();
    }
}

/**
 * Update user menu when authenticated
 */
function updateUserMenuForAuth() {
    const userMenuToggle = document.getElementById('userMenuToggle');
    const userMenuDropdown = document.getElementById('userMenuDropdown');
    
    if (!userMenuToggle || !userMenuDropdown) return;
    
    const user = authManager.getUser();
    const team = authManager.getTeam();
    
    if (!user || !team) return;
    
    // Update toggle button
    userMenuToggle.innerHTML = `
        <img src="${authManager.getAvatarUrl(32)}" alt="${user.username}" class="user-avatar-small">
        <span class="user-team-abbr">${team.abbreviation}</span>
        <i class="fas fa-chevron-down"></i>
    `;
    
    // Update dropdown menu (only visible when logged in)
    userMenuDropdown.innerHTML = `
        <a href="dashboard.html">
            <i class="fas fa-tachometer-alt"></i>
            Dashboard
        </a>
        <a href="rosters.html?team=${team.abbreviation}">
            <i class="fas fa-baseball-ball"></i>
            My Roster
        </a>
        <a href="trade.html">
            <i class="fas fa-handshake"></i>
            Trade Portal
        </a>
        <a href="draft-board.html">
            <i class="fas fa-clipboard-list"></i>
            Draft Board
        </a>
        <a href="pad.html">
            <i class="fas fa-receipt"></i>
            PAD
        </a>
        <a href="kap.html">
            <i class="fas fa-trophy"></i>
            KAP
        </a>
        ${authManager.isAdmin && authManager.isAdmin() ? `
            <a href="admin.html">
                <i class="fas fa-shield-alt"></i>
                Admin Portal
            </a>
        ` : ''}
        <a href="settings.html">
            <i class="fas fa-cog"></i>
            Settings
        </a>
        <a href="#" id="headerLogout">
            <i class="fas fa-sign-out-alt"></i>
            Logout
        </a>
    `;

    const headerLogout = document.getElementById('headerLogout');
    if (headerLogout) {
        headerLogout.addEventListener('click', (e) => {
            e.preventDefault();
            authManager.logout();
        });
    }
}

/**
 * Setup draft dropdown navigation
 */
function setupDraftDropdown() {
    const dropdownToggle = document.getElementById('draftDropdownToggle');
    const dropdownMenu = document.getElementById('draftDropdownMenu');
    const navMenu = document.getElementById('navMenu');
    
    if (!dropdownToggle || !dropdownMenu) return;
    
    // Toggle dropdown
    dropdownToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownToggle.classList.toggle('open');
        dropdownMenu.classList.toggle('active');
    });
    
    // Close dropdown when clicking menu items on mobile
    const dropdownItems = dropdownMenu.querySelectorAll('.nav-dropdown-item');
    dropdownItems.forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth < 768 && navMenu) {
                navMenu.classList.remove('active');
            }
        });
    });
}

/**
 * Setup Front Office dropdown navigation
 */
function setupFrontOfficeDropdown() {
    const dropdownToggle = document.getElementById('frontOfficeDropdownToggle');
    const dropdownMenu = document.getElementById('frontOfficeDropdownMenu');
    const navMenu = document.getElementById('navMenu');
    
    if (!dropdownToggle || !dropdownMenu) return;
    
    // Toggle dropdown
    dropdownToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownToggle.classList.toggle('open');
        dropdownMenu.classList.toggle('active');
    });
    
    // Close dropdown when clicking menu items on mobile
    const dropdownItems = dropdownMenu.querySelectorAll('.nav-dropdown-item');
    dropdownItems.forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth < 768 && navMenu) {
                navMenu.classList.remove('active');
            }
        });
    });
}

/**
 * Highlight the active navigation link
 */
function highlightActivePage() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const navLinks = document.querySelectorAll('.nav-link');
    const draftPages = ['draft.html', 'draft-preview.html', 'draft-picks.html', 'draft-board.html'];
    const frontOfficePages = ['trade.html', 'auction.html', 'team-planner.html', 'wizbucks.html', 'pad.html', 'kap.html'];
    
    // Handle regular nav links
    navLinks.forEach(link => {
        const linkPage = link.getAttribute('href').split('?')[0];
        link.classList.remove('active');
        
        if (linkPage === currentPage || 
            (currentPage === '' && linkPage === 'index.html')) {
            link.classList.add('active');
        }
    });
    
    // Handle all dropdown items
    const dropdownItems = document.querySelectorAll('.nav-dropdown-item');
    dropdownItems.forEach(item => {
        const itemPage = item.getAttribute('href').split('?')[0];
        item.classList.remove('active');
        
        if (itemPage === currentPage) {
            item.classList.add('active');
        }
    });
    
    // Mark Draft dropdown toggle as active if on any draft page
    const draftToggle = document.getElementById('draftDropdownToggle');
    if (draftToggle && draftPages.includes(currentPage)) {
        draftToggle.classList.add('active');
    }
    
    // Mark Front Office dropdown toggle as active if on any front office page
    const foToggle = document.getElementById('frontOfficeDropdownToggle');
    if (foToggle && frontOfficePages.includes(currentPage)) {
        foToggle.classList.add('active');
    }
}

/**
 * Shrink and hide the sticky header on scroll (mobile-first)
 *
 * Uses simple hysteresis so the nav doesn't "bounce" when the user
 * hovers around the hide/show thresholds.
 */
function setupHeaderScrollBehavior() {
    const nav = document.querySelector('.mobile-nav');
    if (!nav) return;

    // Only allow full hide-on-scroll on high-utilization pages (PAD, KAP).
    // Everywhere else, desktop/tablet keeps the header visible while still
    // compacting it a bit after a small scroll.
    const pageName = typeof getPageName === 'function' ? getPageName() : '';
    const allowDesktopHide = pageName === 'pad' || pageName === 'kap';

    let lastScrollY = window.scrollY;
    let ticking = false;
    let isHidden = false;

    function update() {
        const currentY = window.scrollY;
        const diff = currentY - lastScrollY;
        const isDesktopOrTablet = window.innerWidth >= 768;

        // Desktop / tablet behavior on most pages: never fully hide the header.
        if (isDesktopOrTablet && !allowDesktopHide) {
            // HYSTERESIS: Add buffer so nav doesn't flicker at threshold
            // Turn ON compact at >50px, turn OFF only when <10px
            if (currentY > 50) {
                nav.classList.add('nav-compact');
            } else if (currentY < 10) {
                nav.classList.remove('nav-compact');
            }

            if (isHidden) {
                nav.classList.remove('nav-hidden');
                isHidden = false;
            }

            lastScrollY = currentY;
            ticking = false;
            return;
        }

        // Full hide/show behavior (mobile on all pages, and desktop on PAD/KAP).

        // Ignore very small jitter to reduce "bounce" around thresholds
        if (Math.abs(diff) < 4) {
            lastScrollY = currentY;
            ticking = false;
            return;
        }

        // HYSTERESIS: Same buffer for mobile
        if (currentY > 50) {
            nav.classList.add('nav-compact');
        } else if (currentY < 10) {
            nav.classList.remove('nav-compact');
        }

        // Top of page: always show
        if (currentY < 10) {
            if (isHidden) {
                nav.classList.remove('nav-hidden');
                isHidden = false;
            }
            lastScrollY = currentY;
            ticking = false;
            return;
        }

        const SCROLL_DOWN_THRESHOLD = 40; // pixels
        const SCROLL_UP_THRESHOLD = 60;   // pixels
        const HIDE_START_Y = 200;         // don't start hiding until below this

        // Hide when scrolling down beyond threshold
        if (!isHidden && currentY > HIDE_START_Y && diff > SCROLL_DOWN_THRESHOLD) {
            nav.classList.add('nav-hidden');
            isHidden = true;
        }
        // Show when scrolling up enough
        else if (isHidden && diff < -SCROLL_UP_THRESHOLD) {
            nav.classList.remove('nav-hidden');
            isHidden = false;
        }

        lastScrollY = currentY;
        ticking = false;
    }

    window.addEventListener('scroll', () => {
        if (!ticking) {
            window.requestAnimationFrame(update);
            ticking = true;
        }
    });
}

/**
 * Load all data files
 */
async function loadAllData() {
    console.log('📥 Loading data...');
    
    try {
        // Load core JSON in parallel
        const [playersData, standingsData, wizbucksData] = await Promise.all([
            loadJSON('combined_players.json'),
            loadJSON('standings.json'),
            loadJSON('wizbucks.json')
        ]);
        
        FBPHub.data.players = playersData || [];
        FBPHub.data.standings = standingsData;
        FBPHub.data.wizbucks = wizbucksData;
        
        // Load managers config (needed for abbr → name mapping in WB lookups)
        try {
            const mgr = await fetch('./config/managers.json');
            if (mgr.ok) FBPHub.data.managers = await mgr.json();
        } catch { /* non-critical */ }
        
        // Load team color configuration (defaults + any local overrides)
        await FBPHub.loadTeamColors();
        
        FBPHub.cache.lastUpdate = new Date();
        
        console.log(`✅ Loaded ${FBPHub.data.players.length} players`);
        console.log('✅ Loaded standings, WizBucks, and team colors');
        
    } catch (error) {
        console.error('❌ Error loading data:', error);
        showErrorMessage('Failed to load data. Please try refreshing the page.');
    } finally {
        // Notify any listeners that core data load has completed (success or fail)
        if (typeof FBPHub.emit === 'function') {
            FBPHub.emit('ready');
        }
    }
}

/**
 * Load JSON file from data directory
 */
async function loadJSON(filename) {
    try {
        // Try local path first
        let response = await fetch(`${FBPHub.config.dataPath}${filename}`);
        
        // If local fails, try GitHub raw (for GitHub Pages deployment)
        if (!response.ok) {
            response = await fetch(`${FBPHub.config.githubRaw}${filename}`);
        }
        
        if (!response.ok) {
            throw new Error(`Failed to load ${filename}: ${response.status}`);
        }
        
        return await response.json();
        
    } catch (error) {
        console.error(`Error loading ${filename}:`, error);
        return null;
    }
}

/**
 * Get current page name without extension
 */
function getPageName() {
    const path = window.location.pathname;
    const page = path.split('/').pop();
    return page.replace('.html', '') || 'index';
}

/**
 * Initialize page-specific functionality
 */
function initializePage(pageName) {
    switch(pageName) {
        case 'index':
            if (typeof initHomepage === 'function') {
                initHomepage();
            }
            break;
        case 'players':
            if (typeof initPlayersPage === 'function') {
                initPlayersPage();
            }
            break;
        case 'rosters':
            if (typeof initRostersPage === 'function') {
                initRostersPage();
            }
            break;
        case 'wizbucks':  // ADD THIS!
            if (typeof initWizBucksPage === 'function') {
                initWizBucksPage();
            }
            break;
        case 'trade':
            if (typeof initTradePage === 'function') {
                initTradePage();
            }
            break;
        case 'dashboard':
            if (typeof initDashboard === 'function') {
                initDashboard();
            }
            break;
        case 'salaries':
            if (typeof initSalariesPage === 'function') {
                initSalariesPage();
            }
            break;
        case 'draft-picks':
            if (typeof initDraftPicksPage === 'function') {
                initDraftPicksPage();
            }
            break; 
        case 'season-dates':
            if (typeof initSeasonDatesPage === 'function') {
                initSeasonDatesPage();
            }
            break;
        case 'player-log':
            if (typeof initPlayerLogPage === 'function') {
                initPlayerLogPage();
            }
            break;
        case 'auction':
            if (typeof initAuctionPage === 'function') {
                initAuctionPage();
            }
            break;     
        case 'admin':
            if (typeof initAdminPortal === 'function') {
                initAdminPortal();
            }
            break;
        case 'settings':
            if (typeof initSettings === 'function') {
                initSettings();
            }
            break;
        case 'pad':
            if (typeof initPADPage === 'function') {
                initPADPage();
            }
            break;
        case 'kap':
            if (typeof initKAPPage === 'function') {
                initKAPPage();
            }
            break;
        case 'team-planner':
            if (typeof initTeamPlannerPage === 'function') {
                initTeamPlannerPage();
            }
            break;
        case 'player-profile':
            if (typeof initPlayerProfile === 'function') {
                initPlayerProfile();
            }
            break;
        case 'draft':
            if (typeof initDraft === 'function') {
                initDraft();
            }
            break;
        case 'draft-board':
            if (typeof initDraftBoard === 'function') {
                initDraftBoard();
            }
            break;
        default:
            console.log(`No specific initialization for ${pageName}`);
    }
}

/**
 * Display error message to user
 */
function showErrorMessage(message) {
    const container = document.querySelector('.container');
    if (!container) return;
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-banner';
    errorDiv.innerHTML = `
        <div class="error-content">
            <i class="fas fa-exclamation-triangle"></i>
            <p>${message}</p>
        </div>
    `;
    
    container.insertBefore(errorDiv, container.firstChild);
}

/**
 * Format date for display
 */
function formatDate(dateString) {
    if (!dateString) return 'Unknown';
    
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    }).format(date);
}

/**
 * Format relative time (e.g., "2 days ago")
 */
function formatRelativeTime(dateString) {
    if (!dateString) return 'Unknown';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} days ago`;
    
    return formatDate(dateString);
}

/**
 * Load team colors from data/team_colors.json + localStorage overrides
 */
FBPHub.loadTeamColors = async function() {
    let jsonColors = {};
    try {
        const response = await fetch(`${FBPHub.config.dataPath}team_colors.json`);
        if (response.ok) {
            jsonColors = await response.json();
        }
    } catch (e) {
        console.warn('No team_colors.json found, continuing with local overrides only');
    }

    let localOverrides = {};
    try {
        localOverrides = JSON.parse(localStorage.getItem('team_colors') || '{}');
    } catch (e) {
        localOverrides = {};
    }

    const merged = { ...jsonColors };
    for (const [team, colors] of Object.entries(localOverrides)) {
        merged[team] = { ...(merged[team] || {}), ...colors };
    }

    FBPHub.data.teamColors = merged;
};

/**
 * Get fallback team color when no custom colors are configured
 */
function getTeamColor(teamAbbr) {
    const teamColors = {
        'WIZ': '#FF8C42',
        'B2J': '#4ECDC4',
        'CFL': '#95E1D3',
        'HAM': '#F38181',
        'JEP': '#AA96DA',
        'LFB': '#FCBAD3',
        'DMN': '#A8E6CF',
        'SAD': '#FFD3B6',
        'DRO': '#FFAAA5',
        'RV': '#FF8B94',
        'TBB': '#A8E6CF',
        'WAR': '#C7CEEA'
    };
    
    return teamColors[teamAbbr] || '#FF8C42';
}

/**
 * Create team badge HTML (uses team_colors when available)
 *
 * Design: solid primary background, secondary text color, no outline.
 * Font styling is provided by the global .team-badge class so badges
 * match the FBP HUB 3.0 title treatment.
 */
function createTeamBadge(teamAbbr) {
    if (!teamAbbr) return '';

    const colors = FBPHub.data.teamColors?.[teamAbbr];
    if (colors && colors.primary) {
        const textColor = colors.secondary || '#FFFFFF';
        const style = `background-color: ${colors.primary}; color: ${textColor};`;
        return `<span class="team-badge" style="${style}">${teamAbbr}</span>`;
    }

    // Fallback to static color map and base CSS styling
    const fallback = getTeamColor(teamAbbr);
    const style = `background-color: ${fallback}; color: #FFFFFF;`;
    return `<span class="team-badge" style="${style}">${teamAbbr}</span>`;
}

/**
 * Create position badge HTML
 */
function createPositionBadge(position) {
    const positionTypes = {
        'C': 'catcher',
        '1B': 'infield',
        '2B': 'infield',
        '3B': 'infield',
        'SS': 'infield',
        'LF': 'outfield',
        'CF': 'outfield',
        'RF': 'outfield',
        'OF': 'outfield',
        'DH': 'dh',
        'SP': 'pitcher',
        'RP': 'pitcher',
        'P': 'pitcher'
    };
    
    const type = positionTypes[position] || 'default';
    return `<span class="position-badge ${type}">${position}</span>`;
}

/**
 * Create contract badge HTML
 */
function createContractBadge(contract) {
    const contractTypes = {
        'FC': { label: 'Farm', class: 'farm' },
        'PC': { label: 'Purchased', class: 'purchased' },
        'DC': { label: 'Development', class: 'development' },
        'TC': { label: 'Tender', class: 'tender' },
        'VC': { label: 'Vested', class: 'vested' },
        'R': { label: 'Rookie', class: 'rookie' }
    };
    
    // Extract contract type from string like "FC(2)" or "VC-1"
    const match = contract.match(/^([A-Z]+)/);
    const type = match ? match[1] : 'Unknown';
    const info = contractTypes[type] || { label: contract, class: 'default' };
    
    return `<span class="contract-badge ${info.class}" title="${contract}">${info.label}</span>`;
}

/**
 * Build an MLB Stats headshot image URL for a player, sized to the given
 * pixel width. Backed by MLB's public photo CDN (img.mlbstatic.com), keyed
 * off mlb_id. The `d_...` default-image param means Cloudinary itself falls
 * back to a generic silhouette for players with no photo on file, so this
 * only returns null when we don't even have an mlb_id to try.
 */
function getPlayerPhotoUrl(player, size = 120) {
    const mlbId = player && player.mlb_id;
    if (!mlbId) return null;
    return `https://img.mlbstatic.com/mlb-photos/image/upload/w_${size},q_auto:best,d_people:generic:headshot:67:current.png/v1/people/${mlbId}/headshot/67/current`;
}

// Local silhouette shown when a player has no mlb_id at all, or their
// headshot image fails to load for some other reason.
const PLAYER_PHOTO_FALLBACK = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<rect width="100" height="100" fill="#2a2a2a"/>' +
    '<circle cx="50" cy="38" r="18" fill="#5a5a5a"/>' +
    '<path d="M50 62c-22 0-34 12-34 30v8h68v-8c0-18-12-30-34-30z" fill="#5a5a5a"/>' +
    '</svg>'
);

/**
 * onerror handler for player headshot <img> tags — swaps to the local
 * silhouette so a bad/missing photo never shows a broken-image icon.
 */
function handlePlayerPhotoError(imgEl) {
    if (!imgEl) return;
    imgEl.onerror = null;
    imgEl.src = PLAYER_PHOTO_FALLBACK;
}

/**
 * Render a ready-to-use <img> avatar for a player. Always returns an <img>
 * (falling back to the local silhouette when there's no mlb_id) so callers
 * can drop it into cards, table cells, or list rows with no extra markup.
 *
 * @param {Object} player - a combined_players record (needs mlb_id)
 * @param {number} size - display size in px (a 2x image is requested for retina)
 * @param {string} extraClass - additional CSS class(es) to add
 */
function createPlayerAvatarHTML(player, size = 40, extraClass = '') {
    const name = (player && player.name) || 'Player';
    const safeName = name.replace(/"/g, '&quot;');
    const url = getPlayerPhotoUrl(player, Math.max(size * 2, 60)) || PLAYER_PHOTO_FALLBACK;
    return `<img src="${url}" alt="${safeName}" title="${safeName}" loading="lazy" class="player-avatar ${extraClass}" style="width:${size}px;height:${size}px;" onerror="handlePlayerPhotoError(this)">`;
}

/**
 * Normalize a raw position string into an array of uppercase tokens.
 *
 * Example: "1B,3B" → ["1B", "3B"]
 */
function getPositionTokens(positionStr) {
    if (!positionStr) return [];
    return positionStr
        .split(',')
        .map(p => p.trim().toUpperCase())
        .filter(Boolean);
}

/**
 * Determine whether a player's position string matches a canonical
 * position filter code.
 *
 * Canonical filters we support across the site:
 *   C, 1B, 2B, SS, 3B, CF, OF, DH, SP, RP, P
 *
 * Pitcher rules:
 * - SP: token list contains "SP"
 * - RP: token list contains "RP"
 * - P: generic/unspecified pitchers only:
 *      - explicit "P", OR
 *      - RHP/LHP *without* SP or RP (prospect-style roles)
 */
function positionMatchesFilter(positionStr, filterCode) {
    if (!filterCode) return true;
    const tokens = getPositionTokens(positionStr);
    if (!tokens.length) return false;

    const has = (code) => tokens.includes(code);
    const hasAny = (codes) => codes.some(c => tokens.includes(c));

    const hasSP = has('SP');
    const hasRP = has('RP');
    const hasP = has('P');
    const hasHanded = has('RHP') || has('LHP');

    switch (filterCode) {
        case 'C':
            return has('C');
        case '1B':
            return has('1B');
        case '2B':
            return has('2B');
        case 'SS':
            return has('SS');
        case '3B':
            return has('3B');
        case 'CF':
            return has('CF');
        case 'OF':
            // Treat LF/CF/RF as OF for filtering purposes.
            return hasAny(['OF', 'LF', 'CF', 'RF']);
        case 'DH':
            return has('DH');
        case 'SP':
            return hasSP;
        case 'RP':
            return hasRP;
        case 'P':
            // Generic pitchers: explicit P, or handed-only (RHP/LHP)
            // that are not already classified as SP or RP.
            if (hasP) return true;
            if (hasHanded && !hasSP && !hasRP) return true;
            return false;
        default:
            return has(filterCode.toUpperCase());
    }
}

/**
 * Filter players by criteria
 */
function filterPlayers(criteria) {
    let filtered = [...FBPHub.data.players];
    
    // Filter by player type
    if (criteria.playerType) {
        filtered = filtered.filter(p => p.player_type === criteria.playerType);
    }
    
    // Filter by position (using canonical filter codes)
    if (criteria.position) {
        filtered = filtered.filter(p => positionMatchesFilter(p.position, criteria.position));
    }
    
    // Filter by team
    if (criteria.team) {
        filtered = filtered.filter(p => p.team === criteria.team);
    }
    
    // Filter by contract (combines years_simple status prefix and contract_type)
    if (criteria.contract) {
        const CONTRACT_TYPE_MAP = {
            'PC': 'Purchased Contract',
            'BC': 'Blue Chip Contract',
            'DC': 'Development Cont.',
            'KC': 'Keeper Contract'
        };
        const code = criteria.contract;
        if (CONTRACT_TYPE_MAP[code]) {
            // Match against contract_type field
            filtered = filtered.filter(p => p.contract_type === CONTRACT_TYPE_MAP[code]);
        } else {
            // Match against years_simple prefix (TC, VC, FC, P)
            filtered = filtered.filter(p => {
                if (!p.years_simple) return false;
                const ys = p.years_simple.toUpperCase();
                if (code === 'P') return ys === 'P';
                return ys.startsWith(code);
            });
        }
    }

    // Filter by FBP team (abbreviation)
    if (criteria.manager) {
        filtered = filtered.filter(p => p.FBP_Team === criteria.manager);
    }
    
    // Search by name
    if (criteria.search) {
        const searchLower = criteria.search.toLowerCase();
        filtered = filtered.filter(p => 
            p.name.toLowerCase().includes(searchLower)
        );
    }
    
    return filtered;
}

/**
 * Get unique values from player data
 */
function getUniqueValues(field) {
    const values = new Set();
    FBPHub.data.players.forEach(player => {
        if (player[field]) {
            values.add(player[field]);
        }
    });
    return Array.from(values).sort();
}

/**
 * Debounce function for search inputs
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Copy text to clipboard
 */
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showToast('Copied to clipboard!');
    } catch (err) {
        console.error('Failed to copy:', err);
    }
}

/**
 * Show toast notification
 */
function showToast(message, duration = 3000) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 100);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

/**
 * Calculate relative luminance of a color (WCAG standard)
 * @param {string} color - Hex color (e.g., '#FFFFFF') or RGB string
 * @returns {number} - Luminance value between 0 and 1
 */
function getColorLuminance(color) {
    // Convert hex to RGB if needed
    let r, g, b;
    
    if (color.startsWith('#')) {
        const hex = color.replace('#', '');
        if (hex.length === 3) {
            r = parseInt(hex[0] + hex[0], 16);
            g = parseInt(hex[1] + hex[1], 16);
            b = parseInt(hex[2] + hex[2], 16);
        } else {
            r = parseInt(hex.substr(0, 2), 16);
            g = parseInt(hex.substr(2, 2), 16);
            b = parseInt(hex.substr(4, 2), 16);
        }
    } else if (color.startsWith('rgb')) {
        const matches = color.match(/\d+/g);
        if (matches && matches.length >= 3) {
            r = parseInt(matches[0]);
            g = parseInt(matches[1]);
            b = parseInt(matches[2]);
        } else {
            return 0.5; // default to mid-range if can't parse
        }
    } else {
        return 0.5; // default to mid-range for unknown format
    }
    
    // Convert to 0-1 range and apply gamma correction
    r = r / 255;
    g = g / 255;
    b = b / 255;
    
    r = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
    g = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
    b = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
    
    // Calculate relative luminance
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Get appropriate text color (black or white) for a given background color
 * @param {string} backgroundColor - Hex color or RGB string
 * @returns {string} - '#000000' for dark text, '#FFFFFF' for light text
 */
function getContrastTextColor(backgroundColor) {
    const luminance = getColorLuminance(backgroundColor);
    // WCAG recommends 0.5 threshold; use 0.6 for better readability on colored backgrounds
    return luminance > 0.6 ? '#000000' : '#FFFFFF';
}

// Export for use in other scripts
window.FBPHub = FBPHub;
window.formatDate = formatDate;
window.formatRelativeTime = formatRelativeTime;
window.createTeamBadge = createTeamBadge;
window.createPositionBadge = createPositionBadge;
window.filterPlayers = filterPlayers;
window.positionMatchesFilter = positionMatchesFilter;
window.createContractBadge = createContractBadge;
window.filterPlayers = filterPlayers;
window.getUniqueValues = getUniqueValues;
window.debounce = debounce;
window.getColorLuminance = getColorLuminance;
window.getContrastTextColor = getContrastTextColor;
window.getPlayerPhotoUrl = getPlayerPhotoUrl;
window.createPlayerAvatarHTML = createPlayerAvatarHTML;
window.handlePlayerPhotoError = handlePlayerPhotoError;
