/**
 * FBP Hub - OAuth Callback Handler
 * Processes Discord OAuth callback and creates session
 */

document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');
    
    const processingDiv = document.getElementById('authProcessing');
    const errorDiv = document.getElementById('authError');
    const errorMessage = document.getElementById('errorMessage');
    
    // Check for OAuth errors
    if (error) {
        showError(`Discord authentication error: ${error}`);
        return;
    }
    
    // Check for required parameters
    if (!code || !state) {
        showError('Missing authentication parameters. Please try again.');
        return;
    }
    
    try {
        // Exchange code for session
        await authManager.handleCallback(code, state);
        
        // Get user's team
        const team = authManager.getTeam();
        
        // Show success and redirect
        if (processingDiv) {
            processingDiv.innerHTML = `
                <div class="spinner-large"></div>
                <h3>Success!</h3>
                <p>Welcome${team ? ` ${team.name}` : ''}! Redirecting to your dashboard...</p>
            `;
        }
        
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 2000);
        
    } catch (err) {
        console.error('Authentication error:', err);
        showError(err.message || 'An unexpected error occurred during authentication.');
    }
    
    function showError(message) {
        if (processingDiv) processingDiv.style.display = 'none';
        if (errorDiv) {
            errorDiv.style.display = 'block';
            if (errorMessage) errorMessage.textContent = message;
        }
    }
});
