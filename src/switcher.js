"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

class SceneSwitcher {
    constructor({
        create_obs,
        read_song = (folder) =>
            fs.readFile(path.join(folder, "currentsong.txt"), "utf8"),
        is_game_running = async () => null,
        on_status = () => {},
        poll_interval_ms = 250,
        retry_interval_ms = 3000,
        operation_timeout_ms = 5000,
        scene_refresh_interval_ms = 5000,
    } = {}) {
        this.create_obs =
            create_obs ||
            (() => {
                const { OBSWebSocket } = require("obs-websocket-js");
                return new OBSWebSocket();
            });
        this.read_song = read_song;
        this.is_game_running = is_game_running;
        this.on_status = on_status;
        this.poll_interval_ms = poll_interval_ms;
        this.retry_interval_ms = retry_interval_ms;
        this.operation_timeout_ms = operation_timeout_ms;
        this.scene_refresh_interval_ms = scene_refresh_interval_ms;
        this.generation = 0;
        this.session = null;
        this.last_session = null;
        this.lifecycle = Promise.resolve();
        this.status = {
            running: false,
            obs_state: "stopped",
            game_state: "waiting",
            message: "Scene switching is stopped.",
            scene_names: [],
            current_scene: "",
        };
    }

    get_status() {
        return { ...this.status, scene_names: [...this.status.scene_names] };
    }

    async refresh_scenes() {
        const session = this.session;
        if (!this.is_current(session)) {
            return this.get_status();
        }
        // Complete an existing poll before requesting another scene-list read.
        await session.poll_promise;
        if (this.is_current(session)) {
            session.next_scene_refresh_at = 0;
            session.next_connect_at = 0;
            await this.process_update(session);
        }
        return this.get_status();
    }

    async start(settings) {
        const generation = ++this.generation;
        const previous_session = this.invalidate_session() || this.last_session;
        this.lifecycle = this.lifecycle.then(async () => {
            await this.disconnect_obs(previous_session?.obs);
            if (generation !== this.generation) {
                return;
            }

            this.session = {
                generation,
                settings: { ...settings },
                active: true,
                timer: null,
                poll_promise: null,
                obs: null,
                connected: false,
                obs_state: "connecting",
                connection_message: "Connecting to OBS...",
                next_connect_at: 0,
                next_scene_refresh_at: 0,
                next_switch_at: 0,
                scene_names: [],
                scene_message: "Reading OBS scenes...",
                scenes_valid: false,
                current_scene: "",
                game_state: "waiting",
                game_message: "Checking Clone Hero...",
                desired_state: null,
                applied_state: null,
                last_song_fingerprint:
                    previous_session?.settings.clone_hero_folder ===
                    settings.clone_hero_folder
                        ? previous_session.last_song_fingerprint
                        : undefined,
                stopped_song_fingerprint:
                    previous_session?.settings.clone_hero_folder ===
                    settings.clone_hero_folder
                        ? previous_session.stopped_song_fingerprint
                        : undefined,
                waiting_for_fresh_song:
                    previous_session?.settings.clone_hero_folder ===
                    settings.clone_hero_folder
                        ? previous_session.waiting_for_fresh_song
                        : false,
                game_stopped:
                    previous_session?.settings.clone_hero_folder ===
                    settings.clone_hero_folder
                        ? previous_session.game_stopped
                        : false,
                switch_message: "",
            };
            this.apply_status(this.session);
            // Polling owns its own errors and remains active until explicitly stopped.
            await this.process_update(this.session);
        });
        await this.lifecycle;
        return this.get_status();
    }

    async stop() {
        const generation = ++this.generation;
        const previous_session = this.invalidate_session();
        this.publish_status({
            ...this.status,
            running: false,
            obs_state: "stopped",
            game_state: "waiting",
            message: "Scene switching is stopped.",
        });
        this.lifecycle = this.lifecycle.then(async () => {
            await this.disconnect_obs(previous_session?.obs);
            if (generation === this.generation) {
                this.session = null;
            }
        });
        await this.lifecycle;
        return this.get_status();
    }

    invalidate_session() {
        const session = this.session;
        if (session) {
            session.active = false;
            clearTimeout(session.timer);
            this.last_session = session;
        }
        this.session = null;
        return session;
    }

    is_current(session, obs = session?.obs) {
        return Boolean(
            session?.active &&
            this.session === session &&
            session.generation === this.generation &&
            session.obs === obs,
        );
    }

    async run_operation(action) {
        let timer;
        try {
            return await Promise.race([
                Promise.resolve().then(action),
                new Promise((resolve, reject) => {
                    timer = setTimeout(() => {
                        const error = new Error("The operation timed out.");
                        error.code = "ETIMEDOUT";
                        reject(error);
                    }, this.operation_timeout_ms);
                }),
            ]);
        } finally {
            clearTimeout(timer);
        }
    }

    async disconnect_obs(obs) {
        if (!obs) {
            return;
        }
        try {
            await this.run_operation(() => obs.disconnect());
        } catch {
            // A closed or unresponsive OBS socket must not prevent restarting.
        }
    }

    publish_status(status) {
        if (JSON.stringify(status) === JSON.stringify(this.status)) {
            return;
        }
        this.status = status;
        try {
            this.on_status(this.get_status());
        } catch {
            // UI delivery failures must not stop the polling worker.
        }
    }

    apply_status(session) {
        if (!this.is_current(session)) {
            return;
        }
        let message = session.game_message;
        if (!session.connected) {
            message = session.connection_message;
        } else if (!session.scenes_valid) {
            message = session.scene_message;
        } else if (session.switch_message) {
            message = session.switch_message;
        }
        this.publish_status({
            running: true,
            obs_state: session.obs_state,
            game_state: session.game_state,
            message,
            scene_names: [...session.scene_names],
            current_scene: session.current_scene,
        });
    }

    async process_update(session = this.session) {
        if (!this.is_current(session)) {
            return;
        }
        if (session.poll_promise) {
            return session.poll_promise;
        }
        clearTimeout(session.timer);
        session.poll_promise = this.run_update(session)
            .catch(() => {
                if (this.is_current(session)) {
                    session.game_state = "error";
                    session.game_message =
                        "Unable to check Clone Hero. Retrying automatically.";
                }
            })
            .finally(() => {
                session.poll_promise = null;
                if (this.is_current(session)) {
                    this.apply_status(session);
                    session.timer = setTimeout(() => {
                        void this.process_update(session);
                    }, this.poll_interval_ms);
                    session.timer.unref?.();
                }
            });
        return session.poll_promise;
    }

    async run_update(session) {
        await this.process_game(session);
        if (!this.is_current(session)) {
            return;
        }
        if (session.desired_state === session.applied_state) {
            session.switch_message = "";
        }
        if (!session.connected && Date.now() >= session.next_connect_at) {
            await this.connect_obs(session);
        }
        if (!this.is_current(session) || !session.connected) {
            return;
        }
        if (Date.now() >= session.next_scene_refresh_at) {
            await this.load_scenes(session);
        }
        if (
            this.is_current(session) &&
            session.connected &&
            session.scenes_valid &&
            session.desired_state !== null &&
            session.desired_state !== session.applied_state &&
            Date.now() >= session.next_switch_at
        ) {
            await this.apply_scene(session);
        }
    }

    async process_game(session) {
        const [process_result, song_result] = await Promise.allSettled([
            this.run_operation(() => this.is_game_running()),
            this.run_operation(() =>
                this.read_song(session.settings.clone_hero_folder),
            ),
        ]);
        if (!this.is_current(session)) {
            return;
        }
        const game_running =
            process_result.status === "fulfilled" ? process_result.value : null;
        const song_export =
            song_result.status === "fulfilled" ? song_result.value : undefined;
        const has_metadata =
            song_export !== null && typeof song_export === "object";
        const song_text =
            song_export === undefined
                ? undefined
                : String(has_metadata ? song_export.text : song_export).trim();
        const song_fingerprint =
            song_text === undefined
                ? undefined
                : JSON.stringify([
                      song_text,
                      has_metadata ? (song_export.version ?? null) : null,
                  ]);

        if (game_running === false) {
            session.waiting_for_fresh_song = true;
            if (
                !session.game_stopped ||
                session.stopped_song_fingerprint === undefined
            ) {
                session.stopped_song_fingerprint =
                    song_fingerprint ?? session.last_song_fingerprint;
            }
            session.game_stopped = true;
            session.last_song_fingerprint =
                song_fingerprint ?? session.last_song_fingerprint;
            session.desired_state = "menu";
            session.game_state = "stopped";
            session.game_message =
                "Clone Hero is closed. Waiting for it to start.";
            return;
        }
        if (game_running === true) {
            session.game_stopped = false;
        }
        if (song_result.status === "rejected") {
            const missing_file = song_result.reason?.code === "ENOENT";
            session.game_state = missing_file ? "waiting" : "error";
            session.game_message = missing_file
                ? "Waiting for currentsong.txt. Enable Export Current Song in Clone Hero and check the selected folder."
                : "Unable to read currentsong.txt. Check the folder and file permissions; retrying automatically.";
            // Leave OBS alone until another reliable read, including after reconnecting.
            session.desired_state = null;
            session.switch_message = "";
            return;
        }

        session.last_song_fingerprint = song_fingerprint;
        if (session.waiting_for_fresh_song) {
            if (session.stopped_song_fingerprint === undefined) {
                session.stopped_song_fingerprint = song_fingerprint;
            }
            if (
                song_text &&
                song_fingerprint === session.stopped_song_fingerprint
            ) {
                session.desired_state = "menu";
                session.game_state = "waiting";
                session.game_message =
                    "Waiting for Clone Hero to update currentsong.txt after restarting.";
                return;
            }
            session.waiting_for_fresh_song = false;
        }

        session.desired_state = song_text ? "gameplay" : "menu";
        session.game_state = session.desired_state;
        session.game_message = song_text
            ? "Song detected. Watching for the end of the song."
            : "No active song. Watching for the next song.";
        if (game_running === null) {
            session.game_message +=
                " Process detection is unavailable; using currentsong.txt.";
        }
    }

    handle_disconnect(session, obs, details = "OBS disconnected.") {
        if (!this.is_current(session, obs)) {
            return;
        }
        session.obs = null;
        session.connected = false;
        session.obs_state = "disconnected";
        session.connection_message = `${details} Retrying automatically. Check that OBS and its WebSocket server are running and the connection settings match.`;
        session.next_connect_at = Date.now() + this.retry_interval_ms;
        session.applied_state = null;
        session.scenes_valid = false;
        session.switch_message = "";
        this.apply_status(session);
        void this.disconnect_obs(obs);
    }

    async connect_obs(session) {
        let obs;
        try {
            obs = this.create_obs();
            session.obs = obs;
            session.obs_state = "connecting";
            session.connection_message = "Connecting to OBS...";
            this.apply_status(session);
            obs.on("ConnectionClosed", (error) =>
                this.handle_disconnect(
                    session,
                    obs,
                    error?.code === 4009
                        ? "OBS rejected the password. Update the OBS password in Connection Settings."
                        : "OBS disconnected.",
                ),
            );
            obs.on("ConnectionError", () =>
                this.handle_disconnect(session, obs, "OBS connection failed."),
            );
            obs.on("error", () =>
                this.handle_disconnect(session, obs, "OBS connection failed."),
            );
            for (const event_name of [
                "SceneListChanged",
                "SceneNameChanged",
                "CurrentSceneCollectionChanged",
            ]) {
                obs.on(event_name, () => {
                    if (this.is_current(session, obs)) {
                        session.next_scene_refresh_at = 0;
                    }
                });
            }
            obs.on("CurrentProgramSceneChanged", (event) => {
                if (this.is_current(session, obs)) {
                    session.current_scene = event.sceneName || "";
                    this.apply_status(session);
                }
            });
            await this.run_operation(async () => {
                const result = await obs.connect(
                    session.settings.obs_address,
                    session.settings.obs_password,
                );
                if (!this.is_current(session, obs)) {
                    await this.disconnect_obs(obs);
                }
                return result;
            });
            if (!this.is_current(session, obs)) {
                return;
            }
            session.connected = true;
            session.obs_state = "connected";
            session.connection_message = "";
            session.next_scene_refresh_at = 0;
            session.next_switch_at = 0;
            session.applied_state = null;
        } catch (error) {
            if (obs) {
                const details =
                    error?.code === 4009
                        ? "OBS rejected the password. Update the OBS password in Connection Settings."
                        : "Could not connect to OBS.";
                this.handle_disconnect(session, obs, details);
            } else if (this.is_current(session)) {
                session.obs_state = "disconnected";
                session.connection_message =
                    "Could not create the OBS connection. Retrying automatically.";
                session.next_connect_at = Date.now() + this.retry_interval_ms;
            }
        }
    }

    async load_scenes(session) {
        const obs = session.obs;
        try {
            const result = await this.run_operation(() =>
                obs.call("GetSceneList"),
            );
            if (!this.is_current(session, obs)) {
                return;
            }
            session.scene_names = result.scenes.map((scene) => scene.sceneName);
            session.current_scene =
                result.currentProgramSceneName || session.current_scene;
            const missing_scenes = [
                session.settings.scene_menu,
                session.settings.scene_gameplay,
            ].filter((scene_name) => !session.scene_names.includes(scene_name));
            session.scenes_valid = missing_scenes.length === 0;
            session.scene_message = session.scenes_valid
                ? ""
                : `OBS scene not found: ${missing_scenes.map((name) => `"${name}"`).join(", ")}. Select an existing scene or update the preset; names must match exactly.`;
            if (!session.scenes_valid) {
                session.applied_state = null;
            }
            session.next_scene_refresh_at =
                Date.now() + this.scene_refresh_interval_ms;
        } catch {
            this.handle_disconnect(session, obs, "Unable to read OBS scenes.");
        }
    }

    async apply_scene(session) {
        const obs = session.obs;
        const desired_state = session.desired_state;
        const target_scene =
            desired_state === "gameplay"
                ? session.settings.scene_gameplay
                : session.settings.scene_menu;
        try {
            const result = await this.run_operation(() =>
                obs.call("GetCurrentProgramScene"),
            );
            if (!this.is_current(session, obs)) {
                return;
            }
            session.current_scene = result.currentProgramSceneName;
            if (session.current_scene !== target_scene) {
                await this.run_operation(() => {
                    if (this.is_current(session, obs)) {
                        return obs.call("SetCurrentProgramScene", {
                            sceneName: target_scene,
                        });
                    }
                });
            }
            if (!this.is_current(session, obs)) {
                return;
            }
            session.applied_state = desired_state;
            session.current_scene = target_scene;
            session.switch_message = "";
        } catch (error) {
            if (!this.is_current(session, obs)) {
                return;
            }
            if (error.code === "ETIMEDOUT") {
                this.handle_disconnect(
                    session,
                    obs,
                    "OBS did not respond to the scene change.",
                );
                return;
            }
            session.switch_message = `Unable to switch to "${target_scene}". Check that the scene is available; retrying automatically.`;
            session.next_switch_at = Date.now() + this.retry_interval_ms;
            session.next_scene_refresh_at = 0;
        }
    }
}

module.exports = { SceneSwitcher };
