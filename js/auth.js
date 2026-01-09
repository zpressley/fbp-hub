/**
 * FBP Hub - Authentication System
 * Handles Discord OAuth, session management, and team identification
 */

// Configuration - UPDATE THESE WITH YOUR VALUES
const AUTH_CONFIG = {
    // Your Discord OAuth application credentials
    clientId: '1452125015876173975', // Get from Discord Developer Portal
    
    // Your Cloudflare Worker URL (we'll set this up next)
    workerUrl: 'https://fbp-auth.zpressley.workers.dev',
    
    // Redirect URI (should match Discord app settings)
    redirectUri: 'https://zpressley.github.io/fbp-hub/callback.html',
    
    // Discord OAuth scopes
    scopes: ['identify', 'guilds'],
    
    // Session duration (7 days)
    sessionDuration: 7 * 24 * 60 * 60 * 1000
};

// Manager mapping (Discord ID -> Team Abbreviation)
const MANAGER_MAPPING = {
    '347571660230230017': 'HAM',
    '689911142432112657': 'RV',
    '689952988957245578': 'B2J',
    '689887002887454815': 'CFL',
    '892152416718422056': 'LAW',
    '890059214586773574': 'LFB',
    '814294382529347594': 'JEP',
    '161932197308137473': 'TBB',
    '161967242118955008': 'WIZ',
    '541092942455242754': 'DRO',
    '875750135005597728': 'SAD',
    '664280448788201522': 'WAR'
};

// Team full names
const TEAM_NAMES = {
    'HAM': 'Hammers',
    'RV': 'Rick Vaughn',
    'B2J': 'Btwn2Jackies',
    'CFL': 'Country Fried Lamb',
    'LAW': 'Law-Abiding Citizens',
    'LFB': 'La Flama Blanca',
    'JEP': 'Jepordizers!',
    'TBB': 'The Bluke Blokes',
    'WIZ': 'Whiz Kids',
    'DRO': 'Andromedans',
    'SAD': 'not much of a donkey',
    'WAR': 'Weekend Warriors'
};

// Commissioner Discord IDs
const COMMISSIONER_IDS = [
    '161967242118955008'  // Add commissioner Discord IDs here
];

/**
 * Authentication state management
 */
class AuthManager {
    constructor() {
        this.session = this.loadSession();
    }
    
    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
        if (!this.session) return false;
        
        // Check if session is expired
        if (Date.now() > this.session.expiresAt) {
            this.logout();
            return false;
        }
        
        return true;
    }
    
    /**
     * Get current session
     */
    getSession() {
        return this.session;
    }
    
    /**
     * Get current user info
     */
    getUser() {
        return this.session?.user || null;
    }
    
    /**
     * Get user's team
     */
    getTeam() {
        if (!this.session?.user) return null;
        
        const discordId = this.session.user.id;
        const teamAbbr = MANAGER_MAPPING[discordId];
        
        if (!teamAbbr) return null;
        
        return {
            abbreviation: teamAbbr,
            name: TEAM_NAMES[teamAbbr] || teamAbbr
        };
    }
    
    /**
     * Check if user is commissioner
     */
    isCommissioner() {
        if (!this.session?.user) return false;
        return COMMISSIONER_IDS.includes(this.session.user.id);
    }
    
    /**
     * Initiate Discord OAuth flow
     */
    login() {
        const state = this.generateState();
        localStorage.setItem('oauth_state', state);
        
        const params = new URLSearchParams({
            client_id: AUTH_CONFIG.clientId,
            redirect_uri: AUTH_CONFIG.redirectUri,
            response_type: 'code',
            scope: AUTH_CONFIG.scopes.join(' '),
            state: state
        });
        
        window.location.href = `https://discord.com/api/oauth2/authorize?${params}`;
    }
    
    /**
     * Handle OAuth callback
     */
    async handleCallback(code, state) {
        // Verify state
        const savedState = localStorage.getItem('oauth_state');
        if (state !== savedState) {
            throw new Error('Invalid state parameter');
        }
        
        // Exchange code for token via Cloudflare Worker
        const response = await fetch(`${AUTH_CONFIG.workerUrl}/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                code: code,
                redirect_uri: AUTH_CONFIG.redirectUri
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to exchange code for token');
        }
        
        const data = await response.json();
        
        // Get user info
        const userResponse = await fetch(`${AUTH_CONFIG.workerUrl}/user`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${data.access_token}`
            }
        });
        
        if (!userResponse.ok) {
            throw new Error('Failed to fetch user info');
        }
        
        const user = await userResponse.json();
        
        // Create session
        const session = {
            user: {
                id: user.id,
                username: user.username,
                discriminator: user.discriminator,
                avatar: user.avatar
            },
            token: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: Date.now() + AUTH_CONFIG.sessionDuration
        };
        
        this.saveSession(session);
        this.session = session;
        
        return session;
    }
    
    /**
     * Logout
     */
    logout() {
        localStorage.removeItem('fbp_session');
        localStorage.removeItem('oauth_state');
        this.session = null;
        window.location.href = 'login.html';
    }
    
    /**
     * Save session to localStorage
     */
    saveSession(session) {
        localStorage.setItem('fbp_session', JSON.stringify(session));
    }
    
    /**
     * Load session from localStorage
     */
    loadSession() {
        const sessionData = localStorage.getItem('fbp_session');
        if (!sessionData) return null;
        
        try {
            return JSON.parse(sessionData);
        } catch (e) {
            console.error('Failed to parse session:', e);
            return null;
        }
    }
    
    /**
     * Generate random state for OAuth
     */
    generateState() {
        const array = new Uint8Array(16);
        crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }
    
    /**
     * Get avatar URL
     */
    getAvatarUrl(size = 128) {
        const user = this.getUser();
        if (!user) return null;
        
        if (user.avatar) {
            return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=${size}`;
        }
        
        // Default Discord avatar
        const defaultAvatar = parseInt(user.discriminator) % 5;
        return `https://cdn.discordapp.com/embed/avatars/${defaultAvatar}.png`;
    }
}

/**
 * Auth UI helper functions
 */
const AuthUI = {
    /**
     * Show authenticated user info
     */
    showUserInfo(user, team) {
        const username = user.discriminator === '0' 
            ? user.username 
            : `${user.username}#${user.discriminator}`;
        
        return `
            <div class="user-info">
                <img src="${authManager.getAvatarUrl(64)}" alt="${user.username}" class="user-avatar">
                <div class="user-details">
                    <div class="user-name">${username}</div>
                    ${team ? `<div class="user-team">${team.abbreviation} - ${team.name}</div>` : ''}
                </div>
            </div>
        `;
    },
    
    /**
     * Show loading state
     */
    showLoading(message = 'Loading...') {
        return `
            <div class="loading-state">
                <div class="spinner"></div>
                <p>${message}</p>
            </div>
        `;
    },
    
    /**
     * Show error message
     */
    showError(message) {
        return `
            <div class="error-message">
                <i class="fas fa-exclamation-triangle"></i>
                <p>${message}</p>
            </div>
        `;
    },
    
    /**
     * Require authentication for page
     */
    requireAuth(redirectToLogin = true) {
        if (!authManager.isAuthenticated()) {
            if (redirectToLogin) {
                window.location.href = 'login.html';
            }
            return false;
        }
        return true;
    },
    
    /**
     * Require commissioner role
     */
    requireCommissioner() {
        if (!authManager.isAuthenticated()) {
            window.location.href = 'login.html';
            return false;
        }
        
        if (!authManager.isCommissioner()) {
            alert('This page is only accessible to commissioners.');
            window.location.href = 'dashboard.html';
            return false;
        }
        
        return true;
    }
};

// Create global auth manager instance
const authManager = new AuthManager();

// Add logout functionality to navigation
// Enhance the existing user menu on pages that have one,
// or create it if missing.
document.addEventListener('DOMContentLoaded', () => {
    if (authManager.isAuthenticated()) {
        addUserMenu();
    }
});

/**
 * Add or upgrade user menu in navigation
 */
function addUserMenu() {
    const nav = document.querySelector('.mobile-nav');
    if (!nav) return;

    const user = authManager.getUser();
    const team = authManager.getTeam();

    const navContainer = nav.querySelector('.nav-container');
    if (!navContainer) return;
        
        // Reuse existing user-menu container if present to avoid duplicates
        let userMenu = nav.querySelector('.user-menu');
    if (!userMenu) {
        userMenu = document.createElement('div');
        userMenu.className = 'user-menu';
        navContainer.appendChild(userMenu);
    }

        userMenu.innerHTML = `
        <button class="user-menu-toggle" id="userMenuToggle">
            <img src="${authManager.getAvatarUrl(32)}" alt="${user.username}" class="user-avatar-small">
            <span class="user-team-abbr">${team?.abbreviation || user.username}</span>
            <i class="fas fa-chevron-down"></i>
        </button>
        <div class="user-menu-dropdown" id="userMenuDropdown">
            <a href="dashboard.html">
                <i class="fas fa-tachometer-alt"></i>
                Dashboard
            </a>
            <a href="pad.html">
                <i class="fas fa-receipt"></i>
                PAD
            </a>
            ${authManager.isCommissioner() ? `
                <a href="admin.html">
                    <i class="fas fa-shield-alt"></i>
                    Admin
                </a>
            ` : ''}
            <a href="#" id="userMenuLogout">
                <i class="fas fa-sign-out-alt"></i>
                Logout
            </a>
        </div>
    `;

    const toggle = userMenu.querySelector('#userMenuToggle');
    const dropdown = userMenu.querySelector('#userMenuDropdown');
    const logoutLink = userMenu.querySelector('#userMenuLogout');

    if (!toggle || !dropdown) return;

    if (logoutLink) {
        logoutLink.addEventListener('click', (e) => {
            e.preventDefault();
            authManager.logout();
        });
    }

    // Toggle dropdown
    toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('active');
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
        if (!userMenu.contains(e.target)) {
            dropdown.classList.remove('active');
        }
    });
}

// Export for global use
window.authManager = authManager;
window.AuthUI = AuthUI;
