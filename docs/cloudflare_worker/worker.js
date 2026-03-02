// NOTE: This file is a reference snapshot of the Cloudflare Worker code
// deployed at: https://fbp-auth.zpressley.workers.dev
//
// It is not executed from this repository; deploy via Cloudflare Workers.
// Keep env var names in sync with Cloudflare secrets.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cache-Control',
};

// Discord ID -> Team Abbreviation
// Keep in sync with fbp-hub/js/auth.js MANAGER_MAPPING
const MANAGER_MAPPING = {
  '347571660230230017': 'HAM',
  '689911142432112657': 'RV',
  '689952988957245578': 'B2J',
  '689887002887454815': 'CFL',
  '1085200118149562419': 'DMN',
  '890059214586773574': 'LFB',
  '814294382529347594': 'JEP',
  '161932197308137473': 'TBB',
  '161967242118955008': 'WIZ',
  '541092942455242754': 'DRO',
  '875750135005597728': 'SAD',
  '664280448788201522': 'WAR',
};

const TRADE_AUTH_CACHE = new Map();
const TRADE_AUTH_CACHE_TTL_MS = 5 * 60 * 1000;

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // --- Draft APIs ---
      if (path === '/api/draft/active' && request.method === 'GET') {
        const pathAndQuery = `/api/draft/active${url.search}`;
        return await proxyToBot(pathAndQuery, env);
      }

      if (path === '/api/draft/config' && request.method === 'GET') {
        return await proxyToBot('/api/draft/config', env);
      }

      // --- Draft Pool ---
      if (path === '/api/draft/prospect/pool' && request.method === 'GET') {
        const pathAndQuery = `/api/draft/prospect/pool${url.search}`;
        return await proxyToBot(pathAndQuery, env);
      }

      // --- Draft Boards ---
      if (path.match(/^\/api\/draft\/boards\/[A-Z]{2,4}$/i)) {
        if (request.method === 'GET') {
          return await proxyToBot(path, env);
        }
        if (request.method === 'POST') {
          return await proxyToBot(path, env, request);
        }
      }

      // --- Web-initiated Draft Pick Request ---
      if (path === '/api/draft/prospect/pick-request' && request.method === 'POST') {
        return await proxyToBot('/api/draft/prospect/pick-request', env, request);
      }

      // --- Prospect Draft Validate ---
      if (path === '/api/draft/prospect/validate' && request.method === 'POST') {
        return await proxyToBot('/api/draft/prospect/validate', env, request);
      }

      // --- Prospect Draft Validate Pick & Confirm ---
      if (path === '/api/draft/prospect/validate-pick' && request.method === 'POST') {
        return await proxyToBot('/api/draft/prospect/validate-pick', env, request);
      }

      if (path === '/api/draft/prospect/pick-confirm' && request.method === 'POST') {
        return await proxyToBot('/api/draft/prospect/pick-confirm', env, request);
      }

      // --- Prospect Draft State ---
      if (path === '/api/draft/prospect/state' && request.method === 'GET') {
        return await proxyToBot('/api/draft/prospect/state', env);
      }

      // --- Buy-In APIs (NEW) ---
      if (path === '/api/buyin/purchase' && request.method === 'POST') {
        return await proxyToBot('/api/buyin/purchase', env, request);
      }

      if (path === '/api/buyin/refund' && request.method === 'POST') {
        return await proxyToBot('/api/buyin/refund', env, request);
      }

      // --- PAD submission ---
      if (path === '/api/pad/submit' && request.method === 'POST') {
        return await proxyToBot('/api/pad/submit', env, request);
      }

      // --- KAP submission ---
      if (path === '/api/kap/submit' && request.method === 'POST') {
        return await proxyToBot('/api/kap/submit', env, request);
      }

      // --- Auction APIs ---
      if (path === '/api/auction/bid' && request.method === 'POST') {
        return await proxyToBot('/api/auction/bid', env, request);
      }

      if (path === '/api/auction/current' && request.method === 'GET') {
        return await proxyToBot('/api/auction/current', env);
      }

      // --- Manager Notes ---
      if (path === '/api/notes' && (request.method === 'GET' || request.method === 'POST')) {
        return await proxyToBotAsManager(`/api/notes${url.search}`, env, request);
      }

      // --- Manager Roster ---
      if (path === '/api/roster' && (request.method === 'GET' || request.method === 'POST')) {
        return await proxyToBotAsManager(`/api/roster${url.search}`, env, request);
      }

      // --- Manager Self-Service APIs ---
      if (path === '/api/manager/contract-purchase' && request.method === 'POST') {
        return await proxyToBot('/api/manager/contract-purchase', env, request);
      }

      // --- Settings APIs ---
      // These endpoints require Authorization so we can map the caller to a team
      // and inject X-Manager-Team for the bot.
      if (path.startsWith('/api/settings/') && (request.method === 'GET' || request.method === 'POST')) {
        const pathAndQuery = `${path}${url.search}`;
        return await proxyToBotAsManager(pathAndQuery, env, request);
      }

      // --- Trade APIs ---
      // These endpoints require Authorization so we can map the caller to a team
      // and inject X-Manager-Team for the bot.
      if (path.startsWith('/api/trade/') && (request.method === 'GET' || request.method === 'POST')) {
        const pathAndQuery = `${path}${url.search}`;
        return await proxyToBotAsManager(pathAndQuery, env, request);
      }

      // --- Admin APIs ---
      if (path === '/api/admin/wizbucks-balances' && request.method === 'GET') {
        return await proxyToBot('/api/admin/wizbucks-balances', env);
      }

      if (path === '/api/admin/player-log' && request.method === 'GET') {
        const pathAndQuery = `/api/admin/player-log${url.search}`;
        return await proxyToBot(pathAndQuery, env);
      }

      if (path === '/api/admin/update-player' && request.method === 'POST') {
        return await proxyToBot('/api/admin/update-player', env, request);
      }

      if (path === '/api/admin/wizbucks-adjustment' && request.method === 'POST') {
        return await proxyToBot('/api/admin/wizbucks-adjustment', env, request);
      }

      if (path === '/api/admin/delete-player' && request.method === 'POST') {
        return await proxyToBot('/api/admin/delete-player', env, request);
      }

      if (path === '/api/admin/merge-players' && request.method === 'POST') {
        return await proxyToBot('/api/admin/merge-players', env, request);
      }

      if (path === '/api/admin/pad-test-discord' && request.method === 'POST') {
        return await proxyToBot('/api/admin/pad-test-discord', env, request);
      }

      if (path.startsWith('/api/admin/pad-retro-discord/') && request.method === 'POST') {
        return await proxyToBot(path, env, request);
      }

      // --- Bulk Admin Operations ---
      if (path === '/api/admin/bulk-graduate' && request.method === 'POST') {
        return await proxyToBot('/api/admin/bulk-graduate', env, request);
      }

      if (path === '/api/admin/bulk-update-contracts' && request.method === 'POST') {
        return await proxyToBot('/api/admin/bulk-update-contracts', env, request);
      }

      if (path === '/api/admin/bulk-release' && request.method === 'POST') {
        return await proxyToBot('/api/admin/bulk-release', env, request);
      }

      // --- Add Player + Enrich ---
      if (path === '/api/admin/add-player' && request.method === 'POST') {
        return await proxyToBot('/api/admin/add-player', env, request);
      }

      if (path === '/api/admin/enrich-player' && request.method === 'POST') {
        return await proxyToBot('/api/admin/enrich-player', env, request);
      }

      // --- Auth endpoints ---
      if (path === '/token' && request.method === 'POST') {
        return await handleTokenExchange(request, env);
      }

      if (path === '/user' && request.method === 'GET') {
        return await handleUserInfo(request);
      }

      if (path === '/' || path === '/health') {
        return new Response(
          JSON.stringify({
            status: 'ok',
            service: 'FBP Hub Auth',
          }),
          {
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders,
            },
          },
        );
      }

      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    } catch (error) {
      console.error('Error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
  },

  // Cron Handler - Keep Render App Alive
  // Set cron trigger in Cloudflare Dashboard: */5 * * * * (every 5 minutes)
  async scheduled(event, env, ctx) {
    try {
      const botUrl = env.BOT_API_URL;
      if (!botUrl) {
        console.log('⚠️ BOT_API_URL not configured, skipping health check');
        return;
      }

      const response = await fetch(`${botUrl}/health`, {
        method: 'GET',
        headers: {
          'User-Agent': 'Cloudflare-Cron-KeepAlive',
        },
      });

      if (response.ok) {
        console.log(`✅ Health check successful (${response.status})`);
      } else {
        console.log(`⚠️ Health check returned ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Health check failed:', error.message);
    }
  },
};

// --- Proxy to bot API with X-API-Key (handles both GET and POST) ---

async function proxyToBot(pathAndQuery, env, originalRequest = null) {
  const botBase = env.BOT_API_URL;
  const apiKey = env.BOT_API_KEY;

  if (!botBase || !apiKey) {
    return jsonResponse({ error: 'BOT_API_URL or BOT_API_KEY not configured' }, 500);
  }

  const targetUrl = new URL(pathAndQuery, botBase);

  let method = 'GET';
  let body = null;

  if (originalRequest) {
    method = originalRequest.method;
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      body = await originalRequest.text();
    }
  }

  const resp = await fetch(targetUrl.toString(), {
    method: method,
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: body,
  });

  const responseBody = await resp.text();

  return new Response(responseBody, {
    status: resp.status,
    headers: {
      'Content-Type': resp.headers.get('Content-Type') || 'application/json',
      ...corsHeaders,
    },
  });
}

async function proxyToBotAsManager(pathAndQuery, env, originalRequest) {
  const botBase = env.BOT_API_URL;
  const apiKey = env.BOT_API_KEY;

  if (!botBase || !apiKey) {
    return jsonResponse({ error: 'BOT_API_URL or BOT_API_KEY not configured' }, 500);
  }

  const authHeader = originalRequest.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Missing Authorization' }, 401);
  }

  const token = authHeader.substring(7);
  const teamAbbr = await getManagerTeamForToken(token);
  if (!teamAbbr) {
    return jsonResponse({ error: 'Not an FBP manager' }, 403);
  }

  const targetUrl = new URL(pathAndQuery, botBase);

  let method = originalRequest.method;
  let body = null;

  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    body = await originalRequest.text();
  }

  const resp = await fetch(targetUrl.toString(), {
    method,
    headers: {
      'X-API-Key': apiKey,
      'X-Manager-Team': teamAbbr,
      'Content-Type': 'application/json',
    },
    body,
  });

  const responseBody = await resp.text();

  return new Response(responseBody, {
    status: resp.status,
    headers: {
      'Content-Type': resp.headers.get('Content-Type') || 'application/json',
      ...corsHeaders,
    },
  });
}

async function getManagerTeamForToken(token) {
  // Dev mode support: tokens created by DevAuth on localhost
  // Format: dev_token_<TEAM>_<timestamp>
  if (token && token.startsWith('dev_token_')) {
    const parts = token.split('_');
    const maybeTeam = (parts[2] || '').toUpperCase();
    if (/^[A-Z]{2,4}$/.test(maybeTeam)) {
      return maybeTeam;
    }
  }

  const cached = TRADE_AUTH_CACHE.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.team;
  }

  const userResp = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!userResp.ok) {
    return null;
  }

  const userData = await userResp.json();
  const discordId = userData?.id;
  if (!discordId) {
    return null;
  }

  const team = MANAGER_MAPPING[discordId] || null;
  if (!team) {
    return null;
  }

  TRADE_AUTH_CACHE.set(token, {
    team,
    expiresAt: Date.now() + TRADE_AUTH_CACHE_TTL_MS,
  });

  return team;
}

// --- Auth handlers ---

async function handleTokenExchange(request, env) {
  try {
    const body = await request.json();
    const { code, redirect_uri } = body;

    if (!code) {
      return jsonResponse({ error: 'Missing code' }, 400);
    }

    const clientId = env.DISCORD_CLIENT_ID_ENV;
    const clientSecret = env.DISCORD_CLIENT_SECRET_ENV;
    const redirectUri = redirect_uri || env.REDIRECT_URI_ENV || env.REDIRECT_URL_ENV;

    if (!clientId || !clientSecret || !redirectUri) {
      return jsonResponse({ error: 'Missing environment variables' }, 500);
    }

    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Discord error:', errorText);
      return jsonResponse({ error: 'Discord exchange failed' }, 400);
    }

    const tokenData = await tokenResponse.json();

    return jsonResponse({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in,
      token_type: tokenData.token_type,
    });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
}

async function handleUserInfo(request) {
  try {
    const authHeader = request.headers.get('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Missing auth' }, 401);
    }

    const token = authHeader.substring(7);

    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!userResponse.ok) {
      return jsonResponse({ error: 'Failed to get user' }, 401);
    }

    const userData = await userResponse.json();

    return jsonResponse({
      id: userData.id,
      username: userData.username,
      discriminator: userData.discriminator,
      avatar: userData.avatar,
    });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}
