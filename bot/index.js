/**
 * Nexus Discord Tool - Bot Module v3.0
 * Vollständiger Discord Bot mit allen Features
 */

const { 
    Client, 
    GatewayIntentBits, 
    Partials,
    REST,
    Routes,
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    ChannelType,
    ActivityType,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    AttachmentBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const http = require('http');

// ==================== DATA FILES ====================
const DATA_DIR = __dirname;
const logFile = path.join(DATA_DIR, 'bot.log');
const dataFile = path.join(DATA_DIR, 'bot-data.json');
const ticketsFile = path.join(DATA_DIR, 'tickets.json');
const warnsFile = path.join(DATA_DIR, 'warns.json');
const levelsFile = path.join(DATA_DIR, 'levels.json');
const settingsFile = path.join(DATA_DIR, 'settings.json');
const giveawaysFile = path.join(DATA_DIR, 'giveaways.json');
const reactionRolesFile = path.join(DATA_DIR, 'reaction-roles.json');

// ==================== DATA STORES ====================
const botStartTime = Date.now();
let ticketData = { counter: 0, tickets: {}, settings: {} };
let warnData = {};
let levelData = {};
let settingsData = {};
let giveawayData = {};
let reactionRoleData = {};

// Default Settings
const DEFAULT_SETTINGS = {
    automod: {
        enabled: false,
        antiSpam: true,
        antiBadWords: true,
        antiLinks: false,
        badWords: ['fuck', 'shit', 'bitch', 'asshole', 'nigger', 'nazi'],
        spamThreshold: 5,
        spamInterval: 5000,
        warnOnViolation: true,
        muteOnViolation: false,
        muteDuration: 300000
    },
    welcome: {
        enabled: false,
        channelId: null,
        message: 'Willkommen {user} auf {server}! Du bist Mitglied #{memberCount}.',
        autoRoleId: null,
        dmMessage: null
    },
    goodbye: {
        enabled: false,
        channelId: null,
        message: '{user} hat den Server verlassen. Wir sind jetzt {memberCount} Mitglieder.'
    },
    leveling: {
        enabled: false,
        xpPerMessage: 15,
        xpCooldown: 60000,
        announceChannel: null,
        announceMessage: '🎉 {user} ist jetzt Level {level}!',
        roleRewards: {}
    },
    logging: {
        enabled: false,
        channelId: null,
        logMessages: true,
        logMembers: true,
        logModeration: true
    }
};

// Spam Tracking
const spamTracker = new Map();
const xpCooldowns = new Map();

// ==================== LOGGING ====================
function log(level, message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    console.log(logMessage);
    try {
        fs.appendFileSync(logFile, logMessage + '\n');
    } catch (e) {}
}

// ==================== DATA MANAGEMENT ====================
function loadData(file, defaultData = {}) {
    try {
        if (fs.existsSync(file)) {
            return JSON.parse(fs.readFileSync(file, 'utf8'));
        }
    } catch (error) {
        log('error', `Fehler beim Laden von ${file}: ${error.message}`);
    }
    return defaultData;
}

function saveData(file, data) {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
    } catch (error) {
        log('error', `Fehler beim Speichern von ${file}: ${error.message}`);
    }
}

function loadAllData() {
    ticketData = loadData(ticketsFile, { counter: 0, tickets: {}, settings: {} });
    warnData = loadData(warnsFile, {});
    levelData = loadData(levelsFile, {});
    settingsData = loadData(settingsFile, {});
    giveawayData = loadData(giveawaysFile, {});
    reactionRoleData = loadData(reactionRolesFile, {});
}

function getGuildSettings(guildId) {
    if (!settingsData[guildId]) {
        settingsData[guildId] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    }
    return settingsData[guildId];
}

// ==================== CONFIG ====================
function loadConfig() {
    const configPath = path.join(DATA_DIR, 'config.json');
    if (!fs.existsSync(configPath)) {
        log('error', 'config.json nicht gefunden!');
        process.exit(1);
    }
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!config.token) {
        log('error', 'Kein Bot Token in der Konfiguration!');
        process.exit(1);
    }
    return config;
}

const config = loadConfig();
loadAllData();

// ==================== DISCORD CLIENT ====================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions
    ],
    partials: [
        Partials.Channel,
        Partials.Message,
        Partials.Reaction
    ]
});

// ==================== AUTO MODERATION ====================
async function handleAutoMod(message) {
    if (message.author.bot || !message.guild) return false;
    if (message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) return false;

    const settings = getGuildSettings(message.guild.id);
    if (!settings.automod?.enabled) return false;

    let violation = null;
    let reason = '';

    // Anti-Spam Check
    if (settings.automod.antiSpam) {
        const key = `${message.guild.id}-${message.author.id}`;
        const now = Date.now();
        const userSpam = spamTracker.get(key) || [];
        
        // Alte Einträge entfernen
        const recent = userSpam.filter(t => now - t < settings.automod.spamInterval);
        recent.push(now);
        spamTracker.set(key, recent);

        if (recent.length >= settings.automod.spamThreshold) {
            violation = 'spam';
            reason = 'Spam erkannt';
            spamTracker.delete(key);
        }
    }

    // Bad Words Check
    if (!violation && settings.automod.antiBadWords) {
        const content = message.content.toLowerCase();
        const badWord = settings.automod.badWords.find(word => content.includes(word.toLowerCase()));
        if (badWord) {
            violation = 'badword';
            reason = `Verbotenes Wort: ${badWord}`;
        }
    }

    // Anti-Links Check
    if (!violation && settings.automod.antiLinks) {
        const linkRegex = /(https?:\/\/[^\s]+)|(discord\.gg\/[^\s]+)|(www\.[^\s]+)/gi;
        if (linkRegex.test(message.content)) {
            violation = 'link';
            reason = 'Links sind nicht erlaubt';
        }
    }

    if (violation) {
        try {
            await message.delete();
            
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('⚠️ Auto-Moderation')
                .setDescription(`${message.author}, deine Nachricht wurde entfernt.\n**Grund:** ${reason}`)
                .setTimestamp();

            const warnMsg = await message.channel.send({ embeds: [embed] });
            setTimeout(() => warnMsg.delete().catch(() => {}), 5000);

            // Warn bei Verstoß
            if (settings.automod.warnOnViolation) {
                addWarn(message.guild.id, message.author.id, client.user.id, `AutoMod: ${reason}`);
            }

            // Mute bei Verstoß
            if (settings.automod.muteOnViolation) {
                const member = message.member;
                if (member.moderatable) {
                    await member.timeout(settings.automod.muteDuration, `AutoMod: ${reason}`);
                }
            }

            log('info', `AutoMod: ${message.author.tag} - ${reason}`);
            return true;
        } catch (error) {
            log('error', `AutoMod Fehler: ${error.message}`);
        }
    }

    return false;
}

// ==================== WARN SYSTEM ====================
function addWarn(guildId, userId, moderatorId, reason) {
    if (!warnData[guildId]) warnData[guildId] = {};
    if (!warnData[guildId][userId]) warnData[guildId][userId] = [];
    
    warnData[guildId][userId].push({
        id: Date.now().toString(36),
        moderator: moderatorId,
        reason: reason,
        timestamp: Date.now()
    });
    
    saveData(warnsFile, warnData);
    return warnData[guildId][userId].length;
}

function getWarns(guildId, userId) {
    return warnData[guildId]?.[userId] || [];
}

function clearWarns(guildId, userId) {
    if (warnData[guildId]?.[userId]) {
        delete warnData[guildId][userId];
        saveData(warnsFile, warnData);
        return true;
    }
    return false;
}

// ==================== LEVELING SYSTEM ====================
function addXP(guildId, userId, amount) {
    const settings = getGuildSettings(guildId);
    if (!settings.leveling?.enabled) return null;

    if (!levelData[guildId]) levelData[guildId] = {};
    if (!levelData[guildId][userId]) {
        levelData[guildId][userId] = { xp: 0, level: 0, messages: 0 };
    }

    const userData = levelData[guildId][userId];
    userData.xp += amount;
    userData.messages++;

    // Level berechnen (100 XP pro Level, exponentiell)
    const oldLevel = userData.level;
    userData.level = Math.floor(0.1 * Math.sqrt(userData.xp));

    saveData(levelsFile, levelData);

    if (userData.level > oldLevel) {
        return { newLevel: userData.level, oldLevel };
    }
    return null;
}

function getLeaderboard(guildId, limit = 10) {
    const guildLevels = levelData[guildId] || {};
    return Object.entries(guildLevels)
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => b.xp - a.xp)
        .slice(0, limit);
}

function getUserLevel(guildId, userId) {
    return levelData[guildId]?.[userId] || { xp: 0, level: 0, messages: 0 };
}

// ==================== GIVEAWAY SYSTEM ====================
async function createGiveaway(channel, duration, prize, winners, hostId) {
    const endTime = Date.now() + duration;
    
    const embed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('🎉 GIVEAWAY 🎉')
        .setDescription(`**Preis:** ${prize}\n\n**Gewinner:** ${winners}\n**Endet:** <t:${Math.floor(endTime / 1000)}:R>\n**Veranstalter:** <@${hostId}>\n\nReagiere mit 🎉 um teilzunehmen!`)
        .setFooter({ text: 'Nexus Giveaway' })
        .setTimestamp(endTime);

    const message = await channel.send({ embeds: [embed] });
    await message.react('🎉');

    const giveaway = {
        messageId: message.id,
        channelId: channel.id,
        guildId: channel.guild.id,
        prize,
        winners,
        hostId,
        endTime,
        ended: false
    };

    if (!giveawayData[channel.guild.id]) giveawayData[channel.guild.id] = [];
    giveawayData[channel.guild.id].push(giveaway);
    saveData(giveawaysFile, giveawayData);

    log('info', `Giveaway erstellt: ${prize} (${duration}ms)`);
    return giveaway;
}

async function endGiveaway(giveaway) {
    try {
        const guild = client.guilds.cache.get(giveaway.guildId);
        if (!guild) return;

        const channel = guild.channels.cache.get(giveaway.channelId);
        if (!channel) return;

        const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
        if (!message) return;

        const reaction = message.reactions.cache.get('🎉');
        if (!reaction) return;

        const users = await reaction.users.fetch();
        const participants = users.filter(u => !u.bot).map(u => u.id);

        let winnerText = 'Niemand hat teilgenommen!';
        const selectedWinners = [];

        if (participants.length > 0) {
            const shuffled = participants.sort(() => Math.random() - 0.5);
            const winnerCount = Math.min(giveaway.winners, shuffled.length);
            
            for (let i = 0; i < winnerCount; i++) {
                selectedWinners.push(shuffled[i]);
            }
            winnerText = selectedWinners.map(id => `<@${id}>`).join(', ');
        }

        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('🎉 GIVEAWAY BEENDET 🎉')
            .setDescription(`**Preis:** ${giveaway.prize}\n\n**Gewinner:** ${winnerText}\n**Veranstalter:** <@${giveaway.hostId}>`)
            .setFooter({ text: 'Giveaway beendet' })
            .setTimestamp();

        await message.edit({ embeds: [embed] });

        if (selectedWinners.length > 0) {
            await channel.send(`🎉 Herzlichen Glückwunsch ${winnerText}! Du hast **${giveaway.prize}** gewonnen!`);
        }

        giveaway.ended = true;
        saveData(giveawaysFile, giveawayData);
        log('info', `Giveaway beendet: ${giveaway.prize}`);
    } catch (error) {
        log('error', `Giveaway End Error: ${error.message}`);
    }
}

// Giveaway Timer
setInterval(() => {
    const now = Date.now();
    for (const guildId in giveawayData) {
        for (const giveaway of giveawayData[guildId]) {
            if (!giveaway.ended && giveaway.endTime <= now) {
                endGiveaway(giveaway);
            }
        }
    }
}, 10000);

// ==================== REACTION ROLES ====================
async function setupReactionRole(channel, messageContent, roles) {
    const embed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('🎭 Reaction Roles')
        .setDescription(messageContent + '\n\n' + roles.map(r => `${r.emoji} - <@&${r.roleId}>`).join('\n'))
        .setFooter({ text: 'Reagiere um eine Rolle zu erhalten!' });

    const message = await channel.send({ embeds: [embed] });

    for (const role of roles) {
        await message.react(role.emoji);
    }

    if (!reactionRoleData[channel.guild.id]) reactionRoleData[channel.guild.id] = [];
    reactionRoleData[channel.guild.id].push({
        messageId: message.id,
        channelId: channel.id,
        roles: roles
    });
    saveData(reactionRolesFile, reactionRoleData);

    return message;
}

// ==================== WELCOME SYSTEM ====================
async function handleWelcome(member) {
    const settings = getGuildSettings(member.guild.id);
    if (!settings.welcome?.enabled) return;

    // Auto Role
    if (settings.welcome.autoRoleId) {
        try {
            const role = member.guild.roles.cache.get(settings.welcome.autoRoleId);
            if (role) await member.roles.add(role);
        } catch (e) {
            log('error', `Auto-Role Fehler: ${e.message}`);
        }
    }

    // Welcome Message
    if (settings.welcome.channelId && settings.welcome.message) {
        try {
            const channel = member.guild.channels.cache.get(settings.welcome.channelId);
            if (channel) {
                const message = settings.welcome.message
                    .replace(/{user}/g, member.toString())
                    .replace(/{username}/g, member.user.username)
                    .replace(/{server}/g, member.guild.name)
                    .replace(/{memberCount}/g, member.guild.memberCount);

                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('👋 Willkommen!')
                    .setDescription(message)
                    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                    .setTimestamp();

                await channel.send({ embeds: [embed] });
            }
        } catch (e) {
            log('error', `Welcome Message Fehler: ${e.message}`);
        }
    }

    // DM Message
    if (settings.welcome.dmMessage) {
        try {
            const dm = settings.welcome.dmMessage
                .replace(/{user}/g, member.user.username)
                .replace(/{server}/g, member.guild.name);
            await member.send(dm);
        } catch (e) {}
    }

    log('info', `Willkommen: ${member.user.tag} auf ${member.guild.name}`);
}

async function handleGoodbye(member) {
    const settings = getGuildSettings(member.guild.id);
    if (!settings.goodbye?.enabled || !settings.goodbye.channelId) return;

    try {
        const channel = member.guild.channels.cache.get(settings.goodbye.channelId);
        if (channel) {
            const message = settings.goodbye.message
                .replace(/{user}/g, member.user.username)
                .replace(/{server}/g, member.guild.name)
                .replace(/{memberCount}/g, member.guild.memberCount);

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('👋 Auf Wiedersehen!')
                .setDescription(message)
                .setTimestamp();

            await channel.send({ embeds: [embed] });
        }
    } catch (e) {
        log('error', `Goodbye Message Fehler: ${e.message}`);
    }
}

// ==================== HTTP API ====================
const API_PORT = 47832;
let guildDataCache = null;
let lastCacheUpdate = 0;
const CACHE_DURATION = 60000;

async function getGuildData(forceRefresh = false) {
    const guild = client.guilds.cache.get(config.guild_id);
    if (!guild) return null;

    const now = Date.now();
    if (!forceRefresh && guildDataCache && (now - lastCacheUpdate) < CACHE_DURATION) {
        return guildDataCache;
    }

    try {
        const members = guild.members.cache;
        const settings = getGuildSettings(guild.id);
        
        const channels = guild.channels.cache.map(c => ({
            id: c.id,
            name: c.name,
            type: c.type === ChannelType.GuildText ? 'text' : 
                  c.type === ChannelType.GuildVoice ? 'voice' : 
                  c.type === ChannelType.GuildCategory ? 'category' : 'other',
            position: c.position
        })).filter(c => c.type !== 'category');

        const roles = guild.roles.cache
            .filter(r => r.name !== '@everyone')
            .map(r => ({
                id: r.id,
                name: r.name,
                color: r.hexColor,
                memberCount: r.members.size,
                position: r.position
            }))
            .sort((a, b) => b.position - a.position);

        const online = members.filter(m => m.presence?.status === 'online').size;
        const idle = members.filter(m => m.presence?.status === 'idle').size;
        const dnd = members.filter(m => m.presence?.status === 'dnd').size;
        const offline = members.filter(m => !m.presence || m.presence.status === 'offline').size;
        const bots = members.filter(m => m.user.bot).size;

        const textChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).size;
        const voiceChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size;
        const openTickets = Object.values(ticketData.tickets || {}).filter(t => t.status === 'open').length;

        // Giveaways zählen
        const activeGiveaways = (giveawayData[guild.id] || []).filter(g => !g.ended).length;

        // Top Leveling Users
        const leaderboard = getLeaderboard(guild.id, 5);

        guildDataCache = {
            guild: {
                id: guild.id,
                name: guild.name,
                icon: guild.iconURL({ size: 128 }),
                ownerId: guild.ownerId,
                memberCount: guild.memberCount,
                createdAt: guild.createdTimestamp,
                boostLevel: guild.premiumTier,
                boostCount: guild.premiumSubscriptionCount || 0
            },
            channels,
            roles,
            stats: {
                totalMembers: guild.memberCount,
                online, idle, dnd, offline, bots,
                humans: guild.memberCount - bots,
                totalChannels: guild.channels.cache.size,
                textChannels, voiceChannels,
                totalRoles: guild.roles.cache.size - 1,
                emojis: guild.emojis.cache.size,
                openTickets,
                activeGiveaways
            },
            bot: {
                uptime: Date.now() - botStartTime,
                ping: client.ws.ping,
                status: 'online'
            },
            tickets: {
                total: ticketData.counter,
                open: openTickets,
                settings: ticketData.settings[config.guild_id] || {}
            },
            settings: settings,
            leaderboard: leaderboard
        };

        lastCacheUpdate = now;
        return guildDataCache;
    } catch (error) {
        log('error', `Guild Data Error: ${error.message}`);
        return guildDataCache;
    }
}

async function executeAction(action, params) {
    const guild = client.guilds.cache.get(config.guild_id);
    if (!guild) return { success: false, error: 'Guild nicht gefunden' };

    try {
        switch (action) {
            case 'createChannel': {
                const channelType = params.type === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText;
                const channel = await guild.channels.create({
                    name: params.name,
                    type: channelType,
                    reason: 'Erstellt via Nexus Discord Tool'
                });
                guildDataCache = null;
                log('info', `Kanal erstellt: ${channel.name}`);
                return { success: true, channel: { id: channel.id, name: channel.name } };
            }
            
            case 'deleteChannel': {
                const channel = guild.channels.cache.get(params.id);
                if (!channel) return { success: false, error: 'Kanal nicht gefunden' };
                await channel.delete('Gelöscht via Nexus Discord Tool');
                guildDataCache = null;
                log('info', `Kanal gelöscht: ${channel.name}`);
                return { success: true };
            }
            
            case 'createRole': {
                const role = await guild.roles.create({
                    name: params.name,
                    color: params.color || '#FF0000',
                    reason: 'Erstellt via Nexus Discord Tool'
                });
                guildDataCache = null;
                log('info', `Rolle erstellt: ${role.name}`);
                return { success: true, role: { id: role.id, name: role.name } };
            }
            
            case 'deleteRole': {
                const role = guild.roles.cache.get(params.id);
                if (!role) return { success: false, error: 'Rolle nicht gefunden' };
                await role.delete('Gelöscht via Nexus Discord Tool');
                guildDataCache = null;
                log('info', `Rolle gelöscht: ${role.name}`);
                return { success: true };
            }
            
            case 'sendMessage': {
                const channel = guild.channels.cache.get(params.channelId);
                if (!channel || !channel.isTextBased()) return { success: false, error: 'Kanal nicht gefunden' };
                await channel.send(params.content);
                log('info', `Nachricht gesendet in #${channel.name}`);
                return { success: true };
            }

            case 'sendEmbed': {
                const channel = guild.channels.cache.get(params.channelId);
                if (!channel || !channel.isTextBased()) return { success: false, error: 'Kanal nicht gefunden' };
                
                const embed = new EmbedBuilder()
                    .setColor(params.color || '#FF0000')
                    .setTitle(params.title || '')
                    .setDescription(params.description || '')
                    .setTimestamp();
                
                if (params.footer) embed.setFooter({ text: params.footer });
                if (params.thumbnail) embed.setThumbnail(params.thumbnail);
                if (params.image) embed.setImage(params.image);
                
                await channel.send({ embeds: [embed] });
                log('info', `Embed gesendet in #${channel.name}`);
                return { success: true };
            }

            case 'updateSettings': {
                const settings = getGuildSettings(guild.id);
                
                // Deep merge
                for (const key in params) {
                    if (typeof params[key] === 'object' && !Array.isArray(params[key])) {
                        settings[key] = { ...settings[key], ...params[key] };
                    } else {
                        settings[key] = params[key];
                    }
                }
                
                saveData(settingsFile, settingsData);
                log('info', `Einstellungen aktualisiert`);
                return { success: true, settings };
            }

            case 'getWarns': {
                const warns = getWarns(guild.id, params.userId);
                return { success: true, warns };
            }

            case 'clearWarns': {
                clearWarns(guild.id, params.userId);
                return { success: true };
            }

            default:
                return { success: false, error: 'Unbekannte Aktion' };
        }
    } catch (error) {
        log('error', `Action Error: ${error.message}`);
        return { success: false, error: error.message };
    }
}

const apiServer = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const url = new URL(req.url, `http://localhost:${API_PORT}`);

    try {
        if (req.method === 'GET' && url.pathname === '/status') {
            res.writeHead(200);
            res.end(JSON.stringify({ 
                online: client.isReady(), 
                ping: client.ws.ping,
                uptime: Date.now() - botStartTime
            }));
        }
        else if (req.method === 'GET' && url.pathname === '/data') {
            const data = await getGuildData();
            if (data) {
                res.writeHead(200);
                res.end(JSON.stringify(data));
            } else {
                res.writeHead(503);
                res.end(JSON.stringify({ error: 'Bot nicht bereit' }));
            }
        }
        else if (req.method === 'POST' && url.pathname === '/action') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const { action, params } = JSON.parse(body);
                    const result = await executeAction(action, params || {});
                    res.writeHead(result.success ? 200 : 400);
                    res.end(JSON.stringify(result));
                } catch (error) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ success: false, error: 'Ungültige Anfrage' }));
                }
            });
        }
        else {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Nicht gefunden' }));
        }
    } catch (error) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: error.message }));
    }
});

// ==================== SLASH COMMANDS ====================
const commands = [
    // Basic Commands
    new SlashCommandBuilder().setName('ping').setDescription('Zeigt die Bot-Latenz'),
    new SlashCommandBuilder().setName('info').setDescription('Zeigt Bot-Informationen'),
    new SlashCommandBuilder().setName('serverinfo').setDescription('Zeigt Server-Informationen'),
    new SlashCommandBuilder().setName('userinfo').setDescription('Zeigt Benutzer-Informationen')
        .addUserOption(o => o.setName('user').setDescription('Der Benutzer')),
    
    // Moderation
    new SlashCommandBuilder().setName('kick').setDescription('Kickt einen Benutzer')
        .addUserOption(o => o.setName('user').setDescription('Benutzer').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Grund'))
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
    
    new SlashCommandBuilder().setName('ban').setDescription('Bannt einen Benutzer')
        .addUserOption(o => o.setName('user').setDescription('Benutzer').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Grund'))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    
    new SlashCommandBuilder().setName('mute').setDescription('Mutet einen Benutzer')
        .addUserOption(o => o.setName('user').setDescription('Benutzer').setRequired(true))
        .addIntegerOption(o => o.setName('duration').setDescription('Dauer in Minuten').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Grund'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    
    new SlashCommandBuilder().setName('unmute').setDescription('Entmutet einen Benutzer')
        .addUserOption(o => o.setName('user').setDescription('Benutzer').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    
    new SlashCommandBuilder().setName('clear').setDescription('Löscht Nachrichten')
        .addIntegerOption(o => o.setName('amount').setDescription('Anzahl (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    
    // Warn System
    new SlashCommandBuilder().setName('warn').setDescription('Verwarnt einen Benutzer')
        .addUserOption(o => o.setName('user').setDescription('Benutzer').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Grund').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    
    new SlashCommandBuilder().setName('warnings').setDescription('Zeigt Verwarnungen')
        .addUserOption(o => o.setName('user').setDescription('Benutzer').setRequired(true)),
    
    new SlashCommandBuilder().setName('clearwarns').setDescription('Löscht alle Verwarnungen')
        .addUserOption(o => o.setName('user').setDescription('Benutzer').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    
    // Channel Management
    new SlashCommandBuilder().setName('createchannel').setDescription('Erstellt einen Kanal')
        .addStringOption(o => o.setName('name').setDescription('Name').setRequired(true))
        .addStringOption(o => o.setName('type').setDescription('Typ').addChoices({ name: 'Text', value: 'text' }, { name: 'Voice', value: 'voice' }))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    
    new SlashCommandBuilder().setName('createrole').setDescription('Erstellt eine Rolle')
        .addStringOption(o => o.setName('name').setDescription('Name').setRequired(true))
        .addStringOption(o => o.setName('color').setDescription('Farbe (#HEX)'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    
    // Ticket System
    new SlashCommandBuilder().setName('ticket').setDescription('Ticket System')
        .addSubcommand(s => s.setName('setup').setDescription('Richtet das System ein')
            .addChannelOption(o => o.setName('channel').setDescription('Kanal').setRequired(true))
            .addRoleOption(o => o.setName('support_role').setDescription('Support Rolle')))
        .addSubcommand(s => s.setName('close').setDescription('Schließt das Ticket'))
        .addSubcommand(s => s.setName('add').setDescription('Fügt User hinzu')
            .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)))
        .addSubcommand(s => s.setName('remove').setDescription('Entfernt User')
            .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    
    // Leveling
    new SlashCommandBuilder().setName('level').setDescription('Zeigt dein Level'),
    new SlashCommandBuilder().setName('leaderboard').setDescription('Zeigt das Leaderboard'),
    
    // Giveaway
    new SlashCommandBuilder().setName('giveaway').setDescription('Giveaway System')
        .addSubcommand(s => s.setName('start').setDescription('Startet ein Giveaway')
            .addStringOption(o => o.setName('prize').setDescription('Preis').setRequired(true))
            .addStringOption(o => o.setName('duration').setDescription('Dauer (z.B. 1h, 30m, 1d)').setRequired(true))
            .addIntegerOption(o => o.setName('winners').setDescription('Anzahl Gewinner').setMinValue(1).setMaxValue(10)))
        .addSubcommand(s => s.setName('end').setDescription('Beendet ein Giveaway')
            .addStringOption(o => o.setName('message_id').setDescription('Message ID').setRequired(true)))
        .addSubcommand(s => s.setName('reroll').setDescription('Wählt neue Gewinner')
            .addStringOption(o => o.setName('message_id').setDescription('Message ID').setRequired(true)))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    
    // Reaction Roles
    new SlashCommandBuilder().setName('reactionrole').setDescription('Reaction Role Setup')
        .addChannelOption(o => o.setName('channel').setDescription('Kanal').setRequired(true))
        .addStringOption(o => o.setName('message').setDescription('Nachricht').setRequired(true))
        .addStringOption(o => o.setName('emoji1').setDescription('Emoji 1').setRequired(true))
        .addRoleOption(o => o.setName('role1').setDescription('Rolle 1').setRequired(true))
        .addStringOption(o => o.setName('emoji2').setDescription('Emoji 2'))
        .addRoleOption(o => o.setName('role2').setDescription('Rolle 2'))
        .addStringOption(o => o.setName('emoji3').setDescription('Emoji 3'))
        .addRoleOption(o => o.setName('role3').setDescription('Rolle 3'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    
    // Utility
    new SlashCommandBuilder().setName('announce').setDescription('Sendet Ankündigung')
        .addStringOption(o => o.setName('message').setDescription('Nachricht').setRequired(true))
        .addChannelOption(o => o.setName('channel').setDescription('Kanal'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    
    new SlashCommandBuilder().setName('poll').setDescription('Erstellt eine Umfrage')
        .addStringOption(o => o.setName('question').setDescription('Frage').setRequired(true))
        .addStringOption(o => o.setName('options').setDescription('Optionen (kommagetrennt)').setRequired(true)),
    
    new SlashCommandBuilder().setName('stats').setDescription('Server-Statistiken'),
    
    // Settings
    new SlashCommandBuilder().setName('settings').setDescription('Bot-Einstellungen')
        .addSubcommand(s => s.setName('automod').setDescription('Auto-Moderation')
            .addBooleanOption(o => o.setName('enabled').setDescription('Aktiviert')))
        .addSubcommand(s => s.setName('welcome').setDescription('Willkommensnachrichten')
            .addBooleanOption(o => o.setName('enabled').setDescription('Aktiviert'))
            .addChannelOption(o => o.setName('channel').setDescription('Kanal'))
            .addRoleOption(o => o.setName('autorole').setDescription('Auto-Rolle')))
        .addSubcommand(s => s.setName('leveling').setDescription('Leveling System')
            .addBooleanOption(o => o.setName('enabled').setDescription('Aktiviert'))
            .addChannelOption(o => o.setName('channel').setDescription('Ankündigungskanal')))
        .addSubcommand(s => s.setName('view').setDescription('Zeigt aktuelle Einstellungen'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
];

async function deployCommands() {
    const rest = new REST({ version: '10' }).setToken(config.token);
    try {
        log('info', 'Registriere Slash Commands...');
        if (config.guild_id) {
            await rest.put(Routes.applicationGuildCommands(config.client_id, config.guild_id), { body: commands.map(c => c.toJSON()) });
            log('info', `${commands.length} Guild Commands registriert`);
        } else {
            await rest.put(Routes.applicationCommands(config.client_id), { body: commands.map(c => c.toJSON()) });
            log('info', `${commands.length} globale Commands registriert`);
        }
    } catch (error) {
        log('error', `Command Registrierung fehlgeschlagen: ${error.message}`);
    }
}

// ==================== EVENT HANDLERS ====================

// Ready
client.once('ready', async () => {
    log('info', `Bot eingeloggt als ${client.user.tag}`);
    log('info', `Verbunden mit ${client.guilds.cache.size} Server(n)`);
    client.user.setActivity('Nexus Discord Tool', { type: ActivityType.Playing });
    await deployCommands();
    apiServer.listen(API_PORT, '127.0.0.1', () => {
        log('info', `API Server läuft auf Port ${API_PORT}`);
    });
});

// Message Create
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // Auto Moderation
    const moderated = await handleAutoMod(message);
    if (moderated) return;

    // Leveling XP
    const settings = getGuildSettings(message.guild.id);
    if (settings.leveling?.enabled) {
        const key = `${message.guild.id}-${message.author.id}`;
        const cooldown = xpCooldowns.get(key);
        const now = Date.now();

        if (!cooldown || now - cooldown > settings.leveling.xpCooldown) {
            xpCooldowns.set(key, now);
            const result = addXP(message.guild.id, message.author.id, settings.leveling.xpPerMessage);
            
            if (result) {
                // Level Up!
                const channel = settings.leveling.announceChannel 
                    ? message.guild.channels.cache.get(settings.leveling.announceChannel)
                    : message.channel;
                
                if (channel) {
                    const announceMsg = (settings.leveling.announceMessage || '🎉 {user} ist jetzt Level {level}!')
                        .replace(/{user}/g, message.author.toString())
                        .replace(/{level}/g, result.newLevel);
                    
                    const embed = new EmbedBuilder()
                        .setColor('#FFD700')
                        .setTitle('🎉 Level Up!')
                        .setDescription(announceMsg)
                        .setThumbnail(message.author.displayAvatarURL())
                        .setTimestamp();
                    
                    channel.send({ embeds: [embed] });
                }

                // Role Rewards
                const roleReward = settings.leveling.roleRewards?.[result.newLevel];
                if (roleReward) {
                    const role = message.guild.roles.cache.get(roleReward);
                    if (role) {
                        message.member.roles.add(role).catch(() => {});
                    }
                }
            }
        }
    }
});

// Member Join
client.on('guildMemberAdd', handleWelcome);

// Member Leave
client.on('guildMemberRemove', handleGoodbye);

// Reaction Add (for Reaction Roles)
client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch();

    const guildRR = reactionRoleData[reaction.message.guild?.id];
    if (!guildRR) return;

    const setup = guildRR.find(r => r.messageId === reaction.message.id);
    if (!setup) return;

    const roleSetup = setup.roles.find(r => r.emoji === reaction.emoji.name || r.emoji === reaction.emoji.toString());
    if (!roleSetup) return;

    const member = await reaction.message.guild.members.fetch(user.id);
    const role = reaction.message.guild.roles.cache.get(roleSetup.roleId);
    if (role) {
        await member.roles.add(role);
        log('info', `Reaction Role: ${user.tag} erhielt ${role.name}`);
    }
});

// Reaction Remove (for Reaction Roles)
client.on('messageReactionRemove', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch();

    const guildRR = reactionRoleData[reaction.message.guild?.id];
    if (!guildRR) return;

    const setup = guildRR.find(r => r.messageId === reaction.message.id);
    if (!setup) return;

    const roleSetup = setup.roles.find(r => r.emoji === reaction.emoji.name || r.emoji === reaction.emoji.toString());
    if (!roleSetup) return;

    const member = await reaction.message.guild.members.fetch(user.id);
    const role = reaction.message.guild.roles.cache.get(roleSetup.roleId);
    if (role) {
        await member.roles.remove(role);
        log('info', `Reaction Role: ${user.tag} verlor ${role.name}`);
    }
});

// Button Interactions
client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton()) {
        if (interaction.customId === 'create_ticket') {
            await handleTicketCreate(interaction);
        } else if (interaction.customId === 'close_ticket') {
            await handleTicketClose(interaction);
        } else if (interaction.customId === 'confirm_close_ticket') {
            await confirmTicketClose(interaction);
        }
    }
});

// Ticket Functions
async function handleTicketCreate(interaction) {
    const guild = interaction.guild;
    const user = interaction.user;
    
    const existingTicket = Object.entries(ticketData.tickets || {}).find(
        ([_, t]) => t.userId === user.id && t.status === 'open'
    );
    
    if (existingTicket) {
        return interaction.reply({ 
            content: `Du hast bereits ein Ticket: <#${existingTicket[1].channelId}>`, 
            ephemeral: true 
        });
    }
    
    await interaction.deferReply({ ephemeral: true });
    
    ticketData.counter++;
    const ticketNumber = ticketData.counter.toString().padStart(4, '0');
    const settings = ticketData.settings[guild.id] || {};
    
    try {
        const channel = await guild.channels.create({
            name: `ticket-${ticketNumber}`,
            type: ChannelType.GuildText,
            parent: settings.categoryId || null,
            permissionOverwrites: [
                { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
            ]
        });
        
        if (settings.supportRoleId) {
            await channel.permissionOverwrites.edit(settings.supportRoleId, { ViewChannel: true, SendMessages: true });
        }
        
        ticketData.tickets[channel.id] = {
            number: ticketNumber, channelId: channel.id, userId: user.id,
            createdAt: Date.now(), status: 'open'
        };
        saveData(ticketsFile, ticketData);
        
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle(`🎫 Ticket #${ticketNumber}`)
            .setDescription(`Willkommen ${user}!\n\nBeschreibe dein Anliegen.`)
            .addFields(
                { name: 'Erstellt von', value: user.tag, inline: true },
                { name: 'Erstellt am', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
            )
            .setTimestamp();
        
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('close_ticket').setLabel('Ticket schließen').setStyle(ButtonStyle.Danger).setEmoji('🔒')
        );
        
        await channel.send({ 
            content: settings.supportRoleId ? `<@&${settings.supportRoleId}>` : '',
            embeds: [embed], components: [row] 
        });
        
        log('info', `Ticket #${ticketNumber} erstellt von ${user.tag}`);
        await interaction.editReply({ content: `Ticket erstellt: ${channel}` });
    } catch (error) {
        log('error', `Ticket Create Error: ${error.message}`);
        await interaction.editReply({ content: 'Fehler beim Erstellen des Tickets.' });
    }
}

async function handleTicketClose(interaction) {
    const embed = new EmbedBuilder()
        .setColor('#FFA500')
        .setTitle('⚠️ Ticket schließen?')
        .setDescription('Bist du sicher?');
    
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('confirm_close_ticket').setLabel('Ja').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('cancel_close').setLabel('Nein').setStyle(ButtonStyle.Secondary)
    );
    
    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

async function confirmTicketClose(interaction) {
    const ticket = ticketData.tickets[interaction.channel.id];
    if (!ticket) return interaction.reply({ content: 'Kein Ticket.', ephemeral: true });
    
    await interaction.update({ content: 'Schließe...', embeds: [], components: [] });
    
    ticket.status = 'closed';
    ticket.closedAt = Date.now();
    saveData(ticketsFile, ticketData);
    
    const embed = new EmbedBuilder().setColor('#FF0000').setTitle('🔒 Geschlossen').setTimestamp();
    await interaction.channel.send({ embeds: [embed] });
    
    log('info', `Ticket #${ticket.number} geschlossen`);
    
    setTimeout(async () => {
        try {
            await interaction.channel.delete();
            delete ticketData.tickets[interaction.channel.id];
            saveData(ticketsFile, ticketData);
        } catch (e) {}
    }, 5000);
}

// Slash Command Handler
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    
    const { commandName } = interaction;
    log('info', `Command: /${commandName} von ${interaction.user.tag}`);
    
    try {
        switch (commandName) {
            case 'ping': {
                const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('🏓 Pong!')
                    .addFields(
                        { name: 'Latenz', value: `${sent.createdTimestamp - interaction.createdTimestamp}ms`, inline: true },
                        { name: 'API', value: `${client.ws.ping}ms`, inline: true }
                    );
                await interaction.editReply({ content: '', embeds: [embed] });
                break;
            }

            case 'info': {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('Nexus Discord Bot')
                    .addFields(
                        { name: 'Version', value: '3.0.0', inline: true },
                        { name: 'Server', value: `${client.guilds.cache.size}`, inline: true },
                        { name: 'Uptime', value: formatUptime(client.uptime), inline: true }
                    )
                    .setThumbnail(client.user.displayAvatarURL());
                await interaction.reply({ embeds: [embed] });
                break;
            }

            case 'serverinfo': {
                const g = interaction.guild;
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle(g.name)
                    .setThumbnail(g.iconURL())
                    .addFields(
                        { name: 'Mitglieder', value: `${g.memberCount}`, inline: true },
                        { name: 'Kanäle', value: `${g.channels.cache.size}`, inline: true },
                        { name: 'Rollen', value: `${g.roles.cache.size}`, inline: true },
                        { name: 'Erstellt', value: `<t:${Math.floor(g.createdTimestamp / 1000)}:R>`, inline: true },
                        { name: 'Boosts', value: `${g.premiumSubscriptionCount || 0}`, inline: true }
                    );
                await interaction.reply({ embeds: [embed] });
                break;
            }

            case 'userinfo': {
                const user = interaction.options.getUser('user') || interaction.user;
                const member = await interaction.guild.members.fetch(user.id).catch(() => null);
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle(user.tag)
                    .setThumbnail(user.displayAvatarURL())
                    .addFields(
                        { name: 'ID', value: user.id, inline: true },
                        { name: 'Erstellt', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true }
                    );
                if (member) {
                    embed.addFields({ name: 'Beigetreten', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true });
                }
                await interaction.reply({ embeds: [embed] });
                break;
            }

            case 'kick': {
                const user = interaction.options.getUser('user');
                const reason = interaction.options.getString('reason') || 'Kein Grund';
                const member = await interaction.guild.members.fetch(user.id);
                if (!member.kickable) return interaction.reply({ content: 'Kann nicht kicken!', ephemeral: true });
                await member.kick(reason);
                log('info', `Kick: ${user.tag} - ${reason}`);
                await interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('Gekickt').setDescription(`${user.tag} wurde gekickt.\nGrund: ${reason}`)] });
                break;
            }

            case 'ban': {
                const user = interaction.options.getUser('user');
                const reason = interaction.options.getString('reason') || 'Kein Grund';
                await interaction.guild.members.ban(user, { reason });
                log('info', `Ban: ${user.tag} - ${reason}`);
                await interaction.reply({ embeds: [new EmbedBuilder().setColor('#FF0000').setTitle('Gebannt').setDescription(`${user.tag} wurde gebannt.\nGrund: ${reason}`)] });
                break;
            }

            case 'mute': {
                const user = interaction.options.getUser('user');
                const duration = interaction.options.getInteger('duration');
                const reason = interaction.options.getString('reason') || 'Kein Grund';
                const member = await interaction.guild.members.fetch(user.id);
                await member.timeout(duration * 60 * 1000, reason);
                log('info', `Mute: ${user.tag} für ${duration}m - ${reason}`);
                await interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('Gemutet').setDescription(`${user.tag} für ${duration} Minuten gemutet.\nGrund: ${reason}`)] });
                break;
            }

            case 'unmute': {
                const user = interaction.options.getUser('user');
                const member = await interaction.guild.members.fetch(user.id);
                await member.timeout(null);
                log('info', `Unmute: ${user.tag}`);
                await interaction.reply({ embeds: [new EmbedBuilder().setColor('#00FF00').setTitle('Entmutet').setDescription(`${user.tag} wurde entmutet.`)] });
                break;
            }

            case 'clear': {
                const amount = interaction.options.getInteger('amount');
                const deleted = await interaction.channel.bulkDelete(amount, true);
                await interaction.reply({ content: `${deleted.size} Nachrichten gelöscht.`, ephemeral: true });
                break;
            }

            case 'warn': {
                const user = interaction.options.getUser('user');
                const reason = interaction.options.getString('reason');
                const count = addWarn(interaction.guild.id, user.id, interaction.user.id, reason);
                log('info', `Warn: ${user.tag} - ${reason} (${count} total)`);
                await interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('⚠️ Verwarnung').setDescription(`${user} wurde verwarnt.\n**Grund:** ${reason}\n**Verwarnungen:** ${count}`)] });
                break;
            }

            case 'warnings': {
                const user = interaction.options.getUser('user');
                const warns = getWarns(interaction.guild.id, user.id);
                if (warns.length === 0) {
                    await interaction.reply({ content: `${user.tag} hat keine Verwarnungen.`, ephemeral: true });
                } else {
                    const list = warns.map((w, i) => `**${i + 1}.** ${w.reason} - <t:${Math.floor(w.timestamp / 1000)}:R>`).join('\n');
                    await interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle(`Verwarnungen: ${user.tag}`).setDescription(list)] });
                }
                break;
            }

            case 'clearwarns': {
                const user = interaction.options.getUser('user');
                clearWarns(interaction.guild.id, user.id);
                await interaction.reply({ content: `Verwarnungen von ${user.tag} gelöscht.`, ephemeral: true });
                break;
            }

            case 'createchannel': {
                const name = interaction.options.getString('name');
                const type = interaction.options.getString('type') || 'text';
                const channel = await interaction.guild.channels.create({
                    name, type: type === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText
                });
                await interaction.reply({ embeds: [new EmbedBuilder().setColor('#00FF00').setTitle('Kanal erstellt').setDescription(`${channel} wurde erstellt.`)] });
                break;
            }

            case 'createrole': {
                const name = interaction.options.getString('name');
                const color = interaction.options.getString('color') || '#FF0000';
                const role = await interaction.guild.roles.create({ name, color });
                await interaction.reply({ embeds: [new EmbedBuilder().setColor(color).setTitle('Rolle erstellt').setDescription(`${role} wurde erstellt.`)] });
                break;
            }

            case 'ticket': {
                const sub = interaction.options.getSubcommand();
                if (sub === 'setup') {
                    const channel = interaction.options.getChannel('channel');
                    const supportRole = interaction.options.getRole('support_role');
                    
                    const embed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('🎫 Support Tickets')
                        .setDescription('Klicke um ein Ticket zu erstellen.')
                        .setTimestamp();
                    
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('create_ticket').setLabel('📩 Ticket erstellen').setStyle(ButtonStyle.Primary)
                    );
                    
                    await channel.send({ embeds: [embed], components: [row] });
                    ticketData.settings[interaction.guild.id] = { panelChannel: channel.id, supportRoleId: supportRole?.id };
                    saveData(ticketsFile, ticketData);
                    await interaction.reply({ content: `Ticket-System in ${channel} eingerichtet!`, ephemeral: true });
                } else if (sub === 'close') {
                    const ticket = ticketData.tickets[interaction.channel.id];
                    if (!ticket) return interaction.reply({ content: 'Kein Ticket.', ephemeral: true });
                    ticket.status = 'closed';
                    saveData(ticketsFile, ticketData);
                    await interaction.reply({ embeds: [new EmbedBuilder().setColor('#FF0000').setTitle('🔒 Geschlossen')] });
                    setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
                } else if (sub === 'add') {
                    const user = interaction.options.getUser('user');
                    await interaction.channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true });
                    await interaction.reply({ content: `${user} hinzugefügt.` });
                } else if (sub === 'remove') {
                    const user = interaction.options.getUser('user');
                    await interaction.channel.permissionOverwrites.delete(user.id);
                    await interaction.reply({ content: `${user} entfernt.` });
                }
                break;
            }

            case 'level': {
                const data = getUserLevel(interaction.guild.id, interaction.user.id);
                const nextLevelXP = Math.pow((data.level + 1) * 10, 2);
                const progress = Math.floor((data.xp / nextLevelXP) * 100);
                
                const embed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle(`📊 Level von ${interaction.user.username}`)
                    .addFields(
                        { name: 'Level', value: `${data.level}`, inline: true },
                        { name: 'XP', value: `${data.xp}/${nextLevelXP}`, inline: true },
                        { name: 'Nachrichten', value: `${data.messages}`, inline: true }
                    )
                    .setThumbnail(interaction.user.displayAvatarURL());
                await interaction.reply({ embeds: [embed] });
                break;
            }

            case 'leaderboard': {
                const lb = getLeaderboard(interaction.guild.id, 10);
                if (lb.length === 0) {
                    await interaction.reply({ content: 'Noch keine Daten.', ephemeral: true });
                } else {
                    const list = lb.map((u, i) => `**${i + 1}.** <@${u.id}> - Level ${u.level} (${u.xp} XP)`).join('\n');
                    await interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFD700').setTitle('🏆 Leaderboard').setDescription(list)] });
                }
                break;
            }

            case 'giveaway': {
                const sub = interaction.options.getSubcommand();
                if (sub === 'start') {
                    const prize = interaction.options.getString('prize');
                    const durationStr = interaction.options.getString('duration');
                    const winners = interaction.options.getInteger('winners') || 1;
                    
                    // Parse duration
                    const match = durationStr.match(/(\d+)([mhd])/);
                    if (!match) return interaction.reply({ content: 'Ungültige Dauer. Nutze z.B. 30m, 1h, 1d', ephemeral: true });
                    
                    const num = parseInt(match[1]);
                    const unit = match[2];
                    let ms = num * 60 * 1000; // minutes
                    if (unit === 'h') ms = num * 60 * 60 * 1000;
                    if (unit === 'd') ms = num * 24 * 60 * 60 * 1000;
                    
                    await createGiveaway(interaction.channel, ms, prize, winners, interaction.user.id);
                    await interaction.reply({ content: '🎉 Giveaway gestartet!', ephemeral: true });
                } else if (sub === 'end') {
                    const msgId = interaction.options.getString('message_id');
                    const giveaway = giveawayData[interaction.guild.id]?.find(g => g.messageId === msgId);
                    if (!giveaway) return interaction.reply({ content: 'Giveaway nicht gefunden.', ephemeral: true });
                    await endGiveaway(giveaway);
                    await interaction.reply({ content: 'Giveaway beendet!', ephemeral: true });
                } else if (sub === 'reroll') {
                    const msgId = interaction.options.getString('message_id');
                    const giveaway = giveawayData[interaction.guild.id]?.find(g => g.messageId === msgId);
                    if (!giveaway) return interaction.reply({ content: 'Giveaway nicht gefunden.', ephemeral: true });
                    giveaway.ended = false;
                    await endGiveaway(giveaway);
                    await interaction.reply({ content: 'Neue Gewinner ausgelost!', ephemeral: true });
                }
                break;
            }

            case 'reactionrole': {
                const channel = interaction.options.getChannel('channel');
                const message = interaction.options.getString('message');
                
                const roles = [];
                for (let i = 1; i <= 3; i++) {
                    const emoji = interaction.options.getString(`emoji${i}`);
                    const role = interaction.options.getRole(`role${i}`);
                    if (emoji && role) {
                        roles.push({ emoji, roleId: role.id });
                    }
                }
                
                if (roles.length === 0) return interaction.reply({ content: 'Mindestens 1 Emoji+Rolle erforderlich.', ephemeral: true });
                
                await setupReactionRole(channel, message, roles);
                await interaction.reply({ content: `Reaction Roles in ${channel} eingerichtet!`, ephemeral: true });
                break;
            }

            case 'announce': {
                const msg = interaction.options.getString('message');
                const channel = interaction.options.getChannel('channel') || interaction.channel;
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('📢 Ankündigung')
                    .setDescription(msg)
                    .setFooter({ text: `Von ${interaction.user.tag}` })
                    .setTimestamp();
                await channel.send({ embeds: [embed] });
                await interaction.reply({ content: `Gesendet in ${channel}`, ephemeral: true });
                break;
            }

            case 'poll': {
                const question = interaction.options.getString('question');
                const options = interaction.options.getString('options').split(',').map(o => o.trim()).slice(0, 10);
                const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
                const desc = options.map((o, i) => `${emojis[i]} ${o}`).join('\n');
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle(`📊 ${question}`)
                    .setDescription(desc)
                    .setFooter({ text: `Umfrage von ${interaction.user.tag}` });
                const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
                for (let i = 0; i < options.length; i++) await msg.react(emojis[i]);
                break;
            }

            case 'stats': {
                const g = interaction.guild;
                const members = g.members.cache;
                const online = members.filter(m => m.presence?.status === 'online').size;
                const openTickets = Object.values(ticketData.tickets || {}).filter(t => t.status === 'open').length;
                const activeGiveaways = (giveawayData[g.id] || []).filter(gw => !gw.ended).length;
                
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle(`📊 ${g.name} Statistiken`)
                    .addFields(
                        { name: '👥 Mitglieder', value: `${g.memberCount} (${online} online)`, inline: true },
                        { name: '📁 Kanäle', value: `${g.channels.cache.size}`, inline: true },
                        { name: '🎭 Rollen', value: `${g.roles.cache.size}`, inline: true },
                        { name: '🎫 Tickets', value: `${openTickets} offen`, inline: true },
                        { name: '🎉 Giveaways', value: `${activeGiveaways} aktiv`, inline: true },
                        { name: '🚀 Boosts', value: `${g.premiumSubscriptionCount || 0}`, inline: true }
                    );
                await interaction.reply({ embeds: [embed] });
                break;
            }

            case 'settings': {
                const sub = interaction.options.getSubcommand();
                const settings = getGuildSettings(interaction.guild.id);
                
                if (sub === 'view') {
                    const embed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('⚙️ Bot Einstellungen')
                        .addFields(
                            { name: 'Auto-Moderation', value: settings.automod?.enabled ? '✅ Aktiv' : '❌ Inaktiv', inline: true },
                            { name: 'Willkommen', value: settings.welcome?.enabled ? '✅ Aktiv' : '❌ Inaktiv', inline: true },
                            { name: 'Leveling', value: settings.leveling?.enabled ? '✅ Aktiv' : '❌ Inaktiv', inline: true }
                        );
                    await interaction.reply({ embeds: [embed], ephemeral: true });
                } else if (sub === 'automod') {
                    const enabled = interaction.options.getBoolean('enabled');
                    if (enabled !== null) settings.automod.enabled = enabled;
                    saveData(settingsFile, settingsData);
                    await interaction.reply({ content: `Auto-Moderation: ${settings.automod.enabled ? '✅ Aktiviert' : '❌ Deaktiviert'}`, ephemeral: true });
                } else if (sub === 'welcome') {
                    const enabled = interaction.options.getBoolean('enabled');
                    const channel = interaction.options.getChannel('channel');
                    const autorole = interaction.options.getRole('autorole');
                    if (enabled !== null) settings.welcome.enabled = enabled;
                    if (channel) settings.welcome.channelId = channel.id;
                    if (autorole) settings.welcome.autoRoleId = autorole.id;
                    saveData(settingsFile, settingsData);
                    await interaction.reply({ content: `Willkommen: ${settings.welcome.enabled ? '✅ Aktiviert' : '❌ Deaktiviert'}`, ephemeral: true });
                } else if (sub === 'leveling') {
                    const enabled = interaction.options.getBoolean('enabled');
                    const channel = interaction.options.getChannel('channel');
                    if (enabled !== null) settings.leveling.enabled = enabled;
                    if (channel) settings.leveling.announceChannel = channel.id;
                    saveData(settingsFile, settingsData);
                    await interaction.reply({ content: `Leveling: ${settings.leveling.enabled ? '✅ Aktiviert' : '❌ Deaktiviert'}`, ephemeral: true });
                }
                break;
            }
        }
    } catch (error) {
        log('error', `Command Error: ${error.message}`);
        const errEmbed = new EmbedBuilder().setColor('#FF0000').setTitle('Fehler').setDescription(error.message);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ embeds: [errEmbed], ephemeral: true });
        } else {
            await interaction.reply({ embeds: [errEmbed], ephemeral: true });
        }
    }
});

// Utilities
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

// Error Handling
client.on('error', e => log('error', `Client: ${e.message}`));
process.on('unhandledRejection', e => log('error', `Unhandled: ${e.message}`));
process.on('SIGINT', () => { log('info', 'Shutdown...'); apiServer.close(); client.destroy(); process.exit(0); });
process.on('SIGTERM', () => { log('info', 'Shutdown...'); apiServer.close(); client.destroy(); process.exit(0); });

// Start
log('info', 'Bot startet...');
client.login(config.token).catch(e => { log('error', `Login: ${e.message}`); process.exit(1); });
