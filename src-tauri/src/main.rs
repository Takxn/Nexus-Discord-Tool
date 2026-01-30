// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;
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

// Pfade - Fester Pfad zum Projekt
fn get_project_dir() -> PathBuf {
    // Versuche verschiedene Pfade
    let possible_paths = [
        PathBuf::from(r"C:\Users\110ha\Desktop\Nexus-discord-tool"),
        std::env::current_exe()
            .unwrap()
            .parent()
            .unwrap()
            .join("..").join("..").join(".."),
    ];
    
    for path in &possible_paths {
        let bot_dir = path.join("bot");
        if bot_dir.exists() {
            return path.clone();
        }
    }
    
    // Fallback
    PathBuf::from(r"C:\Users\110ha\Desktop\Nexus-discord-tool")
}

fn get_config_path() -> PathBuf {
    get_project_dir().join("bot").join("config.json")
}

fn get_bot_dir() -> PathBuf {
    get_project_dir().join("bot")
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
    
    Ok("Konfiguration gespeichert".to_string())
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

// Bot starten
#[tauri::command]
fn start_bot(state: State<BotProcess>, start_time: State<BotStartTime>) -> Result<String, String> {
    let mut process = state.0.lock().map_err(|e| e.to_string())?;
    
    if process.is_some() {
        return Err("Bot läuft bereits".to_string());
    }
    
    let bot_dir = get_bot_dir();
    
    // Prüfe ob config.json existiert
    let config_path = bot_dir.join("config.json");
    if !config_path.exists() {
        return Err("Bitte zuerst die Konfiguration speichern".to_string());
    }
    
    // Prüfe ob Token gesetzt ist
    let config_content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    let config: BotConfig = serde_json::from_str(&config_content).map_err(|e| e.to_string())?;
    
    if config.token.is_empty() {
        return Err("Bitte zuerst einen Bot Token eingeben".to_string());
    }
    
    #[cfg(windows)]
    let child = Command::new("node")
        .arg("index.js")
        .current_dir(&bot_dir)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Fehler beim Starten: {}. Ist Node.js installiert?", e))?;
    
    #[cfg(not(windows))]
    let child = Command::new("node")
        .arg("index.js")
        .current_dir(&bot_dir)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Fehler beim Starten: {}. Ist Node.js installiert?", e))?;
    
    *process = Some(child);
    
    // Startzeit speichern
    let mut time = start_time.0.lock().map_err(|e| e.to_string())?;
    *time = Some(SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs());
    
    Ok("Bot gestartet".to_string())
}

// Bot stoppen
#[tauri::command]
fn stop_bot(state: State<BotProcess>, start_time: State<BotStartTime>) -> Result<String, String> {
    let mut process = state.0.lock().map_err(|e| e.to_string())?;
    
    if let Some(mut child) = process.take() {
        let _ = child.kill();
        let _ = child.wait();
        
        // Startzeit zurücksetzen
        let mut time = start_time.0.lock().map_err(|e| e.to_string())?;
        *time = None;
        
        Ok("Bot gestoppt".to_string())
    } else {
        Err("Bot läuft nicht".to_string())
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

// Bot neustarten
#[tauri::command]
fn restart_bot(state: State<BotProcess>, start_time: State<BotStartTime>) -> Result<String, String> {
    // Erst stoppen
    {
        let mut process = state.0.lock().map_err(|e| e.to_string())?;
        if let Some(mut child) = process.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
    
    std::thread::sleep(std::time::Duration::from_millis(500));
    
    // Dann starten
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
        .map_err(|e| format!("Fehler beim Neustarten: {}", e))?;
    
    #[cfg(not(windows))]
    let child = Command::new("node")
        .arg("index.js")
        .current_dir(&bot_dir)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Fehler beim Neustarten: {}", e))?;
    
    *process = Some(child);
    
    // Startzeit aktualisieren
    let mut time = start_time.0.lock().map_err(|e| e.to_string())?;
    *time = Some(SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs());
    
    Ok("Bot neugestartet".to_string())
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

// Logs lesen
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

// Logs löschen
#[tauri::command]
fn clear_logs() -> Result<String, String> {
    let bot_dir = get_bot_dir();
    let log_path = bot_dir.join("bot.log");
    
    if log_path.exists() {
        fs::write(&log_path, "").map_err(|e| e.to_string())?;
    }
    
    Ok("Logs gelöscht".to_string())
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
        .map_err(|_| "Bot API nicht erreichbar".to_string())?;
    
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
        .map_err(|_| "Bot API nicht erreichbar".to_string())?;
    
    if !response.status().is_success() {
        return Err("Bot nicht bereit".to_string());
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
        .map_err(|_| "Bot API nicht erreichbar".to_string())?;
    
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

fn main() {
    // Rich Presence starten
    start_rich_presence();
    
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(BotProcess(Mutex::new(None)))
        .manage(BotStartTime(Mutex::new(None)))
        .manage(RichPresenceActive(AtomicBool::new(true)))
        .invoke_handler(tauri::generate_handler![
            save_config,
            load_config,
            start_bot,
            stop_bot,
            get_bot_status,
            restart_bot,
            get_hosting_stats,
            read_logs,
            clear_logs,
            check_bot_api,
            get_bot_data,
            execute_bot_action
        ])
        .run(tauri::generate_context!())
        .expect("Fehler beim Starten der Anwendung");
}
