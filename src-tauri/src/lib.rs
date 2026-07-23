mod commands;
mod docker;
mod hosts;
mod known_hosts;
mod ssh;
mod ssh_config;
mod store;

use tauri::menu::{MenuBuilder, SubmenuBuilder};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // recuerda tamaño y posición de la ventana entre sesiones
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(commands::DockerState::default())
        .menu(|handle| {
            let app_menu = SubmenuBuilder::new(handle, "Narwhal")
                .about(None)
                .separator()
                .hide()
                .hide_others()
                .separator()
                .quit()
                .build()?;

            // El menú Edición es obligatorio en macOS: sin él, Cmd+C/V/X no
            // llegan al webview.
            let edit_menu = SubmenuBuilder::new(handle, "Edición")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;

            let window_menu = SubmenuBuilder::new(handle, "Ventana")
                .minimize()
                .maximize()
                .separator()
                .fullscreen()
                .build()?;

            MenuBuilder::new(handle)
                .items(&[&app_menu, &edit_menu, &window_menu])
                .build()
        })
        .invoke_handler(tauri::generate_handler![
            commands::docker_connect_local,
            commands::docker_connect_remote,
            commands::docker_list_containers,
            commands::docker_start,
            commands::docker_stop,
            commands::docker_restart,
            commands::docker_remove,
            commands::docker_logs_start,
            commands::docker_logs_stop,
            commands::docker_stats_start,
            commands::docker_stats_stop,
            commands::docker_exec_start,
            commands::docker_exec_write,
            commands::docker_exec_resize,
            commands::docker_exec_stop,
            commands::docker_compose_up,
            commands::docker_compose_action,
            commands::docker_list_images,
            commands::docker_remove_image,
            commands::docker_prune_images,
            commands::docker_list_volumes,
            commands::docker_remove_volume,
            commands::docker_prune_volumes,
            commands::docker_list_networks,
            commands::docker_remove_network,
            commands::docker_prune_networks,
            hosts::hosts_list,
            hosts::host_save,
            hosts::host_delete,
            ssh_config::read_ssh_config,
            known_hosts::list_known_hosts,
            known_hosts::forget_known_host,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
