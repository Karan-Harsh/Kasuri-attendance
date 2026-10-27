// Hides the extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;

const AUTO_BACKUP_PREFIX: &str = "kasuri-auto-backup-";

/// Writes a file the user picked in a "Save as" dialog (CSV exports, manual backups).
#[tauri::command]
fn save_text_file(path: String, contents: String) -> Result<(), String> {
    fs::write(&path, contents).map_err(|e| e.to_string())
}

/// Writes an automatic backup into `dir` and deletes the oldest ones beyond `keep`.
#[tauri::command]
fn write_backup(dir: String, name: String, contents: String, keep: usize) -> Result<String, String> {
    if !name.starts_with(AUTO_BACKUP_PREFIX) || name.contains(['/', '\\']) {
        return Err("invalid backup file name".into());
    }
    let dir = PathBuf::from(dir);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(&name);
    fs::write(&path, contents).map_err(|e| e.to_string())?;

    // File names contain the date (YYYY-MM-DD), so sorting by name sorts by age.
    let mut backups: Vec<PathBuf> = fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| entry.ok().map(|e| e.path()))
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.starts_with(AUTO_BACKUP_PREFIX) && n.ends_with(".json"))
        })
        .collect();
    backups.sort();
    if backups.len() > keep {
        for old in &backups[..backups.len() - keep] {
            let _ = fs::remove_file(old);
        }
    }
    Ok(path.to_string_lossy().into_owned())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![save_text_file, write_backup])
        .run(tauri::generate_context!())
        .expect("error while running Kasuri");
}
