"use strict";

const assert = require("node:assert/strict");
const { createHash: create_hash } = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { setTimeout: wait_for } = require("node:timers/promises");
const test = require("node:test");

const { encode, decode } = require("@msgpack/msgpack");
const { WebSocketServer } = require("ws");

const { SceneSwitcher } = require("../src/switcher");

class ObsTestServer {
    constructor() {
        this.server = null;
        this.port = 0;
        this.password = "local-test-password";
        this.current_scene = "Starting soon";
        this.scene_names = [
            "Menus",
            "Gameplay",
            "Lobby",
            "Band",
            "Starting soon",
        ];
        this.scene_changes = [];
        this.authentication_attempts = 0;
    }

    async start() {
        this.server = new WebSocketServer({
            port: this.port,
            host: "127.0.0.1",
        });
        this.server.on("connection", (socket) => {
            let identified = false;
            const salt = "test-salt";
            const challenge = "test-challenge";
            socket.send(
                encode({
                    op: 0,
                    d: {
                        obsWebSocketVersion: "5.6.0",
                        rpcVersion: 1,
                        authentication: { salt, challenge },
                    },
                }),
            );
            socket.on("message", (data) => {
                const message = decode(data);
                if (message.op === 1) {
                    this.authentication_attempts += 1;
                    const secret = create_hash("sha256")
                        .update(this.password + salt)
                        .digest("base64");
                    const authentication = create_hash("sha256")
                        .update(secret + challenge)
                        .digest("base64");
                    if (message.d.authentication !== authentication) {
                        socket.close(4009, "Authentication failed");
                        return;
                    }
                    identified = true;
                    socket.send(
                        encode({ op: 2, d: { negotiatedRpcVersion: 1 } }),
                    );
                    return;
                }
                if (message.op !== 6 || !identified) {
                    return;
                }
                const {
                    requestId: request_id,
                    requestType: request_type,
                    requestData: request_data,
                } = message.d;
                let response_data = {};
                let result = true;
                if (request_type === "GetSceneList") {
                    response_data = {
                        scenes: this.scene_names.map(
                            (scene_name, scene_index) => ({
                                sceneName: scene_name,
                                sceneIndex: scene_index,
                            }),
                        ),
                        currentProgramSceneName: this.current_scene,
                    };
                } else if (request_type === "GetCurrentProgramScene") {
                    response_data = {
                        currentProgramSceneName: this.current_scene,
                    };
                } else if (request_type === "SetCurrentProgramScene") {
                    result = this.scene_names.includes(request_data.sceneName);
                    if (result) {
                        this.current_scene = request_data.sceneName;
                        this.scene_changes.push(this.current_scene);
                        socket.send(
                            encode({
                                op: 5,
                                d: {
                                    eventType: "CurrentProgramSceneChanged",
                                    eventIntent: 4,
                                    eventData: {
                                        sceneName: this.current_scene,
                                    },
                                },
                            }),
                        );
                    }
                }
                socket.send(
                    encode({
                        op: 7,
                        d: {
                            requestType: request_type,
                            requestId: request_id,
                            requestStatus: { result, code: result ? 100 : 600 },
                            responseData: response_data,
                        },
                    }),
                );
            });
        });
        await new Promise((resolve, reject) => {
            this.server.once("listening", resolve);
            this.server.once("error", reject);
        });
        this.port = this.server.address().port;
    }

    async stop() {
        if (!this.server) {
            return;
        }
        for (const socket of this.server.clients) {
            socket.terminate();
        }
        await new Promise((resolve) => this.server.close(resolve));
        this.server = null;
    }
}

async function wait_until(predicate) {
    const deadline = Date.now() + 5000;
    while (!predicate()) {
        if (Date.now() >= deadline) {
            assert.fail(
                "Expected application state was not reached within five seconds.",
            );
        }
        await wait_for(10);
    }
}

test(
    "real OBS v5 client authenticates, follows exports and presets, and reconnects after server restart",
    { timeout: 20000 },
    async (context) => {
        const directory = await fs.mkdtemp(
            path.join(os.tmpdir(), "scene-switcher-websocket-"),
        );
        const song_path = path.join(directory, "currentsong.txt");
        await fs.writeFile(song_path, "\r\n  ");
        const server = new ObsTestServer();
        await server.start();
        const switcher = new SceneSwitcher({
            is_game_running: async () => true,
            poll_interval_ms: 15,
            retry_interval_ms: 40,
            operation_timeout_ms: 1000,
            scene_refresh_interval_ms: 50,
        });
        context.after(async () => {
            await switcher.stop();
            await server.stop();
            await fs.rm(directory, { recursive: true, force: true });
        });
        const settings = {
            obs_address: `ws://127.0.0.1:${server.port}`,
            obs_password: server.password,
            clone_hero_folder: directory,
            scene_menu: "Menus",
            scene_gameplay: "Gameplay",
        };
        await switcher.start(settings);
        await wait_until(() => server.current_scene === "Menus");
        await fs.writeFile(song_path, "Artist - Song\r\n");
        await wait_until(() => server.current_scene === "Gameplay");
        await switcher.start({
            ...settings,
            scene_menu: "Lobby",
            scene_gameplay: "Band",
        });
        await wait_until(() => server.current_scene === "Band");
        await server.stop();
        await wait_until(
            () => switcher.get_status().obs_state === "disconnected",
        );
        await fs.writeFile(song_path, "");
        server.current_scene = "Starting soon";
        await server.start();
        await wait_until(() => server.current_scene === "Lobby");
        assert.equal(switcher.get_status().running, true);
        assert.ok(server.authentication_attempts >= 3);
        assert.deepEqual(server.scene_changes, [
            "Menus",
            "Gameplay",
            "Band",
            "Lobby",
        ]);
    },
);

test(
    "wrong OBS password is recoverable through a settings change",
    { timeout: 10000 },
    async (context) => {
        const server = new ObsTestServer();
        await server.start();
        const switcher = new SceneSwitcher({
            read_song: async () => "",
            is_game_running: async () => true,
            poll_interval_ms: 15,
            retry_interval_ms: 40,
            operation_timeout_ms: 1000,
        });
        context.after(async () => {
            await switcher.stop();
            await server.stop();
        });
        const settings = {
            obs_address: `ws://127.0.0.1:${server.port}`,
            obs_password: "incorrect-test-password",
            clone_hero_folder: os.tmpdir(),
            scene_menu: "Menus",
            scene_gameplay: "Gameplay",
        };
        await switcher.start(settings);
        assert.equal(switcher.get_status().obs_state, "disconnected");
        assert.equal(switcher.get_status().running, true);
        await switcher.start({ ...settings, obs_password: server.password });
        await wait_until(() => server.current_scene === "Menus");
        assert.equal(switcher.get_status().obs_state, "connected");
    },
);
