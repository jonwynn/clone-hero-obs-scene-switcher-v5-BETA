"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");

const { SceneSwitcher } = require("../src/switcher");

class FakeObs extends EventEmitter {
    constructor() {
        super();
        this.scene_names = ["Menu", "Gameplay", "Multiplayer", "Break"];
        this.current_scene = "Break";
        this.switches = [];
        this.disconnect_count = 0;
    }

    async connect(address, password) {
        this.address = address;
        this.password = password;
    }

    async disconnect() {
        this.disconnect_count += 1;
        this.emit("ConnectionClosed");
    }

    async call(request_name, request) {
        if (request_name === "GetSceneList") {
            return {
                scenes: this.scene_names.map((scene_name) => ({
                    sceneName: scene_name,
                })),
                currentProgramSceneName: this.current_scene,
            };
        }
        if (request_name === "GetCurrentProgramScene") {
            return { currentProgramSceneName: this.current_scene };
        }
        if (request_name === "SetCurrentProgramScene") {
            this.switches.push(request.sceneName);
            this.current_scene = request.sceneName;
        }
        return {};
    }
}

function build_settings(overrides = {}) {
    return {
        obs_address: "ws://127.0.0.1:4455",
        obs_password: "test-password",
        clone_hero_folder: "C:\\Clone Hero",
        scene_menu: "Menu",
        scene_gameplay: "Gameplay",
        ...overrides,
    };
}

function create_deferred() {
    let resolve;
    let reject;
    const promise = new Promise((promise_resolve, promise_reject) => {
        resolve = promise_resolve;
        reject = promise_reject;
    });
    return { promise, resolve, reject };
}

function create_fixture(context, overrides = {}) {
    const fixture = {
        song_text: "",
        file_error: null,
        game_running: true,
        clients: [],
        statuses: [],
    };
    fixture.switcher = new SceneSwitcher({
        create_obs: () => {
            const obs = new FakeObs();
            fixture.clients.push(obs);
            return obs;
        },
        read_song: async () => {
            if (fixture.file_error) {
                throw fixture.file_error;
            }
            return fixture.song_text;
        },
        is_game_running: async () => fixture.game_running,
        on_status: (status) => fixture.statuses.push(status),
        poll_interval_ms: 60000,
        retry_interval_ms: 0,
        operation_timeout_ms: 1000,
        scene_refresh_interval_ms: 60000,
        ...overrides,
    });
    context.after(() => fixture.switcher.stop());
    return fixture;
}

test("trimmed current-song contents preserve menu/gameplay transitions", async (context) => {
    const fixture = create_fixture(context);
    fixture.song_text = " \n\t ";
    await fixture.switcher.start(build_settings());
    fixture.song_text = "  Artist - Song\n";
    await fixture.switcher.process_update();
    fixture.song_text = "Another song";
    await fixture.switcher.process_update();
    fixture.song_text = "";
    await fixture.switcher.process_update();
    assert.deepEqual(fixture.clients[0].switches, ["Menu", "Gameplay", "Menu"]);
    assert.equal(fixture.switcher.get_status().game_state, "menu");
});

test("manual OBS changes are respected until the next game-state transition", async (context) => {
    const fixture = create_fixture(context, { scene_refresh_interval_ms: 0 });
    fixture.song_text = "Song";
    await fixture.switcher.start(build_settings());
    const obs = fixture.clients[0];
    obs.current_scene = "Break";
    obs.emit("CurrentProgramSceneChanged", { sceneName: "Break" });
    await fixture.switcher.process_update();
    assert.deepEqual(obs.switches, ["Gameplay"]);
    assert.equal(fixture.switcher.get_status().current_scene, "Break");
    fixture.song_text = "";
    await fixture.switcher.process_update();
    assert.deepEqual(obs.switches, ["Gameplay", "Menu"]);
});

test("refreshing scenes preserves manual OBS changes and the active connection", async (context) => {
    const fixture = create_fixture(context);
    fixture.song_text = "Song";
    await fixture.switcher.start(build_settings());
    const obs = fixture.clients[0];
    obs.current_scene = "Break";
    obs.scene_names.push("New Scene");
    const status = await fixture.switcher.refresh_scenes();
    assert.equal(fixture.clients.length, 1);
    assert.equal(obs.disconnect_count, 0);
    assert.deepEqual(obs.switches, ["Gameplay"]);
    assert.equal(status.current_scene, "Break");
    assert.ok(status.scene_names.includes("New Scene"));
});

test("refreshing scenes while stopped cannot connect or start switching", async (context) => {
    const fixture = create_fixture(context);
    const status = await fixture.switcher.refresh_scenes();
    assert.equal(status.running, false);
    assert.equal(fixture.clients.length, 0);
});

test("OBS can start later and reconnect using the latest game state", async (context) => {
    let attempts = 0;
    const clients = [];
    const fixture = create_fixture(context, {
        create_obs: () => {
            const obs = new FakeObs();
            clients.push(obs);
            obs.connect = async () => {
                attempts += 1;
                if (attempts < 3) {
                    throw new Error("Connection refused");
                }
            };
            return obs;
        },
    });
    await fixture.switcher.start(build_settings());
    assert.equal(fixture.switcher.get_status().obs_state, "disconnected");
    await fixture.switcher.process_update();
    fixture.song_text = "Song";
    await fixture.switcher.process_update();
    assert.equal(fixture.switcher.get_status().obs_state, "connected");
    assert.deepEqual(clients[2].switches, ["Gameplay"]);
});

test("OBS closure and socket errors are recoverable without restarting the switcher", async (context) => {
    const fixture = create_fixture(context);
    await fixture.switcher.start(build_settings());
    fixture.clients[0].emit("ConnectionClosed");
    fixture.clients[0].emit("error", new Error("Late socket error"));
    fixture.song_text = "Song";
    await fixture.switcher.process_update();
    assert.deepEqual(fixture.clients[1].switches, ["Gameplay"]);
    fixture.clients[1].emit("ConnectionError", new Error("Socket failed"));
    await fixture.switcher.process_update();
    assert.deepEqual(fixture.clients[2].switches, ["Gameplay"]);
});

test("failed scene changes retry without losing the pending state", async (context) => {
    const obs = new FakeObs();
    const call = obs.call.bind(obs);
    let reject_switch = true;
    obs.call = async (request_name, request) => {
        if (request_name === "SetCurrentProgramScene" && reject_switch) {
            reject_switch = false;
            throw new Error("Temporary request failure");
        }
        return call(request_name, request);
    };
    const fixture = create_fixture(context, { create_obs: () => obs });
    await fixture.switcher.start(build_settings());
    assert.match(fixture.switcher.get_status().message, /Unable to switch/);
    await fixture.switcher.process_update();
    assert.deepEqual(obs.switches, ["Menu"]);
    assert.doesNotMatch(
        fixture.switcher.get_status().message,
        /Unable to switch/,
    );
});

test("missing scenes are actionable and scene-list events allow recovery", async (context) => {
    const obs = new FakeObs();
    obs.scene_names = ["Menu"];
    const fixture = create_fixture(context, { create_obs: () => obs });
    await fixture.switcher.start(build_settings());
    assert.match(
        fixture.switcher.get_status().message,
        /OBS scene not found: "Gameplay"/,
    );
    assert.deepEqual(obs.switches, []);
    obs.scene_names.push("Gameplay");
    obs.emit("SceneListChanged");
    await fixture.switcher.process_update();
    assert.deepEqual(obs.switches, ["Menu"]);
    obs.scene_names = ["Menu", "Renamed Gameplay"];
    obs.emit("SceneNameChanged");
    await fixture.switcher.process_update();
    assert.match(fixture.switcher.get_status().message, /OBS scene not found/);
});

test("missing and temporarily locked song files recover without spurious switches", async (context) => {
    const fixture = create_fixture(context);
    fixture.file_error = Object.assign(new Error("Missing"), {
        code: "ENOENT",
    });
    await fixture.switcher.start(build_settings());
    assert.equal(fixture.switcher.get_status().game_state, "waiting");
    assert.deepEqual(fixture.clients[0].switches, []);
    fixture.file_error = null;
    fixture.song_text = "Song";
    await fixture.switcher.process_update();
    fixture.file_error = Object.assign(new Error("Locked"), { code: "EBUSY" });
    await fixture.switcher.process_update();
    assert.equal(fixture.switcher.get_status().game_state, "error");
    assert.deepEqual(fixture.clients[0].switches, ["Gameplay"]);
    fixture.file_error = null;
    fixture.song_text = "";
    await fixture.switcher.process_update();
    assert.deepEqual(fixture.clients[0].switches, ["Gameplay", "Menu"]);
});

test("game exit selects the menu and stale exports are ignored after restart", async (context) => {
    const fixture = create_fixture(context);
    fixture.song_text = "Stale song";
    await fixture.switcher.start(build_settings());
    fixture.game_running = false;
    await fixture.switcher.process_update();
    assert.equal(fixture.switcher.get_status().game_state, "stopped");
    fixture.game_running = true;
    await fixture.switcher.process_update();
    assert.equal(fixture.switcher.get_status().game_state, "waiting");
    assert.deepEqual(fixture.clients[0].switches, ["Gameplay", "Menu"]);
    fixture.song_text = "";
    await fixture.switcher.process_update();
    fixture.song_text = "Stale song";
    await fixture.switcher.process_update();
    assert.deepEqual(fixture.clients[0].switches, [
        "Gameplay",
        "Menu",
        "Gameplay",
    ]);
});

test("game exit still selects menu when the current-song file is unreadable", async (context) => {
    const fixture = create_fixture(context);
    fixture.song_text = "Song";
    await fixture.switcher.start(build_settings());
    fixture.game_running = false;
    fixture.file_error = new Error("Locked");
    await fixture.switcher.process_update();
    assert.deepEqual(fixture.clients[0].switches, ["Gameplay", "Menu"]);
});

test("replaying the same song after restart accepts a freshly written export", async (context) => {
    const fixture = create_fixture(context);
    fixture.song_text = { text: "Same song", version: "100:20" };
    await fixture.switcher.start(build_settings());
    fixture.game_running = false;
    await fixture.switcher.process_update();
    fixture.game_running = true;
    await fixture.switcher.process_update();
    assert.equal(fixture.switcher.get_status().game_state, "waiting");
    fixture.song_text = { text: "Same song", version: "101:20" };
    await fixture.switcher.process_update();
    assert.deepEqual(fixture.clients[0].switches, [
        "Gameplay",
        "Menu",
        "Gameplay",
    ]);
});

test("cached stopped process observations do not consume a fresh export after restart", async (context) => {
    const fixture = create_fixture(context);
    fixture.song_text = { text: "Song", version: "100:20" };
    await fixture.switcher.start(build_settings());
    fixture.game_running = false;
    await fixture.switcher.process_update();
    // The game restarts and writes a new export while tasklist's false result is cached.
    fixture.song_text = { text: "Song", version: "101:20" };
    await fixture.switcher.process_update();
    fixture.game_running = true;
    await fixture.switcher.process_update();
    assert.equal(fixture.switcher.get_status().game_state, "gameplay");
    assert.deepEqual(fixture.clients[0].switches, [
        "Gameplay",
        "Menu",
        "Gameplay",
    ]);
});

test("missing exports suspend a pending failed scene change until a reliable read", async (context) => {
    const obs = new FakeObs();
    const call = obs.call.bind(obs);
    let fail_switch = true;
    obs.call = async (request_name, request) => {
        if (request_name === "SetCurrentProgramScene" && fail_switch) {
            throw new Error("Rejected");
        }
        return call(request_name, request);
    };
    const fixture = create_fixture(context, { create_obs: () => obs });
    fixture.song_text = "Song";
    await fixture.switcher.start(build_settings());
    fail_switch = false;
    fixture.file_error = Object.assign(new Error("Missing"), {
        code: "ENOENT",
    });
    await fixture.switcher.process_update();
    assert.deepEqual(obs.switches, []);
    fixture.file_error = null;
    fixture.song_text = "";
    await fixture.switcher.process_update();
    assert.deepEqual(obs.switches, ["Menu"]);
});

test("reconnecting with an unreadable export cannot reapply an old song state", async (context) => {
    const fixture = create_fixture(context);
    fixture.song_text = "Song";
    await fixture.switcher.start(build_settings());
    fixture.clients[0].emit("ConnectionClosed");
    fixture.file_error = new Error("Locked");
    await fixture.switcher.process_update();
    assert.deepEqual(fixture.clients[1].switches, []);
    fixture.file_error = null;
    fixture.song_text = "";
    await fixture.switcher.process_update();
    assert.deepEqual(fixture.clients[1].switches, ["Menu"]);
});

test("OBS diagnostics do not disclose arbitrary server messages", async (context) => {
    const obs = new FakeObs();
    obs.connect = async () => {
        throw Object.assign(new Error("Server echoed a private password"), {
            code: 4009,
        });
    };
    const fixture = create_fixture(context, { create_obs: () => obs });
    await fixture.switcher.start(build_settings());
    assert.match(
        fixture.switcher.get_status().message,
        /OBS rejected the password/,
    );
    assert.doesNotMatch(JSON.stringify(fixture.statuses), /private password/);
});

test("changing presets preserves stale-export protection", async (context) => {
    const fixture = create_fixture(context);
    fixture.game_running = false;
    fixture.song_text = "Stale song";
    await fixture.switcher.start(build_settings());
    fixture.game_running = true;
    await fixture.switcher.start(
        build_settings({ scene_gameplay: "Multiplayer" }),
    );
    assert.equal(fixture.switcher.get_status().game_state, "waiting");
    assert.deepEqual(fixture.clients[1].switches, ["Menu"]);
    fixture.song_text = "New song";
    await fixture.switcher.process_update();
    assert.deepEqual(fixture.clients[1].switches, ["Menu", "Multiplayer"]);
});

test("rapid preset changes and stop/start retain the stale export observation", async (context) => {
    const fixture = create_fixture(context);
    fixture.game_running = false;
    fixture.song_text = { text: "Stale song", version: "100:20" };
    await fixture.switcher.start(build_settings());
    fixture.game_running = true;
    await Promise.all([
        fixture.switcher.start(
            build_settings({ scene_gameplay: "Multiplayer" }),
        ),
        fixture.switcher.start(build_settings({ scene_gameplay: "Gameplay" })),
    ]);
    assert.equal(fixture.switcher.get_status().game_state, "waiting");
    await fixture.switcher.stop();
    await fixture.switcher.start(build_settings());
    assert.equal(fixture.switcher.get_status().game_state, "waiting");
    assert.deepEqual(
        fixture.clients.flatMap((client) => client.switches),
        ["Menu", "Menu", "Menu"],
    );
});

test("unavailable process detection falls back to current-song export", async (context) => {
    const fixture = create_fixture(context);
    fixture.game_running = null;
    fixture.song_text = "Song";
    await fixture.switcher.start(build_settings());
    assert.deepEqual(fixture.clients[0].switches, ["Gameplay"]);
    assert.match(
        fixture.switcher.get_status().message,
        /Process detection is unavailable/,
    );
});

test("stop invalidates an in-flight scene read before it can issue a switch", async (context) => {
    const read_started = create_deferred();
    const read_result = create_deferred();
    const obs = new FakeObs();
    const call = obs.call.bind(obs);
    obs.call = async (request_name, request) => {
        if (request_name === "GetCurrentProgramScene") {
            read_started.resolve();
            return read_result.promise;
        }
        return call(request_name, request);
    };
    const fixture = create_fixture(context, { create_obs: () => obs });
    const starting = fixture.switcher.start(build_settings());
    await read_started.promise;
    const stopping = fixture.switcher.stop();
    read_result.resolve({ currentProgramSceneName: "Break" });
    await Promise.all([starting, stopping]);
    assert.deepEqual(obs.switches, []);
    assert.equal(fixture.switcher.get_status().running, false);
});

test("preset changes invalidate old OBS requests and apply the new preset", async (context) => {
    const read_started = create_deferred();
    const read_result = create_deferred();
    const clients = [];
    const fixture = create_fixture(context, {
        create_obs: () => {
            const obs = new FakeObs();
            if (clients.length === 0) {
                const call = obs.call.bind(obs);
                obs.call = async (request_name, request) => {
                    if (request_name === "GetCurrentProgramScene") {
                        read_started.resolve();
                        return read_result.promise;
                    }
                    return call(request_name, request);
                };
            }
            clients.push(obs);
            return obs;
        },
    });
    fixture.song_text = "Song";
    const starting = fixture.switcher.start(build_settings());
    await read_started.promise;
    const restarting = fixture.switcher.start(
        build_settings({ scene_gameplay: "Multiplayer" }),
    );
    read_result.resolve({ currentProgramSceneName: "Break" });
    await Promise.all([starting, restarting]);
    assert.deepEqual(clients[0].switches, []);
    assert.deepEqual(clients[1].switches, ["Multiplayer"]);
    assert.ok(clients[0].disconnect_count > 0);
});

test("overlapping polls share one file read and cannot issue duplicate switches", async (context) => {
    const read_started = create_deferred();
    const read_result = create_deferred();
    let read_count = 0;
    const fixture = create_fixture(context, {
        read_song: async () => {
            read_count += 1;
            if (read_count === 1) {
                return "";
            }
            read_started.resolve();
            return read_result.promise;
        },
    });
    await fixture.switcher.start(build_settings());
    const first_poll = fixture.switcher.process_update();
    await read_started.promise;
    const second_poll = fixture.switcher.process_update();
    read_result.resolve("Song");
    await Promise.all([first_poll, second_poll]);
    assert.equal(read_count, 2);
    assert.deepEqual(fixture.clients[0].switches, ["Menu", "Gameplay"]);
});

test("timed-out connections are abandoned and late connections cannot switch", async (context) => {
    const connect_result = create_deferred();
    const obs = new FakeObs();
    obs.connect = () => connect_result.promise;
    const fixture = create_fixture(context, {
        create_obs: () => obs,
        operation_timeout_ms: 20,
    });
    await fixture.switcher.start(build_settings());
    assert.equal(fixture.switcher.get_status().obs_state, "disconnected");
    connect_result.resolve();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(obs.switches, []);
    assert.ok(obs.disconnect_count >= 2);
});

test("timed-out scene requests reconnect and retry the desired state", async (context) => {
    const clients = [];
    const fixture = create_fixture(context, {
        operation_timeout_ms: 20,
        create_obs: () => {
            const obs = new FakeObs();
            if (clients.length === 0) {
                const call = obs.call.bind(obs);
                obs.call = (request_name, request) =>
                    request_name === "SetCurrentProgramScene"
                        ? new Promise(() => {})
                        : call(request_name, request);
            }
            clients.push(obs);
            return obs;
        },
    });
    await fixture.switcher.start(build_settings());
    assert.equal(fixture.switcher.get_status().obs_state, "disconnected");
    await fixture.switcher.process_update();
    assert.deepEqual(clients[1].switches, ["Menu"]);
});

test("scene status is a defensive copy and UI callback errors do not stop switching", async (context) => {
    const fixture = create_fixture(context, {
        on_status: () => {
            throw new Error("UI unavailable");
        },
    });
    await fixture.switcher.start(build_settings());
    fixture.switcher.get_status().scene_names.push("Incorrect scene");
    assert.equal(
        fixture.switcher.get_status().scene_names.includes("Incorrect scene"),
        false,
    );
    fixture.song_text = "Song";
    await fixture.switcher.process_update();
    assert.deepEqual(fixture.clients[0].switches, ["Menu", "Gameplay"]);
});
