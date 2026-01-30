# Nexus Discord Tool

<p align="center">
  <img src="logo.png" alt="Nexus Logo" width="150">
</p>

A modern desktop application for configuring, managing, and 24/7 hosting of Discord bots.

## Features

- **Bot Configuration**: Easy setup of Bot Token, Client ID, and Guild ID
- **Server Management**: Manage channels, roles, and members
- **24/7 Hosting**: Local bot hosting without external servers
- **Real-time Logs**: Live logging of all bot activities
- **Analytics**: Server statistics and activity overview
- **Modern Design**: Dark theme with red accents

## Prerequisites

Make sure the following software is installed:

- **Node.js** (v18 or higher): [Download](https://nodejs.org/)
- **Rust** (with Cargo): [Download](https://rustup.rs/)
- **Visual Studio Build Tools** (Windows): [Download](https://visualstudio.microsoft.com/visual-cpp-build-tools/)

## Installation

### 1. Clone or download the repository

```bash
cd Nexus-discord-tool
```

### 2. Install dependencies

```bash
# Root Dependencies (Tauri)
npm install

# Bot Dependencies
cd bot
npm install
cd ..
```

### 3. Create Discord Bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and enter a name
3. Go to "Bot" in the sidebar
4. Click "Add Bot"
5. Copy the **Bot Token** (under "Token")
6. Enable under "Privileged Gateway Intents":
   - PRESENCE INTENT
   - SERVER MEMBERS INTENT
   - MESSAGE CONTENT INTENT
7. Copy the **Application ID** (under "General Information")

### 4. Invite bot to server

1. Go to "OAuth2" → "URL Generator"
2. Select Scopes: `bot`, `applications.commands`
3. Select Permissions: `Administrator` (or specific permissions)
4. Copy the generated URL and open it in your browser
5. Select your server and authorize the bot

### 5. Start the application

**Development mode:**
```bash
npm run dev
```

**Production build:**
```bash
npm run build
```

The built application can be found under `src-tauri/target/release/`.

## Usage

### Bot Configuration

1. Open the application
2. Go to the "Configuration" page
3. Enter:
   - **Bot Token**: Your Discord Bot Token
   - **Client ID**: The Application ID
   - **Guild ID**: The Server ID (Right-click on server → "Copy Server ID")
4. Click "Save"

### Start Bot

1. Go to the "Hosting" page
2. Click "Start"
3. The status indicator shows whether the bot is running

### Available Bot Commands

| Command | Description |
|---------|-------------|
| `/ping` | Shows bot latency |
| `/info` | Bot information |
| `/serverinfo` | Server statistics |
| `/userinfo [@user]` | User information |
| `/createchannel <name> [type]` | Create channel |
| `/createrole <name> [color]` | Create role |
| `/kick <@user> [reason]` | Kick user |
| `/ban <@user> [reason]` | Ban user |
| `/clear <amount>` | Delete messages |
| `/stats` | Server statistics |

## Project Structure

```
nexus-discord-tool/
├── src-tauri/          # Rust Backend (Tauri)
│   ├── Cargo.toml      # Rust Dependencies
│   ├── tauri.conf.json # Tauri Configuration
│   └── src/
│       └── main.rs     # Backend Logic
├── src/                # Web Frontend
│   ├── index.html      # Main UI
│   ├── styles.css      # Styling
│   └── app.js          # Frontend Logic
├── bot/                # Discord Bot
│   ├── package.json    # Bot Dependencies
│   ├── config.json     # Bot Configuration
│   └── index.js        # Bot Logic
├── logo.png            # Application Logo
├── logo.ico            # Windows Icon
├── package.json        # Root Dependencies
└── README.md           # This file
```

## Troubleshooting

### "Invalid Bot Token"
- Make sure you copied the correct token
- Generate a new token in the Developer Portal if necessary

### "Slash Commands not visible"
- Guild Commands are available immediately
- Global Commands can take up to 1 hour
- Make sure the Guild ID is correct

### "Bot cannot create channels"
- Check the bot permissions on the server
- The bot requires "Manage Channels" permission

### Rust Compilation Errors
- Install Visual Studio Build Tools (Windows)
- Run `rustup update`

## Security Notes

- **Never share your Bot Token!**
- The token is stored locally in `bot/config.json`
- Add `config.json` to `.gitignore` if you version the project

## License

MIT License - See LICENSE file for details.

## Author

Nexus Team

Erstellt mit dem Nexus Discord Tool
