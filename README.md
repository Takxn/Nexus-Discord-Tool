# Nexus Discord Tool

<p align="center">
  <img src="logo.png" alt="Nexus Logo" width="150">
</p>

Eine moderne Desktop-Anwendung zur Konfiguration, Verwaltung und 24/7-Hosting von Discord-Bots.

## Features

- **Bot-Konfiguration**: Einfache Einrichtung von Bot Token, Client ID und Guild ID
- **Server-Management**: Kanäle, Rollen und Mitglieder verwalten
- **24/7 Hosting**: Lokales Bot-Hosting ohne externe Server
- **Echtzeit-Logs**: Live-Protokollierung aller Bot-Aktivitäten
- **Analytics**: Server-Statistiken und Aktivitäts-Übersicht
- **Modernes Design**: Dunkles Theme mit roten Akzenten

## Voraussetzungen

Stelle sicher, dass folgende Software installiert ist:

- **Node.js** (v18 oder höher): [Download](https://nodejs.org/)
- **Rust** (mit Cargo): [Download](https://rustup.rs/)
- **Visual Studio Build Tools** (Windows): [Download](https://visualstudio.microsoft.com/visual-cpp-build-tools/)

## Installation

### 1. Repository klonen oder herunterladen

```bash
cd Nexus-discord-tool
```

### 2. Dependencies installieren

```bash
# Root Dependencies (Tauri)
npm install

# Bot Dependencies
cd bot
npm install
cd ..
```

### 3. Discord Bot erstellen

1. Gehe zum [Discord Developer Portal](https://discord.com/developers/applications)
2. Klicke auf "New Application" und gib einen Namen ein
3. Gehe zu "Bot" im Seitenmenü
4. Klicke auf "Add Bot"
5. Kopiere den **Bot Token** (unter "Token")
6. Aktiviere unter "Privileged Gateway Intents":
   - PRESENCE INTENT
   - SERVER MEMBERS INTENT
   - MESSAGE CONTENT INTENT
7. Kopiere die **Application ID** (unter "General Information")

### 4. Bot zum Server einladen

1. Gehe zu "OAuth2" → "URL Generator"
2. Wähle Scopes: `bot`, `applications.commands`
3. Wähle Permissions: `Administrator` (oder spezifische Berechtigungen)
4. Kopiere die generierte URL und öffne sie im Browser
5. Wähle deinen Server und autorisiere den Bot

### 5. Anwendung starten

**Entwicklungsmodus:**
```bash
npm run dev
```

**Produktions-Build:**
```bash
npm run build
```

Die erstellte Anwendung findest du unter `src-tauri/target/release/`.

## Verwendung

### Bot-Konfiguration

1. Öffne die Anwendung
2. Gehe zur "Konfiguration"-Seite
3. Gib ein:
   - **Bot Token**: Dein Discord Bot Token
   - **Client ID**: Die Application ID
   - **Guild ID**: Die Server ID (Rechtsklick auf Server → "Server-ID kopieren")
4. Klicke auf "Speichern"

### Bot starten

1. Gehe zur "Hosting"-Seite
2. Klicke auf "Start"
3. Der Status-Indikator zeigt an, ob der Bot läuft

### Verfügbare Bot-Commands

| Command | Beschreibung |
|---------|--------------|
| `/ping` | Zeigt die Bot-Latenz |
| `/info` | Bot-Informationen |
| `/serverinfo` | Server-Statistiken |
| `/userinfo [@user]` | Benutzer-Informationen |
| `/createchannel <name> [type]` | Kanal erstellen |
| `/createrole <name> [color]` | Rolle erstellen |
| `/kick <@user> [reason]` | Benutzer kicken |
| `/ban <@user> [reason]` | Benutzer bannen |
| `/clear <amount>` | Nachrichten löschen |
| `/stats` | Server-Statistiken |

## Projektstruktur

```
nexus-discord-tool/
├── src-tauri/          # Rust-Backend (Tauri)
│   ├── Cargo.toml      # Rust Dependencies
│   ├── tauri.conf.json # Tauri Konfiguration
│   └── src/
│       └── main.rs     # Backend-Logik
├── src/                # Web-Frontend
│   ├── index.html      # Haupt-UI
│   ├── styles.css      # Styling
│   └── app.js          # Frontend-Logik
├── bot/                # Discord Bot
│   ├── package.json    # Bot Dependencies
│   ├── config.json     # Bot-Konfiguration
│   └── index.js        # Bot-Logik
├── logo.png            # Anwendungs-Logo
├── logo.ico            # Windows Icon
├── package.json        # Root Dependencies
└── README.md           # Diese Datei
```

## Troubleshooting

### "Bot Token ungültig"
- Stelle sicher, dass du den korrekten Token kopiert hast
- Generiere ggf. einen neuen Token im Developer Portal

### "Slash Commands nicht sichtbar"
- Guild Commands sind sofort verfügbar
- Globale Commands können bis zu 1 Stunde dauern
- Stelle sicher, dass die Guild ID korrekt ist

### "Bot kann Kanäle nicht erstellen"
- Überprüfe die Bot-Berechtigungen auf dem Server
- Der Bot benötigt "Manage Channels" Permission

### Rust Compilation Fehler
- Installiere Visual Studio Build Tools (Windows)
- Führe `rustup update` aus

## Sicherheitshinweise

- **Teile niemals deinen Bot Token!**
- Der Token wird lokal in `bot/config.json` gespeichert
- Füge `config.json` zu `.gitignore` hinzu, wenn du das Projekt versionierst

## Lizenz

MIT License - Siehe LICENSE Datei für Details.

## Autor

Erstellt mit dem Nexus Discord Tool
