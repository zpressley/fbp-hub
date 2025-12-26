/**
 * FBP Hub - Cloudflare Worker for Discord OAuth
 * Free tier: 100,000 requests/day
 * 
 * Deploy this to Cloudflare Workers
 * Follow instructions in CLOUDFLARE_SETUP.md
 */

// Discord OAuth Configuration
// These should be set as environment variables in Cloudflare Workers
const DISCORD_CLIENT_ID = DISCORD_CLIENT_ID_ENV;
const DISCORD_CLIENT_SECRET = DISCORD_CLIENT_SECRET_ENV;
const DISCORD_REDIRECT_URI = REDIRECT_URI_ENV;

// CORS headers
const corsHeaders = {
    'Access-Control-Allow-Origin': '*', // In production, replace * with your GitHub Pages URL
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * Main request handler
 */
addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }
    
    const url = new URL(request.url);
    const path = url.pathname;
    
    try {
        // Route requests
        if (path === '/token' && request.method === 'POST') {
            return await handleTokenExchange(request);
        }
        
        if (path === '/user' && request.method === 'GET') {
            return await handleUserInfo(request);
        }
        
        if (path === '/refresh' && request.method === 'POST') {
            return await handleTokenRefresh(request);
        }
        
        // Health check
        if (path === '/' || path === '/health') {
            return jsonResponse({ status: 'ok', service: 'FBP Hub Auth' });
        }
        
        return jsonResponse({ error: 'Not found' }, 404);
        
    } catch (error) {
        console.error('Error:', error);
        return jsonResponse({ error: error.message }, 500);
    }
}

/**
 * Exchange authorization code for access token
 */
async function handleTokenExchange(request) {
    const body = await request.json();
    const { code, redirect_uri } = body;
    
    if (!code) {
        return jsonResponse({ error: 'Missing code parameter' }, 400);
    }
    
    // Exchange code for token with Discord
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            client_id: DISCORD_CLIENT_ID,
            client_secret: DISCORD_CLIENT_SECRET,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: redirect_uri || DISCORD_REDIRECT_URI,
        }),
    });
    
    if (!tokenResponse.ok) {
        const error = await tokenResponse.text();
        console.error('Discord token error:', error);
        return jsonResponse({ error: 'Failed to exchange code' }, 400);
    }
    
    const tokenData = await tokenResponse.json();
    
    return jsonResponse({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in: tokenData.expires_in,
        token_type: tokenData.token_type,
    });
}

/**
 * Get user information from Discord
 */
async function handleUserInfo(request) {
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return jsonResponse({ error: 'Missing or invalid authorization header' }, 401);
    }
    
    const token = authHeader.substring(7);
    
    // Fetch user info from Discord
    const userResponse = await fetch('https://discord.com/api/users/@me', {
        headers: {
            'Authorization': `Bearer ${token}`,
        },
    });
    
    if (!userResponse.ok) {
        return jsonResponse({ error: 'Failed to fetch user info' }, 401);
    }
    
    const userData = await userResponse.json();
    
    return jsonResponse({
        id: userData.id,
        username: userData.username,
        discriminator: userData.discriminator,
        avatar: userData.avatar,
        email: userData.email, // Only if email scope granted
    });
}

/**
 * Refresh access token
 */
async function handleTokenRefresh(request) {
    const body = await request.json();
    const { refresh_token } = body;
    
    if (!refresh_token) {
        return jsonResponse({ error: 'Missing refresh_token parameter' }, 400);
    }
    
    // Refresh token with Discord
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            client_id: DISCORD_CLIENT_ID,
            client_secret: DISCORD_CLIENT_SECRET,
            grant_type: 'refresh_token',
            refresh_token: refresh_token,
        }),
    });
    
    if (!tokenResponse.ok) {
        return jsonResponse({ error: 'Failed to refresh token' }, 400);
    }
    
    const tokenData = await tokenResponse.json();
    
    return jsonResponse({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in: tokenData.expires_in,
        token_type: tokenData.token_type,
    });
}

/**
 * Helper function to create JSON response with CORS
 */
function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status: status,
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
        },
    });
}
