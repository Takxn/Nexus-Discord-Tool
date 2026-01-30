const { Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const http = require('http');

// .env Datei laden (falls vorhanden)
try {
    const possibleEnvPaths = [
        path.join(__dirname, '.env'),           // Gleicher Ordner wie bot.js
        path.join(__dirname, '..', '.env'),     // Ein Ordner höher
        '/home/container/.env',                  // Container Root
        path.join(process.cwd(), '.env')        // Current Working Directory
    ];
    
    for (const envPath of possibleEnvPaths) {
        if (fs.existsSync(envPath)) {
            console.log(`[+] .env gefunden: ${envPath}`);
            const envContent = fs.readFileSync(envPath, 'utf8');
            envContent.split('\n').forEach(line => {
                const trimmedLine = line.trim();
                if (trimmedLine && !trimmedLine.startsWith('#')) {
                    const equalIndex = trimmedLine.indexOf('=');
                    if (equalIndex > 0) {
                        const key = trimmedLine.substring(0, equalIndex).trim();
                        const value = trimmedLine.substring(equalIndex + 1).trim();
                        if (key && value) {
                            process.env[key] = value;
                            console.log(`[+] ENV: ${key} = ${value.substring(0, 5)}...`);
                        }
                    }
                }
            });
            break;
        }
    }
} catch (e) {
    console.log('[!] .env Fehler:', e.message);
}

// ============================================
// KONFIGURATION - Als Environment Variables auf BisectHosting setzen
// ============================================
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHANNEL_ID = process.env.ADMIN_CHANNEL_ID || '1371248920029823029';
const BUYER_ROLE_ID = process.env.BUYER_ROLE_ID || '1372343231379013823';
const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID || '1372341895451381861';
const TICKET_CATEGORY_ID = process.env.TICKET_CATEGORY_ID || null; // Optional: Kategorie für Tickets

// Preise
const PRICES = {
    '1tag': { name: '1 Tag', price: '4€', duration: '24 Stunden' },
    '1woche': { name: '1 Woche', price: '12€', duration: '7 Tage' },
    '1monat': { name: '1 Monat', price: '25€', duration: '30 Tage' }
};

// Aktive Tickets speichern
const activeTickets = new Map();
// BisectHosting setzt SERVER_PORT oder PORT automatisch
const API_PORT = process.env.SERVER_PORT || process.env.PORT || 3850;

// Prüfe ob Token vorhanden
if (!BOT_TOKEN) {
    console.error('❌ FEHLER: BOT_TOKEN nicht gesetzt!');
    console.log('Setze die Environment Variable BOT_TOKEN im Hosting Panel.');
    process.exit(1);
}

console.log('=================================');
console.log('   NEXUS+ LICENSE BOT v1.0');
console.log('=================================');
console.log(`API Port: ${API_PORT}`);
console.log(`Admin Channel: ${ADMIN_CHANNEL_ID}`);
console.log('=================================');

// Lizenz-Datenbank
const licensesPath = path.join(__dirname, 'licenses.json');

function loadLicenses() {
    if (fs.existsSync(licensesPath)) {
        try {
            return JSON.parse(fs.readFileSync(licensesPath, 'utf8'));
        } catch (e) {
            console.error('Fehler beim Laden der Lizenzen:', e);
            return { licenses: [] };
        }
    }
    return { licenses: [] };
}

function saveLicenses(data) {
    fs.writeFileSync(licensesPath, JSON.stringify(data, null, 2));
}

// Lizenz-Key generieren
function generateKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const segments = [];
    for (let i = 0; i < 4; i++) {
        let segment = '';
        for (let j = 0; j < 4; j++) {
            segment += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        segments.push(segment);
    }
    return segments.join('-');
}

// Laufzeit in Millisekunden
const DURATIONS = {
    '1tag': 24 * 60 * 60 * 1000,
    '1woche': 7 * 24 * 60 * 60 * 1000,
    '1monat': 30 * 24 * 60 * 60 * 1000
};

// Discord Bot
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

client.on('error', (error) => {
    console.error('Discord Error:', error.message);
});

// ============================================
// TICKET SYSTEM - Button Interactions
// ============================================
client.on('interactionCreate', async (interaction) => {
    // Button: Paket auswählen
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_package') {
        const selectedPackage = interaction.values[0];
        const packageInfo = PRICES[selectedPackage];
        
        const embed = new EmbedBuilder()
            .setColor(0xe63946)
            .setTitle('💳 Zahlungsinformationen')
            .setDescription(`Du hast **${packageInfo.name}** für **${packageInfo.price}** ausgewählt.`)
            .addFields(
                { name: '📦 Paket', value: packageInfo.name, inline: true },
                { name: '💰 Preis', value: packageInfo.price, inline: true },
                { name: '⏱️ Laufzeit', value: packageInfo.duration, inline: true },
                { name: '\u200B', value: '**Zahlungsmethoden:**', inline: false },
                { name: '🏦 Überweisung', value: 'IBAN wird nach Bestätigung gesendet', inline: false },
                { name: '💸 PayPal', value: 'PayPal-Link wird nach Bestätigung gesendet', inline: false },
                { name: '₿ Bitcoin (BTC)', value: 'Wallet-Adresse wird nach Bestätigung gesendet', inline: false },
                { name: 'Ξ Ethereum (ETH)', value: 'Wallet-Adresse wird nach Bestätigung gesendet', inline: false }
            )
            .setFooter({ text: 'Ein Admin wird sich in Kürze bei dir melden.' });
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`confirm_${selectedPackage}`)
                    .setLabel('✅ Kaufen bestätigen')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('cancel_ticket')
                    .setLabel('❌ Abbrechen')
                    .setStyle(ButtonStyle.Danger)
            );
        
        await interaction.update({ embeds: [embed], components: [row] });
        
        // Admin benachrichtigen
        const adminChannel = client.channels.cache.get(ADMIN_CHANNEL_ID);
        if (adminChannel) {
            const adminEmbed = new EmbedBuilder()
                .setColor(0xffa502)
                .setTitle('🛒 Neue Kaufanfrage')
                .addFields(
                    { name: 'User', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Paket', value: packageInfo.name, inline: true },
                    { name: 'Preis', value: packageInfo.price, inline: true },
                    { name: 'Ticket', value: `<#${interaction.channel.id}>`, inline: false }
                )
                .setTimestamp();
            adminChannel.send({ content: `<@&${ADMIN_ROLE_ID}>`, embeds: [adminEmbed] });
        }
    }
    
    // Button: Kauf bestätigen
    if (interaction.isButton() && interaction.customId.startsWith('confirm_')) {
        const packageKey = interaction.customId.replace('confirm_', '');
        const packageInfo = PRICES[packageKey];
        
        activeTickets.set(interaction.channel.id, {
            oderId: interaction.user.id,
            package: packageKey,
            status: 'pending_payment'
        });
        
        const embed = new EmbedBuilder()
            .setColor(0x2ed573)
            .setTitle('✅ Bestellung aufgenommen!')
            .setDescription('Ein Admin wird sich gleich bei dir melden mit den Zahlungsdaten.')
            .addFields(
                { name: '📦 Paket', value: packageInfo.name, inline: true },
                { name: '💰 Preis', value: packageInfo.price, inline: true },
                { name: '📋 Status', value: '⏳ Warte auf Admin', inline: true }
            )
            .setFooter({ text: 'Bitte schließe dieses Ticket nicht!' });
        
        await interaction.update({ embeds: [embed], components: [] });
    }
    
    // Button: Ticket abbrechen
    if (interaction.isButton() && interaction.customId === 'cancel_ticket') {
        await interaction.reply({ content: '❌ Bestellung abgebrochen. Ticket wird in 5 Sekunden gelöscht...', ephemeral: true });
        activeTickets.delete(interaction.channel.id);
        setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    }
    
    // Button: Ticket schließen (für Admins)
    if (interaction.isButton() && interaction.customId === 'close_ticket') {
        if (!interaction.member.roles.cache.has(ADMIN_ROLE_ID)) {
            return interaction.reply({ content: '❌ Nur Admins können Tickets schließen.', ephemeral: true });
        }
        await interaction.reply({ content: '🔒 Ticket wird geschlossen...', ephemeral: false });
        activeTickets.delete(interaction.channel.id);
        setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
    }
});

client.once('ready', () => {
    console.log(`✅ Bot online: ${client.user.tag}`);
    console.log(`🌐 API läuft auf Port ${API_PORT}`);
    client.user.setActivity('Nexus+ Lizenzen', { type: 3 });
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (message.channel.id !== ADMIN_CHANNEL_ID) return;
    
    const args = message.content.split(' ');
    const command = args[0].toLowerCase();
    
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.reply('❌ Keine Berechtigung!');
    }
    
    // !lizenz erstellen <1tag|1woche|1monat> [discord_id]
    if (command === '!lizenz' && args[1] === 'erstellen') {
        const duration = args[2]?.toLowerCase();
        const discordId = args[3] || null;
        
        if (!duration || !DURATIONS[duration]) {
            return message.reply('❌ Nutzung: `!lizenz erstellen <1tag|1woche|1monat> [discord_id]`');
        }
        
        const key = generateKey();
        const db = loadLicenses();
        
        const license = {
            key: key,
            duration: duration,
            durationMs: DURATIONS[duration],
            createdAt: Date.now(),
            createdBy: message.author.id,
            discordId: discordId,
            activatedAt: null,
            expiresAt: null,
            status: 'unused'
        };
        
        db.licenses.push(license);
        saveLicenses(db);
        
        const embed = new EmbedBuilder()
            .setColor(0xe63946)
            .setTitle('🔑 Neue Lizenz erstellt')
            .addFields(
                { name: 'Key', value: `\`${key}\``, inline: false },
                { name: 'Laufzeit', value: duration, inline: true },
                { name: 'Status', value: '🟡 Nicht aktiviert', inline: true },
                { name: 'Für User', value: discordId ? `<@${discordId}>` : 'Nicht zugewiesen', inline: true }
            )
            .setTimestamp();
        
        message.reply({ embeds: [embed] });
        
        if (discordId) {
            try {
                const user = await client.users.fetch(discordId);
                const dmEmbed = new EmbedBuilder()
                    .setColor(0xe63946)
                    .setTitle('🎉 Deine Nexus+ Lizenz')
                    .setDescription('Du hast eine Lizenz für den Nexus+ Loader erhalten!')
                    .addFields(
                        { name: 'Key', value: `\`${key}\``, inline: false },
                        { name: 'Laufzeit', value: duration, inline: true }
                    )
                    .setFooter({ text: 'Gib diesen Key im Loader ein um ihn zu aktivieren.' });
                await user.send({ embeds: [dmEmbed] });
                message.channel.send(`📨 DM an <@${discordId}> gesendet!`);
            } catch (e) {
                console.log('DM fehlgeschlagen:', e.message);
            }
        }
    }
    
    // !lizenz liste
    if (command === '!lizenz' && args[1] === 'liste') {
        const db = loadLicenses();
        if (db.licenses.length === 0) return message.reply('📋 Keine Lizenzen.');
        
        const embed = new EmbedBuilder()
            .setColor(0xe63946)
            .setTitle('📋 Alle Lizenzen');
        
        const list = db.licenses.slice(-15).map(l => {
            const status = l.status === 'active' ? '🟢' : l.status === 'expired' ? '🔴' : '🟡';
            const expiry = l.expiresAt ? new Date(l.expiresAt).toLocaleDateString('de-DE') : '-';
            return `${status} \`${l.key}\` | ${l.duration} | ${expiry}`;
        }).join('\n');
        
        embed.setDescription(list);
        embed.setFooter({ text: `${db.licenses.length} Lizenzen gesamt` });
        message.reply({ embeds: [embed] });
    }
    
    // !lizenz aktive
    if (command === '!lizenz' && args[1] === 'aktive') {
        const db = loadLicenses();
        const now = Date.now();
        
        db.licenses.forEach(l => {
            if (l.status === 'active' && l.expiresAt < now) l.status = 'expired';
        });
        saveLicenses(db);
        
        const active = db.licenses.filter(l => l.status === 'active');
        if (active.length === 0) return message.reply('📋 Keine aktiven Lizenzen.');
        
        const embed = new EmbedBuilder()
            .setColor(0x2ed573)
            .setTitle('🟢 Aktive Lizenzen');
        
        const list = active.map(l => {
            const remaining = Math.ceil((l.expiresAt - now) / (24 * 60 * 60 * 1000));
            return `\`${l.key}\` | <@${l.discordId}> | ${remaining} Tage`;
        }).join('\n');
        
        embed.setDescription(list);
        message.reply({ embeds: [embed] });
    }
    
    // !lizenz löschen <key>
    if (command === '!lizenz' && (args[1] === 'löschen' || args[1] === 'delete')) {
        const key = args[2]?.toUpperCase();
        if (!key) return message.reply('❌ Nutzung: `!lizenz löschen <KEY>`');
        
        const db = loadLicenses();
        const index = db.licenses.findIndex(l => l.key === key);
        if (index === -1) return message.reply('❌ Lizenz nicht gefunden.');
        
        db.licenses.splice(index, 1);
        saveLicenses(db);
        message.reply(`✅ Lizenz \`${key}\` gelöscht.`);
    }
    
    // !lizenz info <key>
    if (command === '!lizenz' && args[1] === 'info') {
        const key = args[2]?.toUpperCase();
        if (!key) return message.reply('❌ Nutzung: `!lizenz info <KEY>`');
        
        const db = loadLicenses();
        const license = db.licenses.find(l => l.key === key);
        if (!license) return message.reply('❌ Lizenz nicht gefunden.');
        
        const status = license.status === 'active' ? '🟢 Aktiv' : 
                       license.status === 'expired' ? '🔴 Abgelaufen' : '🟡 Unbenutzt';
        
        const embed = new EmbedBuilder()
            .setColor(license.status === 'active' ? 0x2ed573 : 0xffa502)
            .setTitle('🔑 Lizenz Info')
            .addFields(
                { name: 'Key', value: `\`${license.key}\``, inline: false },
                { name: 'Laufzeit', value: license.duration, inline: true },
                { name: 'Status', value: status, inline: true },
                { name: 'User', value: license.discordId ? `<@${license.discordId}>` : '-', inline: true },
                { name: 'Aktiviert', value: license.activatedAt ? new Date(license.activatedAt).toLocaleDateString('de-DE') : '-', inline: true },
                { name: 'Läuft ab', value: license.expiresAt ? new Date(license.expiresAt).toLocaleDateString('de-DE') : '-', inline: true }
            );
        message.reply({ embeds: [embed] });
    }
    
    // !stats
    if (command === '!stats') {
        const db = loadLicenses();
        const now = Date.now();
        const active = db.licenses.filter(l => l.status === 'active' && l.expiresAt > now).length;
        const unused = db.licenses.filter(l => l.status === 'unused').length;
        const expired = db.licenses.filter(l => l.status === 'expired').length;
        
        const embed = new EmbedBuilder()
            .setColor(0xe63946)
            .setTitle('📊 Statistiken')
            .addFields(
                { name: 'Gesamt', value: `${db.licenses.length}`, inline: true },
                { name: '🟢 Aktiv', value: `${active}`, inline: true },
                { name: '🟡 Unbenutzt', value: `${unused}`, inline: true },
                { name: '🔴 Abgelaufen', value: `${expired}`, inline: true }
            );
        message.reply({ embeds: [embed] });
    }
    
    // !hilfe
    if (command === '!hilfe' || command === '!help') {
        const embed = new EmbedBuilder()
            .setColor(0xe63946)
            .setTitle('📖 Befehle')
            .setDescription(
                '`!lizenz erstellen <1tag|1woche|1monat> [user_id]`\n' +
                '`!lizenz liste` - Alle Lizenzen\n' +
                '`!lizenz aktive` - Aktive Lizenzen\n' +
                '`!lizenz info <KEY>` - Lizenz Details\n' +
                '`!lizenz löschen <KEY>` - Lizenz löschen\n' +
                '`!stats` - Statistiken'
            );
        message.reply({ embeds: [embed] });
    }
});

// ============================================
// API SERVER
// ============================================
const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        return res.end();
    }
    
    const url = new URL(req.url, `http://localhost:${API_PORT}`);
    
    // Health Check
    if (req.method === 'GET' && url.pathname === '/') {
        return res.end(JSON.stringify({ status: 'online', service: 'Nexus+ License API' }));
    }
    
    // POST /validate
    if (req.method === 'POST' && url.pathname === '/validate') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { key, discordId } = JSON.parse(body);
                const db = loadLicenses();
                const now = Date.now();
                
                db.licenses.forEach(l => {
                    if (l.status === 'active' && l.expiresAt < now) l.status = 'expired';
                });
                
                const license = db.licenses.find(l => l.key === key.toUpperCase());
                
                if (!license) return res.end(JSON.stringify({ success: false, error: 'License not found' }));
                if (license.status === 'expired') return res.end(JSON.stringify({ success: false, error: 'License expired' }));
                
                if (license.status === 'active') {
                    if (license.discordId && license.discordId !== discordId) {
                        return res.end(JSON.stringify({ success: false, error: 'License belongs to another user' }));
                    }
                    return res.end(JSON.stringify({
                        success: true,
                        license: { key: license.key, duration: license.duration, expiresAt: license.expiresAt, status: 'active' }
                    }));
                }
                
                // Aktivieren
                license.status = 'active';
                license.activatedAt = now;
                license.expiresAt = now + license.durationMs;
                license.discordId = discordId;
                saveLicenses(db);
                
                // Rolle vergeben
                try {
                    const guild = client.guilds.cache.first();
                    if (guild && BUYER_ROLE_ID) {
                        guild.members.fetch(discordId).then(m => m.roles.add(BUYER_ROLE_ID).catch(() => {})).catch(() => {});
                    }
                } catch (e) {}
                
                console.log(`✅ Lizenz aktiviert: ${license.key} für ${discordId}`);
                res.end(JSON.stringify({
                    success: true,
                    license: { key: license.key, duration: license.duration, expiresAt: license.expiresAt, status: 'active' }
                }));
            } catch (e) {
                res.end(JSON.stringify({ success: false, error: 'Invalid request' }));
            }
        });
        return;
    }
    
    // GET /check
    if (req.method === 'GET' && url.pathname === '/check') {
        const discordId = url.searchParams.get('discordId');
        if (!discordId) return res.end(JSON.stringify({ success: false, error: 'Discord ID missing' }));
        
        const db = loadLicenses();
        const now = Date.now();
        
        db.licenses.forEach(l => {
            if (l.status === 'active' && l.expiresAt < now) l.status = 'expired';
        });
        saveLicenses(db);
        
        const license = db.licenses.find(l => l.discordId === discordId && l.status === 'active');
        
        if (!license) return res.end(JSON.stringify({ success: false, hasLicense: false }));
        
        res.end(JSON.stringify({
            success: true,
            hasLicense: true,
            license: { key: license.key, duration: license.duration, expiresAt: license.expiresAt }
        }));
        return;
    }
    
    // POST /download-loader - Nexus Loader (Spoofer + Mapper) herunterladen
    if (req.method === 'POST' && url.pathname === '/download-loader') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { discordId } = JSON.parse(body);
                
                if (!discordId) {
                    res.end(JSON.stringify({ success: false, error: 'Discord ID missing' }));
                    return;
                }
                
                // Lizenz prüfen
                const db = loadLicenses();
                const license = db.licenses.find(l => l.discordId === discordId && l.status === 'active');
                
                if (!license) {
                    res.end(JSON.stringify({ success: false, error: 'No valid license' }));
                    return;
                }
                
                // Loader-Pfad
                const loaderPath = path.join(__dirname, 'Driver', 'nexus_loader.exe');
                
                if (!fs.existsSync(loaderPath)) {
                    console.log('[!] Loader nicht gefunden:', loaderPath);
                    res.end(JSON.stringify({ success: true, loader: null }));
                    return;
                }
                
                const loaderData = fs.readFileSync(loaderPath);
                const loaderBase64 = loaderData.toString('base64');
                
                console.log(`📥 Loader Download: ${discordId}`);
                
                res.end(JSON.stringify({
                    success: true,
                    loader: loaderBase64,
                    size: loaderData.length
                }));
                
            } catch (e) {
                res.end(JSON.stringify({ success: false, error: 'Invalid request' }));
            }
        });
        return;
    }
    
    // POST /download-vuln - Vulnerable Driver herunterladen
    if (req.method === 'POST' && url.pathname === '/download-vuln') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { discordId } = JSON.parse(body);
                
                if (!discordId) {
                    res.end(JSON.stringify({ success: false, error: 'Discord ID missing' }));
                    return;
                }
                
                // Lizenz prüfen
                const db = loadLicenses();
                const license = db.licenses.find(l => l.discordId === discordId && l.status === 'active');
                
                if (!license) {
                    res.end(JSON.stringify({ success: false, error: 'No valid license' }));
                    return;
                }
                
                // Vuln Driver-Pfad (z.B. EneIo64.sys)
                const vulnPath = path.join(__dirname, 'Driver', 'EneIo64.sys');
                
                if (!fs.existsSync(vulnPath)) {
                    console.log('[!] Vuln Driver nicht gefunden:', vulnPath);
                    res.end(JSON.stringify({ success: true, driver: null }));
                    return;
                }
                
                const vulnData = fs.readFileSync(vulnPath);
                const vulnBase64 = vulnData.toString('base64');
                
                console.log(`📥 Vuln Driver Download: ${discordId}`);
                
                res.end(JSON.stringify({
                    success: true,
                    driver: vulnBase64,
                    size: vulnData.length
                }));
                
            } catch (e) {
                res.end(JSON.stringify({ success: false, error: 'Invalid request' }));
            }
        });
        return;
    }
    
    // POST /download - Driver herunterladen (nur mit gültiger Lizenz)
    if (req.method === 'POST' && url.pathname === '/download') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { discordId } = JSON.parse(body);
                
                if (!discordId) {
                    res.end(JSON.stringify({ success: false, error: 'Discord ID missing' }));
                    return;
                }
                
                const db = loadLicenses();
                const now = Date.now();
                
                // Prüfe abgelaufene Lizenzen
                db.licenses.forEach(l => {
                    if (l.status === 'active' && l.expiresAt < now) l.status = 'expired';
                });
                saveLicenses(db);
                
                // Finde aktive Lizenz für diesen User
                const license = db.licenses.find(l => l.discordId === discordId && l.status === 'active');
                
                if (!license) {
                    res.end(JSON.stringify({ success: false, error: 'No valid license' }));
                    return;
                }
                
                // Driver-Pfad - Probiere verschiedene Locations
                const possiblePaths = [
                    '/home/container/Driver/RGB_Driver.sys',
                    path.join(__dirname, 'Driver', 'RGB_Driver.sys'),
                    path.join(process.cwd(), 'Driver', 'RGB_Driver.sys'),
                    path.join(__dirname, 'driver', 'RGB_Driver.sys'),
                    '/home/container/driver/RGB_Driver.sys',
                    path.join(__dirname, 'RGB_Driver.sys')
                ];
                
                let driverPath = null;
                console.log('🔍 Suche Driver in:');
                for (const p of possiblePaths) {
                    console.log(`   ${p} → ${fs.existsSync(p) ? '✅ GEFUNDEN' : '❌'}`);
                    if (fs.existsSync(p) && !driverPath) {
                        driverPath = p;
                    }
                }
                
                if (!driverPath) {
                    console.error('❌ Driver in keinem Pfad gefunden!');
                    console.log('📁 Inhalt von __dirname:', fs.readdirSync(__dirname));
                    console.log('📁 Inhalt von cwd:', fs.readdirSync(process.cwd()));
                    res.end(JSON.stringify({ success: false, error: 'Driver not available' }));
                    return;
                }
                
                console.log('✅ Driver gefunden:', driverPath);
                
                // Driver als Base64 senden
                const driverData = fs.readFileSync(driverPath);
                const driverBase64 = driverData.toString('base64');
                
                console.log(`📥 Driver Download: ${discordId} (${license.key})`);
                
                res.end(JSON.stringify({
                    success: true,
                    driver: driverBase64,
                    size: driverData.length
                }));
                
            } catch (e) {
                console.error('Download Error:', e);
                res.end(JSON.stringify({ success: false, error: 'Invalid request' }));
            }
        });
        return;
    }
    
    // ============================================
    // API: Download Vulnerable Driver (für Kernel-Spoofing)
    // POST /api/vuln-driver
    // ============================================
    if (req.url === '/api/vuln-driver' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const { discordId } = data;
                
                if (!discordId) {
                    res.end(JSON.stringify({ success: false, error: 'Discord ID missing' }));
                    return;
                }
                
                const db = loadLicenses();
                const license = db.licenses.find(l => l.discordId === discordId && l.status === 'active');
                
                if (!license) {
                    res.end(JSON.stringify({ success: false, error: 'No valid license' }));
                    return;
                }
                
                // Vulnerable Driver Pfad - EneIo64.sys
                const possiblePaths = [
                    '/home/container/Driver/EneIo64.sys',
                    '/home/container/driver/EneIo64.sys',
                    path.join(__dirname, 'Driver', 'EneIo64.sys'),
                    path.join(__dirname, 'driver', 'EneIo64.sys'),
                    path.join(process.cwd(), 'Driver', 'EneIo64.sys'),
                    path.join(__dirname, 'EneIo64.sys')
                ];
                
                let vulnDriverPath = null;
                console.log('🔍 Suche Vulnerable Driver:');
                for (const p of possiblePaths) {
                    console.log(`   ${p} → ${fs.existsSync(p) ? '✅ GEFUNDEN' : '❌'}`);
                    if (fs.existsSync(p) && !vulnDriverPath) {
                        vulnDriverPath = p;
                    }
                }
                
                if (!vulnDriverPath) {
                    console.error('❌ EneIo64.sys nicht gefunden!');
                    res.end(JSON.stringify({ success: false, error: 'Vulnerable driver not available' }));
                    return;
                }
                
                console.log('✅ Vulnerable Driver gefunden:', vulnDriverPath);
                
                // Driver als Base64 senden
                const driverData = fs.readFileSync(vulnDriverPath);
                const driverBase64 = driverData.toString('base64');
                
                console.log(`📥 Vuln Driver Download: ${discordId}`);
                
                res.end(JSON.stringify({
                    success: true,
                    driver: driverBase64,
                    size: driverData.length,
                    name: 'EneIo64.sys'
                }));
                
            } catch (e) {
                console.error('Vuln Driver Error:', e);
                res.end(JSON.stringify({ success: false, error: 'Invalid request' }));
            }
        });
        return;
    }
    
    // ============================================
    // POST /api/create-ticket - Ticket für Lizenz-Kauf erstellen
    // ============================================
    if (req.method === 'POST' && url.pathname === '/api/create-ticket') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { discordId, username } = JSON.parse(body);
                
                if (!discordId) {
                    res.end(JSON.stringify({ success: false, error: 'Discord ID required' }));
                    return;
                }
                
                // Guild finden
                const guild = client.guilds.cache.first();
                if (!guild) {
                    res.end(JSON.stringify({ success: false, error: 'Bot not in any server' }));
                    return;
                }
                
                // Prüfen ob User schon ein offenes Ticket hat
                const existingTicket = guild.channels.cache.find(c => 
                    c.name === `ticket-${discordId.slice(-4)}` && c.type === ChannelType.GuildText
                );
                
                if (existingTicket) {
                    res.end(JSON.stringify({ 
                        success: true, 
                        ticketId: existingTicket.id,
                        message: 'Ticket already exists',
                        inviteUrl: `https://discord.gg/htkJRM9jFw`
                    }));
                    return;
                }
                
                // Ticket-Channel erstellen (ohne Permissions)
                const ticketChannel = await guild.channels.create({
                    name: `ticket-${discordId.slice(-4)}`,
                    type: ChannelType.GuildText,
                    parent: TICKET_CATEGORY_ID || null
                });
                
                // Permissions nachträglich setzen
                try {
                    // @everyone kann nicht sehen
                    await ticketChannel.permissionOverwrites.create(guild.id, {
                        ViewChannel: false
                    });
                    
                    // Admin Rolle kann sehen
                    await ticketChannel.permissionOverwrites.create(ADMIN_ROLE_ID, {
                        ViewChannel: true,
                        SendMessages: true,
                        ManageChannels: true
                    });
                    
                    // User kann sehen
                    await ticketChannel.permissionOverwrites.create(discordId, {
                        ViewChannel: true,
                        SendMessages: true
                    });
                } catch (permError) {
                    console.log('[!] Permission Fehler:', permError.message);
                    // Trotzdem fortfahren - Admins können den Channel über Server-Einstellungen sehen
                }
                
                // Willkommensnachricht mit Paketauswahl
                const welcomeEmbed = new EmbedBuilder()
                    .setColor(0xe63946)
                    .setTitle('🎮 Nexus+ Spoofer - Lizenz kaufen')
                    .setDescription(`Willkommen <@${discordId}>!\n\nWähle dein gewünschtes Paket:`)
                    .addFields(
                        { name: '📦 1 Tag', value: '**4€** - 24 Stunden Zugang', inline: true },
                        { name: '📦 1 Woche', value: '**12€** - 7 Tage Zugang', inline: true },
                        { name: '📦 1 Monat', value: '**25€** - 30 Tage Zugang', inline: true },
                        { name: '\u200B', value: '**Zahlungsmethoden:** Überweisung, PayPal, BTC, ETH', inline: false }
                    )
                    .setFooter({ text: 'Wähle unten dein Paket aus' })
                    .setTimestamp();
                
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('select_package')
                    .setPlaceholder('📦 Paket auswählen...')
                    .addOptions([
                        { label: '1 Tag - 4€', value: '1tag', description: '24 Stunden Zugang', emoji: '⏱️' },
                        { label: '1 Woche - 12€', value: '1woche', description: '7 Tage Zugang', emoji: '📅' },
                        { label: '1 Monat - 25€', value: '1monat', description: '30 Tage Zugang', emoji: '🗓️' }
                    ]);
                
                const closeButton = new ButtonBuilder()
                    .setCustomId('close_ticket')
                    .setLabel('🔒 Ticket schließen')
                    .setStyle(ButtonStyle.Secondary);
                
                const row1 = new ActionRowBuilder().addComponents(selectMenu);
                const row2 = new ActionRowBuilder().addComponents(closeButton);
                
                await ticketChannel.send({ 
                    content: `<@${discordId}> <@&${ADMIN_ROLE_ID}>`,
                    embeds: [welcomeEmbed], 
                    components: [row1, row2] 
                });
                
                console.log(`🎫 Ticket erstellt: ${ticketChannel.name} für ${discordId}`);
                
                res.end(JSON.stringify({ 
                    success: true, 
                    ticketId: ticketChannel.id,
                    channelName: ticketChannel.name,
                    inviteUrl: `https://discord.gg/htkJRM9jFw`
                }));
                
            } catch (e) {
                console.error('Ticket Error:', e);
                res.end(JSON.stringify({ success: false, error: e.message }));
            }
        });
        return;
    }
    
    // ============================================
    // GET /api/module - Kernel Driver Download (für Electron App)
    // ============================================
    if (req.method === 'GET' && url.pathname === '/api/module') {
        const licenseKey = url.searchParams.get('key');
        
        if (!licenseKey) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'License key required' }));
            return;
        }
        
        // Lizenz validieren
        const db = loadLicenses();
        const now = Date.now();
        
        // Abgelaufene Lizenzen aktualisieren
        db.licenses.forEach(l => {
            if (l.status === 'active' && l.expiresAt < now) l.status = 'expired';
        });
        saveLicenses(db);
        
        const license = db.licenses.find(l => l.key === licenseKey.toUpperCase() && l.status === 'active');
        
        if (!license) {
            res.statusCode = 401;
            res.end(JSON.stringify({ error: 'Invalid or expired license' }));
            return;
        }
        
        // Driver-Pfad (amdppm.sys - unauffälliger Name)
        const driverPaths = [
            '/home/container/driver/amdppm.sys',
            '/home/container/Driver/amdppm.sys',
            path.join(__dirname, 'driver', 'amdppm.sys'),
            path.join(process.cwd(), 'driver', 'amdppm.sys')
        ];
        
        let driverPath = null;
        for (const p of driverPaths) {
            if (fs.existsSync(p)) {
                driverPath = p;
                break;
            }
        }
        
        if (!driverPath) {
            console.error('❌ wdfsvc.sys nicht gefunden!');
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'Module not available' }));
            return;
        }
        
        // Binary Driver senden
        const driverData = fs.readFileSync(driverPath);
        
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Length', driverData.length);
        res.setHeader('Content-Disposition', 'attachment; filename="m.bin"');
        res.setHeader('Cache-Control', 'no-store');
        
        console.log(`📥 Module Download: ${license.key.substring(0, 8)}... (${driverData.length} bytes)`);
        
        res.end(driverData);
        return;
    }
    
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(API_PORT, '0.0.0.0', () => {
    console.log(`🌐 API: http://0.0.0.0:${API_PORT}`);
});

client.login(BOT_TOKEN).catch(err => {
    console.error('❌ Login fehlgeschlagen:', err.message);
    console.log('Prüfe BOT_TOKEN und aktiviere Intents im Developer Portal!');
});
