// Nexus Discord Tool - Frontend JavaScript v3.0

let statusInterval = null;
let logsInterval = null;
let botData = null;

// Tauri invoke
async function invoke(cmd, args = {}) {
    for (let i = 0; i < 10; i++) {
        if (window.__TAURI__?.core?.invoke) {
            return await window.__TAURI__.core.invoke(cmd, args);
        }
        await new Promise(r => setTimeout(r, 100));
    }
    throw new Error('Tauri API nicht verfügbar');
}

// DOM Ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('Nexus Discord Tool v3.0');
    initNavigation();
    initConfigForm();
    initModals();
    initEmbedPreview();
    
    setTimeout(async () => {
        try {
            await loadConfig();
            startStatusPolling();
            loadDashboard();
        } catch (e) {
            console.log('Init:', e.message);
        }
    }, 500);
});

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
        }
    }
}

// ==================== DASHBOARD ====================
async function loadDashboard() {
    try {
        const status = await invoke('get_bot_status');
        const indicator = document.getElementById('dash-status-indicator');
        const text = document.getElementById('dash-status-text');
        
        if (status.running) {
            indicator?.classList.remove('offline');
            indicator?.classList.add('online');
            if (text) text.textContent = 'Bot Online';
        } else {
            indicator?.classList.remove('online');
            indicator?.classList.add('offline');
            if (text) text.textContent = 'Bot Offline';
        }
        
        // Load bot data
        try {
            const dataStr = await invoke('get_bot_data');
            botData = JSON.parse(dataStr);
            
            document.getElementById('dash-members').textContent = botData.stats?.totalMembers || '-';
            document.getElementById('dash-online').textContent = botData.stats?.online || '-';
            document.getElementById('dash-tickets').textContent = botData.stats?.openTickets || '0';
            document.getElementById('dash-giveaways').textContent = botData.stats?.activeGiveaways || '0';
            document.getElementById('dash-uptime').textContent = 'Uptime: ' + formatUptime(botData.bot?.uptime || 0);
            
            // Features
            const settings = botData.settings || {};
            updateFeatureStatus('feature-automod', settings.automod?.enabled);
            updateFeatureStatus('feature-welcome', settings.welcome?.enabled);
            updateFeatureStatus('feature-leveling', settings.leveling?.enabled);
            
            // Leaderboard
            renderLeaderboard(botData.leaderboard || []);
        } catch (e) {
            document.getElementById('dash-uptime').textContent = 'Uptime: -';
        }
    } catch (e) {
        console.log('Dashboard:', e);
    }
}

function updateFeatureStatus(id, enabled) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = enabled ? 'An' : 'Aus';
        el.className = 'feature-status ' + (enabled ? 'on' : 'off');
    }
}

function renderLeaderboard(data) {
    const container = document.getElementById('dash-leaderboard');
    if (!data.length) {
        container.innerHTML = '<p class="placeholder-text">Noch keine Daten. Aktiviere Leveling!</p>';
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
    
    if (!config.token) return showToast('Bitte Bot Token eingeben', 'error');
    if (!config.client_id) return showToast('Bitte Client ID eingeben', 'error');
    
    try {
        const result = await invoke('save_config', { config });
        showToast(result, 'success');
    } catch (e) {
        showToast('Fehler: ' + e, 'error');
    }
}

async function loadConfig() {
    try {
        const config = await invoke('load_config');
        document.getElementById('token').value = config.token || '';
        document.getElementById('client-id').value = config.client_id || '';
        document.getElementById('guild-id').value = config.guild_id || '';
        document.getElementById('prefix').value = config.prefix || '!';
        if (config.token) showToast('Konfiguration geladen', 'info');
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
    if (!clientId) return showToast('Client ID erforderlich', 'error');
    
    const url = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=8&scope=bot%20applications.commands`;
    document.getElementById('invite-link').value = url;
    document.getElementById('invite-link-container').style.display = 'flex';
}

function copyInviteLink() {
    const input = document.getElementById('invite-link');
    input.select();
    navigator.clipboard.writeText(input.value);
    showToast('Link kopiert', 'success');
}

// ==================== BOT CONTROL ====================
async function startBot() {
    try {
        showToast('Bot wird gestartet...', 'info');
        const result = await invoke('start_bot');
        showToast(result, 'success');
        await updateBotStatus();
        await updateHostingStats();
        setTimeout(loadDashboard, 2000);
    } catch (e) {
        showToast('Fehler: ' + e, 'error');
    }
}

async function stopBot() {
    try {
        const result = await invoke('stop_bot');
        showToast(result, 'success');
        await updateBotStatus();
        botData = null;
        loadDashboard();
    } catch (e) {
        showToast('Fehler: ' + e, 'error');
    }
}

async function restartBot() {
    try {
        showToast('Bot wird neugestartet...', 'info');
        const result = await invoke('restart_bot');
        showToast(result, 'success');
        await updateBotStatus();
        setTimeout(loadDashboard, 2000);
    } catch (e) {
        showToast('Fehler: ' + e, 'error');
    }
}

async function updateBotStatus() {
    try {
        const status = await invoke('get_bot_status');
        const indicator = document.getElementById('status-indicator');
        const title = document.getElementById('status-title');
        const pid = document.getElementById('status-pid');
        
        if (status.running) {
            indicator?.classList.remove('offline');
            indicator?.classList.add('online');
            if (title) title.textContent = 'Bot Status: Online';
            if (pid) pid.textContent = 'PID: ' + status.pid;
        } else {
            indicator?.classList.remove('online');
            indicator?.classList.add('offline');
            if (title) title.textContent = 'Bot Status: Offline';
            if (pid) pid.textContent = 'PID: -';
        }
    } catch (e) {}
}

function startStatusPolling() {
    updateBotStatus();
    statusInterval = setInterval(updateBotStatus, 5000);
}

// ==================== HOSTING ====================
async function updateHostingStats() {
    try {
        const stats = await invoke('get_hosting_stats');
        const indicator = document.getElementById('status-indicator');
        const title = document.getElementById('status-title');
        
        if (stats.running) {
            indicator?.classList.remove('offline');
            indicator?.classList.add('online');
            if (title) title.textContent = 'Bot Status: Online';
        } else {
            indicator?.classList.remove('online');
            indicator?.classList.add('offline');
            if (title) title.textContent = 'Bot Status: Offline';
        }
        
        document.getElementById('uptime').textContent = stats.running ? stats.uptime : '-';
        document.getElementById('last-activity').textContent = stats.start_time || '-';
        
        if (stats.running) {
            try {
                const apiStatus = await invoke('check_bot_api');
                const api = JSON.parse(apiStatus);
                document.getElementById('bot-ping').textContent = api.ping + 'ms';
            } catch (e) {}
        }
    } catch (e) {}
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
            container.innerHTML = '<p class="placeholder-text">Keine Logs vorhanden.</p>';
        }
    } catch (e) {}
}

async function clearLogs() {
    try {
        await invoke('clear_logs');
        document.getElementById('logs-container').innerHTML = '<p class="placeholder-text">Logs gelöscht</p>';
        showToast('Logs gelöscht', 'success');
    } catch (e) {
        showToast('Fehler: ' + e, 'error');
    }
}

function startLogsPolling() {
    stopLogsPolling();
    logsInterval = setInterval(refreshLogs, 3000);
}

function stopLogsPolling() {
    if (logsInterval) {
        clearInterval(logsInterval);
        logsInterval = null;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('log-filter')?.addEventListener('change', refreshLogs);
});

// ==================== MANAGEMENT ====================
async function loadManagementData() {
    const channelsList = document.getElementById('channels-list');
    const rolesList = document.getElementById('roles-list');
    const membersList = document.getElementById('members-list');
    
    channelsList.innerHTML = '<p class="loading-text">Lade...</p>';
    rolesList.innerHTML = '<p class="loading-text">Lade...</p>';
    membersList.innerHTML = '<p class="loading-text">Lade...</p>';
    
    try {
        const dataStr = await invoke('get_bot_data');
        botData = JSON.parse(dataStr);
        
        renderChannels(botData.channels);
        renderRoles(botData.roles);
        renderTicketInfo(botData);
    } catch (e) {
        const err = '<p class="placeholder-text">Bot nicht verbunden.</p>';
        channelsList.innerHTML = err;
        rolesList.innerHTML = err;
        membersList.innerHTML = err;
    }
}

function renderChannels(channels) {
    const container = document.getElementById('channels-list');
    if (!channels?.length) {
        container.innerHTML = '<p class="placeholder-text">Keine Kanäle</p>';
        return;
    }
    
    const text = channels.filter(c => c.type === 'text');
    const voice = channels.filter(c => c.type === 'voice');
    
    let html = '<div class="list-section-title">💬 Text Kanäle</div>';
    text.forEach(c => {
        html += `<div class="list-item"><span class="channel-name"># ${escapeHtml(c.name)}</span>
            <button class="btn-sm btn-danger" onclick="deleteChannel('${c.id}', '${escapeHtml(c.name)}')">Löschen</button></div>`;
    });
    
    html += '<div class="list-section-title" style="margin-top:15px">🔊 Voice Kanäle</div>';
    voice.forEach(c => {
        html += `<div class="list-item"><span class="channel-name">🔊 ${escapeHtml(c.name)}</span>
            <button class="btn-sm btn-danger" onclick="deleteChannel('${c.id}', '${escapeHtml(c.name)}')">Löschen</button></div>`;
    });
    
    container.innerHTML = html;
}

function renderRoles(roles) {
    const container = document.getElementById('roles-list');
    if (!roles?.length) {
        container.innerHTML = '<p class="placeholder-text">Keine Rollen</p>';
        return;
    }
    
    container.innerHTML = roles.slice(0, 15).map(r => `
        <div class="list-item">
            <span class="role-name"><span class="role-color" style="background:${r.color}"></span>${escapeHtml(r.name)} <span class="member-count">(${r.memberCount})</span></span>
            <button class="btn-sm btn-danger" onclick="deleteRole('${r.id}', '${escapeHtml(r.name)}')">Löschen</button>
        </div>
    `).join('');
}

function renderTicketInfo(data) {
    const container = document.getElementById('members-list');
    container.innerHTML = `
        <div class="ticket-stats">
            <div class="stat-box"><span class="stat-number">${data.tickets?.total || 0}</span><span class="stat-label">Tickets Gesamt</span></div>
            <div class="stat-box"><span class="stat-number">${data.stats?.openTickets || 0}</span><span class="stat-label">Offene Tickets</span></div>
            <div class="stat-box"><span class="stat-number">${data.stats?.activeGiveaways || 0}</span><span class="stat-label">Aktive Giveaways</span></div>
        </div>
        <div class="ticket-commands">
            <h4>🎫 Commands</h4>
            <div class="command-list">
                <div class="command-item"><code>/ticket setup</code><span>Panel erstellen</span></div>
                <div class="command-item"><code>/giveaway start</code><span>Giveaway starten</span></div>
                <div class="command-item"><code>/reactionrole</code><span>Reaction Roles</span></div>
            </div>
        </div>
    `;
}

async function deleteChannel(id, name) {
    if (!confirm(`Kanal "${name}" löschen?`)) return;
    try {
        const result = await invoke('execute_bot_action', { action: 'deleteChannel', params: JSON.stringify({ id }) });
        const r = JSON.parse(result);
        if (r.success) { showToast(`"${name}" gelöscht`, 'success'); loadManagementData(); }
        else showToast('Fehler: ' + r.error, 'error');
    } catch (e) { showToast('Fehler: ' + e, 'error'); }
}

async function deleteRole(id, name) {
    if (!confirm(`Rolle "${name}" löschen?`)) return;
    try {
        const result = await invoke('execute_bot_action', { action: 'deleteRole', params: JSON.stringify({ id }) });
        const r = JSON.parse(result);
        if (r.success) { showToast(`"${name}" gelöscht`, 'success'); loadManagementData(); }
        else showToast('Fehler: ' + r.error, 'error');
    } catch (e) { showToast('Fehler: ' + e, 'error'); }
}

function refreshChannels() { loadManagementData(); }
function refreshRoles() { loadManagementData(); }
function refreshMembers() { loadManagementData(); }

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
    openModal('Kanal erstellen', `
        <div class="modal-form">
            <div class="form-group"><label>Name</label><input type="text" id="new-channel-name" placeholder="general"></div>
            <div class="form-group"><label>Typ</label><select id="new-channel-type"><option value="text">💬 Text</option><option value="voice">🔊 Voice</option></select></div>
            <button class="btn btn-primary" onclick="createChannel()">Erstellen</button>
        </div>
    `);
}

function showCreateRoleModal() {
    openModal('Rolle erstellen', `
        <div class="modal-form">
            <div class="form-group"><label>Name</label><input type="text" id="new-role-name" placeholder="Mitglied"></div>
            <div class="form-group"><label>Farbe</label><input type="color" id="new-role-color" value="#FF0000"></div>
            <button class="btn btn-primary" onclick="createRole()">Erstellen</button>
        </div>
    `);
}

async function createChannel() {
    const name = document.getElementById('new-channel-name').value.trim();
    const type = document.getElementById('new-channel-type').value;
    if (!name) return showToast('Name erforderlich', 'error');
    
    try {
        const result = await invoke('execute_bot_action', { action: 'createChannel', params: JSON.stringify({ name, type }) });
        const r = JSON.parse(result);
        if (r.success) { showToast(`"${name}" erstellt`, 'success'); closeModal(); loadManagementData(); }
        else showToast('Fehler: ' + r.error, 'error');
    } catch (e) { showToast('Fehler: ' + e, 'error'); }
}

async function createRole() {
    const name = document.getElementById('new-role-name').value.trim();
    const color = document.getElementById('new-role-color').value;
    if (!name) return showToast('Name erforderlich', 'error');
    
    try {
        const result = await invoke('execute_bot_action', { action: 'createRole', params: JSON.stringify({ name, color }) });
        const r = JSON.parse(result);
        if (r.success) { showToast(`"${name}" erstellt`, 'success'); closeModal(); loadManagementData(); }
        else showToast('Fehler: ' + r.error, 'error');
    } catch (e) { showToast('Fehler: ' + e, 'error'); }
}

// ==================== EMBED BUILDER ====================
function initEmbedPreview() {
    ['embed-title', 'embed-description', 'embed-color', 'embed-footer'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', updateEmbedPreview);
    });
}

function updateEmbedPreview() {
    const title = document.getElementById('embed-title')?.value || 'Titel';
    const desc = document.getElementById('embed-description')?.value || 'Beschreibung';
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
        
        const textChannels = botData.channels?.filter(c => c.type === 'text') || [];
        const options = textChannels.map(c => `<option value="${c.id}"># ${escapeHtml(c.name)}</option>`).join('');
        
        ['embed-channel', 'quick-channel'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '<option value="">Kanal wählen...</option>' + options;
        });
    } catch (e) {}
}

async function sendEmbed() {
    const channelId = document.getElementById('embed-channel').value;
    const title = document.getElementById('embed-title').value.trim();
    const description = document.getElementById('embed-description').value.trim();
    const color = document.getElementById('embed-color').value;
    const footer = document.getElementById('embed-footer').value.trim();
    const thumbnail = document.getElementById('embed-thumbnail').value.trim();
    const image = document.getElementById('embed-image').value.trim();
    
    if (!channelId) return showToast('Kanal wählen', 'error');
    if (!title && !description) return showToast('Titel oder Beschreibung erforderlich', 'error');
    
    try {
        const result = await invoke('execute_bot_action', {
            action: 'sendEmbed',
            params: JSON.stringify({ channelId, title, description, color, footer, thumbnail, image })
        });
        const r = JSON.parse(result);
        if (r.success) showToast('Embed gesendet!', 'success');
        else showToast('Fehler: ' + r.error, 'error');
    } catch (e) { showToast('Fehler: ' + e, 'error'); }
}

async function sendQuickMessage() {
    const channelId = document.getElementById('quick-channel').value;
    const content = document.getElementById('quick-message').value.trim();
    
    if (!channelId) return showToast('Kanal wählen', 'error');
    if (!content) return showToast('Nachricht eingeben', 'error');
    
    try {
        const result = await invoke('execute_bot_action', {
            action: 'sendMessage',
            params: JSON.stringify({ channelId, content })
        });
        const r = JSON.parse(result);
        if (r.success) {
            showToast('Nachricht gesendet!', 'success');
            document.getElementById('quick-message').value = '';
        } else showToast('Fehler: ' + r.error, 'error');
    } catch (e) { showToast('Fehler: ' + e, 'error'); }
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
        
        // Populate channel/role selects
        const textChannels = botData.channels?.filter(c => c.type === 'text') || [];
        const roles = botData.roles || [];
        
        const channelOptions = '<option value="">Kanal wählen...</option>' + textChannels.map(c => `<option value="${c.id}"># ${escapeHtml(c.name)}</option>`).join('');
        const roleOptions = '<option value="">Keine</option>' + roles.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
        
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
            showToast('Einstellung gespeichert', 'success');
            loadDashboard();
        } else {
            showToast('Fehler: ' + r.error, 'error');
        }
    } catch (e) {
        showToast('Fehler: ' + e, 'error');
    }
}

// ==================== ANALYTICS ====================
async function loadAnalyticsData() {
    try {
        const dataStr = await invoke('get_bot_data');
        botData = JSON.parse(dataStr);
        
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
                    <div class="stat-item"><span class="stat-icon">👥</span><div class="stat-info"><span class="stat-value">${botData.stats?.totalMembers || 0}</span><span class="stat-label">Mitglieder</span></div></div>
                    <div class="stat-item"><span class="stat-icon">🟢</span><div class="stat-info"><span class="stat-value">${botData.stats?.online || 0}</span><span class="stat-label">Online</span></div></div>
                    <div class="stat-item"><span class="stat-icon">💬</span><div class="stat-info"><span class="stat-value">${botData.stats?.textChannels || 0}</span><span class="stat-label">Text</span></div></div>
                    <div class="stat-item"><span class="stat-icon">🔊</span><div class="stat-info"><span class="stat-value">${botData.stats?.voiceChannels || 0}</span><span class="stat-label">Voice</span></div></div>
                    <div class="stat-item"><span class="stat-icon">🎭</span><div class="stat-info"><span class="stat-value">${botData.stats?.totalRoles || 0}</span><span class="stat-label">Rollen</span></div></div>
                    <div class="stat-item"><span class="stat-icon">🎫</span><div class="stat-info"><span class="stat-value">${botData.stats?.openTickets || 0}</span><span class="stat-label">Tickets</span></div></div>
                    <div class="stat-item"><span class="stat-icon">🎉</span><div class="stat-info"><span class="stat-value">${botData.stats?.activeGiveaways || 0}</span><span class="stat-label">Giveaways</span></div></div>
                    <div class="stat-item"><span class="stat-icon">⚡</span><div class="stat-info"><span class="stat-value">${botData.bot?.ping || '-'}ms</span><span class="stat-label">Ping</span></div></div>
                </div>
            </div>
        `;
    } catch (e) {
        document.getElementById('member-count').textContent = '-';
        document.getElementById('channel-count').textContent = '-';
        document.getElementById('role-count').textContent = '-';
        document.getElementById('online-count').textContent = '-';
        document.getElementById('server-info').innerHTML = '<p class="placeholder-text">Bot nicht verbunden.</p>';
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
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d}d ${h % 24}h`;
    if (h > 0) return `${h}h ${m % 60}m`;
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
