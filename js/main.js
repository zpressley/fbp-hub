/**
 * FBP Hub - Main JavaScript
 * Handles data loading, navigation, and global utilities
 */

// Global state
const FBPHub = {
    data: {
        players: [],
        standings: null,
        wizbucks: null,
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

/**
 * Initialize the application
 */
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 FBP Hub initializing...');
    
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
    
    // Setup draft dropdown
    setupDraftDropdown();
    
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
        <a href="pad.html">
            <i class="fas fa-receipt"></i>
            PAD
        </a>
        <a href="kap.html">
            <i class="fas fa-trophy"></i>
            KAP
        </a>
        <a href="settings.html">
            <i class="fas fa-cog"></i>
            Settings
        </a>
        <a href="draft-board.html">
            <i class="fas fa-clipboard-list"></i>
            Draft Board
        </a>
        ${authManager.isAdmin && authManager.isAdmin() ? `
            <a href="admin.html">
                <i class="fas fa-shield-alt"></i>
                Admin Portal
            </a>
            <a href="auction.html">
                <i class="fas fa-gavel"></i>
                Auction
            </a>
            <a href="season-dates.html">
                <i class="fas fa-calendar-alt"></i>
                Season Dates
            </a>
        ` : ''}
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
 * Highlight the active navigation link
 */
function highlightActivePage() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const navLinks = document.querySelectorAll('.nav-link');
    const draftPages = ['draft.html', 'draft-preview.html', 'draft-picks.html', 'draft-board.html'];
    const effectiveCurrent = currentPage === 'draft-board.html' ? 'draft.html' : currentPage;
    
    // Handle regular nav links
    navLinks.forEach(link => {
        const linkPage = link.getAttribute('href').split('?')[0];
        link.classList.remove('active');
        
        if (linkPage === effectiveCurrent || 
            (effectiveCurrent === '' && linkPage === 'index.html')) {
            link.classList.add('active');
        }
    });
    
    // Handle draft dropdown items
    const dropdownItems = document.querySelectorAll('.nav-dropdown-item');
    const dropdownToggle = document.getElementById('draftDropdownToggle');
    
    dropdownItems.forEach(item => {
        const itemPage = item.getAttribute('href').split('?')[0];
        item.classList.remove('active');
        
        if (itemPage === currentPage) {
            item.classList.add('active');
        }
    });
    
    // Mark dropdown toggle as active if on any draft page
    if (dropdownToggle && draftPages.includes(currentPage)) {
        dropdownToggle.classList.add('active');
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
