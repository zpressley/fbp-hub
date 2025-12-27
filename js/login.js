/**
 * FBP Hub - Login Page JavaScript
 * Handles login button and redirects authenticated users
 */

document.addEventListener('DOMContentLoaded', () => {
    // Check if already authenticated
    if (authManager.isAuthenticated()) {
        // Show success message and redirect
        const status = document.getElementById('authStatus');
        const form = document.getElementById('loginForm');
        
        if (status && form) {
            status.className = 'auth-status success';
            status.innerHTML = `
                <i class="fas fa-check-circle"></i>
                <p>You're already signed in! Redirecting...</p>
            `;
            form.style.display = 'none';
            
            // Redirect to dashboard (relative URL for GitHub Pages project site)
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1500);
        }
        return;
    }
    
    // Setup Discord login button
    const discordLoginBtn = document.getElementById('discordLoginBtn');
    if (discordLoginBtn) {
        discordLoginBtn.addEventListener('click', () => {
            authManager.login();
        });
    }
});
