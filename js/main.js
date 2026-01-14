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
        dataPath: './data/',
        githubRaw: 'https://raw.githubusercontent.com/yourusername/fbp-hub/main/data/'
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
        ${authManager.isAdmin ? authManager.isAdmin() : authManager.isCommissioner && authManager.isCommissioner() ? `
            <a href="admin.html">
                <i class="fas fa-shield-alt"></i>
                Admin
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
 * Highlight the active navigation link
 */
function highlightActivePage() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const navLinks = document.querySelectorAll('.nav-link');
    
    navLinks.forEach(link => {
        const linkPage = link.getAttribute('href').split('?')[0];
        link.classList.remove('active');
        
        if (linkPage === currentPage || 
            (currentPage === '' && linkPage === 'index.html')) {
            link.classList.add('active');
        }
    });
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

    let lastScrollY = window.scrollY;
    let ticking = false;
    let isHidden = false;

    function update() {
        const currentY = window.scrollY;
        const diff = currentY - lastScrollY;

        // Compact once user scrolls a bit
        if (currentY > 40) {
            nav.classList.add('nav-compact');
        } else {
            nav.classList.remove('nav-compact');
        }

        // Top of page: always show
        if (currentY < 40) {
            if (isHidden) {
                nav.classList.remove('nav-hidden');
                isHidden = false;
            }
            lastScrollY = currentY;
            ticking = false;
            return;
        }

        const SCROLL_DOWN_THRESHOLD = 10; // pixels
        const SCROLL_UP_THRESHOLD = 20;   // pixels
        const HIDE_START_Y = 120;         // don't start hiding until below this

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
        case 'transactions':
            if (typeof initTransactionsPage === 'function') {
                initTransactionsPage();
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
        'LAW': '#A8E6CF',
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
 */
function createTeamBadge(teamAbbr) {
    if (!teamAbbr) return '';

    const colors = FBPHub.data.teamColors?.[teamAbbr];
    if (colors && colors.primary) {
        const borderColor = colors.secondary || colors.primary;
        const style = `background-color: ${colors.primary}; color: white; border: 2px solid ${borderColor};`;
        return `<span class="team-badge" style="${style}">${teamAbbr}</span>`;
    }

    // Fallback to static color map and base CSS styling
    const fallback = getTeamColor(teamAbbr);
    return `<span class="team-badge" style="background-color: ${fallback}; color: white;">${teamAbbr}</span>`;
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
 * Filter players by criteria
 */
function filterPlayers(criteria) {
    let filtered = [...FBPHub.data.players];
    
    // Filter by player type
    if (criteria.playerType) {
        filtered = filtered.filter(p => p.player_type === criteria.playerType);
    }
    
    // Filter by position
    if (criteria.position) {
        filtered = filtered.filter(p => p.position === criteria.position);
    }
    
    // Filter by team
    if (criteria.team) {
        filtered = filtered.filter(p => p.team === criteria.team);
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

// Export for use in other scripts
window.FBPHub = FBPHub;
window.formatDate = formatDate;
window.formatRelativeTime = formatRelativeTime;
window.createTeamBadge = createTeamBadge;
window.createPositionBadge = createPositionBadge;
window.createContractBadge = createContractBadge;
window.filterPlayers = filterPlayers;
window.getUniqueValues = getUniqueValues;
window.debounce = debounce;