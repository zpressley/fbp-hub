/**
 * FBP Hub - Main JavaScript
 * Handles data loading, navigation, and global utilities
 */

// Global state
const FBPHub = {
    data: {
        players: [],
        standings: null,
        wizbucks: null
    },
    config: {
        dataPath: './data/',
        githubRaw: 'https://raw.githubusercontent.com/yourusername/fbp-hub/main/data/'
    },
    cache: {
        lastUpdate: null
    }
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
 * Setup navigation toggle for mobile
 */
function setupNavigation() {
    const navToggle = document.getElementById('navToggle');
    const navMenu = document.getElementById('navMenu');
    
    if (navToggle && navMenu) {
        navToggle.addEventListener('click', () => {
            navMenu.classList.toggle('active');
        });
        
        // Close menu when clicking a link
        const navLinks = navMenu.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                if (window.innerWidth < 768) {
                    navMenu.classList.remove('active');
                }
            });
        });
    }
    
    // Highlight active page
    highlightActivePage();
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
 * Load all data files
 */
async function loadAllData() {
    console.log('📥 Loading data...');
    
    try {
        // Load in parallel
        const [playersData, standingsData, wizbucksData] = await Promise.all([
            loadJSON('combined_players.json'),
            loadJSON('standings.json'),
            loadJSON('wizbucks.json')
        ]);
        
        FBPHub.data.players = playersData || [];
        FBPHub.data.standings = standingsData;
        FBPHub.data.wizbucks = wizbucksData;
        
        FBPHub.cache.lastUpdate = new Date();
        
        console.log(`✅ Loaded ${FBPHub.data.players.length} players`);
        console.log('✅ Loaded standings and WizBucks data');
        
    } catch (error) {
        console.error('❌ Error loading data:', error);
        showErrorMessage('Failed to load data. Please try refreshing the page.');
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
 * Get team color (for future customization)
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
 * Create team badge HTML
 */
function createTeamBadge(teamAbbr) {
    const color = getTeamColor(teamAbbr);
    return `<span class="team-badge" style="background-color: ${color}">${teamAbbr}</span>`;
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
    
    // Filter by manager
    if (criteria.manager) {
        filtered = filtered.filter(p => p.manager === criteria.manager);
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