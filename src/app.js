// Nexus Discord Tool - Frontend JavaScript v3.4 (English)
// SECURITY: Protected key validation system

let statusInterval = null;
let logsInterval = null;
let botData = null;
let currentUser = null;
let oauthCheckInterval = null;

// SECURITY: Obfuscated key validation state
const _sec = { _v: false, _t: 0 };
Object.defineProperty(window, 'keyValidated', {
    get: function() { return _sec._v; },
    set: function(val) { 
        // Only allow setting from trusted context
        if (val === true && !_sec._pendingValidation) {
            console.warn('SECURITY: Unauthorized key validation attempt blocked');
            return;
        }
        _sec._v = val;
    },
    configurable: false
});

// Helper to set key validation securely
function _setKeyValid(val, timestamp) {
    _sec._pendingValidation = true;
    _sec._v = val;
    _sec._t = timestamp || Date.now();
    _sec._pendingValidation = false;
}

// OAuth2 Configuration - Fixed server URL
const DISCORD_CLIENT_ID = '1423405574283858081';
const OAUTH_SERVER_URL = 'http://51.38.117.108:9005';
const OAUTH_REDIRECT_URI = 'http://51.38.117.108:9005/callback';
const NEXUS_SERVER_INVITE = 'https://discord.gg/htkJRM9jFw';
const NEXUS_GUILD_ID = '1190558638067163226';

// Tauri invoke
async function invoke(cmd, args = {}) {
    for (let i = 0; i < 10; i++) {
        if (window.__TAURI__?.core?.invoke) {
            return await window.__TAURI__.core.invoke(cmd, args);
        }
        await new Promise(r => setTimeout(r, 100));
    }
    throw new Error('Tauri API not available');
}

// Fetch with timeout and cache busting
async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
    // Add cache-busting parameter
    const urlWithCache = url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now();
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        
        const response = await fetch(urlWithCache, {
            ...options,
            signal: controller.signal,
            cache: 'no-store',
            headers: {
                'Accept': 'application/json',
                ...options.headers
            }
        });
        clearTimeout(timeoutId);
        console.log(`[API] ${url} -> ${response.status}`);
        return response;
    } catch (e) {
        console.log(`[API] ${url} -> Error: ${e.message}`);
        throw e;
    }
}

// DOM Ready
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Nexus Discord Tool v3.1');
    
    // Check for OAuth callback
    checkOAuthCallback();
    
    // Check login state
    const savedUser = localStorage.getItem('discord_user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        
        // Check if user has a valid key
        const hasKey = await checkToolKey(currentUser.id);
        if (hasKey) {
            showApp();
        } else {
            showKeyRequiredScreen();
        }
    } else {
        showLoginScreen();
    }
});

// ==================== KEY SYSTEM ====================
// Security: Key validation MUST be done server-side
const KEY_VALIDATION_TIMEOUT = 300000; // 5 minutes

async function checkToolKey(discordId) {
    // SECURITY: Always validate with server - NO LOCAL FALLBACK
    try {
        const response = await fetch(`${OAUTH_SERVER_URL}/tool/check-key?discordId=${discordId}&_t=${Date.now()}`);
        
        if (!response.ok) {
            console.error('Key server returned error:', response.status);
            _setKeyValid(false);
            return false;
        }
        
        const data = await response.json();
        
        if (data.success && data.hasKey && data.key) {
            // Store key data with server-provided signature
            const keyData = {
                key: data.key,
                discordId: discordId,
                validatedAt: Date.now(),
                serverSignature: data.signature || data.key.activatedAt
            };
            localStorage.setItem('tool_key_data', JSON.stringify(keyData));
            _setKeyValid(true, Date.now());
            return true;
        }
        
        // No valid key
        localStorage.removeItem('tool_key_data');
        _setKeyValid(false);
        return false;
    } catch (e) {
        console.error('Key check failed - server unreachable:', e);
        // SECURITY: If server is down, user cannot use the tool
        // No local fallback to prevent bypassing
        _setKeyValid(false);
        return false;
    }
}

// Periodic key re-validation
async function revalidateKey() {
    if (!currentUser) return false;
    
    // Re-check key every 5 minutes
    if (Date.now() - _sec._t > KEY_VALIDATION_TIMEOUT) {
        const valid = await checkToolKey(currentUser.id);
        if (!valid) {
            // Key no longer valid - force back to key screen
            showKeyRequiredScreen();
            showToast('License expired or revoked. Please re-activate.', 'error');
            return false;
        }
    }
    return _sec._v;
}

// Key activation is now handled via browser - see openKeyPurchasePage()

// SECURITY: Key purchase/activation is handled via browser
// This screen just shows a message to redirect to login
function showKeyRequiredScreen() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-container').style.display = 'none';
    
    // Create simple key required overlay
    let keyScreen = document.getElementById('key-required-screen');
    if (!keyScreen) {
        keyScreen = document.createElement('div');
        keyScreen.id = 'key-required-screen';
        keyScreen.className = 'key-required-screen';
        keyScreen.innerHTML = `
            <div class="key-container-simple">
                <div class="key-icon-large">🔑</div>
                <h1 class="key-title-simple">License Required</h1>
                <p class="key-text">A valid license key is required to use Nexus Discord Tool.</p>
                
                <div class="key-input-section">
                    <label class="key-input-label">License Key</label>
                    <input type="text" id="tool-key-input" class="key-input-field" placeholder="NEXUS-XXXX-XXXX-XXXX" maxlength="19">
                    <button class="btn-key-activate" onclick="activateKeyFromTool()">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
                        Activate Key
                    </button>
                </div>
                
                <div class="key-divider">
                    <span>or</span>
                </div>
                
                <button class="btn-key-login" onclick="openKeyPurchasePage()">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M19 14V6c0-1.1-.9-2-2-2H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zm-9-1c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm13-6v11c0 1.1-.9 2-2 2H4v-2h17V7h2z"/></svg>
                    Purchase Key (2.50€)
                </button>
                
                <button class="btn-key-retry" onclick="retryKeyCheck()">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
                    Check Again
                </button>
                
                <button class="btn-key-switch" onclick="logout()">
                    ← Switch Account
                </button>
            </div>
        `;
        document.body.appendChild(keyScreen);
        
        // Add key input formatting
        document.getElementById('tool-key-input').addEventListener('input', function(e) {
            let v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
            let f = v.startsWith('NEXUS') 
                ? 'NEXUS-' + (v.slice(5).match(/.{1,4}/g)?.join('-') || '')
                : v.match(/.{1,4}/g)?.join('-') || '';
            e.target.value = f.slice(0, 19);
        });
    }
    
    keyScreen.style.display = 'flex';
}

// Activate key directly from tool
async function activateKeyFromTool() {
    const keyInput = document.getElementById('tool-key-input');
    const key = keyInput.value.trim();
    
    if (!key || key.length < 15) {
        showToast('Please enter a valid license key', 'error');
        return;
    }
    
    if (!currentUser) {
        showToast('Please login first', 'error');
        return;
    }
    
    showToast('Activating key...', 'info');
    
    try {
        console.log('[Key] Sending validation request for:', key, 'user:', currentUser.id);
        
        const response = await fetch(`${OAUTH_SERVER_URL}/tool/validate-key`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: key, discordId: currentUser.id })
        });
        
        console.log('[Key] Response status:', response.status);
        const data = await response.json();
        console.log('[Key] Response data:', data);
        
        if (data.success) {
            showToast('Key activated successfully!', 'success');
            _setKeyValid(true, Date.now());
            localStorage.setItem('tool_key', key);
            localStorage.setItem('tool_key_data', JSON.stringify({
                key: key,
                discordId: currentUser.id,
                activatedAt: Date.now()
            }));
            
            setTimeout(() => {
                hideKeyRequiredScreen();
                showApp();
            }, 1000);
        } else {
            console.log('[Key] Activation failed:', data.error);
            showToast('Error: ' + (data.error || 'Invalid key'), 'error');
        }
    } catch (e) {
        console.error('[Key] Connection error:', e);
        showToast('Connection error. Please try again.', 'error');
    }
}

function hideKeyRequiredScreen() {
    const keyScreen = document.getElementById('key-required-screen');
    if (keyScreen) {
        keyScreen.style.display = 'none';
    }
}

// Open browser to login/purchase page
function openKeyPurchasePage() {
    const authUrl = `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(OAUTH_REDIRECT_URI)}&scope=identify+guilds.join`;
    
    if (window.__TAURI__?.shell?.open) {
        window.__TAURI__.shell.open(authUrl);
    } else {
        window.open(authUrl, '_blank');
    }
    
    showToast('Opening license page in browser...', 'info');
}

// Re-check if user now has a key
async function retryKeyCheck() {
    if (!currentUser) {
        showToast('Please login first', 'error');
        return;
    }
    
    showToast('Checking license...', 'info');
    
    const hasKey = await checkToolKey(currentUser.id);
    if (hasKey) {
        showToast('License verified!', 'success');
        hideKeyRequiredScreen();
        showApp();
    } else {
        showToast('No valid license found. Please purchase or activate a key.', 'error');
    }
}

// ==================== LOGIN / OAUTH2 ====================
function showLoginScreen() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app-container').style.display = 'none';
}

// SECURITY: showApp checks if key was properly validated
function showApp() {
    // Double-check: key must be validated
    if (!_sec._v) {
        console.error('SECURITY: Attempted to show app without valid key!');
        showKeyRequiredScreen();
        return;
    }
    
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-container').style.display = 'flex';
    hideKeyRequiredScreen();
    
    // Update user info in sidebar
    if (currentUser) {
        document.getElementById('sidebar-user').style.display = 'flex';
        document.getElementById('sidebar-avatar').src = currentUser.avatar || '';
        document.getElementById('sidebar-name').textContent = currentUser.username || 'User';
    }
    
    initApp();
    
    // Start periodic key re-validation
    setInterval(revalidateKey, KEY_VALIDATION_TIMEOUT);
}

function initApp() {
    // SECURITY: Final check before initializing
    if (!_sec._v) {
        console.error('SECURITY: initApp called without valid key!');
        document.getElementById('app-container').style.display = 'none';
        showKeyRequiredScreen();
        return;
    }
    
    initNavigation();
    initConfigForm();
    initModals();
    initEmbedPreview();
    
    setTimeout(async () => {
        // Re-verify key before loading sensitive data
        if (!_sec._v) {
            showKeyRequiredScreen();
            return;
        }
        
        try {
            await loadConfig();
            loadStatusConfig(); // Load Discord status settings
            startStatusPolling();
            loadDashboard();
        } catch (e) {
            console.log('Init:', e.message);
        }
    }, 500);
}

async function loginWithDiscord() {
    // Direct OAuth URL with fixed server
    const authUrl = `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(OAUTH_REDIRECT_URI)}&scope=identify+guilds.join`;
    
    // Open in default browser
    if (window.__TAURI__?.shell?.open) {
        window.__TAURI__.shell.open(authUrl);
    } else {
        window.open(authUrl, '_blank');
    }
    
    showToast('Please complete login in your browser', 'info');
    
    // Start polling for user data
    startOAuthPolling(OAUTH_SERVER_URL);
}

function startOAuthPolling(serverUrl) {
    // Clear existing interval
    if (oauthCheckInterval) {
        clearInterval(oauthCheckInterval);
    }
    
    // Poll server for user data every 2 seconds
    oauthCheckInterval = setInterval(async () => {
        try {
            const response = await fetch(`${serverUrl}/auth/user`);
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.user) {
                    // Stop polling
                    clearInterval(oauthCheckInterval);
                    oauthCheckInterval = null;
                    
                    // Save user data
                    const user = data.user;
                    user.avatar = user.avatar 
                        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
                        : 'https://cdn.discordapp.com/embed/avatars/0.png';
                    
                    currentUser = user;
                    localStorage.setItem('discord_user', JSON.stringify(user));
                    
                    // Show user info on login screen
                    document.getElementById('discord-login-btn').style.display = 'none';
                    document.getElementById('user-info').style.display = 'flex';
                    document.getElementById('user-avatar').src = user.avatar;
                    document.getElementById('user-name').textContent = user.username;
                    document.getElementById('user-tag').textContent = `#${user.discriminator || '0'}`;
                    
                    showToast(`Welcome, ${user.username}!`, 'success');
                    
                    // Auto-enter app after 2 seconds (enterApp will verify key)
                    setTimeout(async () => await enterApp(), 2000);
                }
            }
        } catch (e) {
            // Server not reachable - keep trying
        }
    }, 2000);
    
    // Stop after 2 minutes
    setTimeout(() => {
        if (oauthCheckInterval) {
            clearInterval(oauthCheckInterval);
            oauthCheckInterval = null;
        }
    }, 120000);
}

function checkOAuthCallback() {
    // Nothing to check - server URL is fixed
}

// SECURITY: enterApp must ALWAYS check key first
async function enterApp() {
    if (!currentUser) {
        showLoginScreen();
        return;
    }
    
    // ALWAYS verify key with server before allowing access
    const hasKey = await checkToolKey(currentUser.id);
    if (hasKey) {
        showApp();
    } else {
        showKeyRequiredScreen();
    }
}

// Minimize window to background
async function minimizeToBackground() {
    try {
        await invoke('minimize_window');
    } catch (error) {
        console.error('Failed to minimize window:', error);
    }
}

async function logout() {
    // SECURITY: Reset all validation state
    _setKeyValid(false, 0);
    
    // Notify server
    const serverUrl = localStorage.getItem('oauth_server_url') || OAUTH_SERVER_URL;
    try {
        await fetch(`${serverUrl}/auth/logout`, { method: 'POST' });
    } catch (e) {
        // Ignore server errors
    }
    
    localStorage.removeItem('discord_user');
    localStorage.removeItem('tool_key_data');
    localStorage.removeItem('tool_key');
    currentUser = null;
    location.reload();
}


// ==================== NAVIGATION ====================
function initNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            this.classList.add('active');
            showPage(this.dataset.page);
        });
    });
}

function showPage(pageName) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const page = document.getElementById(`${pageName}-page`);
    if (page) {
        page.classList.add('active');
        stopLogsPolling();
        
        switch (pageName) {
            case 'dashboard': loadDashboard(); break;
            case 'logs': refreshLogs(); startLogsPolling(); break;
            case 'hosting': updateHostingStats(); break;
            case 'management': loadManagementData(); break;
            case 'analytics': loadAnalyticsData(); break;
            case 'embed': loadChannelsForEmbed(); break;
            case 'settings': loadSettings(); break;
            case 'giveaways': loadGiveawaysPage(); break;
            case 'reactionroles': loadReactionRolesPage(); break;
            case 'webhooks': loadWebhooksPage(); break;
            case 'alerts': loadAlertsPage(); break;
            case 'backup': loadBackupPage(); break;
            case 'info': loadInfoPage(); break;
        }
    }
}

// ==================== DASHBOARD ====================
async function loadDashboard() {
    const indicator = document.getElementById('dash-status-indicator');
    const text = document.getElementById('dash-status-text');
    
    let isOnline = false;
    
    // Check LOCAL bot process first
    try {
        const status = await invoke('get_bot_status');
        console.log('[Dashboard] Local bot process status:', status);
        
        if (status.running) {
            isOnline = true;
        }
    } catch (e) {
        console.log('[Dashboard] Process check error:', e.message);
    }
    
    // Check API for Discord connection status
    let apiData = null;
    try {
        const apiStatus = await invoke('check_bot_api');
        apiData = JSON.parse(apiStatus);
        console.log('[Dashboard] API Response:', apiData);
        console.log('[Dashboard] Source:', apiData.source || 'unknown');
        console.log('[Dashboard] online:', apiData.online, 'type:', typeof apiData.online);
        
        // Only online if API says Discord is connected (online === true)
        if (apiData.online === true) {
            isOnline = true;
            console.log('[Dashboard] -> Bot is ONLINE');
        } else {
            isOnline = false; // API running but Discord disconnected
            console.log('[Dashboard] -> Bot is OFFLINE (Discord disconnected)');
        }
    } catch (e) {
        console.log('[Dashboard] API not reachable:', e);
        // API not reachable = offline
        isOnline = false;
    }
    
    // Update UI based on status
    if (isOnline && apiData) {
        indicator?.classList.remove('offline', 'starting');
        indicator?.classList.add('online');
        
        const pingText = apiData.ping ? ` • ${apiData.ping}ms` : '';
        if (text) text.textContent = (apiData.botTag || 'Bot Online') + pingText;
        
        document.getElementById('dash-uptime').textContent = 'Uptime: ' + formatUptime(apiData.uptime || 0);
        
        const pingEl = document.getElementById('dash-ping');
        if (pingEl && apiData.ping !== undefined) {
            pingEl.textContent = `Ping: ${apiData.ping}ms`;
            pingEl.className = 'ping-display ' + (apiData.ping < 100 ? 'good' : apiData.ping < 200 ? 'medium' : 'bad');
        }
        
        if (apiData.memberCount) {
            document.getElementById('dash-members').textContent = apiData.memberCount;
        }
    } else {
        // Bot offline
        indicator?.classList.remove('online', 'starting');
        indicator?.classList.add('offline');
        if (text) text.textContent = 'Bot Offline';
        document.getElementById('dash-uptime').textContent = 'Uptime: -';
        const pingEl = document.getElementById('dash-ping');
        if (pingEl) {
            pingEl.textContent = 'Ping: -';
            pingEl.className = 'ping-display';
        }
    }
    
    // Load additional data
    try {
        const dataStr = await invoke('get_bot_data');
        botData = JSON.parse(dataStr);
        
        if (!document.getElementById('dash-members').textContent || document.getElementById('dash-members').textContent === '-') {
            document.getElementById('dash-members').textContent = botData.stats?.totalMembers || '-';
        }
        document.getElementById('dash-online').textContent = botData.stats?.online || '-';
        document.getElementById('dash-tickets').textContent = botData.stats?.openTickets || '0';
        document.getElementById('dash-giveaways').textContent = botData.stats?.activeGiveaways || '0';
        
        // Features
        const settings = botData.settings || {};
        updateFeatureStatus('feature-automod', settings.automod?.enabled);
        updateFeatureStatus('feature-welcome', settings.welcome?.enabled);
        updateFeatureStatus('feature-leveling', settings.leveling?.enabled);
        
        // Leaderboard
        renderLeaderboard(botData.leaderboard || []);
    } catch (e) {
        // Local bot data not available
    }
    
    // Also load tickets from local bot
    refreshTickets();
}

function updateFeatureStatus(id, enabled) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = enabled ? 'On' : 'Off';
        el.className = 'feature-status ' + (enabled ? 'on' : 'off');
    }
}

function renderLeaderboard(data) {
    const container = document.getElementById('dash-leaderboard');
    if (!data.length) {
        container.innerHTML = '<p class="placeholder-text">No data yet. Enable Leveling!</p>';
        return;
    }
    
    container.innerHTML = data.map((u, i) => `
        <div class="leaderboard-item">
            <span class="lb-rank">#${i + 1}</span>
            <span class="lb-user"><@${u.id}></span>
            <span class="lb-level">Lvl ${u.level}</span>
            <span class="lb-xp">${u.xp} XP</span>
        </div>
    `).join('');
}

// ==================== CONFIG ====================
function initConfigForm() {
    document.getElementById('config-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveConfig();
    });
}

async function saveConfig() {
    const config = {
        token: document.getElementById('token').value.trim(),
        client_id: document.getElementById('client-id').value.trim(),
        guild_id: document.getElementById('guild-id').value.trim(),
        prefix: document.getElementById('prefix').value.trim() || '!'
    };
    
    if (!config.token) return showToast('Please enter Bot Token', 'error');
    if (!config.client_id) return showToast('Please enter Client ID', 'error');
    
    // Save client ID for OAuth
    localStorage.setItem('oauth_client_id', config.client_id);
    
    try {
        const result = await invoke('save_config', { config });
        showToast('Configuration saved!', 'success');
    } catch (e) {
        showToast('Error: ' + e, 'error');
    }
}

async function loadConfig() {
    try {
        const config = await invoke('load_config');
        document.getElementById('token').value = config.token || '';
        document.getElementById('client-id').value = config.client_id || '';
        document.getElementById('guild-id').value = config.guild_id || '';
        document.getElementById('prefix').value = config.prefix || '!';
        
        if (config.client_id) {
            localStorage.setItem('oauth_client_id', config.client_id);
        }
        
        if (config.token) showToast('Configuration loaded', 'info');
        
        // Load connected servers
        loadConnectedServers();
    } catch (e) {
        console.log('Config:', e);
    }
}

function toggleTokenVisibility() {
    const input = document.getElementById('token');
    input.type = input.type === 'password' ? 'text' : 'password';
}

function generateInviteLink() {
    const clientId = document.getElementById('client-id').value.trim();
    if (!clientId) return showToast('Client ID required', 'error');
    
    const url = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=8&scope=bot%20applications.commands`;
    document.getElementById('invite-link').value = url;
    document.getElementById('invite-link-container').style.display = 'flex';
}

function copyInviteLink() {
    const input = document.getElementById('invite-link');
    input.select();
    navigator.clipboard.writeText(input.value);
    showToast('Link copied!', 'success');
}

// ==================== CONNECTED SERVERS ====================
async function loadConnectedServers() {
    const container = document.getElementById('connected-servers');
    if (!container) return;
    
    try {
        const dataStr = await invoke('get_bot_data');
        const data = JSON.parse(dataStr);
        
        if (data.guilds && data.guilds.length > 0) {
            const currentGuildId = document.getElementById('guild-id')?.value || '';
            
            container.innerHTML = data.guilds.map(guild => `
                <div class="server-item ${guild.id === currentGuildId ? 'selected' : ''}" 
                     onclick="selectServer('${guild.id}')" 
                     title="Click to select as primary server">
                    <div class="server-icon">
                        ${guild.icon 
                            ? `<img src="${guild.icon}" alt="${escapeHtml(guild.name)}">`
                            : guild.name.charAt(0).toUpperCase()
                        }
                    </div>
                    <div class="server-info">
                        <span class="server-name">${escapeHtml(guild.name)}</span>
                        <span class="server-members">${guild.memberCount || 0} Members</span>
                    </div>
                </div>
            `).join('');
        } else if (data.guild) {
            // Single guild fallback
            const guild = data.guild;
            container.innerHTML = `
                <div class="server-item selected">
                    <div class="server-icon">
                        ${guild.icon 
                            ? `<img src="${guild.icon}" alt="${escapeHtml(guild.name)}">`
                            : (guild.name || 'S').charAt(0).toUpperCase()
                        }
                    </div>
                    <div class="server-info">
                        <span class="server-name">${escapeHtml(guild.name || 'Server')}</span>
                        <span class="server-members">${data.stats?.totalMembers || 0} Members</span>
                    </div>
                </div>
            `;
            // Set guild ID
            if (guild.id) {
                document.getElementById('guild-id').value = guild.id;
            }
        } else {
            container.innerHTML = `
                <div class="server-placeholder">
                    <span class="placeholder-icon">⚠️</span>
                    <span>No servers found. Is the bot in a server?</span>
                </div>
            `;
        }
    } catch (e) {
        container.innerHTML = `
            <div class="server-placeholder">
                <span class="placeholder-icon">🔌</span>
                <span>Start bot to see connected servers</span>
            </div>
        `;
    }
}

function selectServer(guildId) {
    document.getElementById('guild-id').value = guildId;
    
    // Update selection UI
    document.querySelectorAll('.server-item').forEach(item => {
        item.classList.remove('selected');
    });
    event.currentTarget.classList.add('selected');
    
    showToast('Primary server selected', 'success');
}

// ==================== STATUS CONFIG ====================
function updateStatusPreview() {
    const activityType = document.getElementById('status-activity-type')?.value || 'watching';
    const customText = document.getElementById('status-custom-text')?.value || '';
    const showPing = document.getElementById('status-show-ping')?.checked ?? true;
    const showUptime = document.getElementById('status-show-uptime')?.checked ?? true;
    const showMembers = document.getElementById('status-show-members')?.checked ?? false;
    const showServer = document.getElementById('status-show-server')?.checked ?? false;
    
    // Build preview text
    let parts = [];
    if (customText) parts.push(customText);
    if (showPing) parts.push('45ms');
    if (showUptime) parts.push('Uptime: 2h 15m');
    if (showMembers) parts.push('150 Members');
    if (showServer) parts.push('My Server');
    
    const previewText = parts.join(' • ') || 'Nexus Discord Tool';
    
    // Update preview
    const previewEl = document.getElementById('status-preview-text');
    const iconEl = document.querySelector('.status-preview-icon svg');
    
    // Activity type labels
    const typeLabels = {
        'watching': 'Watching',
        'playing': 'Playing',
        'listening': 'Listening to',
        'competing': 'Competing in'
    };
    
    if (previewEl) {
        previewEl.textContent = `${typeLabels[activityType]} ${previewText}`;
    }
    
    // Update icon based on activity type
    const icons = {
        'watching': '<path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/>',
        'playing': '<path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H8v3H6v-3H3v-2h3V8h2v3h3v2zm4.5 2c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4-3c-.83 0-1.5-.67-1.5-1.5S18.67 9 19.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>',
        'listening': '<path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>',
        'competing': '<path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2z"/>'
    };
    
    if (iconEl) {
        iconEl.innerHTML = icons[activityType] || icons['watching'];
    }
}

async function saveStatusConfig() {
    const config = {
        activityType: document.getElementById('status-activity-type')?.value || 'watching',
        customText: document.getElementById('status-custom-text')?.value || '',
        showPing: document.getElementById('status-show-ping')?.checked ?? true,
        showUptime: document.getElementById('status-show-uptime')?.checked ?? true,
        showMembers: document.getElementById('status-show-members')?.checked ?? false,
        showServer: document.getElementById('status-show-server')?.checked ?? false
    };
    
    console.log('[StatusConfig] Saving:', config);
    
    // Save to localStorage
    localStorage.setItem('statusConfig', JSON.stringify(config));
    
    // Also save directly to file via Tauri
    try {
        await invoke('save_status_config', { config: JSON.stringify(config) });
    } catch (e) {
        console.log('[StatusConfig] Could not save to file:', e);
    }
    
    // Send to bot via action (if running)
    try {
        const result = await invoke('execute_bot_action', {
            action: 'updateStatusConfig',
            params: JSON.stringify(config)
        });
        const r = JSON.parse(result);
        if (r.success) {
            showToast('Status settings saved & applied!', 'success');
        } else {
            showToast('Saved. Restart bot to apply.', 'info');
        }
    } catch (e) {
        // Bot might not be running
        showToast('Saved. Start bot to apply.', 'info');
    }
}

function loadStatusConfig() {
    try {
        const saved = localStorage.getItem('statusConfig');
        if (saved) {
            const config = JSON.parse(saved);
            
            if (document.getElementById('status-activity-type')) {
                document.getElementById('status-activity-type').value = config.activityType || 'watching';
            }
            if (document.getElementById('status-custom-text')) {
                document.getElementById('status-custom-text').value = config.customText || '';
            }
            if (document.getElementById('status-show-ping')) {
                document.getElementById('status-show-ping').checked = config.showPing ?? true;
            }
            if (document.getElementById('status-show-uptime')) {
                document.getElementById('status-show-uptime').checked = config.showUptime ?? true;
            }
            if (document.getElementById('status-show-members')) {
                document.getElementById('status-show-members').checked = config.showMembers ?? false;
            }
            if (document.getElementById('status-show-server')) {
                document.getElementById('status-show-server').checked = config.showServer ?? false;
            }
            
            updateStatusPreview();
        }
    } catch (e) {
        console.log('Status config load error:', e);
    }
}

// ==================== BOT CONTROL ====================

// Check setup status
async function checkSetupStatus() {
    try {
        const result = await invoke('check_setup_status');
        return JSON.parse(result);
    } catch (e) {
        console.error('Setup status check failed:', e);
        return null;
    }
}

// Check if Node.js is installed
async function checkNodeInstalled() {
    try {
        const version = await invoke('check_node_installed');
        return { installed: true, version };
    } catch (e) {
        return { installed: false, error: e };
    }
}

// Install bot dependencies
async function installBotDependencies() {
    try {
        showToast('Installing dependencies... This may take a minute.', 'info');
        const result = await invoke('install_bot_dependencies');
        showToast('Dependencies installed!', 'success');
        return true;
    } catch (e) {
        showToast('Failed to install dependencies: ' + e, 'error');
        return false;
    }
}

async function startBot() {
    try {
        // Check setup status first
        const status = await checkSetupStatus();
        
        if (status) {
            // Check Node.js
            if (!status.node_installed) {
                showToast('Node.js is not installed! Please install from nodejs.org', 'error');
                window.open('https://nodejs.org', '_blank');
                return;
            }
            
            // Check bot files
            if (!status.bot_files_exist) {
                showToast('Bot files not found. Please reinstall the application.', 'error');
                return;
            }
            
            // Check token
            if (!status.token_set) {
                showToast('Please enter your Bot Token in Configuration first!', 'error');
                showPage('config');
                return;
            }
        }
        
        // Cleanup old processes before starting
        try {
            await invoke('force_cleanup_bot');
        } catch (e) {}
        
        // Check if dependencies need to be installed
        if (status && !status.dependencies_installed) {
            showToast('Installing dependencies... Please wait (first start only)', 'info');
        } else {
            showToast('Starting bot...', 'info');
        }
        
        const result = await invoke('start_bot');
        showToast('Bot started successfully!', 'success');
        await updateBotStatus();
        await updateHostingStats();
        setTimeout(loadDashboard, 2000);
    } catch (e) {
        const errorMsg = String(e);
        
        if (errorMsg.includes('npm install') || errorMsg.includes('Node.js')) {
            showToast('Node.js is required! Please install from nodejs.org', 'error');
            window.open('https://nodejs.org', '_blank');
        } else if (errorMsg.includes('Token')) {
            showToast('Please configure your Bot Token first!', 'error');
            showPage('config');
        } else if (errorMsg.includes('reinstall')) {
            showToast('Bot files missing. Please reinstall the application.', 'error');
        } else {
            showToast('Error: ' + e, 'error');
        }
    }
}

async function stopBot() {
    try {
        const result = await invoke('stop_bot');
        showToast('Bot stopped', 'success');
        await updateBotStatus();
        botData = null;
        loadDashboard();
    } catch (e) {
        showToast('Error: ' + e, 'error');
    }
}

async function restartBot() {
    try {
        showToast('Restarting bot...', 'info');
        const result = await invoke('restart_bot');
        showToast('Bot restarted!', 'success');
        await updateBotStatus();
        setTimeout(loadDashboard, 2000);
    } catch (e) {
        showToast('Error: ' + e, 'error');
    }
}

async function updateBotStatus() {
    const indicator = document.getElementById('status-indicator');
    const title = document.getElementById('status-title');
    const pid = document.getElementById('status-pid');
    
    let isOnline = false;
    let processPid = null;
    
    // Check LOCAL bot process for PID
    try {
        const status = await invoke('get_bot_status');
        if (status.running) {
            processPid = status.pid;
        }
    } catch (e) {}
    
    // Check API for actual Discord connection status
    try {
        const apiStatus = await invoke('check_bot_api');
        const api = JSON.parse(apiStatus);
        // Only online if Discord client is ready
        if (api.online === true) {
            isOnline = true;
        }
    } catch (e) {}
    
    if (isOnline) {
        indicator?.classList.remove('offline', 'starting');
        indicator?.classList.add('online');
        if (title) title.textContent = 'Bot Status: Online';
        if (pid) pid.textContent = processPid ? 'PID: ' + processPid : 'Running';
    } else {
        indicator?.classList.remove('online', 'starting');
        indicator?.classList.add('offline');
        if (title) title.textContent = 'Bot Status: Offline';
        if (pid) pid.textContent = 'PID: -';
    }
}

function startStatusPolling() {
    updateBotStatus();
    loadDashboard(); // Also refresh dashboard
    statusInterval = setInterval(() => {
        updateBotStatus();
        loadDashboard();
    }, 3000); // Refresh every 3 seconds
}

// Force refresh dashboard - can be called from UI
async function forceRefreshDashboard() {
    console.log('[Dashboard] Force refresh triggered');
    await updateBotStatus();
    await loadDashboard();
}

// ==================== HOSTING ====================
async function updateHostingStats() {
    const indicator = document.getElementById('status-indicator');
    const title = document.getElementById('status-title');
    
    // Check LOCAL bot (primary)
    // Helper for safe textContent setting
    const setText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    
    try {
        const stats = await invoke('get_hosting_stats');
        
        if (stats.running) {
            indicator?.classList.remove('offline', 'starting');
            indicator?.classList.add('online');
            if (title) title.textContent = 'Bot Status: Online';
            setText('uptime', stats.uptime || '-');
            setText('last-activity', stats.start_time || '-');
            
            try {
                const apiStatus = await invoke('check_bot_api');
                const api = JSON.parse(apiStatus);
                setText('bot-ping', (api.ping || 0) + 'ms');
            } catch (e) {
                setText('bot-ping', '-');
            }
        } else {
            indicator?.classList.remove('online', 'starting');
            indicator?.classList.add('offline');
            if (title) title.textContent = 'Bot Status: Offline';
            setText('uptime', '-');
            setText('bot-ping', '-');
            setText('last-activity', '-');
        }
    } catch (e) {
        indicator?.classList.remove('online', 'starting');
        indicator?.classList.add('offline');
        if (title) title.textContent = 'Bot Status: Offline';
        setText('uptime', '-');
        setText('bot-ping', '-');
        setText('last-activity', '-');
    }
}

// ==================== LOGS ====================
async function refreshLogs() {
    try {
        const logs = await invoke('read_logs');
        const container = document.getElementById('logs-container');
        const filter = document.getElementById('log-filter')?.value || 'all';
        
        if (logs?.trim()) {
            let lines = logs.split('\n').filter(l => l.trim());
            
            if (filter !== 'all') {
                lines = lines.filter(l => {
                    const lower = l.toLowerCase();
                    if (filter === 'error') return lower.includes('error');
                    if (filter === 'warn') return lower.includes('warn');
                    if (filter === 'info') return lower.includes('info');
                    return true;
                });
            }
            
            container.innerHTML = lines.map(l => {
                let type = 'info';
                if (l.toLowerCase().includes('error')) type = 'error';
                else if (l.toLowerCase().includes('warn')) type = 'warn';
                return `<div class="log-entry ${type}">${escapeHtml(l)}</div>`;
            }).join('');
            
            container.scrollTop = container.scrollHeight;
        } else {
            container.innerHTML = '<p class="placeholder-text">No logs available.</p>';
        }
    } catch (e) {}
}

async function clearLogs() {
    try {
        await invoke('clear_logs');
        document.getElementById('logs-container').innerHTML = '<p class="placeholder-text">Logs cleared</p>';
        showToast('Logs cleared', 'success');
    } catch (e) {
        showToast('Error: ' + e, 'error');
    }
}

function startLogsPolling() {
    stopLogsPolling();
    // Refresh logs every 5 seconds
    logsInterval = setInterval(refreshLogs, 5000);
    
    // Show auto-refresh indicator
    const header = document.querySelector('.logs-header');
    if (header && !header.querySelector('.auto-refresh-indicator')) {
        const indicator = document.createElement('div');
        indicator.className = 'auto-refresh-indicator';
        indicator.innerHTML = `
            <span class="pulse-dot"></span>
            <span>Auto-refresh: 5s</span>
        `;
        header.appendChild(indicator);
    }
}

function stopLogsPolling() {
    if (logsInterval) {
        clearInterval(logsInterval);
        logsInterval = null;
    }
    
    // Remove auto-refresh indicator
    const indicator = document.querySelector('.auto-refresh-indicator');
    if (indicator) indicator.remove();
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('log-filter')?.addEventListener('change', refreshLogs);
});

// ==================== MANAGEMENT ====================
let managementData = { channels: [], roles: [], members: [], tickets: [] };
let currentMemberPage = 1;
const membersPerPage = 20;

// Tab switching
function switchManagementTab(tabId) {
    document.querySelectorAll('.mgmt-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.mgmt-tab-content').forEach(c => c.classList.remove('active'));
    
    document.querySelector(`[data-tab="${tabId}"]`)?.classList.add('active');
    document.getElementById(tabId)?.classList.add('active');
}

// Refresh all management data
async function refreshAllManagement() {
    showToast('Refreshing data...', 'info');
    await loadManagementData();
    showToast('Data refreshed!', 'success');
}

async function loadManagementData() {
    const channelsList = document.getElementById('channels-list');
    const rolesList = document.getElementById('roles-list');
    const membersList = document.getElementById('members-list');
    const ticketsList = document.getElementById('tickets-list');
    
    // Show loading state
    if (channelsList) channelsList.innerHTML = '<p class="loading-text">Loading channels...</p>';
    if (rolesList) rolesList.innerHTML = '<p class="loading-text">Loading roles...</p>';
    if (membersList) membersList.innerHTML = '<p class="loading-text">Loading members...</p>';
    if (ticketsList) ticketsList.innerHTML = '<p class="loading-text">Loading tickets...</p>';
    
    try {
        const dataStr = await invoke('get_bot_data');
        botData = JSON.parse(dataStr);
        managementData = {
            channels: botData.channels || [],
            roles: botData.roles || [],
            members: botData.members || [],
            tickets: botData.tickets?.list || []
        };
        
        // Update stats bar
        updateManagementStats();
        
        // Render all sections
        renderChannels(managementData.channels);
        renderRoles(managementData.roles);
        renderMembers(managementData.members);
        renderTicketsManagement(managementData.tickets);
        
        // Populate role filter for members
        populateRoleFilter();
        
    } catch (e) {
        console.error('[Management] Load error:', e);
        const err = '<p class="placeholder-text">Bot not connected. Start the bot to manage your server.</p>';
        if (channelsList) channelsList.innerHTML = err;
        if (rolesList) rolesList.innerHTML = err;
        if (membersList) membersList.innerHTML = err;
        if (ticketsList) ticketsList.innerHTML = err;
    }
}

function updateManagementStats() {
    const el = (id, val) => {
        const e = document.getElementById(id);
        if (e) e.textContent = val;
    };
    
    el('mgmt-total-members', botData?.stats?.totalMembers || managementData.members.length || '-');
    el('mgmt-online-members', botData?.stats?.online || '-');
    el('mgmt-total-channels', managementData.channels.length || '-');
    el('mgmt-total-roles', managementData.roles.length || '-');
    el('mgmt-open-tickets', botData?.stats?.openTickets || managementData.tickets.length || '-');
}

// ========== CHANNELS ==========
function renderChannels(channels) {
    const container = document.getElementById('channels-list');
    if (!container) return;
    
    if (!channels?.length) {
        container.innerHTML = '<p class="placeholder-text">No channels found</p>';
        return;
    }
    
    // Group by category
    const categories = channels.filter(c => c.type === 'category');
    const uncategorized = channels.filter(c => c.type !== 'category' && !c.parentId);
    
    let html = '';
    
    // Uncategorized channels first
    if (uncategorized.length > 0) {
        html += '<div class="channel-category">';
        html += '<div class="channel-category-header" onclick="toggleCategory(this)"><svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M7 10l5 5 5-5z"/></svg>Uncategorized</div>';
        html += '<div class="channel-list">';
        uncategorized.forEach(c => html += renderChannelItem(c));
        html += '</div></div>';
    }
    
    // Categorized channels
    categories.forEach(cat => {
        const catChannels = channels.filter(c => c.parentId === cat.id && c.type !== 'category');
        html += '<div class="channel-category">';
        html += `<div class="channel-category-header" onclick="toggleCategory(this)">
            <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M7 10l5 5 5-5z"/></svg>
            <span class="category-name">${escapeHtml(cat.name)}</span>
            <span class="category-count">(${catChannels.length})</span>
            <div class="category-actions">
                <button class="channel-action-btn" onclick="event.stopPropagation(); copyChannelId('${cat.id}')" title="Copy ID">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                </button>
                <button class="channel-action-btn" onclick="event.stopPropagation(); deleteChannel('${cat.id}', '${escapeHtml(cat.name)}')" title="Delete Category">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                </button>
            </div>
        </div>`;
        html += '<div class="channel-list">';
        if (catChannels.length > 0) {
            catChannels.forEach(c => html += renderChannelItem(c));
        } else {
            html += '<div class="channel-empty">No channels in this category</div>';
        }
        html += '</div></div>';
    });
    
    // Show categories without children as empty (for filter)
    if (categories.length === 0 && uncategorized.length === 0) {
        html = '<p class="placeholder-text">No channels found</p>';
    }
    
    container.innerHTML = html;
}

function renderChannelItem(channel) {
    const icons = {
        text: '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M5.88657 21C5.57547 21 5.3399 20.7189 5.39427 20.4126L6.00001 17H2.59511C2.28449 17 2.04905 16.7198 2.10259 16.4138L2.27759 15.4138C2.31946 15.1746 2.52722 15 2.77011 15H6.35001L7.41001 9H4.00511C3.69449 9 3.45905 8.71977 3.51259 8.41381L3.68759 7.41381C3.72946 7.17456 3.93722 7 4.18011 7H7.76001L8.39287 3.41262C8.43477 3.17391 8.64221 3 8.88489 3H9.94536C10.2565 3 10.492 3.28107 10.4376 3.58738L9.85001 7H15.76L16.3929 3.41262C16.4348 3.17391 16.6422 3 16.8849 3H17.9454C18.2565 3 18.492 3.28107 18.4376 3.58738L17.85 7H21.2549C21.5655 7 21.801 7.28023 21.7474 7.58619L21.5724 8.58619C21.5306 8.82544 21.3228 9 21.0799 9H17.5L16.44 15H19.845C20.1556 15 20.391 15.2802 20.3374 15.5862L20.1624 16.5862C20.1206 16.8254 19.9128 17 19.67 17H16.09L15.4571 20.5874C15.4152 20.8261 15.2078 21 14.9651 21H13.9046C13.5935 21 13.358 20.7189 13.4124 20.4126L14 17H8.09001L7.4571 20.5874C7.4152 20.8261 7.20775 21 6.96489 21H5.88657ZM9.50001 9L8.44001 15H14.35L15.41 9H9.50001Z"/></svg>',
        voice: '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M12 3a9 9 0 0 0-8 14.32V21h4v-4H6v-2c0-3.31 2.69-6 6-6s6 2.69 6 6v2h-2v4h4v-3.68A9 9 0 0 0 12 3z"/></svg>',
        announcement: '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M12 8V4l8 8-8 8v-4H4V8z"/></svg>',
        forum: '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>',
        stage: '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>'
    };
    
    const icon = icons[channel.type] || icons.text;
    const topic = channel.topic ? `<span class="channel-topic">${escapeHtml(channel.topic.substring(0, 50))}</span>` : '';
    
    return `
        <div class="channel-item" data-type="${channel.type}" data-name="${channel.name.toLowerCase()}">
            <div class="channel-info">
                <span class="channel-icon ${channel.type}">${icon}</span>
                <span class="channel-name">${escapeHtml(channel.name)}</span>
                ${topic}
            </div>
            <div class="channel-actions">
                <button class="channel-action-btn" onclick="copyChannelId('${channel.id}')" title="Copy ID">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                </button>
                <button class="channel-action-btn" onclick="deleteChannel('${channel.id}', '${escapeHtml(channel.name)}')" title="Delete">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                </button>
            </div>
        </div>
    `;
}

function toggleCategory(header) {
    header.parentElement.classList.toggle('collapsed');
}

function filterChannels() {
    const search = document.getElementById('channel-search')?.value.toLowerCase() || '';
    const typeFilter = document.getElementById('channel-filter')?.value || 'all';
    
    // Filter channel items
    document.querySelectorAll('.channel-item').forEach(item => {
        const name = item.dataset.name;
        const type = item.dataset.type;
        
        const matchesSearch = name.includes(search);
        const matchesType = typeFilter === 'all' || type === typeFilter;
        
        item.style.display = (matchesSearch && matchesType) ? '' : 'none';
    });
    
    // Show/hide categories based on filter and if they have visible children
    document.querySelectorAll('.channel-category').forEach(cat => {
        const header = cat.querySelector('.channel-category-header');
        const catName = header?.textContent.toLowerCase() || '';
        const visibleChildren = cat.querySelectorAll('.channel-item:not([style*="display: none"])').length;
        
        // If filtering by category type, show categories as headers
        if (typeFilter === 'category') {
            // Show all categories when filter is 'category'
            cat.style.display = catName.includes(search) ? '' : 'none';
        } else if (typeFilter === 'all') {
            // Show category if name matches OR has visible children
            cat.style.display = (catName.includes(search) || visibleChildren > 0) ? '' : 'none';
        } else {
            // For other filters, only show if has visible children
            cat.style.display = visibleChildren > 0 ? '' : 'none';
        }
    });
}

function copyChannelId(id) {
    navigator.clipboard.writeText(id);
    showToast('Channel ID copied!', 'success');
}

// ========== ROLES ==========
function renderRoles(roles) {
    const container = document.getElementById('roles-list');
    if (!container) return;
    
    if (!roles?.length) {
        container.innerHTML = '<p class="placeholder-text">No roles found</p>';
        return;
    }
    
    // Sort by position (highest first)
    const sorted = [...roles].sort((a, b) => (b.position || 0) - (a.position || 0));
    
    container.innerHTML = sorted.map(role => {
        const color = role.color || '#99aab5';
        const perms = [];
        if (role.permissions?.includes('ADMINISTRATOR')) perms.push('<span class="role-perm-badge admin">Admin</span>');
        if (role.permissions?.includes('MANAGE_GUILD')) perms.push('<span class="role-perm-badge">Manage Server</span>');
        if (role.permissions?.includes('MANAGE_CHANNELS')) perms.push('<span class="role-perm-badge">Manage Channels</span>');
        if (role.permissions?.includes('MANAGE_ROLES')) perms.push('<span class="role-perm-badge">Manage Roles</span>');
        if (role.permissions?.includes('KICK_MEMBERS')) perms.push('<span class="role-perm-badge">Kick</span>');
        if (role.permissions?.includes('BAN_MEMBERS')) perms.push('<span class="role-perm-badge">Ban</span>');
        
        return `
            <div class="role-item" data-name="${role.name.toLowerCase()}" data-members="${role.memberCount || 0}" style="border-left-color: ${color}">
                <div class="role-info">
                    <div class="role-color-badge" style="background: ${color}"></div>
                    <div class="role-details">
                        <span class="role-name" style="color: ${color}">${escapeHtml(role.name)}</span>
                        <div class="role-meta">
                            <span>👥 ${role.memberCount || 0} members</span>
                            <span>📍 Position ${role.position || 0}</span>
                        </div>
                        <div class="role-permissions">${perms.slice(0, 4).join('')}</div>
                    </div>
                </div>
                <div class="role-actions">
                    <button class="channel-action-btn" onclick="copyRoleId('${role.id}')" title="Copy ID">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                    </button>
                    <button class="channel-action-btn" onclick="deleteRole('${role.id}', '${escapeHtml(role.name)}')" title="Delete">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function filterRoles() {
    const search = document.getElementById('role-search')?.value.toLowerCase() || '';
    document.querySelectorAll('.role-item').forEach(item => {
        const name = item.dataset.name;
        item.style.display = name.includes(search) ? '' : 'none';
    });
}

function sortRoles() {
    const sortBy = document.getElementById('role-sort')?.value || 'position';
    const container = document.getElementById('roles-list');
    const items = Array.from(container.querySelectorAll('.role-item'));
    
    items.sort((a, b) => {
        if (sortBy === 'members') {
            return parseInt(b.dataset.members) - parseInt(a.dataset.members);
        } else if (sortBy === 'name') {
            return a.dataset.name.localeCompare(b.dataset.name);
        }
        return 0; // Keep original (position) order
    });
    
    items.forEach(item => container.appendChild(item));
}

function copyRoleId(id) {
    navigator.clipboard.writeText(id);
    showToast('Role ID copied!', 'success');
}

// ========== MEMBERS ==========
function renderMembers(members) {
    const container = document.getElementById('members-list');
    if (!container) return;
    
    if (!members?.length) {
        container.innerHTML = '<p class="placeholder-text">No members data available. Enable member fetching in bot settings.</p>';
        return;
    }
    
    // Paginate
    const start = (currentMemberPage - 1) * membersPerPage;
    const pageMembers = members.slice(start, start + membersPerPage);
    
    container.innerHTML = pageMembers.map(member => {
        const avatar = member.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png';
        const status = member.status || 'offline';
        const roles = (member.roles || []).slice(0, 5);
        
        return `
            <div class="member-card" data-status="${status}" data-bot="${member.bot ? 'true' : 'false'}" data-name="${member.name?.toLowerCase() || ''}">
                <div class="member-avatar-wrapper">
                    <img src="${avatar}" class="member-avatar" alt="${escapeHtml(member.name || 'User')}">
                    <div class="member-status ${status}"></div>
                </div>
                <div class="member-info">
                    <div class="member-name">
                        ${escapeHtml(member.name || 'Unknown')}
                        ${member.bot ? '<span class="bot-badge">BOT</span>' : ''}
                    </div>
                    <div class="member-roles">
                        ${roles.map(r => `<div class="member-role-dot" style="background: ${r.color || '#99aab5'}" title="${escapeHtml(r.name || '')}"></div>`).join('')}
                        ${member.roles?.length > 5 ? `<span style="color: var(--text-muted); font-size: 0.75rem;">+${member.roles.length - 5}</span>` : ''}
                    </div>
                </div>
                <div class="member-actions">
                    <button class="channel-action-btn" onclick="copyMemberId('${member.id}')" title="Copy ID">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
    
    // Render pagination
    renderMembersPagination(members.length);
}

function renderMembersPagination(total) {
    const container = document.getElementById('members-pagination');
    if (!container) return;
    
    const totalPages = Math.ceil(total / membersPerPage);
    
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    container.innerHTML = `
        <button class="pagination-btn" onclick="changeMemberPage(-1)" ${currentMemberPage === 1 ? 'disabled' : ''}>← Prev</button>
        <span class="pagination-info">Page ${currentMemberPage} of ${totalPages} (${total} members)</span>
        <button class="pagination-btn" onclick="changeMemberPage(1)" ${currentMemberPage === totalPages ? 'disabled' : ''}>Next →</button>
    `;
}

function changeMemberPage(delta) {
    currentMemberPage += delta;
    renderMembers(managementData.members);
}

function searchMembers() {
    const search = document.getElementById('member-search')?.value.toLowerCase() || '';
    document.querySelectorAll('.member-card').forEach(card => {
        const name = card.dataset.name;
        card.style.display = name.includes(search) ? '' : 'none';
    });
}

function filterMembers() {
    const statusFilter = document.getElementById('member-filter')?.value || 'all';
    const roleFilter = document.getElementById('member-role-filter')?.value || 'all';
    
    document.querySelectorAll('.member-card').forEach(card => {
        const status = card.dataset.status;
        const isBot = card.dataset.bot === 'true';
        
        let show = true;
        
        if (statusFilter === 'online') show = status !== 'offline';
        else if (statusFilter === 'offline') show = status === 'offline';
        else if (statusFilter === 'bots') show = isBot;
        else if (statusFilter === 'humans') show = !isBot;
        
        card.style.display = show ? '' : 'none';
    });
}

function populateRoleFilter() {
    const select = document.getElementById('member-role-filter');
    if (!select) return;
    
    select.innerHTML = '<option value="all">All Roles</option>';
    managementData.roles.forEach(role => {
        select.innerHTML += `<option value="${role.id}">${escapeHtml(role.name)}</option>`;
    });
}

function copyMemberId(id) {
    navigator.clipboard.writeText(id);
    showToast('Member ID copied!', 'success');
}

// ========== TICKETS ==========
function renderTicketsManagement(tickets) {
    const container = document.getElementById('tickets-list');
    if (!container) return;
    
    if (!tickets?.length) {
        container.innerHTML = '<p class="placeholder-text">No open tickets</p>';
        return;
    }
    
    container.innerHTML = tickets.map(ticket => {
        const status = ticket.claimed ? 'claimed' : 'open';
        const created = ticket.createdAt ? new Date(ticket.createdAt).toLocaleString() : 'Unknown';
        
        return `
            <div class="ticket-item ${status}" data-status="${status}">
                <div class="ticket-info">
                    <span class="ticket-id">#${escapeHtml(ticket.name || ticket.id)}</span>
                    <span class="ticket-created">${created}</span>
                </div>
                <div class="ticket-user">
                    <img src="${ticket.userAvatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}" class="ticket-user-avatar">
                    <span class="ticket-user-name">${escapeHtml(ticket.userName || 'Unknown')}</span>
                </div>
                <div class="ticket-status">
                    <span class="ticket-status-dot ${status}"></span>
                    <span>${status === 'claimed' ? 'Claimed' : 'Open'}</span>
                </div>
                <div class="ticket-actions">
                    <button class="btn btn-sm btn-primary" onclick="openTicketChannel('${ticket.id}')">Open</button>
                    <button class="btn btn-sm btn-danger" onclick="closeTicket('${ticket.id}')">Close</button>
                </div>
            </div>
        `;
    }).join('');
}

function filterTickets() {
    const search = document.getElementById('ticket-search')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('ticket-filter')?.value || 'all';
    
    document.querySelectorAll('.ticket-item').forEach(item => {
        const status = item.dataset.status;
        const text = item.textContent.toLowerCase();
        
        const matchesSearch = text.includes(search);
        const matchesStatus = statusFilter === 'all' || status === statusFilter;
        
        item.style.display = (matchesSearch && matchesStatus) ? '' : 'none';
    });
}

async function deleteChannel(id, name) {
    if (!confirm(`Delete channel "${name}"?`)) return;
    try {
        const result = await invoke('execute_bot_action', { action: 'deleteChannel', params: JSON.stringify({ id }) });
        const r = JSON.parse(result);
        if (r.success) { showToast(`"${name}" deleted`, 'success'); loadManagementData(); }
        else showToast('Error: ' + r.error, 'error');
    } catch (e) { showToast('Error: ' + e, 'error'); }
}

async function deleteRole(id, name) {
    if (!confirm(`Delete role "${name}"?`)) return;
    try {
        const result = await invoke('execute_bot_action', { action: 'deleteRole', params: JSON.stringify({ id }) });
        const r = JSON.parse(result);
        if (r.success) { showToast(`"${name}" deleted`, 'success'); loadManagementData(); }
        else showToast('Error: ' + r.error, 'error');
    } catch (e) { showToast('Error: ' + e, 'error'); }
}

function refreshChannels() { loadManagementData(); }
function refreshRoles() { loadManagementData(); }
function refreshMembers() { loadManagementData(); }

// ==================== TICKET MANAGEMENT ====================
async function refreshTickets() {
    const container = document.getElementById('tickets-list');
    if (!container) return;
    
    container.innerHTML = '<p class="placeholder-text">Loading tickets...</p>';
    
    try {
        // Get tickets from LOCAL bot
        const result = await invoke('execute_bot_action', {
            action: 'getTickets',
            params: '{}'
        });
        const data = JSON.parse(result);
        
        if (data.success && data.tickets && data.tickets.length > 0) {
            managementData.tickets = data.tickets;
            renderTicketsManagement(data.tickets);
        } else {
            container.innerHTML = '<p class="placeholder-text">No open tickets</p>';
        }
    } catch (e) {
        console.error('Ticket error:', e);
        container.innerHTML = '<p class="placeholder-text">Could not load tickets</p>';
    }
}

function openTicketChannel(ticketId) {
    showToast('Opening ticket in Discord...', 'info');
    if (window.__TAURI__?.shell?.open) {
        // Open in Discord app or browser
        window.__TAURI__.shell.open(`discord://discord.com/channels/@me/${ticketId}`);
    }
}

async function closeTicket(ticketId) {
    if (!confirm('Close this ticket?')) return;
    
    try {
        const result = await invoke('execute_bot_action', {
            action: 'closeTicket',
            params: JSON.stringify({ ticketId })
        });
        const data = JSON.parse(result);
        
        if (data.success) {
            showToast('Ticket closed', 'success');
            refreshTickets();
        } else {
            showToast('Failed to close ticket: ' + (data.error || ''), 'error');
        }
    } catch (e) {
        showToast('Error: ' + e.message, 'error');
    }
}

async function closeAllTickets() {
    if (!confirm('Close ALL open tickets?')) return;
    
    try {
        const result = await invoke('execute_bot_action', {
            action: 'closeAllTickets',
            params: '{}'
        });
        const data = JSON.parse(result);
        
        if (data.success) {
            showToast(`${data.closed || 0} tickets closed`, 'success');
            refreshTickets();
        } else {
            showToast('Failed to close tickets', 'error');
        }
    } catch (e) {
        showToast('Error: ' + e.message, 'error');
    }
}

// ==================== MODALS ====================
function initModals() {
    document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'modal-overlay') closeModal();
    });
}

function openModal(title, content) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-content').innerHTML = content;
    document.getElementById('modal-overlay').classList.add('active');
}

function closeModal() {
    document.getElementById('modal-overlay').classList.remove('active');
}

function showCreateChannelModal() {
    openModal('Create Channel', `
        <div class="modal-form">
            <div class="form-group"><label>Name</label><input type="text" id="new-channel-name" placeholder="general"></div>
            <div class="form-group"><label>Type</label><select id="new-channel-type"><option value="text">💬 Text</option><option value="voice">🔊 Voice</option></select></div>
            <button class="btn btn-primary" onclick="createChannel()">Create</button>
        </div>
    `);
}

function showCreateRoleModal() {
    openModal('Create Role', `
        <div class="modal-form">
            <div class="form-group"><label>Name</label><input type="text" id="new-role-name" placeholder="Member"></div>
            <div class="form-group"><label>Color</label><input type="color" id="new-role-color" value="#FF0000"></div>
            <button class="btn btn-primary" onclick="createRole()">Create</button>
        </div>
    `);
}

async function createChannel() {
    const name = document.getElementById('new-channel-name').value.trim();
    const type = document.getElementById('new-channel-type').value;
    if (!name) return showToast('Name required', 'error');
    
    try {
        const result = await invoke('execute_bot_action', { action: 'createChannel', params: JSON.stringify({ name, type }) });
        const r = JSON.parse(result);
        if (r.success) { showToast(`"${name}" created`, 'success'); closeModal(); loadManagementData(); }
        else showToast('Error: ' + r.error, 'error');
    } catch (e) { showToast('Error: ' + e, 'error'); }
}

async function createRole() {
    const name = document.getElementById('new-role-name').value.trim();
    const color = document.getElementById('new-role-color').value;
    if (!name) return showToast('Name required', 'error');
    
    try {
        const result = await invoke('execute_bot_action', { action: 'createRole', params: JSON.stringify({ name, color }) });
        const r = JSON.parse(result);
        if (r.success) { showToast(`"${name}" created`, 'success'); closeModal(); loadManagementData(); }
        else showToast('Error: ' + r.error, 'error');
    } catch (e) { showToast('Error: ' + e, 'error'); }
}

// ==================== EMBED BUILDER ====================
function initEmbedPreview() {
    ['embed-title', 'embed-description', 'embed-color', 'embed-footer'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', updateEmbedPreview);
    });
}

function updateEmbedPreview() {
    const title = document.getElementById('embed-title')?.value || 'Title';
    const desc = document.getElementById('embed-description')?.value || 'Description';
    const color = document.getElementById('embed-color')?.value || '#FF0033';
    const footer = document.getElementById('embed-footer')?.value || '';
    
    document.getElementById('preview-bar').style.background = color;
    document.getElementById('preview-title').textContent = title;
    document.getElementById('preview-desc').textContent = desc;
    document.getElementById('preview-footer').textContent = footer;
}

async function loadChannelsForEmbed() {
    try {
        const dataStr = await invoke('get_bot_data');
        botData = JSON.parse(dataStr);
        
        // Include text AND announcement (news) channels
        const textChannels = botData.channels?.filter(c => c.type === 'text' || c.type === 'announcement') || [];
        const options = textChannels.map(c => {
            const prefix = c.type === 'announcement' ? '📢' : '#';
            return `<option value="${c.id}">${prefix} ${escapeHtml(c.name)}</option>`;
        }).join('');
        
        ['embed-channel', 'quick-channel', 'schedule-channel'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '<option value="">Select channel...</option>' + options;
        });
        
        // Set default date/time
        const now = new Date();
        now.setHours(now.getHours() + 1);
        const dateEl = document.getElementById('schedule-date');
        const timeEl = document.getElementById('schedule-time');
        if (dateEl) dateEl.value = now.toISOString().split('T')[0];
        if (timeEl) timeEl.value = now.toTimeString().slice(0, 5);
        
        // Load scheduled messages
        await loadScheduledMessages();
    } catch (e) {}
}

async function loadScheduledMessages() {
    try {
        const result = await invoke('execute_bot_action', { action: 'getScheduledMessages', params: '{}' });
        const data = JSON.parse(result);
        const container = document.getElementById('scheduled-list');
        
        if (data.success && data.messages?.length > 0) {
            container.innerHTML = data.messages.map(m => `
                <div class="scheduled-item">
                    <div class="scheduled-info">
                        <strong>#${escapeHtml(m.channelName)}</strong>
                        <span class="scheduled-meta">${m.content.substring(0, 50)}${m.content.length > 50 ? '...' : ''}</span>
                        <span class="scheduled-time">📅 ${new Date(m.scheduledFor).toLocaleString()} ${m.repeat ? '(Daily)' : ''}</span>
                    </div>
                    <button class="btn btn-sm btn-danger" onclick="cancelScheduledMessage('${m.id}')">Cancel</button>
                </div>
            `).join('');
        } else {
            container.innerHTML = '<p class="placeholder-text">No scheduled messages</p>';
        }
    } catch (e) {
        console.error('Error loading scheduled messages:', e);
    }
}

async function scheduleMessage() {
    const channelId = document.getElementById('schedule-channel').value;
    const content = document.getElementById('schedule-message').value.trim();
    const date = document.getElementById('schedule-date').value;
    const time = document.getElementById('schedule-time').value;
    const repeat = document.getElementById('schedule-repeat').checked;
    
    if (!channelId) return showToast('Select a channel', 'error');
    if (!content) return showToast('Enter a message', 'error');
    if (!date || !time) return showToast('Set date and time', 'error');
    
    const scheduledFor = new Date(`${date}T${time}`).getTime();
    if (scheduledFor < Date.now()) return showToast('Cannot schedule in the past', 'error');
    
    try {
        const result = await invoke('execute_bot_action', {
            action: 'scheduleMessage',
            params: JSON.stringify({ channelId, content, scheduledFor, repeat })
        });
        const data = JSON.parse(result);
        if (data.success) {
            showToast('Message scheduled!', 'success');
            document.getElementById('schedule-message').value = '';
            await loadScheduledMessages();
        } else {
            showToast('Error: ' + data.error, 'error');
        }
    } catch (e) {
        showToast('Error scheduling message', 'error');
    }
}

async function cancelScheduledMessage(id) {
    try {
        const result = await invoke('execute_bot_action', {
            action: 'cancelScheduledMessage',
            params: JSON.stringify({ id })
        });
        const data = JSON.parse(result);
        if (data.success) {
            showToast('Scheduled message cancelled', 'success');
            await loadScheduledMessages();
        } else {
            showToast('Error: ' + data.error, 'error');
        }
    } catch (e) {
        showToast('Error cancelling message', 'error');
    }
}

async function sendEmbed() {
    const channelId = document.getElementById('embed-channel').value;
    const title = document.getElementById('embed-title').value.trim();
    const description = document.getElementById('embed-description').value.trim();
    const color = document.getElementById('embed-color').value;
    const footer = document.getElementById('embed-footer').value.trim();
    const thumbnail = document.getElementById('embed-thumbnail').value.trim();
    const image = document.getElementById('embed-image').value.trim();
    
    if (!channelId) return showToast('Select a channel', 'error');
    if (!title && !description) return showToast('Title or description required', 'error');
    
    try {
        const result = await invoke('execute_bot_action', {
            action: 'sendEmbed',
            params: JSON.stringify({ channelId, title, description, color, footer, thumbnail, image })
        });
        const r = JSON.parse(result);
        if (r.success) showToast('Embed sent!', 'success');
        else showToast('Error: ' + r.error, 'error');
    } catch (e) { showToast('Error: ' + e, 'error'); }
}

async function sendQuickMessage() {
    const channelId = document.getElementById('quick-channel').value;
    const content = document.getElementById('quick-message').value.trim();
    
    if (!channelId) return showToast('Select a channel', 'error');
    if (!content) return showToast('Enter a message', 'error');
    
    try {
        const result = await invoke('execute_bot_action', {
            action: 'sendMessage',
            params: JSON.stringify({ channelId, content })
        });
        const r = JSON.parse(result);
        if (r.success) {
            showToast('Message sent!', 'success');
            document.getElementById('quick-message').value = '';
        } else showToast('Error: ' + r.error, 'error');
    } catch (e) { showToast('Error: ' + e, 'error'); }
}

// ==================== SETTINGS ====================
async function loadSettings() {
    try {
        const dataStr = await invoke('get_bot_data');
        botData = JSON.parse(dataStr);
        const settings = botData.settings || {};
        
        // AutoMod
        document.getElementById('setting-automod-enabled').checked = settings.automod?.enabled || false;
        document.getElementById('setting-automod-spam').checked = settings.automod?.antiSpam !== false;
        document.getElementById('setting-automod-badwords').checked = settings.automod?.antiBadWords !== false;
        document.getElementById('setting-automod-links').checked = settings.automod?.antiLinks || false;
        
        // Welcome
        document.getElementById('setting-welcome-enabled').checked = settings.welcome?.enabled || false;
        document.getElementById('setting-goodbye-enabled').checked = settings.goodbye?.enabled || false;
        
        // Leveling
        document.getElementById('setting-leveling-enabled').checked = settings.leveling?.enabled || false;
        document.getElementById('setting-leveling-xp').value = settings.leveling?.xpPerMessage || 15;
        
        // Populate channel/role selects (include text AND announcement channels)
        const textChannels = botData.channels?.filter(c => c.type === 'text' || c.type === 'announcement') || [];
        const roles = botData.roles || [];
        
        const channelOptions = '<option value="">Select channel...</option>' + textChannels.map(c => {
            const prefix = c.type === 'announcement' ? '📢' : '#';
            return `<option value="${c.id}">${prefix} ${escapeHtml(c.name)}</option>`;
        }).join('');
        const roleOptions = '<option value="">None</option>' + roles.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
        
        ['setting-welcome-channel', 'setting-leveling-channel', 'setting-goodbye-channel'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = channelOptions;
        });
        
        document.getElementById('setting-welcome-role').innerHTML = roleOptions;
        
        // Set current values
        if (settings.welcome?.channelId) document.getElementById('setting-welcome-channel').value = settings.welcome.channelId;
        if (settings.welcome?.autoRoleId) document.getElementById('setting-welcome-role').value = settings.welcome.autoRoleId;
        if (settings.leveling?.announceChannel) document.getElementById('setting-leveling-channel').value = settings.leveling.announceChannel;
        if (settings.goodbye?.channelId) document.getElementById('setting-goodbye-channel').value = settings.goodbye.channelId;
        
    } catch (e) {
        console.log('Settings:', e);
    }
}

async function updateSetting(category, key, value) {
    try {
        const params = {};
        params[category] = {};
        params[category][key] = value;
        
        const result = await invoke('execute_bot_action', {
            action: 'updateSettings',
            params: JSON.stringify(params)
        });
        const r = JSON.parse(result);
        if (r.success) {
            showToast('Setting saved', 'success');
            loadDashboard();
        } else {
            showToast('Error: ' + r.error, 'error');
        }
    } catch (e) {
        showToast('Error: ' + e, 'error');
    }
}

// ==================== DATA MANAGEMENT ====================
async function clearAllData() {
    if (!confirm('Alle gespeicherten Daten löschen?\n\nDas löscht:\n- Bot Token\n- Konfiguration\n- Einstellungen\n- Logs\n\nDer Bot wird gestoppt.')) {
        return;
    }
    
    try {
        // Erst Bot stoppen
        try {
            await invoke('stop_bot');
        } catch (e) {}
        
        // Daten löschen
        const result = await invoke('clear_all_data');
        showToast(result, 'success');
        
        // Logout
        localStorage.clear();
        
        // Felder leeren
        document.getElementById('bot-token').value = '';
        document.getElementById('client-id').value = '';
        document.getElementById('guild-id').value = '';
        
        // Neu laden
        setTimeout(() => window.location.reload(), 1000);
    } catch (e) {
        showToast('Fehler: ' + e, 'error');
    }
}

async function showConfigLocation() {
    try {
        const location = await invoke('get_config_location');
        showToast('Speicherort: ' + location, 'info');
    } catch (e) {
        showToast('Fehler: ' + e, 'error');
    }
}

// ==================== ANALYTICS ====================
async function loadAnalyticsData() {
    // Get data from LOCAL bot
    try {
        const dataStr = await invoke('get_bot_data');
        botData = JSON.parse(dataStr);
    } catch (e) {
        console.log('Analytics: Could not get bot data', e.message);
    }
    
    if (!botData) return;
    
    try {
        document.getElementById('member-count').textContent = botData.stats?.totalMembers || '-';
        document.getElementById('channel-count').textContent = botData.stats?.totalChannels || '-';
        document.getElementById('role-count').textContent = botData.stats?.totalRoles || '-';
        document.getElementById('online-count').textContent = botData.stats?.online || '-';
        
        document.getElementById('server-info').innerHTML = `
            <div class="server-details">
                <div class="server-header">
                    ${botData.guild?.icon ? `<img src="${botData.guild.icon}" class="server-icon">` : '<div class="server-icon-placeholder">🏠</div>'}
                    <div class="server-name-info"><h3>${escapeHtml(botData.guild?.name || 'Server')}</h3><span class="server-id">${botData.guild?.id || '-'}</span></div>
                </div>
                <div class="stats-grid">
                    <div class="stat-item"><span class="stat-icon">👥</span><div class="stat-info"><span class="stat-value">${botData.stats?.totalMembers || 0}</span><span class="stat-label">Members</span></div></div>
                    <div class="stat-item"><span class="stat-icon">🟢</span><div class="stat-info"><span class="stat-value">${botData.stats?.online || 0}</span><span class="stat-label">Online</span></div></div>
                    <div class="stat-item"><span class="stat-icon">💬</span><div class="stat-info"><span class="stat-value">${botData.stats?.textChannels || 0}</span><span class="stat-label">Text</span></div></div>
                    <div class="stat-item"><span class="stat-icon">🔊</span><div class="stat-info"><span class="stat-value">${botData.stats?.voiceChannels || 0}</span><span class="stat-label">Voice</span></div></div>
                    <div class="stat-item"><span class="stat-icon">🎭</span><div class="stat-info"><span class="stat-value">${botData.stats?.totalRoles || 0}</span><span class="stat-label">Roles</span></div></div>
                    <div class="stat-item"><span class="stat-icon">🎫</span><div class="stat-info"><span class="stat-value">${botData.stats?.openTickets || 0}</span><span class="stat-label">Tickets</span></div></div>
                    <div class="stat-item"><span class="stat-icon">🎉</span><div class="stat-info"><span class="stat-value">${botData.stats?.activeGiveaways || 0}</span><span class="stat-label">Giveaways</span></div></div>
                    <div class="stat-item"><span class="stat-icon">⚡</span><div class="stat-info"><span class="stat-value">${botData.bot?.ping || '-'}ms</span><span class="stat-label">Ping</span></div></div>
                </div>
            </div>
        `;
        
        // Load additional stats
        await loadMessageStats();
        await loadTopUsers();
        await loadVoiceStats();
    } catch (e) {
        document.getElementById('member-count').textContent = '-';
        document.getElementById('channel-count').textContent = '-';
        document.getElementById('role-count').textContent = '-';
        document.getElementById('online-count').textContent = '-';
        document.getElementById('server-info').innerHTML = '<p class="placeholder-text">Bot not connected.</p>';
    }
}

async function loadMessageStats() {
    try {
        const result = await invoke('execute_bot_action', { action: 'getMessageStats', params: '{}' });
        const data = JSON.parse(result);
        if (data.success) {
            document.getElementById('msg-today').textContent = data.today || 0;
            document.getElementById('msg-week').textContent = data.week || 0;
            
            const maxMessages = Math.max(data.today || 0, data.week || 0, 1);
            document.getElementById('msg-today-bar').style.width = ((data.today || 0) / maxMessages * 100) + '%';
            document.getElementById('msg-week-bar').style.width = ((data.week || 0) / maxMessages * 100) + '%';
        }
    } catch (e) {
        console.error('Error loading message stats:', e);
    }
}

async function loadTopUsers() {
    try {
        const result = await invoke('execute_bot_action', { action: 'getTopUsers', params: '{}' });
        const data = JSON.parse(result);
        const container = document.getElementById('top-users');
        
        if (data.success && data.users?.length > 0) {
            container.innerHTML = data.users.slice(0, 10).map((u, i) => `
                <div class="top-user-item">
                    <span class="top-user-rank">#${i + 1}</span>
                    <span class="top-user-name">${escapeHtml(u.username)}</span>
                    <span class="top-user-xp">${u.xp} XP (Lvl ${u.level})</span>
                </div>
            `).join('');
        } else {
            container.innerHTML = '<p class="placeholder-text">No leveling data</p>';
        }
    } catch (e) {
        console.error('Error loading top users:', e);
    }
}

async function loadVoiceStats() {
    try {
        const result = await invoke('execute_bot_action', { action: 'getVoiceStats', params: '{}' });
        const data = JSON.parse(result);
        if (data.success) {
            document.getElementById('voice-users').textContent = data.usersInVoice || 0;
            document.getElementById('voice-channels').textContent = data.activeChannels || 0;
        }
    } catch (e) {
        console.error('Error loading voice stats:', e);
    }
}

// ==================== TOAST ====================
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.innerHTML = '<span>' + escapeHtml(message) + '</span>';
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ==================== UTILITY ====================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatUptime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const seconds = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const minutes = totalMinutes % 60;
    const totalHours = Math.floor(totalMinutes / 60);
    const hours = totalHours % 24;
    const days = Math.floor(totalHours / 24);
    
    if (days > 0) {
        return `${days}d ${hours}h ${minutes}m ${seconds}s`;
    }
    if (hours > 0) {
        return `${hours}h ${minutes}m ${seconds}s`;
    }
    if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

// ==================== GIVEAWAYS ====================
async function loadGiveawaysPage() {
    try {
        const dataStr = await invoke('get_bot_data');
        botData = JSON.parse(dataStr);
        
        // Populate channel dropdown
        const textChannels = botData.channels?.filter(c => c.type === 'text' || c.type === 'announcement') || [];
        const channelOptions = textChannels.map(c => `<option value="${c.id}"># ${escapeHtml(c.name)}</option>`).join('');
        const channelEl = document.getElementById('giveaway-channel');
        if (channelEl) channelEl.innerHTML = '<option value="">Select channel...</option>' + channelOptions;
        
        // Populate role dropdown
        const roles = botData.roles || [];
        const roleOptions = roles.filter(r => r.name !== '@everyone').map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
        const roleEl = document.getElementById('giveaway-role');
        if (roleEl) roleEl.innerHTML = '<option value="">No requirement</option>' + roleOptions;
        
        // Load active giveaways
        await loadActiveGiveaways();
    } catch (e) {
        console.error('Error loading giveaways page:', e);
    }
}

async function loadActiveGiveaways() {
    try {
        const result = await invoke('execute_bot_action', { action: 'getGiveaways', params: '{}' });
        const data = JSON.parse(result);
        const container = document.getElementById('active-giveaways');
        
        if (data.success && data.giveaways?.length > 0) {
            container.innerHTML = data.giveaways.map(g => `
                <div class="giveaway-item">
                    <div class="giveaway-info">
                        <strong>🎁 ${escapeHtml(g.prize)}</strong>
                        <span class="giveaway-meta">Channel: #${escapeHtml(g.channelName)} • Winners: ${g.winners} • Ends: ${new Date(g.endsAt).toLocaleString()}</span>
                    </div>
                    <div class="giveaway-actions">
                        <button class="btn btn-sm btn-danger" onclick="endGiveaway('${g.messageId}')">End Now</button>
                    </div>
                </div>
            `).join('');
        } else {
            container.innerHTML = '<p class="placeholder-text">No active giveaways</p>';
        }
    } catch (e) {
        console.error('Error loading giveaways:', e);
    }
}

async function createGiveaway() {
    const channelId = document.getElementById('giveaway-channel').value;
    const prize = document.getElementById('giveaway-prize').value.trim();
    const duration = parseInt(document.getElementById('giveaway-duration').value);
    const winners = parseInt(document.getElementById('giveaway-winners').value);
    const description = document.getElementById('giveaway-description')?.value.trim() || '';
    const requiredRole = document.getElementById('giveaway-role')?.value || '';
    const color = document.getElementById('giveaway-color')?.value || '#FF0000';
    const image = document.getElementById('giveaway-image')?.value.trim() || '';
    const host = document.getElementById('giveaway-host')?.value.trim() || '';
    
    if (!channelId) return showToast('Select a channel', 'error');
    if (!prize) return showToast('Enter a prize', 'error');
    
    try {
        const result = await invoke('execute_bot_action', {
            action: 'createGiveaway',
            params: JSON.stringify({ 
                channelId, prize, duration, winners,
                description, requiredRole, color, image, host
            })
        });
        const data = JSON.parse(result);
        if (data.success) {
            showToast('Giveaway started!', 'success');
            document.getElementById('giveaway-prize').value = '';
            document.getElementById('giveaway-description').value = '';
            document.getElementById('giveaway-image').value = '';
            document.getElementById('giveaway-host').value = '';
            await loadActiveGiveaways();
        } else {
            showToast('Error: ' + data.error, 'error');
        }
    } catch (e) {
        showToast('Error creating giveaway', 'error');
    }
}

async function endGiveaway(messageId) {
    try {
        const result = await invoke('execute_bot_action', {
            action: 'endGiveaway',
            params: JSON.stringify({ messageId })
        });
        const data = JSON.parse(result);
        if (data.success) {
            showToast('Giveaway ended! Winner: ' + (data.winner || 'No participants'), 'success');
            await loadActiveGiveaways();
        } else {
            showToast('Error: ' + data.error, 'error');
        }
    } catch (e) {
        showToast('Error ending giveaway', 'error');
    }
}

// ==================== REACTION ROLES ====================
async function loadReactionRolesPage() {
    try {
        const dataStr = await invoke('get_bot_data');
        botData = JSON.parse(dataStr);
        
        // Populate channel dropdown
        const textChannels = botData.channels?.filter(c => c.type === 'text' || c.type === 'announcement') || [];
        const channelOptions = textChannels.map(c => `<option value="${c.id}"># ${escapeHtml(c.name)}</option>`).join('');
        const el = document.getElementById('rr-channel');
        if (el) el.innerHTML = '<option value="">Select channel...</option>' + channelOptions;
        
        // Populate role dropdowns
        populateReactionRoleDropdowns();
        
        // Load active reaction roles
        await loadActiveReactionRoles();
    } catch (e) {
        console.error('Error loading reaction roles page:', e);
    }
}

function populateReactionRoleDropdowns() {
    const roles = botData.roles || [];
    const roleOptions = '<option value="">Select role...</option>' + roles.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
    document.querySelectorAll('.rr-role').forEach(select => {
        const currentValue = select.value;
        select.innerHTML = roleOptions;
        if (currentValue) select.value = currentValue;
    });
}

function addReactionRoleRow() {
    const container = document.getElementById('rr-roles-container');
    const roles = botData.roles || [];
    const roleOptions = '<option value="">Select role...</option>' + roles.filter(r => r.name !== '@everyone').map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
    
    const row = document.createElement('div');
    row.className = 'rr-role-row';
    row.innerHTML = `
        <input type="text" class="form-control rr-emoji" placeholder="Emoji (e.g. 🎮)">
        <select class="form-control rr-role">${roleOptions}</select>
        <input type="text" class="form-control rr-label" placeholder="Label (optional)">
        <button class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">✕</button>
    `;
    container.appendChild(row);
}

async function loadActiveReactionRoles() {
    try {
        const result = await invoke('execute_bot_action', { action: 'getReactionRoles', params: '{}' });
        const data = JSON.parse(result);
        const container = document.getElementById('active-reaction-roles');
        
        if (data.success && data.reactionRoles?.length > 0) {
            container.innerHTML = data.reactionRoles.map(rr => `
                <div class="rr-item">
                    <div class="rr-info">
                        <strong>📨 Message ID: ${rr.messageId}</strong>
                        <span class="rr-meta">Channel: #${escapeHtml(rr.channelName)} • ${rr.roles?.length || 0} roles</span>
                    </div>
                    <div class="rr-actions">
                        <button class="btn btn-sm btn-danger" onclick="deleteReactionRole('${rr.messageId}')">Delete</button>
                    </div>
                </div>
            `).join('');
        } else {
            container.innerHTML = '<p class="placeholder-text">No reaction role messages</p>';
        }
    } catch (e) {
        console.error('Error loading reaction roles:', e);
    }
}

async function createReactionRole() {
    const channelId = document.getElementById('rr-channel').value;
    const title = document.getElementById('rr-title').value.trim() || 'Role Selection';
    const description = document.getElementById('rr-description').value.trim() || 'React to get a role!';
    
    const roles = [];
    document.querySelectorAll('.rr-role-row').forEach(row => {
        const emoji = row.querySelector('.rr-emoji').value.trim();
        const roleId = row.querySelector('.rr-role').value;
        if (emoji && roleId) {
            roles.push({ emoji, roleId });
        }
    });
    
    if (!channelId) return showToast('Select a channel', 'error');
    if (roles.length === 0) return showToast('Add at least one role', 'error');
    
    try {
        const result = await invoke('execute_bot_action', {
            action: 'createReactionRole',
            params: JSON.stringify({ channelId, title, description, roles })
        });
        const data = JSON.parse(result);
        if (data.success) {
            showToast('Reaction role message created!', 'success');
            await loadActiveReactionRoles();
        } else {
            showToast('Error: ' + data.error, 'error');
        }
    } catch (e) {
        showToast('Error creating reaction role', 'error');
    }
}

async function deleteReactionRole(messageId) {
    try {
        const result = await invoke('execute_bot_action', {
            action: 'deleteReactionRole',
            params: JSON.stringify({ messageId })
        });
        const data = JSON.parse(result);
        if (data.success) {
            showToast('Reaction role deleted', 'success');
            await loadActiveReactionRoles();
        } else {
            showToast('Error: ' + data.error, 'error');
        }
    } catch (e) {
        showToast('Error deleting reaction role', 'error');
    }
}

// ==================== WEBHOOKS ====================
async function loadWebhooksPage() {
    try {
        const dataStr = await invoke('get_bot_data');
        botData = JSON.parse(dataStr);
        
        // Populate channel dropdown
        const textChannels = botData.channels?.filter(c => c.type === 'text' || c.type === 'announcement') || [];
        const options = textChannels.map(c => `<option value="${c.id}"># ${escapeHtml(c.name)}</option>`).join('');
        const el = document.getElementById('webhook-channel');
        if (el) el.innerHTML = '<option value="">Select channel...</option>' + options;
    } catch (e) {
        console.error('Error loading webhooks page:', e);
    }
}

async function createWebhook() {
    const channelId = document.getElementById('webhook-channel').value;
    const name = document.getElementById('webhook-name').value.trim();
    const avatar = document.getElementById('webhook-avatar').value.trim();
    
    if (!channelId) return showToast('Select a channel', 'error');
    if (!name) return showToast('Enter a webhook name', 'error');
    
    try {
        const result = await invoke('execute_bot_action', {
            action: 'createWebhook',
            params: JSON.stringify({ channelId, name, avatar })
        });
        const data = JSON.parse(result);
        if (data.success) {
            showToast('Webhook created!', 'success');
            showModal('Webhook URL', `<p>Your webhook URL:</p><input type="text" class="form-control" value="${data.url}" readonly onclick="this.select()">`);
            document.getElementById('webhook-name').value = '';
            document.getElementById('webhook-avatar').value = '';
            await loadWebhooks();
        } else {
            showToast('Error: ' + data.error, 'error');
        }
    } catch (e) {
        showToast('Error creating webhook', 'error');
    }
}

async function sendWebhookMessage() {
    const url = document.getElementById('webhook-url').value.trim();
    const message = document.getElementById('webhook-message').value.trim();
    const username = document.getElementById('webhook-username').value.trim();
    
    if (!url) return showToast('Enter webhook URL', 'error');
    if (!message) return showToast('Enter a message', 'error');
    
    try {
        const body = { content: message };
        if (username) body.username = username;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        
        if (response.ok) {
            showToast('Message sent!', 'success');
            document.getElementById('webhook-message').value = '';
        } else {
            showToast('Error sending message', 'error');
        }
    } catch (e) {
        showToast('Error: Invalid webhook URL', 'error');
    }
}

async function loadWebhooks() {
    try {
        const result = await invoke('execute_bot_action', { action: 'getWebhooks', params: '{}' });
        const data = JSON.parse(result);
        const container = document.getElementById('webhooks-list');
        
        if (data.success && data.webhooks?.length > 0) {
            container.innerHTML = data.webhooks.map(w => `
                <div class="webhook-item">
                    <img src="${w.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}" class="webhook-avatar" alt="">
                    <div class="webhook-info">
                        <strong>${escapeHtml(w.name)}</strong>
                        <span class="webhook-meta">#${escapeHtml(w.channelName)}</span>
                    </div>
                    <div class="webhook-actions">
                        <button class="btn btn-sm btn-secondary" onclick="copyWebhookUrl('${w.url}')">Copy URL</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteWebhook('${w.id}')">Delete</button>
                    </div>
                </div>
            `).join('');
        } else {
            container.innerHTML = '<p class="placeholder-text">No webhooks found</p>';
        }
    } catch (e) {
        console.error('Error loading webhooks:', e);
    }
}

function copyWebhookUrl(url) {
    navigator.clipboard.writeText(url).then(() => showToast('URL copied!', 'success'));
}

async function deleteWebhook(webhookId) {
    if (!confirm('Delete this webhook?')) return;
    try {
        const result = await invoke('execute_bot_action', {
            action: 'deleteWebhook',
            params: JSON.stringify({ webhookId })
        });
        const data = JSON.parse(result);
        if (data.success) {
            showToast('Webhook deleted', 'success');
            await loadWebhooks();
        } else {
            showToast('Error: ' + data.error, 'error');
        }
    } catch (e) {
        showToast('Error deleting webhook', 'error');
    }
}

// ==================== ALERTS (Twitch/YouTube) ====================
async function loadAlertsPage() {
    try {
        const dataStr = await invoke('get_bot_data');
        botData = JSON.parse(dataStr);
        
        // Populate channel dropdowns
        const textChannels = botData.channels?.filter(c => c.type === 'text' || c.type === 'announcement') || [];
        const options = textChannels.map(c => `<option value="${c.id}"># ${escapeHtml(c.name)}</option>`).join('');
        
        ['twitch-channel', 'youtube-channel'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '<option value="">Select channel...</option>' + options;
        });
        
        await loadActiveAlerts();
    } catch (e) {
        console.error('Error loading alerts page:', e);
    }
}

async function loadActiveAlerts() {
    try {
        const result = await invoke('execute_bot_action', { action: 'getAlerts', params: '{}' });
        const data = JSON.parse(result);
        const container = document.getElementById('active-alerts');
        
        if (data.success && data.alerts?.length > 0) {
            container.innerHTML = data.alerts.map(a => `
                <div class="alert-item ${a.type}">
                    <div class="alert-icon">${a.type === 'twitch' ? '📺' : '🎬'}</div>
                    <div class="alert-info">
                        <strong>${escapeHtml(a.name)}</strong>
                        <span class="alert-meta">${a.type.toUpperCase()} → #${escapeHtml(a.channelName)}</span>
                    </div>
                    <div class="alert-actions">
                        <button class="btn btn-sm btn-danger" onclick="deleteAlert('${a.id}')">Delete</button>
                    </div>
                </div>
            `).join('');
        } else {
            container.innerHTML = '<p class="placeholder-text">No alerts configured</p>';
        }
    } catch (e) {
        console.error('Error loading alerts:', e);
    }
}

async function addTwitchAlert() {
    const username = document.getElementById('twitch-username').value.trim();
    const channelId = document.getElementById('twitch-channel').value;
    const message = document.getElementById('twitch-message').value.trim();
    
    if (!username) return showToast('Enter Twitch username', 'error');
    if (!channelId) return showToast('Select notification channel', 'error');
    
    try {
        const result = await invoke('execute_bot_action', {
            action: 'addTwitchAlert',
            params: JSON.stringify({ username, channelId, message })
        });
        const data = JSON.parse(result);
        if (data.success) {
            showToast('Twitch alert added!', 'success');
            document.getElementById('twitch-username').value = '';
            await loadActiveAlerts();
        } else {
            showToast('Error: ' + data.error, 'error');
        }
    } catch (e) {
        showToast('Error adding alert', 'error');
    }
}

async function addYoutubeAlert() {
    const youtubeChannelId = document.getElementById('youtube-channel-id').value.trim();
    const channelId = document.getElementById('youtube-channel').value;
    const message = document.getElementById('youtube-message').value.trim();
    
    if (!youtubeChannelId) return showToast('Enter YouTube channel ID', 'error');
    if (!channelId) return showToast('Select notification channel', 'error');
    
    try {
        const result = await invoke('execute_bot_action', {
            action: 'addYoutubeAlert',
            params: JSON.stringify({ youtubeChannelId, channelId, message })
        });
        const data = JSON.parse(result);
        if (data.success) {
            showToast('YouTube alert added!', 'success');
            document.getElementById('youtube-channel-id').value = '';
            await loadActiveAlerts();
        } else {
            showToast('Error: ' + data.error, 'error');
        }
    } catch (e) {
        showToast('Error adding alert', 'error');
    }
}

async function deleteAlert(alertId) {
    try {
        const result = await invoke('execute_bot_action', {
            action: 'deleteAlert',
            params: JSON.stringify({ alertId })
        });
        const data = JSON.parse(result);
        if (data.success) {
            showToast('Alert deleted', 'success');
            await loadActiveAlerts();
        } else {
            showToast('Error: ' + data.error, 'error');
        }
    } catch (e) {
        showToast('Error deleting alert', 'error');
    }
}

// ==================== BACKUP ====================
async function loadBackupPage() {
    // Nothing special to load initially
}

async function createBackup() {
    const includeChannels = document.getElementById('backup-channels').checked;
    const includeRoles = document.getElementById('backup-roles').checked;
    const includeSettings = document.getElementById('backup-settings').checked;
    const includeAutomod = document.getElementById('backup-automod').checked;
    
    try {
        const result = await invoke('execute_bot_action', {
            action: 'createBackup',
            params: JSON.stringify({ includeChannels, includeRoles, includeSettings, includeAutomod })
        });
        const data = JSON.parse(result);
        if (data.success) {
            // Download backup as JSON file
            const blob = new Blob([JSON.stringify(data.backup, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `nexus-backup-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showToast('Backup created and downloaded!', 'success');
        } else {
            showToast('Error: ' + data.error, 'error');
        }
    } catch (e) {
        showToast('Error creating backup', 'error');
    }
}

let pendingBackup = null;

function handleBackupFile(input) {
    const file = input.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            pendingBackup = JSON.parse(e.target.result);
            
            // Show preview
            document.getElementById('backup-preview').style.display = 'block';
            document.getElementById('backup-info').innerHTML = `
                <p><strong>Server:</strong> ${escapeHtml(pendingBackup.serverName || 'Unknown')}</p>
                <p><strong>Created:</strong> ${new Date(pendingBackup.createdAt).toLocaleString()}</p>
                <p><strong>Channels:</strong> ${pendingBackup.channels?.length || 0}</p>
                <p><strong>Roles:</strong> ${pendingBackup.roles?.length || 0}</p>
            `;
        } catch (e) {
            showToast('Invalid backup file', 'error');
        }
    };
    reader.readAsText(file);
}

async function restoreBackup() {
    if (!pendingBackup) return showToast('No backup loaded', 'error');
    if (!confirm('This will restore settings from the backup. Continue?')) return;
    
    try {
        const result = await invoke('execute_bot_action', {
            action: 'restoreBackup',
            params: JSON.stringify({ backup: pendingBackup })
        });
        const data = JSON.parse(result);
        if (data.success) {
            showToast('Backup restored!', 'success');
            pendingBackup = null;
            document.getElementById('backup-preview').style.display = 'none';
        } else {
            showToast('Error: ' + data.error, 'error');
        }
    } catch (e) {
        showToast('Error restoring backup', 'error');
    }
}

async function loadAuditLog() {
    try {
        const result = await invoke('execute_bot_action', { action: 'getAuditLog', params: '{}' });
        const data = JSON.parse(result);
        const container = document.getElementById('audit-log');
        
        if (data.success && data.entries?.length > 0) {
            container.innerHTML = data.entries.slice(0, 50).map(e => `
                <div class="audit-entry">
                    <span class="audit-action">${escapeHtml(e.action)}</span>
                    <span class="audit-user">by ${escapeHtml(e.executor)}</span>
                    <span class="audit-target">${escapeHtml(e.target || '')}</span>
                    <span class="audit-time">${new Date(e.createdAt).toLocaleString()}</span>
                </div>
            `).join('');
        } else {
            container.innerHTML = '<p class="placeholder-text">No audit log entries</p>';
        }
    } catch (e) {
        console.error('Error loading audit log:', e);
        document.getElementById('audit-log').innerHTML = '<p class="placeholder-text">Error loading audit log</p>';
    }
}

// ==================== QUICK ACTIONS ====================
async function executeQuickAction(action, target, value = '') {
    try {
        const result = await invoke('execute_quick_action', { action, target, value });
        const data = JSON.parse(result);
        if (data.success) {
            showToast(data.message || 'Action completed!', 'success');
        } else {
            showToast('Error: ' + (data.error || 'Unknown error'), 'error');
        }
        return data;
    } catch (e) {
        showToast('Error: ' + e, 'error');
        return { success: false, error: e };
    }
}

// Quick announce to a channel
async function quickAnnounce() {
    const channels = botData?.channels?.filter(c => c.type === 'text') || [];
    if (channels.length === 0) {
        showToast('No text channels available', 'error');
        return;
    }
    
    const channelOptions = channels.map(c => `<option value="${c.id}">#${escapeHtml(c.name)}</option>`).join('');
    
    showModal('Quick Announce', `
        <div class="form-group">
            <label>Channel</label>
            <select id="quick-announce-channel">${channelOptions}</select>
        </div>
        <div class="form-group">
            <label>Message</label>
            <textarea id="quick-announce-message" rows="4" placeholder="Your announcement..."></textarea>
        </div>
        <button class="btn btn-primary" onclick="sendQuickAnnounce()">Send Announcement</button>
    `);
}

async function sendQuickAnnounce() {
    const channel = document.getElementById('quick-announce-channel').value;
    const message = document.getElementById('quick-announce-message').value;
    if (!message.trim()) return showToast('Please enter a message', 'error');
    
    await executeQuickAction('announce', channel, message);
    closeModal();
}

// Quick DM to a user
async function quickDM(userId, username) {
    showModal(`DM to ${username}`, `
        <div class="form-group">
            <label>Message</label>
            <textarea id="quick-dm-message" rows="4" placeholder="Your message..."></textarea>
        </div>
        <button class="btn btn-primary" onclick="sendQuickDM('${userId}')">Send DM</button>
    `);
}

async function sendQuickDM(userId) {
    const message = document.getElementById('quick-dm-message').value;
    if (!message.trim()) return showToast('Please enter a message', 'error');
    
    await executeQuickAction('dm-user', userId, message);
    closeModal();
}

// Quick timeout
async function quickTimeout(userId, username) {
    showModal(`Timeout ${username}`, `
        <div class="form-group">
            <label>Duration (minutes)</label>
            <select id="quick-timeout-duration">
                <option value="1">1 minute</option>
                <option value="5">5 minutes</option>
                <option value="10">10 minutes</option>
                <option value="30">30 minutes</option>
                <option value="60">1 hour</option>
                <option value="1440">24 hours</option>
            </select>
        </div>
        <button class="btn btn-danger" onclick="sendQuickTimeout('${userId}')">Apply Timeout</button>
    `);
}

async function sendQuickTimeout(userId) {
    const duration = document.getElementById('quick-timeout-duration').value;
    await executeQuickAction('timeout-user', userId, duration);
    closeModal();
}

// Quick role management
async function quickAddRole(userId, username) {
    const roles = botData?.roles || [];
    const roleOptions = roles.map(r => `<option value="${r.id}" style="color:${r.color}">${escapeHtml(r.name)}</option>`).join('');
    
    showModal(`Add Role to ${username}`, `
        <div class="form-group">
            <label>Role</label>
            <select id="quick-role-select">${roleOptions}</select>
        </div>
        <button class="btn btn-primary" onclick="sendQuickAddRole('${userId}')">Add Role</button>
    `);
}

async function sendQuickAddRole(userId) {
    const roleId = document.getElementById('quick-role-select').value;
    await executeQuickAction('add-role', `${userId}:${roleId}`, '');
    closeModal();
    loadManagementData(); // Refresh
}

// ==================== SERVER SWITCHING ====================
async function loadServerSelector() {
    try {
        const result = await invoke('get_bot_servers');
        const data = JSON.parse(result);
        
        if (data.success && data.servers?.length > 0) {
            return data.servers;
        }
    } catch (e) {
        console.error('Error loading servers:', e);
    }
    return [];
}

async function switchServer(guildId) {
    try {
        const result = await invoke('switch_bot_server', { guildId });
        const data = JSON.parse(result);
        
        if (data.success) {
            showToast(`Switched to ${data.server?.name || 'server'}`, 'success');
            
            // Refresh all data
            setTimeout(() => {
                loadDashboard();
                loadConnectedServers();
            }, 500);
        } else {
            showToast('Error: ' + (data.error || 'Unknown error'), 'error');
        }
    } catch (e) {
        showToast('Error switching server: ' + e, 'error');
    }
}

// ==================== BOT CONTROL ====================
async function reloadBotCommands() {
    try {
        const result = await invoke('send_bot_control', { command: 'reload-commands' });
        const data = JSON.parse(result);
        if (data.success) {
            showToast('Commands reloaded!', 'success');
        } else {
            showToast('Error: ' + data.error, 'error');
        }
    } catch (e) {
        showToast('Bot not running', 'error');
    }
}

async function clearBotCache() {
    try {
        const result = await invoke('send_bot_control', { command: 'clear-cache' });
        const data = JSON.parse(result);
        if (data.success) {
            showToast('Cache cleared!', 'success');
            loadDashboard();
        } else {
            showToast('Error: ' + data.error, 'error');
        }
    } catch (e) {
        showToast('Bot not running', 'error');
    }
}

async function reloadBotSettings() {
    try {
        const result = await invoke('send_bot_control', { command: 'reload-settings' });
        const data = JSON.parse(result);
        if (data.success) {
            showToast('Settings reloaded!', 'success');
        } else {
            showToast('Error: ' + data.error, 'error');
        }
    } catch (e) {
        showToast('Bot not running', 'error');
    }
}

async function saveAllBotData() {
    try {
        const result = await invoke('send_bot_control', { command: 'save-all' });
        const data = JSON.parse(result);
        if (data.success) {
            showToast('All data saved!', 'success');
        } else {
            showToast('Error: ' + data.error, 'error');
        }
    } catch (e) {
        showToast('Bot not running', 'error');
    }
}

// ==================== ENHANCED STATUS POLLING ====================
let connectionRetries = 0;
const MAX_RETRIES = 5;

async function checkBotConnection() {
    try {
        const result = await invoke('ping_bot');
        const data = JSON.parse(result);
        connectionRetries = 0;
        return data.online;
    } catch (e) {
        connectionRetries++;
        if (connectionRetries >= MAX_RETRIES) {
            console.warn('Bot connection lost after', MAX_RETRIES, 'retries');
        }
        return false;
    }
}

// Update connection status indicator
function updateConnectionIndicator(connected) {
    const indicator = document.getElementById('connection-indicator');
    if (indicator) {
        indicator.className = 'connection-indicator ' + (connected ? 'connected' : 'disconnected');
        indicator.title = connected ? 'Connected to Bot' : 'Disconnected';
    }
}

// Enhanced status polling with reconnection handling
let lastKnownStatus = null;

async function enhancedStatusPolling() {
    const connected = await checkBotConnection();
    updateConnectionIndicator(connected);
    
    if (connected && !lastKnownStatus) {
        // Just reconnected
        showToast('Bot connected!', 'success');
        loadDashboard();
    } else if (!connected && lastKnownStatus) {
        // Just disconnected
        showToast('Bot connection lost', 'warning');
    }
    
    lastKnownStatus = connected;
}

// Start enhanced polling when app loads
setInterval(enhancedStatusPolling, 5000);

// ==================== INFO PAGE ====================
function generateInfoInviteLink() {
    const clientId = document.getElementById('info-client-id').value.trim();
    if (!clientId) {
        showToast('Please enter your Client ID', 'error');
        return;
    }
    
    const permissions = document.getElementById('info-permission-level').value;
    const url = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=${permissions}&scope=bot%20applications.commands`;
    
    document.getElementById('info-invite-link').value = url;
    document.getElementById('info-invite-result').style.display = 'block';
}

function copyInfoInviteLink() {
    const input = document.getElementById('info-invite-link');
    input.select();
    navigator.clipboard.writeText(input.value);
    showToast('Link copied!', 'success');
}

function openInfoInviteLink() {
    const url = document.getElementById('info-invite-link').value;
    if (url) {
        window.open(url, '_blank');
    }
}

// Pre-fill client ID from config when info page loads
async function loadInfoPage() {
    try {
        const config = await invoke('load_config');
        if (config.client_id) {
            document.getElementById('info-client-id').value = config.client_id;
        }
    } catch (e) {
        // Ignore
    }
}
