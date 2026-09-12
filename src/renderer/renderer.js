"use strict";

let app_settings = null;
let app_status = null;
let selected_profile_id = null;
let profile_baseline = "";
let connection_baseline = "";
let request_pending = false;
let previous_scene_names = "";

function load_element(element_id) {
    return document.getElementById(element_id);
}

function build_profile_values() {
    return {
        name: load_element("profile_name").value,
        scene_menu: load_element("scene_menu").value,
        scene_gameplay: load_element("scene_gameplay").value,
    };
}

function build_connection_values() {
    return {
        obs_address: load_element("obs_address").value,
        obs_password: load_element("obs_password").value,
        clone_hero_folder: load_element("clone_hero_folder").value,
    };
}

function validate_profile_dirty() {
    return JSON.stringify(build_profile_values()) !== profile_baseline;
}

function validate_connection_dirty() {
    return JSON.stringify(build_connection_values()) !== connection_baseline;
}

function apply_feedback(message, tone = "success") {
    const feedback = load_element("feedback");
    feedback.textContent = message;
    feedback.dataset.tone = tone;
    feedback.hidden = !message;
    feedback.setAttribute("role", tone === "error" ? "alert" : "status");
}

function apply_controls() {
    const unavailable = !app_settings || request_pending;
    for (const control of document.querySelectorAll(
        "main input, main select, main button, .app-header button, .app-footer button",
    )) {
        control.disabled = unavailable;
    }
    if (unavailable) {
        return;
    }

    load_element("activate_profile").disabled =
        !selected_profile_id ||
        selected_profile_id === app_settings.active_profile_id;
    load_element("delete_profile").disabled = !selected_profile_id;
    load_element("refresh_scenes").disabled =
        app_status?.obs_state !== "connected";
    load_element("profile_dirty").hidden = !validate_profile_dirty();
    load_element("connection_dirty").hidden = !validate_connection_dirty();
}

function apply_profile_options() {
    const profile_select = load_element("profile_select");
    profile_select.replaceChildren();
    if (!selected_profile_id) {
        const new_option = document.createElement("option");
        new_option.value = "";
        new_option.textContent = "New preset (unsaved)";
        profile_select.append(new_option);
    }
    for (const profile of app_settings.profiles) {
        const profile_option = document.createElement("option");
        profile_option.value = profile.id;
        profile_option.textContent =
            profile.name +
            (profile.id === app_settings.active_profile_id ? " · Active" : "");
        profile_select.append(profile_option);
    }
    profile_select.value = selected_profile_id || "";

    const active_profile = app_settings.profiles.find(
        (profile) => profile.id === app_settings.active_profile_id,
    );
    load_element("active_profile_label").textContent = active_profile
        ? `Active preset: ${active_profile.name}`
        : "No active preset";
}

function apply_profile_form(profile_id) {
    const profile = app_settings.profiles.find(
        (saved_profile) => saved_profile.id === profile_id,
    );
    selected_profile_id = profile?.id || null;
    load_element("profile_name").value = profile?.name || "";
    load_element("scene_menu").value = profile?.scene_menu || "";
    load_element("scene_gameplay").value = profile?.scene_gameplay || "";
    profile_baseline = JSON.stringify(build_profile_values());
    apply_profile_options();
    apply_controls();
}

function apply_connection_form() {
    load_element("obs_address").value =
        app_settings.obs_address || "ws://127.0.0.1:4455";
    load_element("obs_password").value = app_settings.obs_password || "";
    load_element("clone_hero_folder").value =
        app_settings.clone_hero_folder || "";
    connection_baseline = JSON.stringify(build_connection_values());
}

function build_status_label(value) {
    const labels = {
        connected: "Connected",
        connecting: "Connecting…",
        disconnected: "Waiting for OBS",
        reconnecting: "Reconnecting…",
        error: "Needs attention",
        waiting: "Waiting for game",
        missing: "Waiting for game",
        unavailable: "Waiting for game",
        gameplay: "In a song",
        playing: "In a song",
        menu: "In menus",
        idle: "In menus",
        paused: "Paused",
        stopped: "Paused",
        unconfigured: "Setup needed",
        not_configured: "Setup needed",
    };
    return (
        labels[value] ||
        String(value || "Waiting")
            .replaceAll("_", " ")
            .replace(/^./, (letter) => letter.toUpperCase())
    );
}

function apply_status(status) {
    if (!status) {
        return;
    }
    app_status = status;
    load_element("running_status").textContent = status.running
        ? "Running"
        : "Paused";
    load_element("running_dot").dataset.tone = status.running
        ? "positive"
        : "neutral";
    load_element("obs_status").textContent =
        status.running && status.obs_state === "stopped"
            ? "Waiting for OBS"
            : build_status_label(status.obs_state);
    load_element("obs_dot").dataset.tone =
        status.obs_state === "connected"
            ? "positive"
            : status.obs_state === "error"
              ? "error"
              : "waiting";
    load_element("game_status").textContent =
        status.running && status.game_state === "stopped"
            ? "Waiting for game"
            : build_status_label(status.game_state);
    load_element("game_dot").dataset.tone = [
        "playing",
        "gameplay",
        "menu",
        "idle",
    ].includes(status.game_state)
        ? "positive"
        : status.game_state === "error"
          ? "error"
          : "waiting";
    if (load_element("status_message").textContent !== status.message) {
        load_element("status_message").textContent =
            status.message ||
            "Save your connection and scene preset to get started.";
    }
    load_element("current_scene").textContent = status.current_scene || "—";
    load_element("toggle_running").textContent = status.running
        ? "Pause switching"
        : "Start switching";
    load_element("toggle_running").classList.toggle(
        "is-running",
        Boolean(status.running),
    );
    load_element("refresh_scenes").disabled =
        request_pending || status.obs_state !== "connected";

    const scene_names = status.scene_names || [];
    const scene_names_json = JSON.stringify(scene_names);
    if (scene_names_json !== previous_scene_names) {
        const scene_options = scene_names.map((scene_name) => {
            const scene_option = document.createElement("option");
            scene_option.value = scene_name;
            return scene_option;
        });
        load_element("scene_names").replaceChildren(...scene_options);
        previous_scene_names = scene_names_json;
    }
}

function apply_state(state, options = {}) {
    app_settings = state.settings;
    if (options.reset_connection) {
        apply_connection_form();
    }
    if (options.reset_profile) {
        apply_profile_form(app_settings.active_profile_id);
    } else {
        apply_profile_options();
    }
    apply_status(state.status);
    load_element("app_version").textContent = state.version
        ? `v${state.version}`
        : "";
    load_element("notice").textContent = state.notice || "";
    load_element("notice").hidden = !state.notice;
    apply_controls();
}

async function run_request(action, success_message, options = {}) {
    if (request_pending) {
        return;
    }
    request_pending = true;
    apply_controls();
    apply_feedback("");
    try {
        const state = await action();
        if (state?.settings) {
            apply_state(state, options);
        }
        if (success_message) {
            apply_feedback(success_message);
        }
    } catch (error) {
        apply_feedback(
            error?.message ||
                "The action could not be completed. Please try again.",
            "error",
        );
    } finally {
        request_pending = false;
        apply_controls();
    }
}

function run_confirmation(
    title,
    message,
    accept_label,
    cancel_label = "Keep editing",
) {
    const confirmation_dialog = load_element("confirmation_dialog");
    load_element("confirmation_title").textContent = title;
    load_element("confirmation_message").textContent = message;
    load_element("accept_confirmation").textContent = accept_label;
    load_element("cancel_confirmation").textContent = cancel_label;
    confirmation_dialog.returnValue = "cancel";
    return new Promise((resolve) => {
        confirmation_dialog.addEventListener(
            "close",
            () => {
                resolve(confirmation_dialog.returnValue === "confirm");
            },
            { once: true },
        );
        confirmation_dialog.showModal();
    });
}

async function validate_discard_profile() {
    if (!validate_profile_dirty()) {
        return true;
    }
    return run_confirmation(
        "Discard unsaved preset changes?",
        "Your changes to this preset have not been saved. Discard them to continue, or keep editing and save your preset first.",
        "Discard changes",
    );
}

async function handle_profile_selection() {
    const next_profile_id = load_element("profile_select").value;
    if (!(await validate_discard_profile())) {
        load_element("profile_select").value = selected_profile_id || "";
        return;
    }
    apply_profile_form(next_profile_id);
    apply_feedback("");
}

async function handle_new_profile() {
    if (!(await validate_discard_profile())) {
        return;
    }
    apply_profile_form(null);
    apply_feedback("");
    load_element("profile_name").focus();
}

async function handle_activate_profile() {
    if (!selected_profile_id || !(await validate_discard_profile())) {
        return;
    }
    await run_request(
        () => window.switcher.activate_profile(selected_profile_id),
        "Preset activated. Switching will use this scene pair.",
        { reset_profile: true },
    );
}

async function handle_save_profile(event) {
    event.preventDefault();
    const profile = build_profile_values();
    if (selected_profile_id) {
        profile.id = selected_profile_id;
    }
    await run_request(
        () => window.switcher.save_profile(profile),
        "Preset saved and activated.",
        { reset_profile: true },
    );
}

async function handle_delete_profile() {
    const profile = app_settings.profiles.find(
        (saved_profile) => saved_profile.id === selected_profile_id,
    );
    if (!profile) {
        return;
    }
    const unsaved_message = validate_profile_dirty()
        ? " Unsaved changes to this preset will also be discarded."
        : "";
    const active_message =
        profile.id === app_settings.active_profile_id
            ? app_settings.profiles.length > 1
                ? " Another saved preset will become active."
                : " Switching will pause until you save a new preset."
            : "";
    if (
        !(await run_confirmation(
            "Delete preset?",
            `Delete “${profile.name}”?${active_message}${unsaved_message} This cannot be undone.`,
            "Delete preset",
            "Cancel",
        ))
    ) {
        return;
    }
    await run_request(
        () => window.switcher.delete_profile(profile.id),
        "Preset deleted.",
        { reset_profile: true },
    );
}

async function handle_save_connection(event) {
    event.preventDefault();
    await run_request(
        () => window.switcher.save_connection(build_connection_values()),
        "Connection settings saved.",
        { reset_connection: true },
    );
}

async function handle_browse_folder() {
    await run_request(async () => {
        const folder_path = await window.switcher.browse_folder();
        if (folder_path) {
            load_element("clone_hero_folder").value = folder_path;
        }
    });
}

function handle_toggle_password() {
    const password_input = load_element("obs_password");
    const show_password = password_input.type === "password";
    password_input.type = show_password ? "text" : "password";
    load_element("toggle_password").textContent = show_password
        ? "Hide"
        : "Show";
    load_element("toggle_password").setAttribute(
        "aria-label",
        `${show_password ? "Hide" : "Show"} WebSocket password`,
    );
    load_element("toggle_password").setAttribute(
        "aria-pressed",
        String(show_password),
    );
}

async function load_application() {
    load_element("profile_form").addEventListener(
        "submit",
        handle_save_profile,
    );
    load_element("connection_form").addEventListener(
        "submit",
        handle_save_connection,
    );
    load_element("profile_select").addEventListener(
        "change",
        handle_profile_selection,
    );
    load_element("new_profile").addEventListener("click", handle_new_profile);
    load_element("activate_profile").addEventListener(
        "click",
        handle_activate_profile,
    );
    load_element("delete_profile").addEventListener(
        "click",
        handle_delete_profile,
    );
    load_element("browse_folder").addEventListener(
        "click",
        handle_browse_folder,
    );
    load_element("toggle_password").addEventListener(
        "click",
        handle_toggle_password,
    );
    load_element("profile_form").addEventListener("input", apply_controls);
    load_element("connection_form").addEventListener("input", apply_controls);
    load_element("toggle_running").addEventListener("click", () =>
        run_request(() => window.switcher.set_running(!app_status?.running)),
    );
    load_element("refresh_scenes").addEventListener("click", () =>
        run_request(() => window.switcher.refresh_scenes()),
    );
    load_element("open_logs").addEventListener("click", () =>
        run_request(() => window.switcher.open_logs()),
    );
    window.switcher.on_status(apply_status);
    await run_request(() => window.switcher.load_state(), "", {
        reset_profile: true,
        reset_connection: true,
    });
}

load_application();
