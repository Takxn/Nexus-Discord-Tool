// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::sync::atomic::AtomicBool;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{State, Manager};
use tauri::tray::{TrayIconBuilder, MouseButton, MouseButtonState, TrayIconEvent};
use tauri::menu::{Menu, MenuItem};
use tauri::image::Image;
use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

// Discord Application ID - Nexus Discord Tool
// WICHTIG: Erstelle eine App auf https://discord.com/developers/applications
// und ersetze diese ID mit deiner eigenen!
const DISCORD_APP_ID: &str = "1190558638067163226";

// Bot-Prozess State
struct BotProcess(Mutex<Option<Child>>);

// Bot-Startzeit State
struct BotStartTime(Mutex<Option<u64>>);

// Rich Presence State
#[allow(dead_code)]
struct RichPresenceActive(AtomicBool);

// App Start Time für Rich Presence
static APP_START_TIME: std::sync::OnceLock<i64> = std::sync::OnceLock::new();

// Konfigurationsstruktur
#[derive(Debug, Serialize, Deserialize, Clone)]
struct BotConfig {
    token: String,
    client_id: String,
    guild_id: String,
    prefix: String,
}

// Bot-Status
#[derive(Debug, Serialize)]
struct BotStatus {
    running: bool,
    pid: Option<u32>,
    uptime: Option<u64>,
}

// Hosting Stats
#[derive(Debug, Serialize)]
struct HostingStats {
    running: bool,
    uptime: String,
    uptime_seconds: u64,
    start_time: Option<String>,
}

// Pfade - Dokumenten-Ordner für Benutzer-Daten
fn get_app_data_dir() -> PathBuf {
    // Dokumenten-Ordner ermitteln
    if let Some(documents) = dirs::document_dir() {
        let app_dir = documents.join("Nexus Discord Tool");
        // Ordner erstellen falls nicht vorhanden
        let _ = fs::create_dir_all(&app_dir);
        return app_dir;
    }
    
    // Fallback: User-Home
    if let Some(home) = dirs::home_dir() {
        let app_dir = home.join("Nexus Discord Tool");
        let _ = fs::create_dir_all(&app_dir);
        return app_dir;
    }
    
    // Letzter Fallback
    PathBuf::from(".")
}

fn get_project_dir() -> PathBuf {
    // Use app data directory for bot files
    get_app_data_dir()
}

fn get_config_path() -> PathBuf {
    // Config wird im Dokumenten-Ordner gespeichert
    get_app_data_dir().join("config.json")
}

fn get_bot_dir() -> PathBuf {
    get_project_dir().join("bot")
}

// Initialize bot files from resources
fn initialize_bot_files(app_handle: &tauri::AppHandle) -> Result<(), String> {
    let bot_dir = get_bot_dir();
    let index_file = bot_dir.join("index.js");
    
    // If bot files already exist, skip
    if index_file.exists() {
        return Ok(());
    }
    
    // Create bot directory
    fs::create_dir_all(&bot_dir).map_err(|e| format!("Failed to create bot directory: {}", e))?;
    
    // Try to copy from resource path
    if let Ok(resource_path) = app_handle.path().resource_dir() {
        let source_bot_dir = resource_path.join("bot");
        if source_bot_dir.exists() {
            copy_dir_recursive(&source_bot_dir, &bot_dir)
                .map_err(|e| format!("Failed to copy bot files: {}", e))?;
            return Ok(());
        }
    }
    
    // Fallback: Check next to executable
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            // Check various possible locations
            let possible_sources = [
                exe_dir.join("bot"),
                exe_dir.join("_up_").join("bot"),
                exe_dir.join("..").join("bot"),
                exe_dir.join("..").join("..").join("bot"),
                exe_dir.join("..").join("Resources").join("bot"), // macOS
            ];
            
            for source in &possible_sources {
                if source.exists() && source.join("index.js").exists() {
                    copy_dir_recursive(source, &bot_dir)
                        .map_err(|e| format!("Failed to copy bot files: {}", e))?;
                    return Ok(());
                }
            }
        }
    }
    
    Err("Bot files not found. Please reinstall the application.".to_string())
}

// Recursively copy directory
fn copy_dir_recursive(src: &PathBuf, dst: &PathBuf) -> std::io::Result<()> {
    if !dst.exists() {
        fs::create_dir_all(dst)?;
    }
    
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let path = entry.path();
        let dest_path = dst.join(entry.file_name());
        
        if path.is_dir() {
            // Skip node_modules - will be installed fresh
            if entry.file_name() == "node_modules" {
                continue;
            }
            copy_dir_recursive(&path, &dest_path)?;
        } else {
            // Skip config.json - user will configure
            if entry.file_name() == "config.json" {
                continue;
            }
            fs::copy(&path, &dest_path)?;
        }
    }
    
    Ok(())
}

// Check if Node.js is installed
#[tauri::command]
fn check_node_installed() -> Result<String, String> {
    #[cfg(windows)]
    let output = Command::new("node")
        .arg("--version")
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    
    #[cfg(not(windows))]
    let output = Command::new("node")
        .arg("--version")
        .output();
    
    match output {
        Ok(out) => {
            if out.status.success() {
                let version = String::from_utf8_lossy(&out.stdout).trim().to_string();
                Ok(version)
            } else {
                Err("Node.js not found".to_string())
            }
        }
        Err(_) => Err("Node.js not installed. Please install Node.js from https://nodejs.org".to_string())
    }
}

// Check setup status - returns what's ready and what's missing
#[tauri::command]
fn check_setup_status() -> Result<String, String> {
    let bot_dir = get_bot_dir();
    let config_path = get_config_path();
    
    let mut status = serde_json::json!({
        "node_installed": false,
        "node_version": "",
        "bot_files_exist": false,
        "dependencies_installed": false,
        "config_exists": false,
        "token_set": false,
        "ready": false
    });
    
    // Check Node.js
    #[cfg(windows)]
    let node_check = Command::new("node")
        .arg("--version")
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    
    #[cfg(not(windows))]
    let node_check = Command::new("node")
        .arg("--version")
        .output();
    
    if let Ok(output) = node_check {
        if output.status.success() {
            status["node_installed"] = serde_json::json!(true);
            status["node_version"] = serde_json::json!(String::from_utf8_lossy(&output.stdout).trim().to_string());
        }
    }
    
    // Check bot files
    if bot_dir.join("index.js").exists() && bot_dir.join("package.json").exists() {
        status["bot_files_exist"] = serde_json::json!(true);
    }
    
    // Check dependencies
    let node_modules = bot_dir.join("node_modules");
    if node_modules.exists() && node_modules.join("discord.js").exists() {
        status["dependencies_installed"] = serde_json::json!(true);
    }
    
    // Check config
    if config_path.exists() {
        status["config_exists"] = serde_json::json!(true);
        
        if let Ok(content) = fs::read_to_string(&config_path) {
            if let Ok(config) = serde_json::from_str::<BotConfig>(&content) {
                if !config.token.is_empty() {
                    status["token_set"] = serde_json::json!(true);
                }
            }
        }
    }
    
    // Check if everything is ready
    let ready = status["node_installed"].as_bool().unwrap_or(false)
        && status["bot_files_exist"].as_bool().unwrap_or(false)
        && status["token_set"].as_bool().unwrap_or(false);
    status["ready"] = serde_json::json!(ready);
    
    Ok(status.to_string())
}

// Install bot dependencies
#[tauri::command]
async fn install_bot_dependencies() -> Result<String, String> {
    let bot_dir = get_bot_dir();
    
    if !bot_dir.join("package.json").exists() {
        return Err("Bot files not found".to_string());
    }
    
    #[cfg(windows)]
    let output = Command::new("cmd")
        .args(["/C", "npm", "install"])
        .current_dir(&bot_dir)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("Failed to run npm install: {}", e))?;
    
    #[cfg(not(windows))]
    let output = Command::new("npm")
        .arg("install")
        .current_dir(&bot_dir)
        .output()
        .map_err(|e| format!("Failed to run npm install: {}", e))?;
    
    if output.status.success() {
        Ok("Dependencies installed successfully".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("npm install failed: {}", stderr))
    }
}

// Konfiguration speichern
#[tauri::command]
fn save_config(config: BotConfig) -> Result<String, String> {
    let config_path = get_config_path();
    
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&config_path, json).map_err(|e| e.to_string())?;
    
    Ok("Configuration saved".to_string())
}

// Konfiguration laden
#[tauri::command]
fn load_config() -> Result<BotConfig, String> {
    let config_path = get_config_path();
    
    if !config_path.exists() {
        return Ok(BotConfig {
            token: String::new(),
            client_id: String::new(),
            guild_id: String::new(),
            prefix: "!".to_string(),
        });
    }
    
    let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    let config: BotConfig = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    
    Ok(config)
}

// Alle gespeicherten Daten löschen
#[tauri::command]
fn clear_all_data() -> Result<String, String> {
    let app_data_dir = get_app_data_dir();
    let bot_dir = get_bot_dir();
    
    let mut deleted = Vec::new();
    
    // Config im Dokumenten-Ordner löschen
    let app_config = app_data_dir.join("config.json");
    if app_config.exists() {
        fs::remove_file(&app_config).map_err(|e| e.to_string())?;
        deleted.push("Dokumenten-Config");
    }
    
    // Config im Bot-Ordner löschen
    let bot_config = bot_dir.join("config.json");
    if bot_config.exists() {
        fs::remove_file(&bot_config).map_err(|e| e.to_string())?;
        deleted.push("Bot-Config");
    }
    
    // Settings im Bot-Ordner löschen
    let settings = bot_dir.join("settings.json");
    if settings.exists() {
        fs::remove_file(&settings).map_err(|e| e.to_string())?;
        deleted.push("Settings");
    }
    
    // Delete logs
    let logs = bot_dir.join("bot.log");
    if logs.exists() {
        fs::remove_file(&logs).map_err(|e| e.to_string())?;
        deleted.push("Logs");
    }
    
    if deleted.is_empty() {
        Ok("No data to delete found".to_string())
    } else {
        Ok(format!("Deleted: {}", deleted.join(", ")))
    }
}

// Config-Speicherort abrufen
#[tauri::command]
fn get_config_location() -> Result<String, String> {
    Ok(get_app_data_dir().to_string_lossy().to_string())
}

// Status-Config speichern
#[tauri::command]
fn save_status_config(config: String) -> Result<String, String> {
    let bot_dir = get_bot_dir();
    let status_path = bot_dir.join("status-config.json");
    
    fs::write(&status_path, &config).map_err(|e| e.to_string())?;
    
    Ok("Status config saved".to_string())
}

// Bot starten
#[tauri::command]
fn start_bot(state: State<BotProcess>, start_time: State<BotStartTime>) -> Result<String, String> {
    let mut process = state.0.lock().map_err(|e| e.to_string())?;
    
    if process.is_some() {
        return Err("Bot is already running".to_string());
    }
    
    let bot_dir = get_bot_dir();
    let app_config_path = get_config_path(); // In documents folder
    let bot_config_path = bot_dir.join("config.json"); // In bot folder
    
    // Check if bot files exist
    if !bot_dir.join("index.js").exists() {
        return Err("Bot files not found. Please reinstall the application.".to_string());
    }
    
    // Check if config.json exists in documents folder
    if !app_config_path.exists() {
        return Err("Please save the configuration first".to_string());
    }
    
    // Check if token is set
    let config_content = fs::read_to_string(&app_config_path).map_err(|e| e.to_string())?;
    let config: BotConfig = serde_json::from_str(&config_content).map_err(|e| e.to_string())?;
    
    if config.token.is_empty() {
        return Err("Please enter a Bot Token first".to_string());
    }
    
    // Check if node_modules exists, if not install dependencies
    let node_modules = bot_dir.join("node_modules");
    if !node_modules.exists() || !node_modules.join("discord.js").exists() {
        // Install dependencies synchronously
        #[cfg(windows)]
        let install_result = Command::new("cmd")
            .args(["/C", "npm", "install", "--production"])
            .current_dir(&bot_dir)
            .creation_flags(CREATE_NO_WINDOW)
            .output();
        
        #[cfg(not(windows))]
        let install_result = Command::new("npm")
            .args(["install", "--production"])
            .current_dir(&bot_dir)
            .output();
        
        match install_result {
            Ok(output) => {
                if !output.status.success() {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    return Err(format!("Failed to install dependencies: {}", stderr));
                }
            }
            Err(e) => {
                return Err(format!("Failed to run npm install: {}. Is Node.js installed?", e));
            }
        }
    }
    
    // Copy config.json to bot folder (bot needs it there)
    fs::copy(&app_config_path, &bot_config_path).map_err(|e| e.to_string())?;
    
    #[cfg(windows)]
    let child = Command::new("node")
        .arg("index.js")
        .current_dir(&bot_dir)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Error starting: {}. Is Node.js installed?", e))?;
    
    #[cfg(not(windows))]
    let child = Command::new("node")
        .arg("index.js")
        .current_dir(&bot_dir)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Error starting: {}. Is Node.js installed?", e))?;
    
    *process = Some(child);
    
    // Save start time
    let mut time = start_time.0.lock().map_err(|e| e.to_string())?;
    *time = Some(SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs());
    
    Ok("Bot started".to_string())
}

// Prozess und alle Kindprozesse beenden (Windows)
#[cfg(windows)]
fn kill_process_tree(pid: u32) {
    // taskkill /F /T /PID beendet Prozess und alle Kindprozesse
    let _ = Command::new("taskkill")
        .args(["/F", "/T", "/PID", &pid.to_string()])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
}

#[cfg(not(windows))]
fn kill_process_tree(pid: u32) {
    // Auf Unix: kill -9 -<pid> für Prozessgruppe
    let _ = Command::new("kill")
        .args(["-9", &format!("-{}", pid)])
        .output();
}

// Alle Node-Prozesse für den Bot beenden
fn cleanup_bot_processes() {
    #[cfg(windows)]
    {
        // Versuche über Port 47832 zu identifizieren und beenden
        // Dann Fallback auf node.exe mit Fenstertitel
        let _ = Command::new("cmd")
            .args(["/C", "for /f \"tokens=5\" %a in ('netstat -ano ^| findstr :47832 ^| findstr LISTENING') do taskkill /F /PID %a 2>nul"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
    }
    
    #[cfg(not(windows))]
    {
        // Unix: fuser zum Beenden von Prozessen auf Port
        let _ = Command::new("sh")
            .args(["-c", "fuser -k 47832/tcp 2>/dev/null"])
            .output();
    }
}

// Tauri-Befehl zum manuellen Cleanup
#[tauri::command]
fn force_cleanup_bot() -> Result<String, String> {
    cleanup_bot_processes();
    std::thread::sleep(std::time::Duration::from_millis(500));
    Ok("Cleanup durchgeführt".to_string())
}

// Bot stoppen
#[tauri::command]
fn stop_bot(state: State<BotProcess>, start_time: State<BotStartTime>) -> Result<String, String> {
    let mut process = state.0.lock().map_err(|e| e.to_string())?;
    
    if let Some(mut child) = process.take() {
        let pid = child.id();
        
        // Erst versuchen normal zu beenden
        let _ = child.kill();
        
        // Then kill the entire process tree with taskkill
        kill_process_tree(pid);
        
        // Wait until terminated
        let _ = child.wait();
        
        // Reset start time
        let mut time = start_time.0.lock().map_err(|e| e.to_string())?;
        *time = None;
        
        Ok("Bot stopped".to_string())
    } else {
        // Still try cleanup in case process was started externally
        cleanup_bot_processes();
        Err("Bot is not running".to_string())
    }
}

// Bot-Status abrufen
#[tauri::command]
fn get_bot_status(state: State<BotProcess>, start_time: State<BotStartTime>) -> Result<BotStatus, String> {
    let mut process = state.0.lock().map_err(|e| e.to_string())?;
    let time = start_time.0.lock().map_err(|e| e.to_string())?;
    
    if let Some(ref mut child) = *process {
        match child.try_wait() {
            Ok(Some(_status)) => {
                // Prozess hat sich beendet
                *process = None;
                Ok(BotStatus {
                    running: false,
                    pid: None,
                    uptime: None,
                })
            }
            Ok(None) => {
                // Prozess läuft noch
                let uptime = time.map(|t| {
                    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() - t
                });
                Ok(BotStatus {
                    running: true,
                    pid: Some(child.id()),
                    uptime,
                })
            }
            Err(e) => Err(e.to_string()),
        }
    } else {
        Ok(BotStatus {
            running: false,
            pid: None,
            uptime: None,
        })
    }
}

// Restart bot
#[tauri::command]
fn restart_bot(state: State<BotProcess>, start_time: State<BotStartTime>) -> Result<String, String> {
    // First stop with complete cleanup
    {
        let mut process = state.0.lock().map_err(|e| e.to_string())?;
        if let Some(mut child) = process.take() {
            let pid = child.id();
            let _ = child.kill();
            kill_process_tree(pid);
            let _ = child.wait();
        }
    }
    
    // Extra cleanup for hanging processes
    cleanup_bot_processes();
    
    // Wait a bit longer to ensure process is terminated
    std::thread::sleep(std::time::Duration::from_millis(1000));
    
    // Then start
    let mut process = state.0.lock().map_err(|e| e.to_string())?;
    let bot_dir = get_bot_dir();
    
    #[cfg(windows)]
    let child = Command::new("node")
        .arg("index.js")
        .current_dir(&bot_dir)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Error restarting: {}", e))?;
    
    #[cfg(not(windows))]
    let child = Command::new("node")
        .arg("index.js")
        .current_dir(&bot_dir)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Error restarting: {}", e))?;
    
    *process = Some(child);
    
    // Update start time
    let mut time = start_time.0.lock().map_err(|e| e.to_string())?;
    *time = Some(SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs());
    
    Ok("Bot restarted".to_string())
}

// Hosting-Statistiken abrufen
#[tauri::command]
fn get_hosting_stats(state: State<BotProcess>, start_time: State<BotStartTime>) -> Result<HostingStats, String> {
    let mut process = state.0.lock().map_err(|e| e.to_string())?;
    let time = start_time.0.lock().map_err(|e| e.to_string())?;
    
    let running = if let Some(ref mut child) = *process {
        match child.try_wait() {
            Ok(Some(_)) => {
                *process = None;
                false
            }
            Ok(None) => true,
            Err(_) => false,
        }
    } else {
        false
    };
    
    let uptime_seconds = if running {
        time.map(|t| SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() - t).unwrap_or(0)
    } else {
        0
    };
    
    let uptime = format_uptime(uptime_seconds);
    
    let start_time_str = if running {
        time.map(|t| format_timestamp(t))
    } else {
        None
    };
    
    Ok(HostingStats {
        running,
        uptime,
        uptime_seconds,
        start_time: start_time_str,
    })
}

fn format_uptime(seconds: u64) -> String {
    let days = seconds / 86400;
    let hours = (seconds % 86400) / 3600;
    let minutes = (seconds % 3600) / 60;
    let secs = seconds % 60;
    
    if days > 0 {
        format!("{}d {}h {}m", days, hours, minutes)
    } else if hours > 0 {
        format!("{}h {}m {}s", hours, minutes, secs)
    } else if minutes > 0 {
        format!("{}m {}s", minutes, secs)
    } else {
        format!("{}s", secs)
    }
}

fn format_timestamp(timestamp: u64) -> String {
    let secs = timestamp;
    let days_since_epoch = secs / 86400;
    let time_of_day = secs % 86400;
    let hours = (time_of_day / 3600 + 1) % 24; // +1 für CET
    let minutes = (time_of_day % 3600) / 60;
    
    let mut year = 1970i64;
    let mut remaining_days = days_since_epoch as i64;
    
    loop {
        let days_in_year = if year % 4 == 0 && (year % 100 != 0 || year % 400 == 0) { 366 } else { 365 };
        if remaining_days < days_in_year {
            break;
        }
        remaining_days -= days_in_year;
        year += 1;
    }
    
    let days_in_months: [i64; 12] = if year % 4 == 0 && (year % 100 != 0 || year % 400 == 0) {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    
    let mut month = 1;
    for days in days_in_months.iter() {
        if remaining_days < *days {
            break;
        }
        remaining_days -= *days;
        month += 1;
    }
    
    let day = remaining_days + 1;
    
    format!("{:02}.{:02}.{} {:02}:{:02}", day, month, year, hours, minutes)
}

// Read logs
#[tauri::command]
fn read_logs() -> Result<String, String> {
    let bot_dir = get_bot_dir();
    let log_path = bot_dir.join("bot.log");
    
    if !log_path.exists() {
        return Ok("".to_string());
    }
    
    let content = fs::read_to_string(&log_path).map_err(|e| e.to_string())?;
    
    // Nur die letzten 200 Zeilen zurückgeben
    let lines: Vec<&str> = content.lines().collect();
    let start = if lines.len() > 200 { lines.len() - 200 } else { 0 };
    
    Ok(lines[start..].join("\n"))
}

// Clear logs
#[tauri::command]
fn clear_logs() -> Result<String, String> {
    let bot_dir = get_bot_dir();
    let log_path = bot_dir.join("bot.log");
    
    if log_path.exists() {
        fs::write(&log_path, "").map_err(|e| e.to_string())?;
    }
    
    Ok("Logs cleared".to_string())
}

// Bot API Status prüfen
#[tauri::command]
async fn check_bot_api() -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .map_err(|e| e.to_string())?;
    
    let response = client
        .get("http://127.0.0.1:47832/status")
        .send()
        .await
        .map_err(|_| "Bot API not reachable".to_string())?;
    
    let body = response.text().await.map_err(|e| e.to_string())?;
    Ok(body)
}

// Bot Daten abrufen
#[tauri::command]
async fn get_bot_data() -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;
    
    let response = client
        .get("http://127.0.0.1:47832/data")
        .send()
        .await
        .map_err(|_| "Bot API not reachable".to_string())?;
    
    if !response.status().is_success() {
        return Err("Bot not ready".to_string());
    }
    
    let body = response.text().await.map_err(|e| e.to_string())?;
    Ok(body)
}

// Bot Aktion ausführen
#[tauri::command]
async fn execute_bot_action(action: String, params: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    
    let body = format!(r#"{{"action":"{}","params":{}}}"#, action, params);
    
    let response = client
        .post("http://127.0.0.1:47832/action")
        .header("Content-Type", "application/json")
        .body(body)
        .send()
        .await
        .map_err(|_| "Bot API not reachable".to_string())?;
    
    let result = response.text().await.map_err(|e| e.to_string())?;
    Ok(result)
}

// Schneller Ping-Check
#[tauri::command]
async fn ping_bot() -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(1))
        .build()
        .map_err(|e| e.to_string())?;
    
    let response = client
        .get("http://127.0.0.1:47832/ping")
        .send()
        .await
        .map_err(|_| "Bot not reachable".to_string())?;
    
    let body = response.text().await.map_err(|e| e.to_string())?;
    Ok(body)
}

// Server-Liste abrufen
#[tauri::command]
async fn get_bot_servers() -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;
    
    let response = client
        .get("http://127.0.0.1:47832/servers")
        .send()
        .await
        .map_err(|_| "Bot API not reachable".to_string())?;
    
    let body = response.text().await.map_err(|e| e.to_string())?;
    Ok(body)
}

// Server wechseln
#[tauri::command]
async fn switch_bot_server(guild_id: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;
    
    let body = format!(r#"{{"guildId":"{}"}}"#, guild_id);
    
    let response = client
        .post("http://127.0.0.1:47832/switch-server")
        .header("Content-Type", "application/json")
        .body(body)
        .send()
        .await
        .map_err(|_| "Bot API not reachable".to_string())?;
    
    let result = response.text().await.map_err(|e| e.to_string())?;
    Ok(result)
}

// Bot-Steuerbefehl senden
#[tauri::command]
async fn send_bot_control(command: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    
    let body = format!(r#"{{"command":"{}"}}"#, command);
    
    let response = client
        .post("http://127.0.0.1:47832/control")
        .header("Content-Type", "application/json")
        .body(body)
        .send()
        .await
        .map_err(|_| "Bot API not reachable".to_string())?;
    
    let result = response.text().await.map_err(|e| e.to_string())?;
    Ok(result)
}

// Schnellaktion ausführen
#[tauri::command]
async fn execute_quick_action(action: String, target: String, value: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    
    let body = format!(r#"{{"action":"{}","target":"{}","value":"{}"}}"#, action, target, value);
    
    let response = client
        .post("http://127.0.0.1:47832/quick-action")
        .header("Content-Type", "application/json")
        .body(body)
        .send()
        .await
        .map_err(|_| "Bot API not reachable".to_string())?;
    
    let result = response.text().await.map_err(|e| e.to_string())?;
    Ok(result)
}

// Discord Rich Presence starten
fn start_rich_presence() {
    std::thread::spawn(|| {
        // Startzeit setzen
        let start_time = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let _ = APP_START_TIME.set(start_time);
        
        // Discord Client erstellen
        let mut client = match DiscordIpcClient::new(DISCORD_APP_ID) {
            Ok(c) => c,
            Err(_) => return,
        };
        
        // Verbinden
        if client.connect().is_err() {
            return;
        }
        
        loop {
            // Activity Status ermitteln
            let (state, details) = get_presence_status();
            
            // Activity aktualisieren
            let payload = activity::Activity::new()
                .state(&state)
                .details(&details)
                .assets(
                    activity::Assets::new()
                        .large_image("nexus_logo")
                        .large_text("Nexus Discord Tool")
                        .small_image("online")
                        .small_text("Bot Management")
                )
                .timestamps(
                    activity::Timestamps::new()
                        .start(*APP_START_TIME.get().unwrap_or(&start_time))
                )
                .buttons(vec![
                    activity::Button::new("Nexus+ Server beitreten", "https://discord.gg/htkJRM9jFw")
                ]);
            
            let _ = client.set_activity(payload);
            
            // Alle 15 Sekunden aktualisieren
            std::thread::sleep(std::time::Duration::from_secs(15));
        }
    });
}

// Aktuellen Status für Rich Presence ermitteln
fn get_presence_status() -> (String, String) {
    // Prüfe ob Bot läuft (vereinfacht)
    let bot_dir = get_bot_dir();
    let log_path = bot_dir.join("bot.log");
    
    if log_path.exists() {
        if let Ok(content) = fs::read_to_string(&log_path) {
            let lines: Vec<&str> = content.lines().collect();
            if let Some(last) = lines.last() {
                if last.contains("eingeloggt") || last.contains("online") {
                    return ("Bot ist Online".to_string(), "Verwaltet Discord Server".to_string());
                }
            }
        }
    }
    
    ("Nexus Discord Tool".to_string(), "Bot Management Dashboard".to_string())
}

// Fenster in System Tray minimieren (verstecken)
#[tauri::command]
fn minimize_window(window: tauri::Window) {
    let _ = window.hide();
}

fn main() {
    // Cleanup beim Start - alte Prozesse beenden
    cleanup_bot_processes();
    
    // Rich Presence starten
    start_rich_presence();
    
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(BotProcess(Mutex::new(None)))
        .manage(BotStartTime(Mutex::new(None)))
        .manage(RichPresenceActive(AtomicBool::new(true)))
        .setup(|app| {
            // Create System Tray
            let show_item = MenuItem::with_id(app, "show", "Open", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;
            
            // Tray Icon laden
            let icon = Image::from_path("icons/icon.png")
                .or_else(|_| Image::from_path("icons/32x32.png"))
                .unwrap_or_else(|_| Image::from_bytes(include_bytes!("../icons/icon.png")).expect("Failed to load embedded icon"));
            
            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .tooltip("Nexus Discord Tool")
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            // Bot cleanup vor dem Beenden
                            if let Some(state) = app.try_state::<BotProcess>() {
                                let mut process = state.0.lock().unwrap();
                                if let Some(ref mut child) = *process {
                                    let pid: u32 = child.id();
                                    let _ = child.kill();
                                    kill_process_tree(pid);
                                    let _ = child.wait();
                                }
                                *process = None;
                            }
                            cleanup_bot_processes();
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    // Double click or left click opens window
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;
            
            // Initialize bot files from resources
            let app_handle = app.handle().clone();
            if let Err(e) = initialize_bot_files(&app_handle) {
                eprintln!("Warning: Could not initialize bot files: {}", e);
            }
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            save_config,
            load_config,
            clear_all_data,
            get_config_location,
            save_status_config,
            start_bot,
            stop_bot,
            get_bot_status,
            restart_bot,
            force_cleanup_bot,
            get_hosting_stats,
            read_logs,
            clear_logs,
            check_bot_api,
            get_bot_data,
            execute_bot_action,
            ping_bot,
            get_bot_servers,
            switch_bot_server,
            send_bot_control,
            execute_quick_action,
            minimize_window,
            check_node_installed,
            check_setup_status,
            install_bot_dependencies
        ])
        .on_window_event(|window, event| {
            // Stop bot when app is closed
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if let Some(state) = window.try_state::<BotProcess>() {
                    let mut process = state.0.lock().unwrap();
                    if let Some(ref mut child) = *process {
                        let pid: u32 = child.id();
                        let _ = child.kill();
                        kill_process_tree(pid);
                        let _ = child.wait();
                    }
                    *process = None;
                }
                // Extra cleanup
                cleanup_bot_processes();
            }
        })
        .run(tauri::generate_context!())
        .expect("Error starting the application");
}
