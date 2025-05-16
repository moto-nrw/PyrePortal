use serde::{Serialize, Deserialize};
use std::sync::Mutex;
use once_cell::sync::Lazy;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthInfo {
    pub access_token: String,
    pub refresh_token: String,
    pub user_id: i32,
    pub username: String,
}

// Global auth state - will be set when a staff member logs in
static AUTH_INFO: Lazy<Mutex<Option<AuthInfo>>> = Lazy::new(|| Mutex::new(None));

pub fn set_auth_info(auth_info: AuthInfo) {
    let mut info = AUTH_INFO.lock().unwrap();
    *info = Some(auth_info);
}

pub fn clear_auth_info() {
    let mut info = AUTH_INFO.lock().unwrap();
    *info = None;
}

pub fn get_auth_token() -> Option<String> {
    let info = AUTH_INFO.lock().unwrap();
    info.as_ref().map(|auth| auth.access_token.clone())
}

pub fn get_user_id() -> Option<i32> {
    let info = AUTH_INFO.lock().unwrap();
    info.as_ref().map(|auth| auth.user_id)
}

// For Tauri command registration
#[tauri::command]
pub fn set_user_auth(
    access_token: String, 
    refresh_token: String,
    user_id: i32,
    username: String
) {
    set_auth_info(AuthInfo {
        access_token,
        refresh_token,
        user_id,
        username,
    });
}

#[tauri::command]
pub fn clear_user_auth() {
    clear_auth_info();
}

#[tauri::command]
pub fn is_authenticated() -> bool {
    get_auth_token().is_some()
}