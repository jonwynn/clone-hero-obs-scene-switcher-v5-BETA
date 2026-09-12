"use strict";

const {
    contextBridge: context_bridge,
    ipcRenderer: ipc_renderer,
} = require("electron");

async function invoke_action(action, value) {
    const response = await ipc_renderer.invoke(action, value);
    if (!response.ok) {
        throw new Error(response.error);
    }
    return response.value;
}

context_bridge.exposeInMainWorld("switcher", {
    load_state: () => invoke_action("load-state"),
    save_connection: (value) => invoke_action("save-connection", value),
    save_profile: (value) => invoke_action("save-profile", value),
    activate_profile: (value) => invoke_action("activate-profile", value),
    delete_profile: (value) => invoke_action("delete-profile", value),
    browse_folder: () => invoke_action("browse-folder"),
    set_running: (value) => invoke_action("set-running", value),
    refresh_scenes: () => invoke_action("refresh-scenes"),
    open_logs: () => invoke_action("open-logs"),
    on_status: (callback) => {
        const listener = (event, status) => callback(status);
        ipc_renderer.on("switcher-status", listener);
        return () => ipc_renderer.removeListener("switcher-status", listener);
    },
});
