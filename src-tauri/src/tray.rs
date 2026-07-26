use serde::Deserialize;
use tauri::menu::{
    IconMenuItem, IconMenuItemBuilder, Menu, MenuBuilder, MenuItemBuilder, NativeIcon,
    PredefinedMenuItem, Submenu,
};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, Wry};

const TRAY_ID: &str = "narwhal-tray";

/// Resumen mínimo que el frontend empuja tras cada refresh.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayContainer {
    pub id: String,
    pub name: String,
    pub state: String,
    pub compose_project: Option<String>,
    /// nombre del servicio compose, más corto que el del contenedor
    #[serde(default)]
    pub service: Option<String>,
    pub unhealthy: bool,
}

/// Ítem con icono nativo de macOS (en otras plataformas queda sin icono).
fn action(
    app: &AppHandle,
    id: String,
    text: &str,
    icon: NativeIcon,
) -> tauri::Result<IconMenuItem<Wry>> {
    IconMenuItemBuilder::with_id(id, text)
        .native_icon(icon)
        .build(app)
}

/// Punto de estado nativo de macOS, como los de OrbStack.
fn status_icon(c: &TrayContainer) -> NativeIcon {
    if c.unhealthy {
        NativeIcon::StatusPartiallyAvailable
    } else if c.state == "running" {
        NativeIcon::StatusAvailable
    } else {
        NativeIcon::StatusNone
    }
}

fn container_submenu(app: &AppHandle, c: &TrayContainer) -> tauri::Result<Submenu<Wry>> {
    let running = c.state == "running";
    // dentro de un proyecto basta el nombre del servicio, como OrbStack
    let label = c.service.as_deref().unwrap_or(&c.name);
    let sub = Submenu::with_id_and_native_icon(
        app,
        format!("csub:{}", c.id),
        label,
        true,
        Some(status_icon(c)),
    )?;

    sub.append(&action(
        app,
        format!("sel:{}", c.id),
        "Ver en Narwhal",
        NativeIcon::RevealFreestanding,
    )?)?;
    sub.append(&PredefinedMenuItem::separator(app)?)?;
    if running {
        sub.append(&action(
            app,
            format!("exec:{}", c.id),
            "Consola",
            NativeIcon::FollowLinkFreestanding,
        )?)?;
        sub.append(&action(
            app,
            format!("logs:{}", c.id),
            "Logs",
            NativeIcon::ListView,
        )?)?;
        sub.append(&PredefinedMenuItem::separator(app)?)?;
        sub.append(&action(
            app,
            format!("act:stop:{}", c.id),
            "Detener",
            NativeIcon::StopProgressFreestanding,
        )?)?;
        sub.append(&action(
            app,
            format!("act:restart:{}", c.id),
            "Reiniciar",
            NativeIcon::RefreshFreestanding,
        )?)?;
    } else {
        sub.append(&action(
            app,
            format!("act:start:{}", c.id),
            "Iniciar",
            NativeIcon::RightFacingTriangle,
        )?)?;
    }
    Ok(sub)
}

fn build_menu(app: &AppHandle, containers: &[TrayContainer]) -> tauri::Result<Menu<Wry>> {
    let mut menu = MenuBuilder::new(app)
        .item(&MenuItemBuilder::with_id("open", "Abrir Narwhal").build(app)?)
        .separator();

    if !containers.is_empty() {
        menu = menu.item(
            &MenuItemBuilder::new("Contenedores")
                .enabled(false)
                .build(app)?,
        );

        // agrupados por proyecto compose, sueltos al final
        let mut projects: Vec<String> = containers
            .iter()
            .filter_map(|c| c.compose_project.clone())
            .collect();
        projects.sort();
        projects.dedup();

        for project in &projects {
            let items: Vec<&TrayContainer> = containers
                .iter()
                .filter(|c| c.compose_project.as_deref() == Some(project))
                .collect();
            let running = items.iter().filter(|c| c.state == "running").count();
            let sub = Submenu::with_id_and_native_icon(
                app,
                format!("psub:{project}"),
                format!("{project} · {running}/{}", items.len()),
                true,
                Some(NativeIcon::MultipleDocuments),
            )?;
            // acciones del proyecto arriba, como OrbStack
            sub.append(&action(
                app,
                format!("prj:stop:{project}"),
                "Detener todo",
                NativeIcon::StopProgressFreestanding,
            )?)?;
            sub.append(&action(
                app,
                format!("prj:restart:{project}"),
                "Reiniciar",
                NativeIcon::RefreshFreestanding,
            )?)?;
            sub.append(&PredefinedMenuItem::separator(app)?)?;
            sub.append(&action(
                app,
                format!("prj:down:{project}"),
                "Down — detener y eliminar",
                NativeIcon::TrashFull,
            )?)?;
            sub.append(&PredefinedMenuItem::separator(app)?)?;
            sub.append(&MenuItemBuilder::new("Servicios").enabled(false).build(app)?)?;
            for c in items {
                sub.append(&container_submenu(app, c)?)?;
            }
            menu = menu.item(&sub);
        }

        for c in containers.iter().filter(|c| c.compose_project.is_none()) {
            menu = menu.item(&container_submenu(app, c)?);
        }
        menu = menu.separator();
    }

    menu.item(
        &MenuItemBuilder::with_id("quit", "Salir de Narwhal")
            .accelerator("Cmd+Q")
            .build(app)?,
    )
    .build()
}

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn on_menu_item(app: &AppHandle, id: &str) {
    match id {
        "open" => show_main(app),
        "quit" => app.exit(0),
        _ => {
            if let Some(container_id) = id.strip_prefix("sel:") {
                show_main(app);
                let _ = app.emit("tray-select", container_id.to_string());
            } else if let Some(container_id) = id.strip_prefix("exec:") {
                show_main(app);
                let _ = app.emit("tray-exec", container_id.to_string());
            } else if let Some(container_id) = id.strip_prefix("logs:") {
                show_main(app);
                let _ = app.emit("tray-logs", container_id.to_string());
            } else if let Some(rest) = id.strip_prefix("prj:") {
                if let Some((action, project)) = rest.split_once(':') {
                    if matches!(action, "stop" | "restart" | "down") {
                        let app = app.clone();
                        let action = action.to_string();
                        let project = project.to_string();
                        tauri::async_runtime::spawn(async move {
                            let state = app.state::<crate::commands::DockerState>();
                            let Ok(host) = crate::commands::host(&state).await else {
                                return;
                            };
                            let result = host
                                .compose_action(&project, &action, Box::new(|_| {}))
                                .await;
                            if let Err(message) = result {
                                let _ = app.emit("tray-error", message);
                            }
                        });
                    }
                }
            } else if let Some(rest) = id.strip_prefix("act:") {
                if let Some((action, container_id)) = rest.split_once(':') {
                    let app = app.clone();
                    let action = action.to_string();
                    let container_id = container_id.to_string();
                    tauri::async_runtime::spawn(async move {
                        let state = app.state::<crate::commands::DockerState>();
                        let Ok(host) = crate::commands::host(&state).await else {
                            return;
                        };
                        let result = match action.as_str() {
                            "stop" => host.stop(&container_id).await,
                            "start" => host.start(&container_id).await,
                            "restart" => host.restart(&container_id).await,
                            _ => Ok(()),
                        };
                        // un fallo desde el tray no puede morir en silencio:
                        // la ventana lo muestra como toast
                        if let Err(message) = result {
                            let _ = app.emit("tray-error", message);
                        }
                    });
                }
            }
        }
    }
}

pub fn init(app: &AppHandle) -> tauri::Result<()> {
    let menu = build_menu(app, &[])?;
    // template: solo silueta + alfa; macOS la tiñe según barra clara u oscura
    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray-template.png"))?;
    TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .icon(icon)
        .icon_as_template(true)
        .on_menu_event(|app, event| on_menu_item(app, event.id().as_ref()))
        .build(app)?;
    Ok(())
}

/// Notifica SOLO transiciones: corriendo→parado y sano→unhealthy. Nada de
/// avisar por contenedores nuevos ni por el estado inicial al arrancar.
fn notify_changes(
    app: &AppHandle,
    containers: &[TrayContainer],
    notify_stopped: bool,
    notify_unhealthy: bool,
) {
    use tauri_plugin_notification::NotificationExt;

    let state = app.state::<crate::commands::DockerState>();
    let mut prev = state.tray_prev.lock().unwrap();

    for c in containers {
        if let Some((old_state, old_unhealthy)) = prev.get(&c.id) {
            if notify_stopped && old_state == "running" && c.state != "running" {
                let _ = app
                    .notification()
                    .builder()
                    .title("Contenedor detenido")
                    .body(format!("{} ha dejado de ejecutarse", c.name))
                    .show();
            }
            if notify_unhealthy && !old_unhealthy && c.unhealthy {
                let _ = app
                    .notification()
                    .builder()
                    .title("Healthcheck fallando")
                    .body(format!("{} está unhealthy", c.name))
                    .show();
            }
        }
    }

    *prev = containers
        .iter()
        .map(|c| (c.id.clone(), (c.state.clone(), c.unhealthy)))
        .collect();
}

/// El frontend empuja la lista tras cada cambio; el menú se reconstruye.
#[tauri::command]
pub fn tray_update(
    app: AppHandle,
    containers: Vec<TrayContainer>,
    notify_stopped: bool,
    notify_unhealthy: bool,
) -> Result<(), String> {
    notify_changes(&app, &containers, notify_stopped, notify_unhealthy);
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return Ok(());
    };
    let menu = build_menu(&app, &containers).map_err(|e| e.to_string())?;
    tray.set_menu(Some(menu)).map_err(|e| e.to_string())
}
