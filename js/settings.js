/**
 * FBP Hub - Settings Page
 * Team color customization
 */

const DEFAULT_COLORS = {
    primary: '#EF3E42',
    secondary: '#FFB612',
    accent1: '#1E88C7',
    accent2: '#4CAF50',
    accent3: '#9C27B0'
};

const PRESETS = {
    default: {
        primary: '#EF3E42',
        secondary: '#FFB612',
        accent1: '#1E88C7',
        accent2: '#4CAF50',
        accent3: '#9C27B0'
    },
    rangers: {
        primary: '#003278',
        secondary: '#C0111F',
        accent1: '#FFFFFF',
        accent2: '',
        accent3: ''
    },
    dodgers: {
        primary: '#005A9C',
        secondary: '#EF3E42',
        accent1: '#FFFFFF',
        accent2: '',
        accent3: ''
    },
    yankees: {
        primary: '#0C2340',
        secondary: '#C4CED4',
        accent1: '#FFFFFF',
        accent2: '',
        accent3: ''
    },
    braves: {
        primary: '#CE1141',
        secondary: '#13274F',
        accent1: '#EAAA00',
        accent2: '',
        accent3: ''
    }
};

let currentTeam = null;

/**
 * Initialize settings page
 */
function initSettings() {
    console.log('⚙️ Initializing settings page...');
    
    // Check authentication
    if (typeof authManager === 'undefined' || !authManager.isAuthenticated()) {
        document.getElementById('authRequired').style.display = 'flex';
        return;
    }
    
    currentTeam = authManager.getTeam();
    
    if (!currentTeam) {
        document.getElementById('authRequired').style.display = 'flex';
        return;
    }
    
    document.getElementById('settingsContent').style.display = 'block';
    
    // Load current team colors
    loadTeamColors();
    
    // Setup color input synchronization
    setupColorInputs();
    
    // Update preview
    updatePreview();
}

/**
 * Load team colors from storage
 */
function loadTeamColors() {
    const savedColors = getTeamColors(currentTeam.abbreviation);
    
    if (savedColors) {
        setColorInputs(savedColors);
    } else {
        setColorInputs(DEFAULT_COLORS);
    }
    
    // Update preview team name
    document.getElementById('previewTeamName').textContent = currentTeam.abbreviation;
    document.getElementById('previewTeamFull').textContent = currentTeam.name;
}

/**
 * Get team colors from localStorage
 */
function getTeamColors(teamAbbr) {
    try {
        const allColors = JSON.parse(localStorage.getItem('team_colors') || '{}');
        return allColors[teamAbbr] || null;
    } catch (e) {
        return null;
    }
}

/**
 * Save team colors to localStorage
 */
function saveTeamColorsToStorage(teamAbbr, colors) {
    const allColors = JSON.parse(localStorage.getItem('team_colors') || '{}');
    allColors[teamAbbr] = colors;
    localStorage.setItem('team_colors', JSON.stringify(allColors));
}

/**
 * Setup color input synchronization
 */
function setupColorInputs() {
    const colorFields = ['primary', 'secondary', 'accent1', 'accent2', 'accent3'];
    
    colorFields.forEach(field => {
        const picker = document.getElementById(`${field}Color`);
        const hexInput = document.getElementById(`${field}ColorHex`);
        
        // Sync picker to hex input
        picker.addEventListener('input', (e) => {
            hexInput.value = e.target.value.toUpperCase();
            updatePreview();
        });
        
        // Sync hex input to picker
        hexInput.addEventListener('input', (e) => {
            const value = e.target.value;
            if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
                picker.value = value;
                updatePreview();
            }
        });
        
        hexInput.addEventListener('blur', (e) => {
            const value = e.target.value;
            if (!/^#[0-9A-Fa-f]{6}$/.test(value) && value !== '') {
                // Invalid color, reset to picker value
                e.target.value = picker.value.toUpperCase();
            }
        });
    });
}

/**
 * Set color inputs
 */
function setColorInputs(colors) {
    const fields = {
        primary: colors.primary || DEFAULT_COLORS.primary,
        secondary: colors.secondary || DEFAULT_COLORS.secondary,
        accent1: colors.accent1 || '',
        accent2: colors.accent2 || '',
        accent3: colors.accent3 || ''
    };
    
    Object.entries(fields).forEach(([field, color]) => {
        const picker = document.getElementById(`${field}Color`);
        const hexInput = document.getElementById(`${field}ColorHex`);
        
        if (color) {
            picker.value = color;
            hexInput.value = color.toUpperCase();
        } else {
            picker.value = '#000000';
            hexInput.value = '';
        }
    });
    
    updatePreview();
}

/**
 * Update preview with current colors
 */
function updatePreview() {
    const colors = {
        primary: document.getElementById('primaryColor').value,
        secondary: document.getElementById('secondaryColor').value,
        accent1: document.getElementById('accent1ColorHex').value || null,
        accent2: document.getElementById('accent2ColorHex').value || null,
        accent3: document.getElementById('accent3ColorHex').value || null
    };
    
    // Update preview banner
    const banner = document.getElementById('previewBanner');
    banner.style.background = `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%)`;
    banner.style.borderColor = colors.primary;
    
    // Update preview badges
    const badge1 = document.getElementById('previewBadge1');
    badge1.style.backgroundColor = colors.primary;
    badge1.style.color = 'white';
    
    const badge2 = document.getElementById('previewBadge2');
    badge2.style.backgroundColor = colors.secondary;
    badge2.style.color = getContrastColor(colors.secondary);
    
    // Update accent previews
    const accent1 = document.getElementById('previewAccent1');
    if (colors.accent1) {
        accent1.style.borderColor = colors.accent1;
        accent1.style.color = colors.accent1;
        accent1.style.opacity = '1';
    } else {
        accent1.style.opacity = '0.3';
        accent1.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        accent1.style.color = var(--text-gray);
    }
    
    const accent2 = document.getElementById('previewAccent2');
    if (colors.accent2) {
        accent2.style.borderColor = colors.accent2;
        accent2.style.color = colors.accent2;
        accent2.style.opacity = '1';
    } else {
        accent2.style.opacity = '0.3';
        accent2.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        accent2.style.color = var(--text-gray);
    }
    
    const accent3 = document.getElementById('previewAccent3');
    if (colors.accent3) {
        accent3.style.borderColor = colors.accent3;
        accent3.style.color = colors.accent3;
        accent3.style.opacity = '1';
    } else {
        accent3.style.opacity = '0.3';
        accent3.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        accent3.style.color = var(--text-gray);
    }
}

/**
 * Get contrasting text color for background
 */
function getContrastColor(hexColor) {
    const r = parseInt(hexColor.substr(1, 2), 16);
    const g = parseInt(hexColor.substr(3, 2), 16);
    const b = parseInt(hexColor.substr(5, 2), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 155 ? '#000000' : '#FFFFFF';
}

/**
 * Apply preset colors
 */
function applyPreset(presetName) {
    const preset = PRESETS[presetName];
    if (!preset) return;
    
    setColorInputs(preset);
    showToast(`Applied ${presetName} preset`, 'success');
}

/**
 * Reset single color to default
 */
function resetColor(field) {
    const defaultColor = DEFAULT_COLORS[field];
    document.getElementById(`${field}Color`).value = defaultColor;
    document.getElementById(`${field}ColorHex`).value = defaultColor.toUpperCase();
    updatePreview();
}

/**
 * Clear optional color
 */
function clearColor(field) {
    document.getElementById(`${field}Color`).value = '#000000';
    document.getElementById(`${field}ColorHex`).value = '';
    updatePreview();
}

/**
 * Reset all colors to defaults
 */
function resetToDefaults() {
    if (confirm('Reset all colors to FBP defaults?')) {
        setColorInputs(DEFAULT_COLORS);
        showToast('Reset to default colors', 'success');
    }
}

/**
 * Save team colors
 */
function saveTeamColors() {
    const colors = {
        primary: document.getElementById('primaryColor').value,
        secondary: document.getElementById('secondaryColor').value,
        accent1: document.getElementById('accent1ColorHex').value || null,
        accent2: document.getElementById('accent2ColorHex').value || null,
        accent3: document.getElementById('accent3ColorHex').value || null
    };
    
    // Validate required colors
    if (!colors.primary || !colors.secondary) {
        showToast('Primary and Secondary colors are required', 'error');
        return;
    }
    
    // Save to localStorage
    saveTeamColorsToStorage(currentTeam.abbreviation, colors);
    
    // In production: POST to /api/settings/team-colors
    console.log('💾 Saving team colors:', colors);
    
    // Apply colors globally
    applyTeamColorsGlobally(colors);
    
    showToast('Team colors saved successfully!', 'success');
    
    // Optional: redirect to dashboard to see changes
    setTimeout(() => {
        window.location.href = 'dashboard.html';
    }, 1500);
}

/**
 * Apply team colors globally using CSS variables
 */
function applyTeamColorsGlobally(colors) {
    const root = document.documentElement;
    
    root.style.setProperty('--team-primary', colors.primary);
    root.style.setProperty('--team-secondary', colors.secondary);
    
    if (colors.accent1) root.style.setProperty('--team-accent-1', colors.accent1);
    if (colors.accent2) root.style.setProperty('--team-accent-2', colors.accent2);
    if (colors.accent3) root.style.setProperty('--team-accent-3', colors.accent3);
}

/**
 * Toast notification
 */
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.style.cssText = `
        position: fixed;
        bottom: 100px;
        right: 20px;
        background-color: var(--bg-charcoal);
        border: 3px solid ${type === 'success' ? '#4CAF50' : '#EF3E42'};
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
        z-index: 10000;
        font-family: var(--font-body);
        font-weight: 600;
    `;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(400px)';
        toast.style.transition = 'all 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Expose functions globally
window.initSettings = initSettings;
window.applyPreset = applyPreset;
window.resetColor = resetColor;
window.clearColor = clearColor;
window.resetToDefaults = resetToDefaults;
window.saveTeamColors = saveTeamColors;
