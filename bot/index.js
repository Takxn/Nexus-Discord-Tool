/**
 * Nexus Discord Tool - Bot Module v3.1
 * Full-featured Discord Bot with OAuth2 Support
 */

// Load environment variables from .env file
require('dotenv').config();

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
const scheduledFile = path.join(DATA_DIR, 'scheduled.json');

// ==================== DATA STORES ====================
const botStartTime = Date.now();
let ticketData = { counter: 0, tickets: {}, settings: {} };
let warnData = {};
let levelData = {};
let settingsData = {};
let giveawayData = {};
let reactionRoleData = {};
let scheduledData = [];
let messageStatsData = {};

// Default Settings
const DEFAULT_SETTINGS = {
    automod: {
        enabled: false,
        antiSpam: true,
        antiBadWords: true,
        antiLinks: false,
        antiInvites: true,
        antiCaps: false,
        antiMassMention: true,
        mentionThreshold: 5,
        antiMassEmoji: false,
        emojiThreshold: 10,
        capsThreshold: 70,
        badWords: ['fuck', 'shit', 'bitch', 'asshole', 'nigger', 'nazi'],
        spamThreshold: 5,
        spamInterval: 5000,
        warnOnViolation: true,
        muteOnViolation: false,
        muteDuration: 300000,
        logChannelId: null,
        ignoredChannels: [],
        ignoredRoles: []
    },
    welcome: {
        enabled: false,
        channelId: null,
        message: 'Welcome {user} to {server}! You are member #{memberCount}.',
        autoRoleId: null,
        dmMessage: null,
        embedColor: '#00FF00',
        embedTitle: '👋 Welcome!',
        embedImage: null,
        embedFooter: null,
        mentionUser: true
    },
    goodbye: {
        enabled: false,
        channelId: null,
        message: '{user} has left the server. We are now {memberCount} members.'
    },
    leveling: {
        enabled: false,
        xpPerMessage: 15,
        xpCooldown: 60000,
        announceChannel: null,
        announceMessage: '🎉 {user} is now Level {level}!',
        roleRewards: {},
        ignoredChannels: [],
        ignoredRoles: [],
        xpBoostRoles: {},
        xpMultiplier: 1.0,
        minMessageLength: 3
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

// AFK System
const afkData = new Map();

// Reminder System
const reminders = [];

// Parse duration string (e.g. "10m", "1h", "1d") to milliseconds
function parseDuration(str) {
    const match = str.match(/^(\d+)([smhd])$/i);
    if (!match) return null;
    const num = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    switch (unit) {
        case 's': return num * 1000;
        case 'm': return num * 60 * 1000;
        case 'h': return num * 60 * 60 * 1000;
        case 'd': return num * 24 * 60 * 60 * 1000;
        default: return null;
    }
}

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
        log('error', `Error loading ${file}: ${error.message}`);
    }
    return defaultData;
}

function saveData(file, data) {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
    } catch (error) {
        log('error', `Error saving ${file}: ${error.message}`);
    }
}

function loadAllData() {
    ticketData = loadData(ticketsFile, { counter: 0, tickets: {}, settings: {} });
    warnData = loadData(warnsFile, {});
    levelData = loadData(levelsFile, {});
    settingsData = loadData(settingsFile, {});
    giveawayData = loadData(giveawaysFile, {});
    reactionRoleData = loadData(reactionRolesFile, {});
    scheduledData = loadData(scheduledFile, []);
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
        log('error', 'config.json not found!');
        process.exit(1);
    }
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!config.token) {
        log('error', 'No bot token in configuration!');
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

    // Check if channel is ignored
    if (settings.automod.ignoredChannels?.includes(message.channel.id)) return false;
    
    // Check if user has ignored role
    if (settings.automod.ignoredRoles?.some(roleId => message.member?.roles.cache.has(roleId))) return false;

    let violation = null;
    let reason = '';

    // Anti-Spam Check
    if (settings.automod.antiSpam) {
        const key = `${message.guild.id}-${message.author.id}`;
        const now = Date.now();
        const userSpam = spamTracker.get(key) || [];
        
        // Remove old entries
        const recent = userSpam.filter(t => now - t < settings.automod.spamInterval);
        recent.push(now);
        spamTracker.set(key, recent);

        if (recent.length >= settings.automod.spamThreshold) {
            violation = 'spam';
            reason = 'Spam detected';
            spamTracker.delete(key);
        }
    }

    // Bad Words Check
    if (!violation && settings.automod.antiBadWords) {
        const content = message.content.toLowerCase();
        const badWord = settings.automod.badWords.find(word => content.includes(word.toLowerCase()));
        if (badWord) {
            violation = 'badword';
            reason = 'Prohibited word detected';
        }
    }

    // Anti-Links Check (but not Discord invites if antiInvites is separate)
    if (!violation && settings.automod.antiLinks) {
        const linkRegex = /(https?:\/\/(?!discord\.gg)[^\s]+)|(www\.[^\s]+)/gi;
        if (linkRegex.test(message.content)) {
            violation = 'link';
            reason = 'Links are not allowed';
        }
    }

    // Anti-Discord Invites Check
    if (!violation && settings.automod.antiInvites) {
        const inviteRegex = /(discord\.gg\/[^\s]+)|(discord\.com\/invite\/[^\s]+)|(discordapp\.com\/invite\/[^\s]+)/gi;
        if (inviteRegex.test(message.content)) {
            violation = 'invite';
            reason = 'Discord invites are not allowed';
        }
    }

    // Anti-Caps Check
    if (!violation && settings.automod.antiCaps && message.content.length > 10) {
        const upperCount = (message.content.match(/[A-Z]/g) || []).length;
        const letterCount = (message.content.match(/[a-zA-Z]/g) || []).length;
        const capsPercent = letterCount > 0 ? (upperCount / letterCount) * 100 : 0;
        
        if (capsPercent >= (settings.automod.capsThreshold || 70)) {
            violation = 'caps';
            reason = 'Too many capital letters';
        }
    }

    // Anti-Mass Mention Check
    if (!violation && settings.automod.antiMassMention) {
        const mentionCount = message.mentions.users.size + message.mentions.roles.size;
        const threshold = settings.automod.mentionThreshold || 5;
        
        if (mentionCount >= threshold) {
            violation = 'mass_mention';
            reason = `Too many mentions (${mentionCount})`;
        }
    }

    // Anti-Mass Emoji Check
    if (!violation && settings.automod.antiMassEmoji) {
        const emojiRegex = /(\p{Emoji_Presentation}|\p{Emoji}\uFE0F|<a?:\w+:\d+>)/gu;
        const emojiCount = (message.content.match(emojiRegex) || []).length;
        const threshold = settings.automod.emojiThreshold || 10;
        
        if (emojiCount >= threshold) {
            violation = 'mass_emoji';
            reason = `Too many emojis (${emojiCount})`;
        }
    }

    if (violation) {
        try {
            await message.delete();
            
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('⚠️ Auto-Moderation')
                .setDescription(`${message.author}, your message was removed.\n**Reason:** ${reason}`)
                .setTimestamp();

            const warnMsg = await message.channel.send({ embeds: [embed] });
            setTimeout(() => warnMsg.delete().catch(() => {}), 5000);

            // Warn on violation
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

            // Log to moderation log channel
            if (settings.automod.logChannelId) {
                const logChannel = message.guild.channels.cache.get(settings.automod.logChannelId);
                if (logChannel && logChannel.isTextBased()) {
                    const logEmbed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('🛡️ AutoMod Action')
                        .setDescription(`A message was automatically removed.`)
                        .addFields(
                            { name: 'User', value: `${message.author.tag} (${message.author.id})`, inline: true },
                            { name: 'Channel', value: `${message.channel}`, inline: true },
                            { name: 'Violation', value: violation, inline: true },
                            { name: 'Reason', value: reason, inline: false },
                            { name: 'Message Content', value: message.content.slice(0, 1000) || '[No text content]', inline: false }
                        )
                        .setThumbnail(message.author.displayAvatarURL())
                        .setTimestamp();
                    
                    if (settings.automod.warnOnViolation) {
                        logEmbed.addFields({ name: 'Action Taken', value: '⚠️ Warning added', inline: true });
                    }
                    if (settings.automod.muteOnViolation) {
                        logEmbed.addFields({ name: 'Action Taken', value: `🔇 Muted for ${settings.automod.muteDuration / 60000}min`, inline: true });
                    }
                    
                    await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
                }
            }

            log('info', `AutoMod: ${message.author.tag} - ${reason}`);
            return true;
        } catch (error) {
            log('error', `AutoMod Error: ${error.message}`);
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

    // Calculate level (100 XP per level, exponential)
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
        .setDescription(`**Prize:** ${prize}\n\n**Winners:** ${winners}\n**Ends:** <t:${Math.floor(endTime / 1000)}:R>\n**Hosted by:** <@${hostId}>\n\nReact with 🎉 to enter!`)
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

    log('info', `Giveaway created: ${prize} (${duration}ms)`);
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
            .setTitle('🎉 GIVEAWAY ENDED 🎉')
            .setDescription(`**Prize:** ${giveaway.prize}\n\n**Winners:** ${winnerText}\n**Hosted by:** <@${giveaway.hostId}>`)
            .setFooter({ text: 'Giveaway ended' })
            .setTimestamp();

        await message.edit({ embeds: [embed] });

        if (selectedWinners.length > 0) {
            await channel.send(`🎉 Congratulations ${winnerText}! You won **${giveaway.prize}**!`);
        }

        giveaway.ended = true;
        saveData(giveawaysFile, giveawayData);
        log('info', `Giveaway ended: ${giveaway.prize}`);
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
        .setFooter({ text: 'React to receive a role!' });

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
            log('error', `Auto-Role Error: ${e.message}`);
        }
    }

    // Welcome Message
    if (settings.welcome.channelId && settings.welcome.message) {
        try {
            const channel = member.guild.channels.cache.get(settings.welcome.channelId);
            if (channel) {
                const messageText = settings.welcome.message
                    .replace(/{user}/g, member.toString())
                    .replace(/{username}/g, member.user.username)
                    .replace(/{tag}/g, member.user.tag)
                    .replace(/{server}/g, member.guild.name)
                    .replace(/{memberCount}/g, member.guild.memberCount)
                    .replace(/{createdAt}/g, `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`);

                const embed = new EmbedBuilder()
                    .setColor(settings.welcome.embedColor || '#00FF00')
                    .setTitle(settings.welcome.embedTitle || '👋 Welcome!')
                    .setDescription(messageText)
                    .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
                    .addFields(
                        { name: 'Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
                        { name: 'Member #', value: `${member.guild.memberCount}`, inline: true }
                    )
                    .setTimestamp();

                if (settings.welcome.embedImage) {
                    embed.setImage(settings.welcome.embedImage);
                }
                
                if (settings.welcome.embedFooter) {
                    embed.setFooter({ text: settings.welcome.embedFooter, iconURL: member.guild.iconURL() });
                } else {
                    embed.setFooter({ text: member.guild.name, iconURL: member.guild.iconURL() });
                }

                const content = settings.welcome.mentionUser ? member.toString() : null;
                await channel.send({ content, embeds: [embed] });
            }
        } catch (e) {
            log('error', `Welcome Message Error: ${e.message}`);
        }
    }

    // DM Message
    if (settings.welcome.dmMessage) {
        try {
            const dm = settings.welcome.dmMessage
                .replace(/{user}/g, member.user.username)
                .replace(/{server}/g, member.guild.name);
            
            const dmEmbed = new EmbedBuilder()
                .setColor(settings.welcome.embedColor || '#00FF00')
                .setTitle(`Welcome to ${member.guild.name}!`)
                .setDescription(dm)
                .setThumbnail(member.guild.iconURL({ dynamic: true }))
                .setTimestamp();
            
            await member.send({ embeds: [dmEmbed] });
        } catch (e) {}
    }

    log('info', `Welcome: ${member.user.tag} on ${member.guild.name}`);
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
                .setTitle('👋 Goodbye!')
                .setDescription(message)
                .setTimestamp();

            await channel.send({ embeds: [embed] });
        }
    } catch (e) {
        log('error', `Goodbye Message Error: ${e.message}`);
    }
}

// ==================== GIVEAWAY END ====================
async function endGiveawayInternal(guildId, messageId) {
    try {
        const guildGiveaways = giveawayData[guildId] || [];
        const giveaway = guildGiveaways.find(g => g.messageId === messageId && g.active);
        
        if (!giveaway) return { success: false, error: 'Giveaway not found' };
        
        const guild = client.guilds.cache.first();
        if (!guild) return { success: false, error: 'Guild not found' };
        
        const channel = guild.channels.cache.get(giveaway.channelId);
        if (!channel) return { success: false, error: 'Channel not found' };
        
        const message = await channel.messages.fetch(messageId).catch(() => null);
        if (!message) return { success: false, error: 'Message not found' };
        
        // Get reactions
        const reaction = message.reactions.cache.get('🎉');
        let winner = null;
        let totalEntries = 0;
        
        if (reaction) {
            const users = await reaction.users.fetch();
            let validUsers = users.filter(u => !u.bot);
            totalEntries = validUsers.size;
            
            // Check required role if set
            if (giveaway.requiredRole && validUsers.size > 0) {
                const filteredUsers = [];
                for (const user of validUsers.values()) {
                    try {
                        const member = await guild.members.fetch(user.id);
                        if (member && member.roles.cache.has(giveaway.requiredRole)) {
                            filteredUsers.push(user);
                        }
                    } catch (e) {}
                }
                validUsers = new Map(filteredUsers.map(u => [u.id, u]));
            }
            
            if (validUsers.size > 0) {
                const winners = [];
                const userArray = Array.from(validUsers.values());
                
                for (let i = 0; i < Math.min(giveaway.winners, userArray.length); i++) {
                    const randomIndex = Math.floor(Math.random() * userArray.length);
                    winners.push(userArray.splice(randomIndex, 1)[0]);
                }
                
                winner = winners.map(w => w.toString()).join(', ');
            }
        }
        
        // Update the message
        const endEmbed = new EmbedBuilder()
            .setColor('#2F3136')
            .setTitle('🎁 GIVEAWAY ENDED 🎁')
            .setDescription(`**Prize:** ${giveaway.prize}\n\n**Winner(s):** ${winner || 'No valid participants'}\n\n**Total Entries:** ${totalEntries}`)
            .setFooter({ text: `Giveaway ended • ${giveaway.host ? 'Hosted by ' + giveaway.host : 'Nexus Giveaway'}` })
            .setTimestamp();
        
        if (giveaway.image) endEmbed.setThumbnail(giveaway.image);
        
        await message.edit({ embeds: [endEmbed] });
        
        // Announce winner with embed
        if (winner) {
            const winnerEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🎉 Congratulations!')
                .setDescription(`${winner} won **${giveaway.prize}**!`)
                .setFooter({ text: 'Nexus Giveaway' })
                .setTimestamp();
            
            await channel.send({ content: winner, embeds: [winnerEmbed] });
        } else {
            await channel.send({ content: '😢 No valid participants for this giveaway.' });
        }
        
        // Mark as inactive
        giveaway.active = false;
        giveaway.winner = winner;
        giveaway.totalEntries = totalEntries;
        saveData(giveawaysFile, giveawayData);
        
        log('info', `Giveaway ended: ${giveaway.prize} - Winner: ${winner || 'None'} - Entries: ${totalEntries}`);
        return { success: true, winner, totalEntries };
    } catch (e) {
        log('error', `Giveaway end error: ${e.message}`);
        return { success: false, error: e.message };
    }
}

// ==================== MESSAGE STATS ====================
function trackMessageStats(guildId) {
    const now = new Date();
    const dateKey = now.toISOString().split('T')[0]; // YYYY-MM-DD
    
    if (!messageStatsData[guildId]) {
        messageStatsData[guildId] = {};
    }
    
    if (!messageStatsData[guildId][dateKey]) {
        messageStatsData[guildId][dateKey] = 0;
    }
    
    messageStatsData[guildId][dateKey]++;
    
    // Clean old data (keep last 30 days)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    for (const key of Object.keys(messageStatsData[guildId])) {
        if (new Date(key) < thirtyDaysAgo) {
            delete messageStatsData[guildId][key];
        }
    }
}

function getMessageStatsForGuild(guildId) {
    const stats = messageStatsData[guildId] || {};
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    // Calculate today's messages
    const todayCount = stats[today] || 0;
    
    // Calculate this week's messages
    let weekCount = 0;
    for (let i = 0; i < 7; i++) {
        const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const dateKey = date.toISOString().split('T')[0];
        weekCount += stats[dateKey] || 0;
    }
    
    return { today: todayCount, week: weekCount };
}

// ==================== SCHEDULED MESSAGES ====================
async function sendScheduledMessage(id) {
    const scheduled = scheduledData.find(s => s.id === id && s.active);
    if (!scheduled) return;
    
    try {
        const guild = client.guilds.cache.first();
        if (!guild) return;
        
        const channel = guild.channels.cache.get(scheduled.channelId);
        if (!channel || !channel.isTextBased()) return;
        
        await channel.send(scheduled.content);
        log('info', `Scheduled message sent to #${channel.name}`);
        
        if (scheduled.repeat) {
            // Schedule for next day
            scheduled.scheduledFor += 24 * 60 * 60 * 1000;
            saveData(scheduledFile, scheduledData);
            const delay = scheduled.scheduledFor - Date.now();
            if (delay > 0) {
                setTimeout(() => sendScheduledMessage(id), delay);
            }
        } else {
            scheduled.active = false;
            saveData(scheduledFile, scheduledData);
        }
    } catch (e) {
        log('error', `Scheduled message error: ${e.message}`);
    }
}

function initScheduledMessages() {
    const now = Date.now();
    scheduledData.filter(s => s.active).forEach(s => {
        const delay = s.scheduledFor - now;
        if (delay > 0) {
            setTimeout(() => sendScheduledMessage(s.id), delay);
        } else if (s.repeat) {
            // Missed, reschedule for next occurrence
            while (s.scheduledFor < now) {
                s.scheduledFor += 24 * 60 * 60 * 1000;
            }
            saveData(scheduledFile, scheduledData);
            setTimeout(() => sendScheduledMessage(s.id), s.scheduledFor - now);
        }
    });
    log('info', `Initialized ${scheduledData.filter(s => s.active).length} scheduled messages`);
}

// ==================== HTTP API ====================
const API_PORT = 47832;
let guildDataCache = null;
let lastCacheUpdate = 0;
const CACHE_DURATION = 60000;

// Status Config
let statusConfig = {
    activityType: 'watching',
    customText: '',
    showPing: true,
    showUptime: true,
    showMembers: false,
    showServer: false
};

// Load status config from file
function loadStatusConfig() {
    try {
        const statusPath = path.join(__dirname, 'status-config.json');
        console.log('[Status] Looking for config at:', statusPath);
        
        if (fs.existsSync(statusPath)) {
            const data = fs.readFileSync(statusPath, 'utf8');
            const loaded = JSON.parse(data);
            statusConfig = { ...statusConfig, ...loaded };
            console.log('[Status] Config loaded:', statusConfig);
            log('info', 'Status config loaded: ' + statusConfig.activityType);
        } else {
            console.log('[Status] No config file found, using defaults');
        }
    } catch (e) {
        log('warn', 'Could not load status config: ' + e.message);
    }
}

// Update bot status based on config
function updateBotStatus() {
    if (!client.isReady()) return;
    
    const ping = client.ws.ping || 0;
    const uptimeMs = client.uptime || 0;
    const uptimeSec = Math.floor(uptimeMs / 1000);
    const uptimeMin = Math.floor(uptimeSec / 60);
    const uptimeHours = Math.floor(uptimeMin / 60);
    const uptimeDays = Math.floor(uptimeHours / 24);
    
    let uptimeStr;
    if (uptimeDays > 0) {
        uptimeStr = `${uptimeDays}d ${uptimeHours % 24}h`;
    } else if (uptimeHours > 0) {
        uptimeStr = `${uptimeHours}h ${uptimeMin % 60}m`;
    } else {
        uptimeStr = `${uptimeMin}m`;
    }
    
    const guild = client.guilds.cache.first();
    const memberCount = guild ? guild.memberCount : 0;
    const serverName = guild ? guild.name : 'Server';
    
    // Build status text
    let parts = [];
    if (statusConfig.customText) parts.push(statusConfig.customText);
    if (statusConfig.showPing) parts.push(`${ping}ms`);
    if (statusConfig.showUptime) parts.push(`Uptime: ${uptimeStr}`);
    if (statusConfig.showMembers) parts.push(`${memberCount} Members`);
    if (statusConfig.showServer) parts.push(serverName);
    
    const statusText = parts.join(' • ') || 'Nexus Discord Tool';
    
    // Activity type mapping
    const activityTypes = {
        'watching': ActivityType.Watching,
        'playing': ActivityType.Playing,
        'listening': ActivityType.Listening,
        'competing': ActivityType.Competing
    };
    
    const activityType = activityTypes[statusConfig.activityType] || ActivityType.Watching;
    client.user.setActivity(statusText, { type: activityType });
    
    // Log status update (only first time and when changed)
    if (!client._lastStatusText || client._lastStatusText !== statusText) {
        console.log('[Status] Set activity:', statusConfig.activityType, '-', statusText);
        client._lastStatusText = statusText;
    }
}

// Load config on startup
loadStatusConfig();

async function getGuildData(forceRefresh = false) {
    const guild = client.guilds.cache.get(config.guild_id);
    if (!guild) return null;

    const now = Date.now();
    if (!forceRefresh && guildDataCache && (now - lastCacheUpdate) < CACHE_DURATION) {
        return guildDataCache;
    }

    try {
        const guildMembers = guild.members.cache;
        const settings = getGuildSettings(guild.id);
        
        // Enhanced channels with all types and metadata
        const channelTypeMap = {
            [ChannelType.GuildText]: 'text',
            [ChannelType.GuildVoice]: 'voice',
            [ChannelType.GuildCategory]: 'category',
            [ChannelType.GuildAnnouncement]: 'announcement',
            [ChannelType.GuildForum]: 'forum',
            [ChannelType.GuildStageVoice]: 'stage',
            [ChannelType.PublicThread]: 'thread',
            [ChannelType.PrivateThread]: 'thread'
        };
        
        const channels = guild.channels.cache
            .filter(c => channelTypeMap[c.type]) // Only include known types
            .map(c => ({
                id: c.id,
                name: c.name,
                type: channelTypeMap[c.type] || 'other',
                position: c.position,
                parentId: c.parentId,
                topic: c.topic || null,
                nsfw: c.nsfw || false,
                userLimit: c.userLimit || null,
                bitrate: c.bitrate || null
            }))
            .sort((a, b) => a.position - b.position);

        // Enhanced roles with permissions
        const roles = guild.roles.cache
            .filter(r => r.name !== '@everyone')
            .map(r => {
                const perms = [];
                if (r.permissions.has('Administrator')) perms.push('ADMINISTRATOR');
                if (r.permissions.has('ManageGuild')) perms.push('MANAGE_GUILD');
                if (r.permissions.has('ManageChannels')) perms.push('MANAGE_CHANNELS');
                if (r.permissions.has('ManageRoles')) perms.push('MANAGE_ROLES');
                if (r.permissions.has('KickMembers')) perms.push('KICK_MEMBERS');
                if (r.permissions.has('BanMembers')) perms.push('BAN_MEMBERS');
                if (r.permissions.has('ModerateMembers')) perms.push('MODERATE_MEMBERS');
                if (r.permissions.has('ManageMessages')) perms.push('MANAGE_MESSAGES');
                
                return {
                    id: r.id,
                    name: r.name,
                    color: r.hexColor,
                    memberCount: r.members.size,
                    position: r.position,
                    hoist: r.hoist,
                    mentionable: r.mentionable,
                    permissions: perms
                };
            })
            .sort((a, b) => b.position - a.position);
        
        // Members list (first 100 with details)
        const membersList = guildMembers
            .filter(m => !m.user.bot) // Humans first
            .first(80)
            .concat(guildMembers.filter(m => m.user.bot).first(20)) // Then bots
            .map(m => ({
                id: m.user.id,
                name: m.user.username,
                displayName: m.displayName,
                discriminator: m.user.discriminator,
                avatar: m.user.displayAvatarURL({ size: 64 }),
                bot: m.user.bot,
                status: m.presence?.status || 'offline',
                joinedAt: m.joinedTimestamp,
                roles: m.roles.cache
                    .filter(r => r.name !== '@everyone')
                    .first(5)
                    .map(r => ({ id: r.id, name: r.name, color: r.hexColor }))
            }));

        const online = guildMembers.filter(m => m.presence?.status === 'online').size;
        const idle = guildMembers.filter(m => m.presence?.status === 'idle').size;
        const dnd = guildMembers.filter(m => m.presence?.status === 'dnd').size;
        const offline = guildMembers.filter(m => !m.presence || m.presence.status === 'offline').size;
        const bots = guildMembers.filter(m => m.user.bot).size;

        const textChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).size;
        const voiceChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size;
        
        // Open tickets with details
        const openTicketsList = Object.entries(ticketData.tickets || {})
            .filter(([, t]) => t.status === 'open')
            .map(([id, t]) => ({
                id: id,
                name: t.channelName || `ticket-${t.counter}`,
                userName: t.userName || 'Unknown',
                userAvatar: t.userAvatar || null,
                userId: t.userId,
                claimed: !!t.claimedBy,
                claimedBy: t.claimedBy,
                createdAt: t.createdAt
            }));
        const openTickets = openTicketsList.length;

        // Count giveaways
        const activeGiveaways = (giveawayData[guild.id] || []).filter(g => !g.ended).length;

        // Top Leveling Users
        const leaderboard = getLeaderboard(guild.id, 5);

        // Get all connected guilds
        const allGuilds = client.guilds.cache.map(g => ({
            id: g.id,
            name: g.name,
            icon: g.iconURL({ size: 128 }),
            memberCount: g.memberCount,
            ownerId: g.ownerId
        }));

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
            guilds: allGuilds, // All connected servers
            channels,
            roles,
            members: membersList, // Member list for management
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
                list: openTicketsList, // Detailed ticket list for management
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
    if (!guild) return { success: false, error: 'Guild not found' };

    try {
        switch (action) {
            case 'createChannel': {
                const channelType = params.type === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText;
                const channel = await guild.channels.create({
                    name: params.name,
                    type: channelType,
                    reason: 'Created via Nexus Discord Tool'
                });
                guildDataCache = null;
                log('info', `Channel created: ${channel.name}`);
                return { success: true, channel: { id: channel.id, name: channel.name } };
            }
            
            case 'deleteChannel': {
                const channel = guild.channels.cache.get(params.id);
                if (!channel) return { success: false, error: 'Channel not found' };
                await channel.delete('Deleted via Nexus Discord Tool');
                guildDataCache = null;
                log('info', `Channel deleted: ${channel.name}`);
                return { success: true };
            }
            
            case 'createRole': {
                const role = await guild.roles.create({
                    name: params.name,
                    color: params.color || '#FF0000',
                    reason: 'Created via Nexus Discord Tool'
                });
                guildDataCache = null;
                log('info', `Role created: ${role.name}`);
                return { success: true, role: { id: role.id, name: role.name } };
            }
            
            case 'deleteRole': {
                const role = guild.roles.cache.get(params.id);
                if (!role) return { success: false, error: 'Role not found' };
                await role.delete('Deleted via Nexus Discord Tool');
                guildDataCache = null;
                log('info', `Role deleted: ${role.name}`);
                return { success: true };
            }
            
            case 'getTickets': {
                // Find all ticket channels
                const ticketChannels = guild.channels.cache.filter(c => 
                    c.name.startsWith('ticket-') && c.type === ChannelType.GuildText
                );
                
                const tickets = ticketChannels.map(c => ({
                    id: c.id,
                    name: c.name,
                    user: c.name.replace('ticket-', ''),
                    status: 'open',
                    createdAt: c.createdTimestamp
                }));
                
                return { success: true, tickets };
            }
            
            case 'closeTicket': {
                const channel = guild.channels.cache.get(params.ticketId);
                if (!channel) return { success: false, error: 'Ticket not found' };
                if (!channel.name.startsWith('ticket-')) return { success: false, error: 'Not a ticket channel' };
                
                await channel.delete('Closed via Nexus Discord Tool');
                log('info', `Ticket closed: ${channel.name}`);
                return { success: true };
            }
            
            case 'closeAllTickets': {
                const ticketChannels = guild.channels.cache.filter(c => 
                    c.name.startsWith('ticket-') && c.type === ChannelType.GuildText
                );
                
                let closed = 0;
                for (const [id, channel] of ticketChannels) {
                    try {
                        await channel.delete('Closed via Nexus Discord Tool');
                        closed++;
                    } catch (e) {
                        log('error', `Error closing ${channel.name}: ${e.message}`);
                    }
                }
                
                log('info', `${closed} tickets closed`);
                return { success: true, closed };
            }
            
            case 'updateStatusConfig': {
                // Save status config and apply immediately
                console.log('[Status] Updating config with:', params);
                
                statusConfig = {
                    activityType: params.activityType || 'watching',
                    customText: params.customText || '',
                    showPing: params.showPing ?? true,
                    showUptime: params.showUptime ?? true,
                    showMembers: params.showMembers ?? false,
                    showServer: params.showServer ?? false
                };
                
                // Save to file
                const statusPath = path.join(__dirname, 'status-config.json');
                console.log('[Status] Saving to:', statusPath);
                fs.writeFileSync(statusPath, JSON.stringify(statusConfig, null, 2));
                
                // Apply immediately
                updateBotStatus();
                
                console.log('[Status] Config saved and applied:', statusConfig);
                log('info', 'Status config updated: ' + statusConfig.activityType);
                return { success: true };
            }
            
            case 'sendMessage': {
                const channel = guild.channels.cache.get(params.channelId);
                if (!channel || !channel.isTextBased()) return { success: false, error: 'Channel not found' };
                await channel.send(params.content);
                log('info', `Message sent to #${channel.name}`);
                return { success: true };
            }

            case 'sendEmbed': {
                const channel = guild.channels.cache.get(params.channelId);
                if (!channel || !channel.isTextBased()) return { success: false, error: 'Channel not found' };
                
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

            // ==================== GIVEAWAYS ====================
            case 'getGiveaways': {
                const guildGiveaways = giveawayData[guild.id] || [];
                const activeGiveaways = guildGiveaways.filter(g => g.active && g.endsAt > Date.now());
                return { 
                    success: true, 
                    giveaways: activeGiveaways.map(g => ({
                        ...g,
                        channelName: guild.channels.cache.get(g.channelId)?.name || 'unknown'
                    }))
                };
            }

            case 'createGiveaway': {
                const channel = guild.channels.cache.get(params.channelId);
                if (!channel || !channel.isTextBased()) return { success: false, error: 'Channel not found' };
                
                const endsAt = Date.now() + params.duration;
                
                // Build description
                let description = `**🎁 Prize:** ${params.prize}\n\n`;
                if (params.description) description += `${params.description}\n\n`;
                description += `**👥 Winners:** ${params.winners}\n`;
                description += `**⏰ Ends:** <t:${Math.floor(endsAt / 1000)}:R>\n`;
                if (params.requiredRole) {
                    const role = guild.roles.cache.get(params.requiredRole);
                    if (role) description += `**🔒 Required:** ${role.name}\n`;
                }
                if (params.host) description += `**🎤 Hosted by:** ${params.host}\n`;
                description += `\n**React with 🎉 to enter!**`;
                
                const embed = new EmbedBuilder()
                    .setColor(params.color || '#FF0000')
                    .setTitle('🎁 GIVEAWAY 🎁')
                    .setDescription(description)
                    .setFooter({ text: `${params.winners} winner(s) • Nexus Giveaway` })
                    .setTimestamp(endsAt);
                
                if (params.image) embed.setImage(params.image);
                
                const message = await channel.send({ embeds: [embed] });
                await message.react('🎉');
                
                if (!giveawayData[guild.id]) giveawayData[guild.id] = [];
                const giveaway = {
                    messageId: message.id,
                    channelId: channel.id,
                    prize: params.prize,
                    description: params.description || null,
                    winners: params.winners,
                    endsAt: endsAt,
                    requiredRole: params.requiredRole || null,
                    host: params.host || null,
                    color: params.color || '#FF0000',
                    image: params.image || null,
                    active: true,
                    createdAt: Date.now(),
                    participants: []
                };
                giveawayData[guild.id].push(giveaway);
                saveData(giveawaysFile, giveawayData);
                
                // Set timeout to end giveaway
                setTimeout(() => endGiveawayInternal(guild.id, message.id), params.duration);
                
                log('info', `Giveaway started: ${params.prize}`);
                return { success: true, messageId: message.id };
            }

            case 'endGiveaway': {
                const result = await endGiveawayInternal(guild.id, params.messageId);
                return result;
            }

            // ==================== REACTION ROLES ====================
            case 'getReactionRoles': {
                const guildRR = reactionRoleData[guild.id] || [];
                return { 
                    success: true, 
                    reactionRoles: guildRR.map(rr => ({
                        ...rr,
                        channelName: guild.channels.cache.get(rr.channelId)?.name || 'unknown'
                    }))
                };
            }

            case 'createReactionRole': {
                const channel = guild.channels.cache.get(params.channelId);
                if (!channel || !channel.isTextBased()) return { success: false, error: 'Channel not found' };
                
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle(params.title)
                    .setDescription(params.description + '\n\n' + params.roles.map(r => {
                        const role = guild.roles.cache.get(r.roleId);
                        return `${r.emoji} → ${role ? role.name : 'Unknown Role'}`;
                    }).join('\n'))
                    .setFooter({ text: 'React to get a role!' });
                
                const message = await channel.send({ embeds: [embed] });
                
                // Add reactions
                for (const r of params.roles) {
                    try {
                        await message.react(r.emoji);
                    } catch (e) {
                        log('error', `Could not add reaction ${r.emoji}: ${e.message}`);
                    }
                }
                
                // Save to data
                if (!reactionRoleData[guild.id]) reactionRoleData[guild.id] = [];
                reactionRoleData[guild.id].push({
                    messageId: message.id,
                    channelId: channel.id,
                    roles: params.roles
                });
                saveData(reactionRolesFile, reactionRoleData);
                
                log('info', `Reaction role created in #${channel.name}`);
                return { success: true, messageId: message.id };
            }

            case 'deleteReactionRole': {
                const guildRR = reactionRoleData[guild.id] || [];
                const index = guildRR.findIndex(rr => rr.messageId === params.messageId);
                if (index === -1) return { success: false, error: 'Reaction role not found' };
                
                // Try to delete the message
                try {
                    const rr = guildRR[index];
                    const channel = guild.channels.cache.get(rr.channelId);
                    if (channel) {
                        const message = await channel.messages.fetch(rr.messageId).catch(() => null);
                        if (message) await message.delete();
                    }
                } catch (e) {}
                
                guildRR.splice(index, 1);
                saveData(reactionRolesFile, reactionRoleData);
                return { success: true };
            }

            // ==================== WEBHOOKS ====================
            case 'getWebhooks': {
                const webhooks = [];
                for (const channel of guild.channels.cache.values()) {
                    if (channel.isTextBased() && channel.fetchWebhooks) {
                        try {
                            const channelWebhooks = await channel.fetchWebhooks();
                            channelWebhooks.forEach(w => webhooks.push({
                                id: w.id,
                                name: w.name,
                                avatar: w.avatarURL(),
                                channelName: channel.name,
                                url: w.url
                            }));
                        } catch (e) {}
                    }
                }
                return { success: true, webhooks };
            }

            case 'createWebhook': {
                const channel = guild.channels.cache.get(params.channelId);
                if (!channel || !channel.isTextBased()) return { success: false, error: 'Channel not found' };
                
                const webhook = await channel.createWebhook({
                    name: params.name,
                    avatar: params.avatar || null,
                    reason: 'Created via Nexus Discord Tool'
                });
                
                log('info', `Webhook created: ${params.name}`);
                return { success: true, url: webhook.url };
            }

            case 'deleteWebhook': {
                for (const channel of guild.channels.cache.values()) {
                    if (channel.isTextBased() && channel.fetchWebhooks) {
                        try {
                            const webhooks = await channel.fetchWebhooks();
                            const webhook = webhooks.get(params.webhookId);
                            if (webhook) {
                                await webhook.delete('Deleted via Nexus Discord Tool');
                                return { success: true };
                            }
                        } catch (e) {}
                    }
                }
                return { success: false, error: 'Webhook not found' };
            }

            // ==================== ALERTS (Twitch/YouTube) ====================
            case 'getAlerts': {
                const alerts = settingsData[guild.id]?.alerts || [];
                return { 
                    success: true, 
                    alerts: alerts.map(a => ({
                        ...a,
                        channelName: guild.channels.cache.get(a.channelId)?.name || 'unknown'
                    }))
                };
            }

            case 'addTwitchAlert': {
                const settings = getGuildSettings(guild.id);
                if (!settings.alerts) settings.alerts = [];
                
                settings.alerts.push({
                    id: Date.now().toString(),
                    type: 'twitch',
                    name: params.username,
                    channelId: params.channelId,
                    message: params.message,
                    lastCheck: 0,
                    lastLive: false
                });
                
                saveData(settingsFile, settingsData);
                log('info', `Twitch alert added: ${params.username}`);
                return { success: true };
            }

            case 'addYoutubeAlert': {
                const settings = getGuildSettings(guild.id);
                if (!settings.alerts) settings.alerts = [];
                
                settings.alerts.push({
                    id: Date.now().toString(),
                    type: 'youtube',
                    name: params.youtubeChannelId,
                    channelId: params.channelId,
                    message: params.message,
                    lastVideoId: null
                });
                
                saveData(settingsFile, settingsData);
                log('info', `YouTube alert added: ${params.youtubeChannelId}`);
                return { success: true };
            }

            case 'deleteAlert': {
                const settings = getGuildSettings(guild.id);
                if (!settings.alerts) return { success: false, error: 'No alerts' };
                
                const index = settings.alerts.findIndex(a => a.id === params.alertId);
                if (index === -1) return { success: false, error: 'Alert not found' };
                
                settings.alerts.splice(index, 1);
                saveData(settingsFile, settingsData);
                return { success: true };
            }

            // ==================== BACKUP ====================
            case 'createBackup': {
                const backup = {
                    version: '1.0',
                    createdAt: Date.now(),
                    serverName: guild.name,
                    serverId: guild.id
                };
                
                if (params.includeChannels) {
                    backup.channels = guild.channels.cache.map(c => ({
                        id: c.id,
                        name: c.name,
                        type: c.type,
                        position: c.position,
                        parentId: c.parentId,
                        topic: c.topic || null
                    }));
                }
                
                if (params.includeRoles) {
                    backup.roles = guild.roles.cache.filter(r => !r.managed && r.id !== guild.id).map(r => ({
                        id: r.id,
                        name: r.name,
                        color: r.hexColor,
                        position: r.position,
                        permissions: r.permissions.bitfield.toString()
                    }));
                }
                
                if (params.includeSettings) {
                    backup.settings = getGuildSettings(guild.id);
                }
                
                if (params.includeAutomod) {
                    backup.automod = getGuildSettings(guild.id).automod;
                }
                
                log('info', 'Backup created');
                return { success: true, backup };
            }

            case 'restoreBackup': {
                const backup = params.backup;
                if (!backup) return { success: false, error: 'No backup data' };
                
                // Restore settings
                if (backup.settings) {
                    settingsData[guild.id] = { ...settingsData[guild.id], ...backup.settings };
                    saveData(settingsFile, settingsData);
                }
                
                log('info', 'Backup restored');
                return { success: true };
            }

            case 'getAuditLog': {
                try {
                    const auditLogs = await guild.fetchAuditLogs({ limit: 50 });
                    const entries = auditLogs.entries.map(e => ({
                        action: e.action.toString(),
                        executor: e.executor?.tag || 'Unknown',
                        target: e.target?.tag || e.target?.name || e.targetId,
                        reason: e.reason,
                        createdAt: e.createdTimestamp
                    }));
                    return { success: true, entries };
                } catch (e) {
                    return { success: false, error: 'Cannot access audit log' };
                }
            }

            // ==================== SCHEDULED MESSAGES ====================
            case 'getScheduledMessages': {
                const activeScheduled = scheduledData.filter(s => s.guildId === guild.id && s.active);
                return { 
                    success: true, 
                    messages: activeScheduled.map(s => ({
                        ...s,
                        channelName: guild.channels.cache.get(s.channelId)?.name || 'unknown'
                    }))
                };
            }

            case 'scheduleMessage': {
                const channel = guild.channels.cache.get(params.channelId);
                if (!channel) return { success: false, error: 'Channel not found' };
                
                const scheduled = {
                    id: Date.now().toString(),
                    guildId: guild.id,
                    channelId: params.channelId,
                    content: params.content,
                    scheduledFor: params.scheduledFor,
                    repeat: params.repeat || false,
                    active: true,
                    createdAt: Date.now()
                };
                
                scheduledData.push(scheduled);
                saveData(scheduledFile, scheduledData);
                
                // Set timeout
                const delay = params.scheduledFor - Date.now();
                if (delay > 0) {
                    setTimeout(() => sendScheduledMessage(scheduled.id), delay);
                }
                
                log('info', `Message scheduled for ${new Date(params.scheduledFor).toLocaleString()}`);
                return { success: true, id: scheduled.id };
            }

            case 'cancelScheduledMessage': {
                const index = scheduledData.findIndex(s => s.id === params.id);
                if (index === -1) return { success: false, error: 'Scheduled message not found' };
                
                scheduledData[index].active = false;
                saveData(scheduledFile, scheduledData);
                return { success: true };
            }

            // ==================== BULK ACTIONS ====================
            case 'bulkBan': {
                const userIds = params.userIds || [];
                const reason = params.reason || 'Bulk ban via Nexus Discord Tool';
                let banned = 0;
                
                for (const userId of userIds) {
                    try {
                        await guild.members.ban(userId, { reason });
                        banned++;
                    } catch (e) {}
                }
                
                log('info', `Bulk banned ${banned}/${userIds.length} users`);
                return { success: true, banned, total: userIds.length };
            }

            case 'bulkKick': {
                const userIds = params.userIds || [];
                const reason = params.reason || 'Bulk kick via Nexus Discord Tool';
                let kicked = 0;
                
                for (const userId of userIds) {
                    try {
                        const member = await guild.members.fetch(userId);
                        if (member) {
                            await member.kick(reason);
                            kicked++;
                        }
                    } catch (e) {}
                }
                
                log('info', `Bulk kicked ${kicked}/${userIds.length} users`);
                return { success: true, kicked, total: userIds.length };
            }

            // ==================== ANALYTICS ====================
            case 'getMessageStats': {
                const stats = getMessageStatsForGuild(guild.id);
                return { success: true, today: stats.today, week: stats.week };
            }

            case 'getTopUsers': {
                const guildLevels = levelData[guild.id] || {};
                const users = Object.entries(guildLevels).map(([id, data]) => ({
                    userId: id,
                    username: data.username || 'Unknown',
                    xp: data.xp || 0,
                    level: data.level || 1
                })).sort((a, b) => b.xp - a.xp);
                
                return { success: true, users };
            }

            case 'getVoiceStats': {
                let usersInVoice = 0;
                let activeChannels = 0;
                
                guild.channels.cache.forEach(channel => {
                    if (channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice) {
                        const members = channel.members.size;
                        if (members > 0) {
                            activeChannels++;
                            usersInVoice += members;
                        }
                    }
                });
                
                return { success: true, usersInVoice, activeChannels };
            }

            default:
                return { success: false, error: 'Unbekannte Aktion' };
        }
    } catch (error) {
        log('error', `Action Error: ${error.message}`);
        return { success: false, error: error.message };
    }
}

// ==================== OAuth2 Configuration ====================
// Client Secret is loaded from .env file for security
// On BisectHosting: Set DISCORD_CLIENT_SECRET in /home/container/.env
const OAUTH_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
const OAUTH_REDIRECT_URI = 'http://localhost:47832/callback';
const NEXUS_GUILD_ID = process.env.NEXUS_GUILD_ID || '1190558638067163226'; // Nexus+ Server
let currentOAuthUser = null;

// Log OAuth status on startup
if (OAUTH_CLIENT_SECRET) {
    console.log('[OAuth] Client Secret loaded from environment');
} else {
    console.log('[OAuth] Warning: No Client Secret configured - OAuth login will not work');
}

// Helper: Exchange code for token
async function exchangeCodeForToken(code) {
    const params = new URLSearchParams({
        client_id: config.client_id,
        client_secret: OAUTH_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: OAUTH_REDIRECT_URI
    });
    
    const response = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
    });
    
    return await response.json();
}

// Helper: Get user info with token
async function getUserInfo(accessToken) {
    const response = await fetch('https://discord.com/api/users/@me', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    return await response.json();
}

// Helper: Add user to guild (auto-join)
async function addUserToGuild(userId, accessToken) {
    try {
        const response = await fetch(`https://discord.com/api/guilds/${NEXUS_GUILD_ID}/members/${userId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bot ${config.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ access_token: accessToken })
        });
        
        if (response.status === 201) {
            log('info', `User ${userId} joined Nexus+ server`);
            return { success: true, message: 'Joined server' };
        } else if (response.status === 204) {
            return { success: true, message: 'Already a member' };
        } else {
            const error = await response.json();
            log('error', `Failed to add user to guild: ${JSON.stringify(error)}`);
            return { success: false, error: error.message || 'Failed to join' };
        }
    } catch (error) {
        log('error', `Add to guild error: ${error.message}`);
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
        // Status endpoint - Enhanced with more details
        if (req.method === 'GET' && url.pathname === '/status') {
            const isReady = client.isReady();
            const guild = client.guilds.cache.get(config.guild_id) || client.guilds.cache.first();
            
            // Calculate memory usage
            const memUsage = process.memoryUsage();
            const memoryMB = Math.round(memUsage.heapUsed / 1024 / 1024);
            
            // Count active features
            const settings = guild ? getGuildSettings(guild.id) : {};
            const activeFeatures = [];
            if (settings.automod?.enabled) activeFeatures.push('AutoMod');
            if (settings.welcome?.enabled) activeFeatures.push('Welcome');
            if (settings.leveling?.enabled) activeFeatures.push('Leveling');
            if (settings.goodbye?.enabled) activeFeatures.push('Goodbye');
            
            const statusData = { 
                online: isReady,
                botTag: client.user ? client.user.tag : null,
                botId: client.user ? client.user.id : null,
                botAvatar: client.user ? client.user.displayAvatarURL({ size: 128 }) : null,
                ping: isReady ? client.ws.ping : -1,
                uptime: isReady ? (Date.now() - botStartTime) : 0,
                uptimeFormatted: isReady ? formatUptime(Date.now() - botStartTime) : '-',
                memberCount: guild ? guild.memberCount : 0,
                serverName: guild ? guild.name : null,
                serverIcon: guild ? guild.iconURL({ size: 128 }) : null,
                serverCount: client.guilds.cache.size,
                channelCount: guild ? guild.channels.cache.size : 0,
                roleCount: guild ? guild.roles.cache.size : 0,
                memory: memoryMB,
                nodeVersion: process.version,
                activeFeatures: activeFeatures,
                commandsLoaded: commands.length,
                source: 'local-bot-47832',
                timestamp: Date.now()
            };
            res.writeHead(200);
            res.end(JSON.stringify(statusData));
        }
        
        // Quick Stats endpoint - Lightweight status check
        else if (req.method === 'GET' && url.pathname === '/ping') {
            res.writeHead(200);
            res.end(JSON.stringify({ 
                online: client.isReady(), 
                ping: client.ws.ping,
                timestamp: Date.now()
            }));
        }
        
        // Servers list endpoint - All connected servers
        else if (req.method === 'GET' && url.pathname === '/servers') {
            const servers = client.guilds.cache.map(g => ({
                id: g.id,
                name: g.name,
                icon: g.iconURL({ size: 64 }),
                memberCount: g.memberCount,
                ownerId: g.ownerId,
                boostLevel: g.premiumTier,
                boostCount: g.premiumSubscriptionCount || 0,
                channels: g.channels.cache.size,
                roles: g.roles.cache.size,
                isActive: g.id === config.guild_id
            }));
            res.writeHead(200);
            res.end(JSON.stringify({ success: true, servers }));
        }
        
        // Switch active server
        else if (req.method === 'POST' && url.pathname === '/switch-server') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const { guildId } = JSON.parse(body);
                    const guild = client.guilds.cache.get(guildId);
                    if (!guild) {
                        res.writeHead(404);
                        res.end(JSON.stringify({ success: false, error: 'Server not found' }));
                        return;
                    }
                    
                    config.guild_id = guildId;
                    guildDataCache = null; // Clear cache
                    log('info', `Switched active server to: ${guild.name}`);
                    
                    res.writeHead(200);
                    res.end(JSON.stringify({ 
                        success: true, 
                        server: { id: guild.id, name: guild.name }
                    }));
                } catch (e) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ success: false, error: e.message }));
                }
            });
            return;
        }
        
        // Bot control endpoint
        else if (req.method === 'POST' && url.pathname === '/control') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const { command } = JSON.parse(body);
                    
                    switch (command) {
                        case 'reload-commands':
                            await deployCommands();
                            res.writeHead(200);
                            res.end(JSON.stringify({ success: true, message: 'Commands reloaded' }));
                            break;
                            
                        case 'clear-cache':
                            guildDataCache = null;
                            lastCacheUpdate = 0;
                            res.writeHead(200);
                            res.end(JSON.stringify({ success: true, message: 'Cache cleared' }));
                            break;
                            
                        case 'reload-settings':
                            loadAllData();
                            loadStatusConfig();
                            res.writeHead(200);
                            res.end(JSON.stringify({ success: true, message: 'Settings reloaded' }));
                            break;
                            
                        case 'save-all':
                            saveData(ticketsFile, ticketData);
                            saveData(warnsFile, warnData);
                            saveData(levelsFile, levelData);
                            saveData(settingsFile, settingsData);
                            saveData(giveawaysFile, giveawayData);
                            res.writeHead(200);
                            res.end(JSON.stringify({ success: true, message: 'All data saved' }));
                            break;
                            
                        default:
                            res.writeHead(400);
                            res.end(JSON.stringify({ success: false, error: 'Unknown command' }));
                    }
                } catch (e) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ success: false, error: e.message }));
                }
            });
            return;
        }
        
        // Quick actions endpoint
        else if (req.method === 'POST' && url.pathname === '/quick-action') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const { action, target, value } = JSON.parse(body);
                    const guild = client.guilds.cache.get(config.guild_id);
                    if (!guild) {
                        res.writeHead(404);
                        res.end(JSON.stringify({ success: false, error: 'Guild not found' }));
                        return;
                    }
                    
                    let result = { success: false };
                    
                    switch (action) {
                        case 'dm-user': {
                            const user = await client.users.fetch(target);
                            await user.send(value);
                            result = { success: true, message: `DM sent to ${user.tag}` };
                            break;
                        }
                        
                        case 'announce': {
                            const channel = guild.channels.cache.get(target);
                            if (!channel) throw new Error('Channel not found');
                            const embed = new EmbedBuilder()
                                .setColor('#FF0033')
                                .setTitle('📢 Announcement')
                                .setDescription(value)
                                .setTimestamp();
                            await channel.send({ embeds: [embed] });
                            result = { success: true, message: `Announcement sent to #${channel.name}` };
                            break;
                        }
                        
                        case 'set-nickname': {
                            const member = await guild.members.fetch(target);
                            await member.setNickname(value || null);
                            result = { success: true, message: `Nickname updated for ${member.user.tag}` };
                            break;
                        }
                        
                        case 'add-role': {
                            const [userId, roleId] = target.split(':');
                            const member = await guild.members.fetch(userId);
                            await member.roles.add(roleId);
                            result = { success: true, message: `Role added to ${member.user.tag}` };
                            break;
                        }
                        
                        case 'remove-role': {
                            const [userId, roleId] = target.split(':');
                            const member = await guild.members.fetch(userId);
                            await member.roles.remove(roleId);
                            result = { success: true, message: `Role removed from ${member.user.tag}` };
                            break;
                        }
                        
                        case 'timeout-user': {
                            const member = await guild.members.fetch(target);
                            const duration = parseInt(value) * 60 * 1000; // minutes to ms
                            await member.timeout(duration, 'Timeout via Nexus Tool');
                            result = { success: true, message: `${member.user.tag} timed out for ${value} minutes` };
                            break;
                        }
                        
                        case 'remove-timeout': {
                            const member = await guild.members.fetch(target);
                            await member.timeout(null);
                            result = { success: true, message: `Timeout removed from ${member.user.tag}` };
                            break;
                        }
                        
                        default:
                            result = { success: false, error: 'Unknown action' };
                    }
                    
                    log('info', `Quick action: ${action} - ${result.message || result.error}`);
                    res.writeHead(result.success ? 200 : 400);
                    res.end(JSON.stringify(result));
                } catch (e) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ success: false, error: e.message }));
                }
            });
            return;
        }
        
        // Logs endpoint - Get recent logs
        else if (req.method === 'GET' && url.pathname === '/logs') {
            const limit = parseInt(url.searchParams.get('limit')) || 100;
            try {
                const logPath = path.join(DATA_DIR, 'bot.log');
                if (fs.existsSync(logPath)) {
                    const content = fs.readFileSync(logPath, 'utf8');
                    const lines = content.split('\n').filter(l => l.trim());
                    const recentLogs = lines.slice(-limit);
                    res.writeHead(200);
                    res.end(JSON.stringify({ success: true, logs: recentLogs }));
                } else {
                    res.writeHead(200);
                    res.end(JSON.stringify({ success: true, logs: [] }));
                }
            } catch (e) {
                res.writeHead(500);
                res.end(JSON.stringify({ success: false, error: e.message }));
            }
        }
        
        // Data endpoint
        else if (req.method === 'GET' && url.pathname === '/data') {
            const data = await getGuildData();
            if (data) {
                res.writeHead(200);
                res.end(JSON.stringify(data));
            } else {
                res.writeHead(503);
                res.end(JSON.stringify({ error: 'Bot not ready' }));
            }
        }
        // Action endpoint
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
                    res.end(JSON.stringify({ success: false, error: 'Invalid request' }));
                }
            });
        }
        // OAuth2 Callback
        else if (req.method === 'GET' && url.pathname === '/callback') {
            const code = url.searchParams.get('code');
            
            if (!code) {
                res.writeHead(400);
                res.setHeader('Content-Type', 'text/html');
                res.end('<html><body><h1>Error: No code provided</h1><script>setTimeout(() => window.close(), 3000);</script></body></html>');
                return;
            }
            
            try {
                // Exchange code for token
                const tokenData = await exchangeCodeForToken(code);
                
                if (tokenData.error) {
                    throw new Error(tokenData.error_description || tokenData.error);
                }
                
                // Get user info
                const user = await getUserInfo(tokenData.access_token);
                
                // Add avatar URL
                if (user.avatar) {
                    user.avatar = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`;
                } else {
                    user.avatar = `https://cdn.discordapp.com/embed/avatars/${parseInt(user.discriminator || '0') % 5}.png`;
                }
                
                // Auto-join to Nexus+ server
                if (tokenData.scope?.includes('guilds.join')) {
                    const joinResult = await addUserToGuild(user.id, tokenData.access_token);
                    user.joinedNexus = joinResult.success;
                    log('info', `OAuth login: ${user.username} - Auto-join: ${joinResult.message}`);
                }
                
                // Store current user
                currentOAuthUser = user;
                
                log('info', `OAuth login successful: ${user.username}#${user.discriminator || '0'}`);
                
                // Return HTML page that closes itself
                res.writeHead(200);
                res.setHeader('Content-Type', 'text/html');
                res.end(`
                    <html>
                    <head>
                        <title>Login Successful</title>
                        <style>
                            body { font-family: 'Segoe UI', sans-serif; background: #0d0d0d; color: white; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                            .container { text-align: center; }
                            img { width: 100px; height: 100px; border-radius: 50%; border: 3px solid #ff0033; }
                            h1 { color: #ff0033; }
                            p { color: #888; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <img src="${user.avatar}" alt="Avatar">
                            <h1>Welcome, ${user.username}!</h1>
                            <p>You can close this window and return to the app.</p>
                            ${user.joinedNexus ? '<p style="color: #00d26a;">✅ Joined Nexus+ Server</p>' : ''}
                            <script>setTimeout(() => window.close(), 3000);</script>
                        </div>
                    </body>
                    </html>
                `);
            } catch (error) {
                log('error', `OAuth error: ${error.message}`);
                res.writeHead(500);
                res.setHeader('Content-Type', 'text/html');
                res.end(`<html><body><h1>Error: ${error.message}</h1><script>setTimeout(() => window.close(), 5000);</script></body></html>`);
            }
        }
        // Get current OAuth user
        else if (req.method === 'GET' && url.pathname === '/auth/user') {
            if (currentOAuthUser) {
                res.writeHead(200);
                res.end(JSON.stringify(currentOAuthUser));
            } else {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'No user logged in' }));
            }
        }
        // Clear OAuth user (logout)
        else if (req.method === 'POST' && url.pathname === '/auth/logout') {
            currentOAuthUser = null;
            res.writeHead(200);
            res.end(JSON.stringify({ success: true }));
        }
        else {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Not found' }));
        }
    } catch (error) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: error.message }));
    }
});

// ==================== SLASH COMMANDS ====================
const commands = [
    // Basic Commands
    new SlashCommandBuilder().setName('ping').setDescription('Shows bot latency'),
    new SlashCommandBuilder().setName('info').setDescription('Shows bot information'),
    new SlashCommandBuilder().setName('serverinfo').setDescription('Shows server information'),
    new SlashCommandBuilder().setName('userinfo').setDescription('Shows user information')
        .addUserOption(o => o.setName('user').setDescription('The user')),
    
    // Moderation
    new SlashCommandBuilder().setName('kick').setDescription('Kicks a user')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason'))
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
    
    new SlashCommandBuilder().setName('ban').setDescription('Bans a user')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason'))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    
    new SlashCommandBuilder().setName('mute').setDescription('Mutes a user')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
        .addIntegerOption(o => o.setName('duration').setDescription('Duration in minutes').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    
    new SlashCommandBuilder().setName('unmute').setDescription('Unmutes a user')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    
    new SlashCommandBuilder().setName('clear').setDescription('Deletes messages')
        .addIntegerOption(o => o.setName('amount').setDescription('Amount (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    
    // Warn System
    new SlashCommandBuilder().setName('warn').setDescription('Warns a user')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    
    new SlashCommandBuilder().setName('warnings').setDescription('Shows warnings')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)),
    
    new SlashCommandBuilder().setName('clearwarns').setDescription('Clears all warnings')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    
    // Channel Management
    new SlashCommandBuilder().setName('createchannel').setDescription('Creates a channel')
        .addStringOption(o => o.setName('name').setDescription('Name').setRequired(true))
        .addStringOption(o => o.setName('type').setDescription('Type').addChoices({ name: 'Text', value: 'text' }, { name: 'Voice', value: 'voice' }))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    
    new SlashCommandBuilder().setName('createrole').setDescription('Creates a role')
        .addStringOption(o => o.setName('name').setDescription('Name').setRequired(true))
        .addStringOption(o => o.setName('color').setDescription('Color (#HEX)'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    
    // Ticket System
    new SlashCommandBuilder().setName('ticket').setDescription('Ticket System')
        .addSubcommand(s => s.setName('setup').setDescription('Setup the ticket system')
            .addChannelOption(o => o.setName('channel').setDescription('Channel').setRequired(true))
            .addRoleOption(o => o.setName('support_role').setDescription('Support Role')))
        .addSubcommand(s => s.setName('close').setDescription('Closes the ticket'))
        .addSubcommand(s => s.setName('add').setDescription('Adds a user')
            .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)))
        .addSubcommand(s => s.setName('remove').setDescription('Removes a user')
            .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    
    // Leveling
    new SlashCommandBuilder().setName('level').setDescription('Shows your level'),
    new SlashCommandBuilder().setName('leaderboard').setDescription('Shows the leaderboard'),
    
    // Giveaway
    new SlashCommandBuilder().setName('giveaway').setDescription('Giveaway System')
        .addSubcommand(s => s.setName('start').setDescription('Starts a giveaway')
            .addStringOption(o => o.setName('prize').setDescription('Prize').setRequired(true))
            .addStringOption(o => o.setName('duration').setDescription('Duration (e.g. 1h, 30m, 1d)').setRequired(true))
            .addIntegerOption(o => o.setName('winners').setDescription('Number of winners').setMinValue(1).setMaxValue(10)))
        .addSubcommand(s => s.setName('end').setDescription('Ends a giveaway')
            .addStringOption(o => o.setName('message_id').setDescription('Message ID').setRequired(true)))
        .addSubcommand(s => s.setName('reroll').setDescription('Selects new winners')
            .addStringOption(o => o.setName('message_id').setDescription('Message ID').setRequired(true)))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    
    // Reaction Roles
    new SlashCommandBuilder().setName('reactionrole').setDescription('Reaction Role Setup')
        .addChannelOption(o => o.setName('channel').setDescription('Channel').setRequired(true))
        .addStringOption(o => o.setName('message').setDescription('Message').setRequired(true))
        .addStringOption(o => o.setName('emoji1').setDescription('Emoji 1').setRequired(true))
        .addRoleOption(o => o.setName('role1').setDescription('Role 1').setRequired(true))
        .addStringOption(o => o.setName('emoji2').setDescription('Emoji 2'))
        .addRoleOption(o => o.setName('role2').setDescription('Role 2'))
        .addStringOption(o => o.setName('emoji3').setDescription('Emoji 3'))
        .addRoleOption(o => o.setName('role3').setDescription('Role 3'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    
    // Utility
    new SlashCommandBuilder().setName('announce').setDescription('Sends an announcement')
        .addStringOption(o => o.setName('message').setDescription('Message').setRequired(true))
        .addChannelOption(o => o.setName('channel').setDescription('Channel'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    
    new SlashCommandBuilder().setName('poll').setDescription('Creates a poll')
        .addStringOption(o => o.setName('question').setDescription('Question').setRequired(true))
        .addStringOption(o => o.setName('options').setDescription('Options (comma-separated)').setRequired(true)),
    
    new SlashCommandBuilder().setName('stats').setDescription('Server statistics'),
    
    // Help Command
    new SlashCommandBuilder().setName('help').setDescription('Shows all commands and active settings')
        .addStringOption(o => o.setName('category').setDescription('Command category')
            .addChoices(
                { name: 'All', value: 'all' },
                { name: 'Moderation', value: 'moderation' },
                { name: 'Tickets', value: 'tickets' },
                { name: 'Leveling', value: 'leveling' },
                { name: 'Giveaways', value: 'giveaways' },
                { name: 'Utility', value: 'utility' },
                { name: 'Settings', value: 'settings' }
            )),
    
    // Settings
    new SlashCommandBuilder().setName('settings').setDescription('Bot settings')
        .addSubcommand(s => s.setName('automod').setDescription('Auto-Moderation')
            .addBooleanOption(o => o.setName('enabled').setDescription('Enabled')))
        .addSubcommand(s => s.setName('welcome').setDescription('Welcome messages')
            .addBooleanOption(o => o.setName('enabled').setDescription('Enabled'))
            .addChannelOption(o => o.setName('channel').setDescription('Channel'))
            .addRoleOption(o => o.setName('autorole').setDescription('Auto-Role')))
        .addSubcommand(s => s.setName('leveling').setDescription('Leveling System')
            .addBooleanOption(o => o.setName('enabled').setDescription('Enabled'))
            .addChannelOption(o => o.setName('channel').setDescription('Announcement channel')))
        .addSubcommand(s => s.setName('view').setDescription('Shows current settings'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    
    // NEW: Additional Moderation Commands
    new SlashCommandBuilder().setName('slowmode').setDescription('Set channel slowmode')
        .addIntegerOption(o => o.setName('seconds').setDescription('Slowmode in seconds (0 to disable)').setRequired(true).setMinValue(0).setMaxValue(21600))
        .addChannelOption(o => o.setName('channel').setDescription('Target channel (default: current)'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    
    new SlashCommandBuilder().setName('lock').setDescription('Lock a channel (prevent messages)')
        .addChannelOption(o => o.setName('channel').setDescription('Target channel (default: current)'))
        .addStringOption(o => o.setName('reason').setDescription('Reason for locking'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    
    new SlashCommandBuilder().setName('unlock').setDescription('Unlock a channel')
        .addChannelOption(o => o.setName('channel').setDescription('Target channel (default: current)'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    
    new SlashCommandBuilder().setName('avatar').setDescription('Show user avatar')
        .addUserOption(o => o.setName('user').setDescription('Target user (default: yourself)')),
    
    new SlashCommandBuilder().setName('banner').setDescription('Show user or server banner')
        .addUserOption(o => o.setName('user').setDescription('Target user'))
        .addBooleanOption(o => o.setName('server').setDescription('Show server banner instead')),
    
    new SlashCommandBuilder().setName('role').setDescription('Manage user roles')
        .addSubcommand(s => s.setName('add').setDescription('Add a role to a user')
            .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
            .addRoleOption(o => o.setName('role').setDescription('Role to add').setRequired(true)))
        .addSubcommand(s => s.setName('remove').setDescription('Remove a role from a user')
            .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
            .addRoleOption(o => o.setName('role').setDescription('Role to remove').setRequired(true)))
        .addSubcommand(s => s.setName('info').setDescription('Show role information')
            .addRoleOption(o => o.setName('role').setDescription('Role to inspect').setRequired(true)))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    
    new SlashCommandBuilder().setName('purge').setDescription('Delete messages with filters')
        .addIntegerOption(o => o.setName('amount').setDescription('Number of messages (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
        .addStringOption(o => o.setName('filter').setDescription('Filter type')
            .addChoices(
                { name: 'All messages', value: 'all' },
                { name: 'Bot messages only', value: 'bots' },
                { name: 'Human messages only', value: 'humans' },
                { name: 'Messages with attachments', value: 'attachments' },
                { name: 'Messages with embeds', value: 'embeds' },
                { name: 'Messages with links', value: 'links' }
            ))
        .addUserOption(o => o.setName('user').setDescription('Only messages from this user'))
        .addStringOption(o => o.setName('contains').setDescription('Only messages containing this text'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    
    new SlashCommandBuilder().setName('nickname').setDescription('Change a user nickname')
        .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
        .addStringOption(o => o.setName('nickname').setDescription('New nickname (leave empty to reset)'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),
    
    new SlashCommandBuilder().setName('remind').setDescription('Set a reminder')
        .addStringOption(o => o.setName('time').setDescription('Time (e.g. 10m, 1h, 1d)').setRequired(true))
        .addStringOption(o => o.setName('message').setDescription('Reminder message').setRequired(true)),
    
    new SlashCommandBuilder().setName('afk').setDescription('Set your AFK status')
        .addStringOption(o => o.setName('reason').setDescription('AFK reason')),
    
    new SlashCommandBuilder().setName('unban').setDescription('Unban a user')
        .addStringOption(o => o.setName('user_id').setDescription('User ID to unban').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason for unban'))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    
    new SlashCommandBuilder().setName('softban').setDescription('Ban and immediately unban (clears messages)')
        .addUserOption(o => o.setName('user').setDescription('User to softban').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason'))
        .addIntegerOption(o => o.setName('days').setDescription('Days of messages to delete (1-7)').setMinValue(1).setMaxValue(7))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    
    new SlashCommandBuilder().setName('embed').setDescription('Send a custom embed message')
        .addStringOption(o => o.setName('title').setDescription('Embed title').setRequired(true))
        .addStringOption(o => o.setName('description').setDescription('Embed description').setRequired(true))
        .addStringOption(o => o.setName('color').setDescription('Embed color (hex, e.g. #FF0000)'))
        .addChannelOption(o => o.setName('channel').setDescription('Target channel'))
        .addStringOption(o => o.setName('footer').setDescription('Footer text'))
        .addStringOption(o => o.setName('image').setDescription('Image URL'))
        .addStringOption(o => o.setName('thumbnail').setDescription('Thumbnail URL'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
];

async function deployCommands() {
    const rest = new REST({ version: '10' }).setToken(config.token);
    try {
        log('info', 'Registering Slash Commands...');
        if (config.guild_id) {
            await rest.put(Routes.applicationGuildCommands(config.client_id, config.guild_id), { body: commands.map(c => c.toJSON()) });
            log('info', `${commands.length} Guild Commands registered`);
        } else {
            await rest.put(Routes.applicationCommands(config.client_id), { body: commands.map(c => c.toJSON()) });
            log('info', `${commands.length} global Commands registered`);
        }
    } catch (error) {
        log('error', `Command registration failed: ${error.message}`);
    }
}

// ==================== EVENT HANDLERS ====================

// Ready
client.once('ready', async () => {
    log('info', `Bot logged in as ${client.user.tag}`);
    log('info', `Connected to ${client.guilds.cache.size} server(s)`);
    
    // Initial status update
    updateBotStatus();
    
    // Update status every 30 seconds
    setInterval(updateBotStatus, 30000);
    
    await deployCommands();
    
    // Initialize scheduled messages
    initScheduledMessages();
    
    apiServer.listen(API_PORT, '127.0.0.1', () => {
        log('info', `API Server running on port ${API_PORT}`);
    });
});

// Message Create
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // Track message stats
    trackMessageStats(message.guild.id);

    // AFK System - Check if author was AFK and remove their status
    if (afkData.has(message.author.id)) {
        const afk = afkData.get(message.author.id);
        afkData.delete(message.author.id);
        
        const duration = Date.now() - afk.since;
        const minutes = Math.floor(duration / 60000);
        
        const welcomeBack = await message.reply({ 
            content: `👋 Welcome back ${message.author}! You were AFK for ${minutes} minute${minutes !== 1 ? 's' : ''}.`,
            allowedMentions: { repliedUser: false }
        });
        setTimeout(() => welcomeBack.delete().catch(() => {}), 5000);
    }

    // AFK System - Check if mentioned users are AFK
    if (message.mentions.users.size > 0) {
        const afkMessages = [];
        message.mentions.users.forEach((user) => {
            if (afkData.has(user.id)) {
                const afk = afkData.get(user.id);
                afkMessages.push(`💤 **${user.username}** is AFK: ${afk.reason} (since <t:${Math.floor(afk.since / 1000)}:R>)`);
            }
        });
        
        if (afkMessages.length > 0) {
            const afkNotice = await message.reply({ 
                content: afkMessages.join('\n'),
                allowedMentions: { repliedUser: false }
            });
            setTimeout(() => afkNotice.delete().catch(() => {}), 10000);
        }
    }

    // Auto Moderation
    const moderated = await handleAutoMod(message);
    if (moderated) return;

    // Leveling XP
    const settings = getGuildSettings(message.guild.id);
    if (settings.leveling?.enabled) {
        // Check if channel is ignored
        if (settings.leveling.ignoredChannels?.includes(message.channel.id)) {
            return;
        }
        
        // Check if user has an ignored role
        if (settings.leveling.ignoredRoles?.some(roleId => message.member?.roles.cache.has(roleId))) {
            return;
        }
        
        // Check minimum message length
        if (settings.leveling.minMessageLength && message.content.length < settings.leveling.minMessageLength) {
            return;
        }
        
        const key = `${message.guild.id}-${message.author.id}`;
        const cooldown = xpCooldowns.get(key);
        const now = Date.now();

        if (!cooldown || now - cooldown > settings.leveling.xpCooldown) {
            xpCooldowns.set(key, now);
            
            // Calculate XP with boost multiplier
            let xpAmount = settings.leveling.xpPerMessage;
            
            // Apply global multiplier
            if (settings.leveling.xpMultiplier) {
                xpAmount *= settings.leveling.xpMultiplier;
            }
            
            // Apply role-based XP boost
            if (settings.leveling.xpBoostRoles) {
                for (const [roleId, multiplier] of Object.entries(settings.leveling.xpBoostRoles)) {
                    if (message.member?.roles.cache.has(roleId)) {
                        xpAmount *= multiplier;
                        break; // Only apply highest boost
                    }
                }
            }
            
            xpAmount = Math.floor(xpAmount);
            const result = addXP(message.guild.id, message.author.id, xpAmount);
            
            if (result) {
                // Level Up!
                const channel = settings.leveling.announceChannel 
                    ? message.guild.channels.cache.get(settings.leveling.announceChannel)
                    : message.channel;
                
                if (channel) {
                    const announceMsg = (settings.leveling.announceMessage || '🎉 {user} is now Level {level}!')
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
        log('info', `Reaction Role: ${user.tag} received ${role.name}`);
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
        log('info', `Reaction Role: ${user.tag} lost ${role.name}`);
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
        } else if (interaction.customId === 'claim_ticket') {
            await handleTicketClaim(interaction);
        } else if (interaction.customId === 'unclaim_ticket') {
            await handleTicketUnclaim(interaction);
        } else if (interaction.customId === 'transcript_ticket') {
            await handleTicketTranscript(interaction);
        }
    }
});

// Ticket Claim Function
async function handleTicketClaim(interaction) {
    const ticket = ticketData.tickets[interaction.channel.id];
    if (!ticket) return interaction.reply({ content: 'This is not a ticket channel.', ephemeral: true });
    
    if (ticket.claimedBy) {
        return interaction.reply({ content: `This ticket is already claimed by <@${ticket.claimedBy}>.`, ephemeral: true });
    }
    
    ticket.claimedBy = interaction.user.id;
    ticket.claimedAt = Date.now();
    saveData(ticketsFile, ticketData);
    
    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('✋ Ticket Claimed')
        .setDescription(`${interaction.user} has claimed this ticket and will assist you.`)
        .setTimestamp();
    
    // Update the ticket message with new buttons
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
        new ButtonBuilder().setCustomId('unclaim_ticket').setLabel('Unclaim').setStyle(ButtonStyle.Secondary).setEmoji('↩️'),
        new ButtonBuilder().setCustomId('transcript_ticket').setLabel('Transcript').setStyle(ButtonStyle.Primary).setEmoji('📝')
    );
    
    await interaction.update({ components: [row] });
    await interaction.channel.send({ embeds: [embed] });
    log('info', `Ticket claimed by ${interaction.user.tag}`);
}

// Ticket Unclaim Function
async function handleTicketUnclaim(interaction) {
    const ticket = ticketData.tickets[interaction.channel.id];
    if (!ticket) return interaction.reply({ content: 'This is not a ticket channel.', ephemeral: true });
    
    if (!ticket.claimedBy) {
        return interaction.reply({ content: 'This ticket is not claimed.', ephemeral: true });
    }
    
    if (ticket.claimedBy !== interaction.user.id && !interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return interaction.reply({ content: 'Only the claimer or a moderator can unclaim this ticket.', ephemeral: true });
    }
    
    const previousClaimer = ticket.claimedBy;
    ticket.claimedBy = null;
    ticket.claimedAt = null;
    saveData(ticketsFile, ticketData);
    
    const embed = new EmbedBuilder()
        .setColor('#FFA500')
        .setTitle('↩️ Ticket Unclaimed')
        .setDescription(`<@${previousClaimer}> has unclaimed this ticket. It's now available for other staff members.`)
        .setTimestamp();
    
    // Update buttons back to original state
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
        new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim').setStyle(ButtonStyle.Success).setEmoji('✋'),
        new ButtonBuilder().setCustomId('transcript_ticket').setLabel('Transcript').setStyle(ButtonStyle.Primary).setEmoji('📝')
    );
    
    await interaction.update({ components: [row] });
    await interaction.channel.send({ embeds: [embed] });
    log('info', `Ticket unclaimed by ${interaction.user.tag}`);
}

// Ticket Transcript Function
async function handleTicketTranscript(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    try {
        const messages = await interaction.channel.messages.fetch({ limit: 100 });
        const sorted = [...messages.values()].reverse();
        
        let transcript = `=== Ticket Transcript ===\n`;
        transcript += `Channel: ${interaction.channel.name}\n`;
        transcript += `Date: ${new Date().toISOString()}\n`;
        transcript += `Messages: ${sorted.length}\n`;
        transcript += `${'='.repeat(50)}\n\n`;
        
        for (const msg of sorted) {
            const time = new Date(msg.createdTimestamp).toLocaleString();
            transcript += `[${time}] ${msg.author.tag}:\n`;
            if (msg.content) transcript += `  ${msg.content}\n`;
            if (msg.attachments.size > 0) {
                transcript += `  [Attachments: ${msg.attachments.map(a => a.url).join(', ')}]\n`;
            }
            if (msg.embeds.length > 0) {
                transcript += `  [${msg.embeds.length} embed(s)]\n`;
            }
            transcript += '\n';
        }
        
        const buffer = Buffer.from(transcript, 'utf-8');
        const attachment = new AttachmentBuilder(buffer, { name: `transcript-${interaction.channel.name}.txt` });
        
        await interaction.editReply({ 
            content: `📝 Transcript generated with ${sorted.length} messages.`,
            files: [attachment]
        });
        
        log('info', `Ticket transcript generated by ${interaction.user.tag}`);
    } catch (e) {
        await interaction.editReply({ content: `Error generating transcript: ${e.message}` });
        log('error', `Transcript error: ${e.message}`);
    }
}

// Ticket Functions
async function handleTicketCreate(interaction) {
    const guild = interaction.guild;
    const user = interaction.user;
    
    const existingTicket = Object.entries(ticketData.tickets || {}).find(
        ([_, t]) => t.userId === user.id && t.status === 'open'
    );
    
    if (existingTicket) {
        return interaction.reply({ 
            content: `You already have an open ticket: <#${existingTicket[1].channelId}>`, 
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
            number: ticketNumber,
            channelId: channel.id,
            channelName: channel.name,
            userId: user.id,
            userName: user.tag,
            userAvatar: user.displayAvatarURL(),
            createdAt: Date.now(),
            status: 'open',
            claimedBy: null,
            claimedAt: null,
            priority: 'normal'
        };
        saveData(ticketsFile, ticketData);
        
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle(`🎫 Ticket #${ticketNumber}`)
            .setDescription(`Welcome ${user}!\n\nPlease describe your issue and a staff member will assist you shortly.`)
            .addFields(
                { name: 'Created by', value: user.tag, inline: true },
                { name: 'Created at', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                { name: 'Status', value: '🟡 Waiting for support', inline: true }
            )
            .setThumbnail(user.displayAvatarURL())
            .setTimestamp();
        
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
            new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim').setStyle(ButtonStyle.Success).setEmoji('✋'),
            new ButtonBuilder().setCustomId('transcript_ticket').setLabel('Transcript').setStyle(ButtonStyle.Primary).setEmoji('📝')
        );
        
        await channel.send({ 
            content: settings.supportRoleId ? `<@&${settings.supportRoleId}>` : '',
            embeds: [embed], components: [row] 
        });
        
        log('info', `Ticket #${ticketNumber} created by ${user.tag}`);
        await interaction.editReply({ content: `Ticket created: ${channel}` });
    } catch (error) {
        log('error', `Ticket Create Error: ${error.message}`);
        await interaction.editReply({ content: 'Error creating ticket.' });
    }
}

async function handleTicketClose(interaction) {
    const embed = new EmbedBuilder()
        .setColor('#FFA500')
        .setTitle('⚠️ Close Ticket?')
        .setDescription('Are you sure you want to close this ticket?');
    
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('confirm_close_ticket').setLabel('Yes').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('cancel_close').setLabel('No').setStyle(ButtonStyle.Secondary)
    );
    
    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

async function confirmTicketClose(interaction) {
    const ticket = ticketData.tickets[interaction.channel.id];
    if (!ticket) return interaction.reply({ content: 'Not a ticket.', ephemeral: true });
    
    await interaction.update({ content: 'Closing ticket...', embeds: [], components: [] });
    
    ticket.status = 'closed';
    ticket.closedAt = Date.now();
    saveData(ticketsFile, ticketData);
    
    const embed = new EmbedBuilder().setColor('#FF0000').setTitle('🔒 Ticket Closed').setTimestamp();
    await interaction.channel.send({ embeds: [embed] });
    
    log('info', `Ticket #${ticket.number} closed`);
    
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
                        { name: 'Members', value: `${g.memberCount}`, inline: true },
                        { name: 'Channels', value: `${g.channels.cache.size}`, inline: true },
                        { name: 'Roles', value: `${g.roles.cache.size}`, inline: true },
                        { name: 'Created', value: `<t:${Math.floor(g.createdTimestamp / 1000)}:R>`, inline: true },
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
                        { name: 'Created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true }
                    );
                if (member) {
                    embed.addFields({ name: 'Joined', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true });
                }
                await interaction.reply({ embeds: [embed] });
                break;
            }

            case 'kick': {
                const user = interaction.options.getUser('user');
                const reason = interaction.options.getString('reason') || 'No reason provided';
                const member = await interaction.guild.members.fetch(user.id);
                if (!member.kickable) return interaction.reply({ content: 'Cannot kick this user!', ephemeral: true });
                await member.kick(reason);
                log('info', `Kick: ${user.tag} - ${reason}`);
                await interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('Kicked').setDescription(`${user.tag} has been kicked.\nReason: ${reason}`)] });
                break;
            }

            case 'ban': {
                const user = interaction.options.getUser('user');
                const reason = interaction.options.getString('reason') || 'No reason provided';
                await interaction.guild.members.ban(user, { reason });
                log('info', `Ban: ${user.tag} - ${reason}`);
                await interaction.reply({ embeds: [new EmbedBuilder().setColor('#FF0000').setTitle('Banned').setDescription(`${user.tag} has been banned.\nReason: ${reason}`)] });
                break;
            }

            case 'mute': {
                const user = interaction.options.getUser('user');
                const duration = interaction.options.getInteger('duration');
                const reason = interaction.options.getString('reason') || 'No reason provided';
                const member = await interaction.guild.members.fetch(user.id);
                await member.timeout(duration * 60 * 1000, reason);
                log('info', `Mute: ${user.tag} for ${duration}m - ${reason}`);
                await interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('Muted').setDescription(`${user.tag} has been muted for ${duration} minutes.\nReason: ${reason}`)] });
                break;
            }

            case 'unmute': {
                const user = interaction.options.getUser('user');
                const member = await interaction.guild.members.fetch(user.id);
                await member.timeout(null);
                log('info', `Unmute: ${user.tag}`);
                await interaction.reply({ embeds: [new EmbedBuilder().setColor('#00FF00').setTitle('Unmuted').setDescription(`${user.tag} has been unmuted.`)] });
                break;
            }

            case 'clear': {
                const amount = interaction.options.getInteger('amount');
                const deleted = await interaction.channel.bulkDelete(amount, true);
                await interaction.reply({ content: `${deleted.size} messages deleted.`, ephemeral: true });
                break;
            }

            case 'warn': {
                const user = interaction.options.getUser('user');
                const reason = interaction.options.getString('reason');
                const count = addWarn(interaction.guild.id, user.id, interaction.user.id, reason);
                log('info', `Warn: ${user.tag} - ${reason} (${count} total)`);
                await interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('⚠️ Warning').setDescription(`${user} has been warned.\n**Reason:** ${reason}\n**Warnings:** ${count}`)] });
                break;
            }

            case 'warnings': {
                const user = interaction.options.getUser('user');
                const warns = getWarns(interaction.guild.id, user.id);
                if (warns.length === 0) {
                    await interaction.reply({ content: `${user.tag} has no warnings.`, ephemeral: true });
                } else {
                    const list = warns.map((w, i) => `**${i + 1}.** ${w.reason} - <t:${Math.floor(w.timestamp / 1000)}:R>`).join('\n');
                    await interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle(`Warnings: ${user.tag}`).setDescription(list)] });
                }
                break;
            }

            case 'clearwarns': {
                const user = interaction.options.getUser('user');
                clearWarns(interaction.guild.id, user.id);
                await interaction.reply({ content: `Warnings cleared for ${user.tag}.`, ephemeral: true });
                break;
            }

            case 'createchannel': {
                const name = interaction.options.getString('name');
                const type = interaction.options.getString('type') || 'text';
                const channel = await interaction.guild.channels.create({
                    name, type: type === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText
                });
                await interaction.reply({ embeds: [new EmbedBuilder().setColor('#00FF00').setTitle('Channel Created').setDescription(`${channel} has been created.`)] });
                break;
            }

            case 'createrole': {
                const name = interaction.options.getString('name');
                const color = interaction.options.getString('color') || '#FF0000';
                const role = await interaction.guild.roles.create({ name, color });
                await interaction.reply({ embeds: [new EmbedBuilder().setColor(color).setTitle('Role Created').setDescription(`${role} has been created.`)] });
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
                        .setDescription('Click the button below to create a support ticket.')
                        .setTimestamp();
                    
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('create_ticket').setLabel('📩 Create Ticket').setStyle(ButtonStyle.Primary)
                    );
                    
                    await channel.send({ embeds: [embed], components: [row] });
                    ticketData.settings[interaction.guild.id] = { panelChannel: channel.id, supportRoleId: supportRole?.id };
                    saveData(ticketsFile, ticketData);
                    await interaction.reply({ content: `Ticket system has been setup in ${channel}!`, ephemeral: true });
                } else if (sub === 'close') {
                    const ticket = ticketData.tickets[interaction.channel.id];
                    if (!ticket) return interaction.reply({ content: 'Not a ticket.', ephemeral: true });
                    ticket.status = 'closed';
                    saveData(ticketsFile, ticketData);
                    await interaction.reply({ embeds: [new EmbedBuilder().setColor('#FF0000').setTitle('🔒 Geschlossen')] });
                    setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
                } else if (sub === 'add') {
                    const user = interaction.options.getUser('user');
                    await interaction.channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true });
                    await interaction.reply({ content: `${user} has been added to the ticket.` });
                } else if (sub === 'remove') {
                    const user = interaction.options.getUser('user');
                    await interaction.channel.permissionOverwrites.delete(user.id);
                    await interaction.reply({ content: `${user} has been removed from the ticket.` });
                }
                break;
            }

            case 'level': {
                const data = getUserLevel(interaction.guild.id, interaction.user.id);
                const nextLevelXP = Math.pow((data.level + 1) * 10, 2);
                const progress = Math.min(100, Math.floor((data.xp / nextLevelXP) * 100));
                
                // Generate progress bar
                const progressBar = generateProgressBar(progress, 10);
                
                // Calculate rank
                const lb = getLeaderboard(interaction.guild.id, 1000);
                const rank = lb.findIndex(u => u.id === interaction.user.id) + 1;
                
                const embed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle(`📊 Level Stats`)
                    .setDescription(`**${interaction.user.username}**'s Progress`)
                    .addFields(
                        { name: '🏆 Rank', value: `#${rank || '?'}`, inline: true },
                        { name: '⭐ Level', value: `${data.level}`, inline: true },
                        { name: '✨ XP', value: `${data.xp.toLocaleString()}`, inline: true },
                        { name: '💬 Messages', value: `${data.messages.toLocaleString()}`, inline: true },
                        { name: '🎯 Next Level', value: `${nextLevelXP.toLocaleString()} XP`, inline: true },
                        { name: '📈 Progress', value: `${progressBar} ${progress}%`, inline: false }
                    )
                    .setThumbnail(interaction.user.displayAvatarURL())
                    .setFooter({ text: 'Keep chatting to earn more XP!' })
                    .setTimestamp();
                await interaction.reply({ embeds: [embed] });
                break;
            }

            case 'leaderboard': {
                const lb = getLeaderboard(interaction.guild.id, 10);
                if (lb.length === 0) {
                    await interaction.reply({ content: 'No leveling data yet. Start chatting to earn XP!', ephemeral: true });
                } else {
                    const medals = ['🥇', '🥈', '🥉'];
                    const list = lb.map((u, i) => {
                        const medal = medals[i] || `**${i + 1}.**`;
                        const progressBar = generateProgressBar(Math.min(100, (u.xp / Math.pow((u.level + 1) * 10, 2)) * 100), 6);
                        return `${medal} <@${u.id}>\n   Level **${u.level}** • ${u.xp.toLocaleString()} XP • ${u.messages} msgs\n   ${progressBar}`;
                    }).join('\n\n');
                    
                    // Find user's rank
                    const fullLb = getLeaderboard(interaction.guild.id, 1000);
                    const userRank = fullLb.findIndex(u => u.id === interaction.user.id) + 1;
                    
                    const embed = new EmbedBuilder()
                        .setColor('#FFD700')
                        .setTitle('🏆 Server Leaderboard')
                        .setDescription(list)
                        .setThumbnail(interaction.guild.iconURL())
                        .setFooter({ text: userRank > 0 ? `Your rank: #${userRank}` : 'Start chatting to appear on the leaderboard!' })
                        .setTimestamp();
                    
                    await interaction.reply({ embeds: [embed] });
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
                    if (!match) return interaction.reply({ content: 'Invalid duration. Use e.g. 30m, 1h, 1d', ephemeral: true });
                    
                    const num = parseInt(match[1]);
                    const unit = match[2];
                    let ms = num * 60 * 1000; // minutes
                    if (unit === 'h') ms = num * 60 * 60 * 1000;
                    if (unit === 'd') ms = num * 24 * 60 * 60 * 1000;
                    
                    await createGiveaway(interaction.channel, ms, prize, winners, interaction.user.id);
                    await interaction.reply({ content: '🎉 Giveaway started!', ephemeral: true });
                } else if (sub === 'end') {
                    const msgId = interaction.options.getString('message_id');
                    const giveaway = giveawayData[interaction.guild.id]?.find(g => g.messageId === msgId);
                    if (!giveaway) return interaction.reply({ content: 'Giveaway not found.', ephemeral: true });
                    await endGiveaway(giveaway);
                    await interaction.reply({ content: 'Giveaway ended!', ephemeral: true });
                } else if (sub === 'reroll') {
                    const msgId = interaction.options.getString('message_id');
                    const giveaway = giveawayData[interaction.guild.id]?.find(g => g.messageId === msgId);
                    if (!giveaway) return interaction.reply({ content: 'Giveaway not found.', ephemeral: true });
                    giveaway.ended = false;
                    await endGiveaway(giveaway);
                    await interaction.reply({ content: 'New winners selected!', ephemeral: true });
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
                
                if (roles.length === 0) return interaction.reply({ content: 'At least 1 emoji+role required.', ephemeral: true });
                
                await setupReactionRole(channel, message, roles);
                await interaction.reply({ content: `Reaction Roles in ${channel} eingerichtet!`, ephemeral: true });
                break;
            }

            case 'announce': {
                const msg = interaction.options.getString('message');
                const channel = interaction.options.getChannel('channel') || interaction.channel;
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('📢 Announcement')
                    .setDescription(msg)
                    .setFooter({ text: `By ${interaction.user.tag}` })
                    .setTimestamp();
                await channel.send({ embeds: [embed] });
                await interaction.reply({ content: `Sent to ${channel}`, ephemeral: true });
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
                    .setFooter({ text: `Poll by ${interaction.user.tag}` });
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
                    .setTitle(`📊 ${g.name} Statistics`)
                    .addFields(
                        { name: '👥 Members', value: `${g.memberCount} (${online} online)`, inline: true },
                        { name: '📁 Channels', value: `${g.channels.cache.size}`, inline: true },
                        { name: '🎭 Roles', value: `${g.roles.cache.size}`, inline: true },
                        { name: '🎫 Tickets', value: `${openTickets} open`, inline: true },
                        { name: '🎉 Giveaways', value: `${activeGiveaways} active`, inline: true },
                        { name: '🚀 Boosts', value: `${g.premiumSubscriptionCount || 0}`, inline: true }
                    );
                await interaction.reply({ embeds: [embed] });
                break;
            }

            case 'help': {
                const category = interaction.options.getString('category') || 'all';
                const settings = getGuildSettings(interaction.guild.id);
                
                // Commands by category
                const commandCategories = {
                    moderation: {
                        title: '🛡️ Moderation',
                        commands: [
                            { name: '/kick', desc: 'Kick a user from the server' },
                            { name: '/ban', desc: 'Ban a user from the server' },
                            { name: '/unban', desc: 'Unban a user by ID' },
                            { name: '/softban', desc: 'Ban & unban to clear messages' },
                            { name: '/mute', desc: 'Timeout a user' },
                            { name: '/unmute', desc: 'Remove timeout from a user' },
                            { name: '/clear', desc: 'Delete messages (1-100)' },
                            { name: '/purge', desc: 'Delete messages with filters' },
                            { name: '/warn', desc: 'Warn a user' },
                            { name: '/warnings', desc: 'View warnings of a user' },
                            { name: '/clearwarns', desc: 'Clear all warnings of a user' },
                            { name: '/slowmode', desc: 'Set channel slowmode' },
                            { name: '/lock', desc: 'Lock a channel' },
                            { name: '/unlock', desc: 'Unlock a channel' },
                            { name: '/nickname', desc: 'Change user nickname' }
                        ]
                    },
                    tickets: {
                        title: '🎫 Tickets',
                        commands: [
                            { name: '/ticket setup', desc: 'Setup the ticket system' },
                            { name: '/ticket close', desc: 'Close a ticket' },
                            { name: '/ticket add', desc: 'Add a user to a ticket' },
                            { name: '/ticket remove', desc: 'Remove a user from a ticket' },
                            { name: '🔘 Claim', desc: 'Button to claim a ticket' },
                            { name: '🔘 Transcript', desc: 'Button to save ticket log' }
                        ]
                    },
                    leveling: {
                        title: '📈 Leveling',
                        commands: [
                            { name: '/level', desc: 'View your current level & rank' },
                            { name: '/leaderboard', desc: 'View the server leaderboard' }
                        ]
                    },
                    giveaways: {
                        title: '🎉 Giveaways',
                        commands: [
                            { name: '/giveaway start', desc: 'Start a new giveaway' },
                            { name: '/giveaway end', desc: 'End a giveaway early' },
                            { name: '/giveaway reroll', desc: 'Reroll giveaway winners' }
                        ]
                    },
                    utility: {
                        title: '🔧 Utility',
                        commands: [
                            { name: '/ping', desc: 'Check bot latency' },
                            { name: '/info', desc: 'View bot information' },
                            { name: '/serverinfo', desc: 'View server information' },
                            { name: '/userinfo', desc: 'View user information' },
                            { name: '/avatar', desc: 'View user avatar in full size' },
                            { name: '/banner', desc: 'View user or server banner' },
                            { name: '/embed', desc: 'Send a custom embed message' },
                            { name: '/announce', desc: 'Send an announcement' },
                            { name: '/poll', desc: 'Create a poll' },
                            { name: '/stats', desc: 'View server statistics' },
                            { name: '/remind', desc: 'Set a reminder' },
                            { name: '/afk', desc: 'Set your AFK status' },
                            { name: '/role add/remove/info', desc: 'Manage user roles' },
                            { name: '/createchannel', desc: 'Create a new channel' },
                            { name: '/createrole', desc: 'Create a new role' },
                            { name: '/reactionrole', desc: 'Setup reaction roles' }
                        ]
                    },
                    settings: {
                        title: '⚙️ Settings',
                        commands: [
                            { name: '/settings view', desc: 'View current settings' },
                            { name: '/settings automod', desc: 'Configure auto-moderation' },
                            { name: '/settings welcome', desc: 'Configure welcome messages' },
                            { name: '/settings leveling', desc: 'Configure leveling system' }
                        ]
                    }
                };
                
                const embeds = [];
                
                // Main Help Embed
                const mainEmbed = new EmbedBuilder()
                    .setColor('#FF0033')
                    .setTitle('📚 Nexus Bot Help')
                    .setDescription('Use `/help <category>` to view commands for a specific category.')
                    .setFooter({ text: `Nexus Discord Tool • ${client.ws.ping}ms` })
                    .setTimestamp();
                
                if (category === 'all' || category === 'settings') {
                    // Active Settings
                    const settingsStatus = [
                        `🛡️ **Auto-Moderation:** ${settings.automod?.enabled ? '✅ Enabled' : '❌ Disabled'}`,
                        `👋 **Welcome Messages:** ${settings.welcome?.enabled ? '✅ Enabled' : '❌ Disabled'}`,
                        `📈 **Leveling System:** ${settings.leveling?.enabled ? '✅ Enabled' : '❌ Disabled'}`,
                        `📝 **Logging:** ${settings.logging?.enabled ? '✅ Enabled' : '❌ Disabled'}`,
                        `👋 **Goodbye Messages:** ${settings.goodbye?.enabled ? '✅ Enabled' : '❌ Disabled'}`
                    ];
                    
                    if (settings.automod?.enabled) {
                        settingsStatus.push(`  └─ Anti-Spam: ${settings.automod.antiSpam ? '✅' : '❌'} | Anti-Links: ${settings.automod.antiLinks ? '✅' : '❌'} | Bad Words: ${settings.automod.antiBadWords ? '✅' : '❌'}`);
                    }
                    if (settings.welcome?.enabled && settings.welcome.channelId) {
                        settingsStatus.push(`  └─ Channel: <#${settings.welcome.channelId}>`);
                    }
                    if (settings.leveling?.enabled) {
                        settingsStatus.push(`  └─ XP/Message: ${settings.leveling.xpPerMessage || 15}`);
                    }
                    
                    mainEmbed.addFields({ name: '⚙️ Active Settings', value: settingsStatus.join('\n') });
                }
                
                if (category === 'all') {
                    // Show all categories overview
                    for (const [key, cat] of Object.entries(commandCategories)) {
                        mainEmbed.addFields({
                            name: cat.title,
                            value: cat.commands.map(c => `\`${c.name}\``).join(', '),
                            inline: false
                        });
                    }
                    embeds.push(mainEmbed);
                } else if (commandCategories[category]) {
                    // Show specific category
                    const cat = commandCategories[category];
                    mainEmbed.setTitle(`📚 ${cat.title} Commands`);
                    const commandList = cat.commands.map(c => `**${c.name}**\n└─ ${c.desc}`).join('\n\n');
                    mainEmbed.setDescription(commandList);
                    embeds.push(mainEmbed);
                } else {
                    mainEmbed.setDescription('Unknown category. Use `/help` without arguments to see all categories.');
                    embeds.push(mainEmbed);
                }
                
                await interaction.reply({ embeds: embeds, ephemeral: true });
                break;
            }

            case 'settings': {
                const sub = interaction.options.getSubcommand();
                const settings = getGuildSettings(interaction.guild.id);
                
                if (sub === 'view') {
                    const embed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('⚙️ Bot Settings')
                        .addFields(
                            { name: 'Auto-Moderation', value: settings.automod?.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
                            { name: 'Welcome', value: settings.welcome?.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
                            { name: 'Leveling', value: settings.leveling?.enabled ? '✅ Enabled' : '❌ Disabled', inline: true }
                        );
                    await interaction.reply({ embeds: [embed], ephemeral: true });
                } else if (sub === 'automod') {
                    const enabled = interaction.options.getBoolean('enabled');
                    if (enabled !== null) settings.automod.enabled = enabled;
                    saveData(settingsFile, settingsData);
                    await interaction.reply({ content: `Auto-Moderation: ${settings.automod.enabled ? '✅ Enabled' : '❌ Disabled'}`, ephemeral: true });
                } else if (sub === 'welcome') {
                    const enabled = interaction.options.getBoolean('enabled');
                    const channel = interaction.options.getChannel('channel');
                    const autorole = interaction.options.getRole('autorole');
                    if (enabled !== null) settings.welcome.enabled = enabled;
                    if (channel) settings.welcome.channelId = channel.id;
                    if (autorole) settings.welcome.autoRoleId = autorole.id;
                    saveData(settingsFile, settingsData);
                    await interaction.reply({ content: `Welcome: ${settings.welcome.enabled ? '✅ Enabled' : '❌ Disabled'}`, ephemeral: true });
                } else if (sub === 'leveling') {
                    const enabled = interaction.options.getBoolean('enabled');
                    const channel = interaction.options.getChannel('channel');
                    if (enabled !== null) settings.leveling.enabled = enabled;
                    if (channel) settings.leveling.announceChannel = channel.id;
                    saveData(settingsFile, settingsData);
                    await interaction.reply({ content: `Leveling: ${settings.leveling.enabled ? '✅ Enabled' : '❌ Disabled'}`, ephemeral: true });
                }
                break;
            }

            // ==================== NEW COMMANDS ====================
            
            case 'slowmode': {
                const seconds = interaction.options.getInteger('seconds');
                const channel = interaction.options.getChannel('channel') || interaction.channel;
                
                if (!channel.isTextBased()) {
                    return interaction.reply({ content: 'This channel does not support slowmode.', ephemeral: true });
                }
                
                await channel.setRateLimitPerUser(seconds, `Set by ${interaction.user.tag}`);
                
                const embed = new EmbedBuilder()
                    .setColor(seconds > 0 ? '#FFA500' : '#00FF00')
                    .setTitle(seconds > 0 ? '🐌 Slowmode Enabled' : '🚀 Slowmode Disabled')
                    .setDescription(seconds > 0 
                        ? `Slowmode set to **${seconds} seconds** in ${channel}`
                        : `Slowmode disabled in ${channel}`)
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed] });
                log('info', `Slowmode: ${channel.name} set to ${seconds}s by ${interaction.user.tag}`);
                break;
            }

            case 'lock': {
                const channel = interaction.options.getChannel('channel') || interaction.channel;
                const reason = interaction.options.getString('reason') || 'No reason provided';
                
                await channel.permissionOverwrites.edit(interaction.guild.id, { SendMessages: false });
                
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('🔒 Channel Locked')
                    .setDescription(`This channel has been locked by ${interaction.user}.`)
                    .addFields({ name: 'Reason', value: reason })
                    .setTimestamp();
                
                await channel.send({ embeds: [embed] });
                await interaction.reply({ content: `${channel} has been locked.`, ephemeral: true });
                log('info', `Lock: ${channel.name} by ${interaction.user.tag}`);
                break;
            }

            case 'unlock': {
                const channel = interaction.options.getChannel('channel') || interaction.channel;
                
                await channel.permissionOverwrites.edit(interaction.guild.id, { SendMessages: null });
                
                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('🔓 Channel Unlocked')
                    .setDescription(`This channel has been unlocked by ${interaction.user}.`)
                    .setTimestamp();
                
                await channel.send({ embeds: [embed] });
                await interaction.reply({ content: `${channel} has been unlocked.`, ephemeral: true });
                log('info', `Unlock: ${channel.name} by ${interaction.user.tag}`);
                break;
            }

            case 'avatar': {
                const user = interaction.options.getUser('user') || interaction.user;
                const avatarURL = user.displayAvatarURL({ size: 4096, dynamic: true });
                
                const embed = new EmbedBuilder()
                    .setColor('#FF0033')
                    .setTitle(`${user.username}'s Avatar`)
                    .setImage(avatarURL)
                    .addFields(
                        { name: 'PNG', value: `[Link](${user.displayAvatarURL({ format: 'png', size: 4096 })})`, inline: true },
                        { name: 'JPG', value: `[Link](${user.displayAvatarURL({ format: 'jpg', size: 4096 })})`, inline: true },
                        { name: 'WEBP', value: `[Link](${user.displayAvatarURL({ format: 'webp', size: 4096 })})`, inline: true }
                    )
                    .setFooter({ text: `Requested by ${interaction.user.tag}` })
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed] });
                break;
            }

            case 'banner': {
                const user = interaction.options.getUser('user');
                const showServer = interaction.options.getBoolean('server');
                
                if (showServer) {
                    const banner = interaction.guild.bannerURL({ size: 4096 });
                    if (!banner) {
                        return interaction.reply({ content: 'This server has no banner.', ephemeral: true });
                    }
                    
                    const embed = new EmbedBuilder()
                        .setColor('#FF0033')
                        .setTitle(`${interaction.guild.name}'s Banner`)
                        .setImage(banner)
                        .setTimestamp();
                    
                    await interaction.reply({ embeds: [embed] });
                } else {
                    const targetUser = user || interaction.user;
                    const fetchedUser = await client.users.fetch(targetUser.id, { force: true });
                    const banner = fetchedUser.bannerURL({ size: 4096 });
                    
                    if (!banner) {
                        return interaction.reply({ content: 'This user has no banner.', ephemeral: true });
                    }
                    
                    const embed = new EmbedBuilder()
                        .setColor('#FF0033')
                        .setTitle(`${targetUser.username}'s Banner`)
                        .setImage(banner)
                        .setTimestamp();
                    
                    await interaction.reply({ embeds: [embed] });
                }
                break;
            }

            case 'role': {
                const sub = interaction.options.getSubcommand();
                
                if (sub === 'add') {
                    const user = interaction.options.getUser('user');
                    const role = interaction.options.getRole('role');
                    const member = await interaction.guild.members.fetch(user.id);
                    
                    if (member.roles.cache.has(role.id)) {
                        return interaction.reply({ content: `${user.tag} already has the role ${role.name}.`, ephemeral: true });
                    }
                    
                    await member.roles.add(role);
                    
                    const embed = new EmbedBuilder()
                        .setColor('#00FF00')
                        .setTitle('✅ Role Added')
                        .setDescription(`Added ${role} to ${user}`)
                        .setTimestamp();
                    
                    await interaction.reply({ embeds: [embed] });
                    log('info', `Role Add: ${role.name} to ${user.tag} by ${interaction.user.tag}`);
                    
                } else if (sub === 'remove') {
                    const user = interaction.options.getUser('user');
                    const role = interaction.options.getRole('role');
                    const member = await interaction.guild.members.fetch(user.id);
                    
                    if (!member.roles.cache.has(role.id)) {
                        return interaction.reply({ content: `${user.tag} doesn't have the role ${role.name}.`, ephemeral: true });
                    }
                    
                    await member.roles.remove(role);
                    
                    const embed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('❌ Role Removed')
                        .setDescription(`Removed ${role} from ${user}`)
                        .setTimestamp();
                    
                    await interaction.reply({ embeds: [embed] });
                    log('info', `Role Remove: ${role.name} from ${user.tag} by ${interaction.user.tag}`);
                    
                } else if (sub === 'info') {
                    const role = interaction.options.getRole('role');
                    
                    const perms = [];
                    if (role.permissions.has('Administrator')) perms.push('Administrator');
                    if (role.permissions.has('ManageGuild')) perms.push('Manage Server');
                    if (role.permissions.has('ManageChannels')) perms.push('Manage Channels');
                    if (role.permissions.has('ManageRoles')) perms.push('Manage Roles');
                    if (role.permissions.has('KickMembers')) perms.push('Kick Members');
                    if (role.permissions.has('BanMembers')) perms.push('Ban Members');
                    if (role.permissions.has('ManageMessages')) perms.push('Manage Messages');
                    
                    const embed = new EmbedBuilder()
                        .setColor(role.hexColor || '#FF0033')
                        .setTitle(`Role Info: ${role.name}`)
                        .addFields(
                            { name: 'ID', value: role.id, inline: true },
                            { name: 'Color', value: role.hexColor || 'None', inline: true },
                            { name: 'Members', value: `${role.members.size}`, inline: true },
                            { name: 'Position', value: `${role.position}`, inline: true },
                            { name: 'Mentionable', value: role.mentionable ? 'Yes' : 'No', inline: true },
                            { name: 'Hoisted', value: role.hoist ? 'Yes' : 'No', inline: true },
                            { name: 'Created', value: `<t:${Math.floor(role.createdTimestamp / 1000)}:R>`, inline: true },
                            { name: 'Key Permissions', value: perms.length > 0 ? perms.join(', ') : 'None', inline: false }
                        )
                        .setTimestamp();
                    
                    await interaction.reply({ embeds: [embed] });
                }
                break;
            }

            case 'purge': {
                const amount = interaction.options.getInteger('amount');
                const filter = interaction.options.getString('filter') || 'all';
                const targetUser = interaction.options.getUser('user');
                const contains = interaction.options.getString('contains');
                
                await interaction.deferReply({ ephemeral: true });
                
                const messages = await interaction.channel.messages.fetch({ limit: 100 });
                let toDelete = messages.filter(m => Date.now() - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000);
                
                // Apply filters
                if (filter === 'bots') toDelete = toDelete.filter(m => m.author.bot);
                if (filter === 'humans') toDelete = toDelete.filter(m => !m.author.bot);
                if (filter === 'attachments') toDelete = toDelete.filter(m => m.attachments.size > 0);
                if (filter === 'embeds') toDelete = toDelete.filter(m => m.embeds.length > 0);
                if (filter === 'links') toDelete = toDelete.filter(m => /(https?:\/\/[^\s]+)/gi.test(m.content));
                
                if (targetUser) toDelete = toDelete.filter(m => m.author.id === targetUser.id);
                if (contains) toDelete = toDelete.filter(m => m.content.toLowerCase().includes(contains.toLowerCase()));
                
                // Limit to requested amount
                const messagesToDelete = [...toDelete.values()].slice(0, amount);
                
                if (messagesToDelete.length === 0) {
                    return interaction.editReply({ content: 'No messages found matching your criteria.' });
                }
                
                const deleted = await interaction.channel.bulkDelete(messagesToDelete, true);
                
                await interaction.editReply({ 
                    content: `🗑️ Deleted **${deleted.size}** messages${filter !== 'all' ? ` (filter: ${filter})` : ''}${targetUser ? ` from ${targetUser.tag}` : ''}${contains ? ` containing "${contains}"` : ''}.` 
                });
                
                log('info', `Purge: ${deleted.size} messages by ${interaction.user.tag}`);
                break;
            }

            case 'nickname': {
                const user = interaction.options.getUser('user');
                const nickname = interaction.options.getString('nickname');
                const member = await interaction.guild.members.fetch(user.id);
                
                const oldNick = member.displayName;
                await member.setNickname(nickname || null);
                
                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('✏️ Nickname Changed')
                    .addFields(
                        { name: 'User', value: user.tag, inline: true },
                        { name: 'Old Nickname', value: oldNick, inline: true },
                        { name: 'New Nickname', value: nickname || user.username, inline: true }
                    )
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed] });
                log('info', `Nickname: ${user.tag} changed to "${nickname || 'reset'}" by ${interaction.user.tag}`);
                break;
            }

            case 'remind': {
                const timeStr = interaction.options.getString('time');
                const message = interaction.options.getString('message');
                
                const duration = parseDuration(timeStr);
                if (!duration) {
                    return interaction.reply({ content: 'Invalid time format. Use e.g. 10m, 1h, 1d', ephemeral: true });
                }
                
                if (duration > 7 * 24 * 60 * 60 * 1000) {
                    return interaction.reply({ content: 'Maximum reminder time is 7 days.', ephemeral: true });
                }
                
                const remindAt = Date.now() + duration;
                
                reminders.push({
                    userId: interaction.user.id,
                    channelId: interaction.channel.id,
                    message: message,
                    remindAt: remindAt
                });
                
                setTimeout(async () => {
                    try {
                        const channel = client.channels.cache.get(interaction.channel.id);
                        if (channel) {
                            const embed = new EmbedBuilder()
                                .setColor('#FFD700')
                                .setTitle('⏰ Reminder!')
                                .setDescription(message)
                                .setFooter({ text: `Reminder for ${interaction.user.tag}` })
                                .setTimestamp();
                            
                            await channel.send({ content: `<@${interaction.user.id}>`, embeds: [embed] });
                        }
                    } catch (e) {
                        log('error', `Reminder error: ${e.message}`);
                    }
                }, duration);
                
                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('⏰ Reminder Set')
                    .setDescription(`I'll remind you <t:${Math.floor(remindAt / 1000)}:R>`)
                    .addFields({ name: 'Message', value: message })
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed], ephemeral: true });
                log('info', `Reminder: ${interaction.user.tag} set for ${timeStr}`);
                break;
            }

            case 'afk': {
                const reason = interaction.options.getString('reason') || 'AFK';
                
                afkData.set(interaction.user.id, {
                    reason: reason,
                    since: Date.now()
                });
                
                const embed = new EmbedBuilder()
                    .setColor('#808080')
                    .setTitle('💤 AFK Set')
                    .setDescription(`${interaction.user} is now AFK: ${reason}`)
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed] });
                log('info', `AFK: ${interaction.user.tag} - ${reason}`);
                break;
            }

            case 'unban': {
                const userId = interaction.options.getString('user_id');
                const reason = interaction.options.getString('reason') || 'No reason provided';
                
                try {
                    await interaction.guild.members.unban(userId, reason);
                    
                    const embed = new EmbedBuilder()
                        .setColor('#00FF00')
                        .setTitle('✅ User Unbanned')
                        .addFields(
                            { name: 'User ID', value: userId, inline: true },
                            { name: 'Reason', value: reason, inline: true },
                            { name: 'Unbanned by', value: interaction.user.tag, inline: true }
                        )
                        .setTimestamp();
                    
                    await interaction.reply({ embeds: [embed] });
                    log('info', `Unban: ${userId} by ${interaction.user.tag}`);
                } catch (e) {
                    await interaction.reply({ content: `Could not unban user: ${e.message}`, ephemeral: true });
                }
                break;
            }

            case 'softban': {
                const user = interaction.options.getUser('user');
                const reason = interaction.options.getString('reason') || 'Softban (message cleanup)';
                const days = interaction.options.getInteger('days') || 1;
                
                try {
                    await interaction.guild.members.ban(user, { deleteMessageDays: days, reason: reason });
                    await interaction.guild.members.unban(user, 'Softban complete');
                    
                    const embed = new EmbedBuilder()
                        .setColor('#FFA500')
                        .setTitle('🔨 User Softbanned')
                        .setDescription(`${user.tag} has been softbanned (${days} days of messages deleted).`)
                        .addFields({ name: 'Reason', value: reason })
                        .setTimestamp();
                    
                    await interaction.reply({ embeds: [embed] });
                    log('info', `Softban: ${user.tag} by ${interaction.user.tag}`);
                } catch (e) {
                    await interaction.reply({ content: `Could not softban user: ${e.message}`, ephemeral: true });
                }
                break;
            }

            case 'embed': {
                const title = interaction.options.getString('title');
                const description = interaction.options.getString('description');
                const color = interaction.options.getString('color') || '#FF0033';
                const channel = interaction.options.getChannel('channel') || interaction.channel;
                const footer = interaction.options.getString('footer');
                const image = interaction.options.getString('image');
                const thumbnail = interaction.options.getString('thumbnail');
                
                const embed = new EmbedBuilder()
                    .setColor(color)
                    .setTitle(title)
                    .setDescription(description)
                    .setTimestamp();
                
                if (footer) embed.setFooter({ text: footer });
                if (image) embed.setImage(image);
                if (thumbnail) embed.setThumbnail(thumbnail);
                
                await channel.send({ embeds: [embed] });
                await interaction.reply({ content: `Embed sent to ${channel}`, ephemeral: true });
                log('info', `Embed: Sent to ${channel.name} by ${interaction.user.tag}`);
                break;
            }
        }
    } catch (error) {
        log('error', `Command Error: ${error.message}`);
        const errEmbed = new EmbedBuilder().setColor('#FF0000').setTitle('Error').setDescription(error.message);
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

// Generate a visual progress bar
function generateProgressBar(progress, length = 10) {
    const filled = Math.round((progress / 100) * length);
    const empty = length - filled;
    return '▓'.repeat(filled) + '░'.repeat(empty);
}

// Format large numbers
function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

// Error Handling
client.on('error', e => log('error', `Client Error: ${e.message}`));
client.on('warn', w => log('warn', `Client Warning: ${w}`));
client.on('shardError', e => log('error', `Shard Error: ${e.message}`));

// Reconnection logging
client.on('shardReconnecting', id => log('info', `Shard ${id} reconnecting...`));
client.on('shardResume', (id, replayed) => log('info', `Shard ${id} resumed. ${replayed} events replayed.`));
client.on('shardDisconnect', (event, id) => log('warn', `Shard ${id} disconnected: ${event.code}`));

// Rate limit warning
client.rest.on('rateLimited', info => {
    log('warn', `Rate Limited: ${info.route} - Retry after ${info.retryAfter}ms`);
});

// Process error handling
process.on('unhandledRejection', (reason, promise) => {
    log('error', `Unhandled Rejection: ${reason?.message || reason}`);
    if (reason?.stack) log('error', reason.stack);
});

process.on('uncaughtException', (error) => {
    log('error', `Uncaught Exception: ${error.message}`);
    if (error.stack) log('error', error.stack);
});

// Graceful shutdown
async function gracefulShutdown(signal) {
    log('info', `${signal} received. Shutting down gracefully...`);
    
    try {
        // Save all data
        saveData(ticketsFile, ticketData);
        saveData(warnsFile, warnData);
        saveData(levelsFile, levelData);
        saveData(settingsFile, settingsData);
        saveData(giveawaysFile, giveawayData);
        log('info', 'All data saved.');
        
        // Close API server
        apiServer.close();
        log('info', 'API server closed.');
        
        // Destroy client
        client.destroy();
        log('info', 'Discord client destroyed.');
        
        process.exit(0);
    } catch (e) {
        log('error', `Shutdown error: ${e.message}`);
        process.exit(1);
    }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Start
log('info', 'Bot starting...');
client.login(config.token).catch(e => { log('error', `Login: ${e.message}`); process.exit(1); });
