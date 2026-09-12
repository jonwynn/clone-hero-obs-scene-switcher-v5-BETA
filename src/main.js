"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { randomUUID: create_uuid } = require("node:crypto");
const { pathToFileURL: build_file_url } = require("node:url");

const {
    app,
    BrowserWindow,
    dialog,
    ipcMain: ipc_main,
    safeStorage: safe_storage,
    shell,
    session,
} = require("electron");
const { OBSWebSocket } = require("obs-websocket-js");

const {
    SettingsStore,
    build_runtime_settings,
    validate_connection,
    validate_profile,
} = require("./settings");
const { SceneSwitcher } = require("./switcher");
const { create_game_probe } = require("./game-process");
const { load_song_snapshot } = require("./song-file");

class DesktopApplication {
    constructor() {
        this.window = null;
        this.store = null;
        this.switcher = null;
        this.paused = false;
        this.quitting = false;
        this.action_chain = Promise.resolve();
        this.last_log_message = "";
        this.renderer_path = path.join(__dirname, "renderer", "index.html");
        this.renderer_url = build_file_url(this.renderer_path).href;
    }

    async run() {
        app.setName("Clone Hero Scene Switcher");
        const data_directory =
            !app.isPackaged && process.env.SCENE_SWITCHER_DATA_DIRECTORY
                ? path.resolve(process.env.SCENE_SWITCHER_DATA_DIRECTORY)
                : path.join(
                      app.getPath("appData"),
                      "Clone Hero Scene Switcher",
                  );
        app.setPath("userData", data_directory);
        if (!app.requestSingleInstanceLock()) {
            app.quit();
            return;
        }
        app.on("second-instance", () => {
            if (this.window) {
                if (this.window.isMinimized()) {
                    this.window.restore();
                }
                this.window.show();
                this.window.focus();
            }
        });
        app.on("window-all-closed", () => app.quit());
        app.on("before-quit", (event) => {
            if (this.quitting || !this.switcher) {
                return;
            }
            event.preventDefault();
            this.quitting = true;
            void this.switcher.stop().finally(() => app.quit());
        });
        await app.whenReady();
        this.store = new SettingsStore(data_directory, safe_storage);
        this.store.load_settings();
        this.log_path = path.join(data_directory, "switcher.log");
        this.switcher = new SceneSwitcher({
            create_obs: () => new OBSWebSocket(),
            read_song: load_song_snapshot,
            is_game_running: create_game_probe({
                on_diagnostic: (message) => this.write_log(message),
            }),
            on_status: (status) => this.handle_status(status),
        });
        session.defaultSession.setPermissionRequestHandler(
            (contents, permission, callback) => callback(false),
        );
        session.defaultSession.setPermissionCheckHandler(() => false);
        this.create_handlers();
        this.create_window();
        await this.apply_settings();
    }

    create_window() {
        this.window = new BrowserWindow({
            width: 1100,
            height: 850,
            minWidth: 850,
            minHeight: 650,
            title: "Clone Hero Scene Switcher",
            backgroundColor: "#10151e",
            icon: path.join(__dirname, "..", "assets", "icon.ico"),
            show: false,
            autoHideMenuBar: true,
            webPreferences: {
                preload: path.join(__dirname, "preload.js"),
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true,
            },
        });
        this.window.setMenu(null);
        this.window.webContents.setWindowOpenHandler(() => ({
            action: "deny",
        }));
        this.window.webContents.on("will-navigate", (event) =>
            event.preventDefault(),
        );
        this.window.once("ready-to-show", () => this.window?.show());
        this.window.on("closed", () => {
            this.window = null;
        });
        void this.window.loadFile(this.renderer_path);
    }

    build_state() {
        return {
            settings: this.store.get_settings(),
            status: this.switcher.get_status(),
            version: app.getVersion(),
            notice: this.store.notice,
        };
    }

    create_handler(channel, handler) {
        ipc_main.handle(channel, (event, value) => {
            if (
                event.sender !== this.window?.webContents ||
                event.senderFrame !== this.window.webContents.mainFrame ||
                event.senderFrame.url !== this.renderer_url
            ) {
                return {
                    ok: false,
                    error: "This request did not come from the application window.",
                };
            }
            // Serialize settings mutations with start/stop so preset changes cannot race.
            const action = this.action_chain.then(async () => {
                if (this.quitting) {
                    throw new Error("The application is closing.");
                }
                return handler(value);
            });
            this.action_chain = action.catch(() => {});
            return action.then(
                (result) => ({ ok: true, value: result }),
                (error) => ({
                    ok: false,
                    error:
                        error.message || "The action could not be completed.",
                }),
            );
        });
    }

    create_handlers() {
        this.create_handler("load-state", () => this.build_state());
        this.create_handler("save-connection", async (value) => {
            this.store.write_settings({
                ...this.store.get_settings(),
                ...validate_connection(value),
            });
            await this.apply_settings();
            return this.build_state();
        });
        this.create_handler("save-profile", async (value) => {
            const settings = this.store.get_settings();
            if (
                value?.id &&
                !settings.profiles.some((item) => item.id === value.id)
            ) {
                throw new Error(
                    "That preset no longer exists. Create a new preset.",
                );
            }
            const profile = validate_profile({
                ...value,
                id: value?.id || create_uuid(),
            });
            const profiles = settings.profiles.filter(
                (item) => item.id !== profile.id,
            );
            profiles.push(profile);
            this.store.write_settings({
                ...settings,
                profiles,
                active_profile_id: profile.id,
            });
            await this.apply_settings();
            return this.build_state();
        });
        this.create_handler("activate-profile", async (id) => {
            this.store.write_settings({
                ...this.store.get_settings(),
                active_profile_id: id,
            });
            await this.apply_settings();
            return this.build_state();
        });
        this.create_handler("delete-profile", async (id) => {
            const settings = this.store.get_settings();
            if (!settings.profiles.some((item) => item.id === id)) {
                throw new Error("That preset no longer exists.");
            }
            const profiles = settings.profiles.filter((item) => item.id !== id);
            const active_profile_id =
                settings.active_profile_id === id
                    ? profiles[0]?.id || null
                    : settings.active_profile_id;
            this.store.write_settings({
                ...settings,
                profiles,
                active_profile_id,
            });
            await this.apply_settings();
            return this.build_state();
        });
        this.create_handler("browse-folder", async () => {
            const result = await dialog.showOpenDialog(this.window, {
                title: "Select the folder containing currentsong.txt",
                properties: ["openDirectory"],
            });
            return result.canceled ? null : result.filePaths[0];
        });
        this.create_handler("set-running", async (running) => {
            if (typeof running !== "boolean") {
                throw new Error("Choose Start or Pause.");
            }
            if (running && !build_runtime_settings(this.store.get_settings())) {
                throw new Error(
                    "Save the connection, Clone Hero folder, and a scene preset before starting.",
                );
            }
            this.paused = !running;
            await this.apply_settings();
            return this.build_state();
        });
        this.create_handler("refresh-scenes", async () => {
            await this.switcher.refresh_scenes();
            return this.build_state();
        });
        this.create_handler("open-logs", async () => {
            fs.mkdirSync(path.dirname(this.log_path), { recursive: true });
            fs.closeSync(fs.openSync(this.log_path, "a"));
            shell.showItemInFolder(this.log_path);
        });
    }

    async apply_settings() {
        const settings = build_runtime_settings(this.store.get_settings());
        if (!settings || this.paused) {
            await this.switcher.stop();
            return;
        }
        await this.switcher.start(settings);
    }

    handle_status(status) {
        if (this.window && !this.window.isDestroyed()) {
            this.window.webContents.send("switcher-status", status);
        }
        const message = `${status.obs_state} | ${status.game_state} | ${status.message}`;
        if (message !== this.last_log_message) {
            this.last_log_message = message;
            this.write_log(message);
        }
    }

    write_log(message) {
        if (!this.log_path) {
            return;
        }
        // Never write settings, passwords, or raw WebSocket errors to the log.
        try {
            if (
                fs.existsSync(this.log_path) &&
                fs.statSync(this.log_path).size > 1024 * 1024
            ) {
                fs.renameSync(this.log_path, `${this.log_path}.previous`);
            }
            fs.appendFileSync(
                this.log_path,
                `${new Date().toISOString()} ${message}\n`,
            );
        } catch {
            // A log failure must not stop a live scene switch.
        }
    }
}

const desktop_application = new DesktopApplication();
void desktop_application.run().catch(() => {
    dialog.showErrorBox(
        "Clone Hero Scene Switcher",
        "The application could not start. Check that your Windows application data folder is writable, then try again.",
    );
    app.quit();
});
