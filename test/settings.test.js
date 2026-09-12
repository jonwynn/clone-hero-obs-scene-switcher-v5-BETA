"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
    SettingsStore,
    build_default_settings,
    build_runtime_settings,
    validate_connection,
    validate_settings,
} = require("../src/settings");

function create_store(context) {
    const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), "scene-switcher-settings-"),
    );
    context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const secret_storage = {
        isEncryptionAvailable: () => true,
        encryptString: (value) => Buffer.from([...value].reverse().join("")),
        decryptString: (value) => [...value.toString()].reverse().join(""),
    };
    return new SettingsStore(directory, secret_storage);
}

function build_settings() {
    return {
        ...build_default_settings(),
        obs_password: "test-only-secret",
        clone_hero_folder: os.tmpdir(),
        profiles: [
            {
                id: "single",
                name: "Single player",
                scene_menu: "Menus",
                scene_gameplay: "Gameplay",
            },
            {
                id: "multi",
                name: "Multiplayer",
                scene_menu: "Lobby",
                scene_gameplay: "Band",
            },
        ],
        active_profile_id: "multi",
    };
}

test("settings and active preset survive restart without storing a plaintext password", (context) => {
    const store = create_store(context);
    const settings = build_settings();
    assert.deepEqual(store.load_settings(), build_default_settings());
    store.write_settings(settings);
    const saved = fs.readFileSync(store.file_path, "utf8");
    assert.equal(saved.includes(settings.obs_password), false);
    assert.equal(Object.hasOwn(JSON.parse(saved), "obs_password"), false);
    const reopened = new SettingsStore(store.directory, store.secret_storage);
    assert.deepEqual(reopened.load_settings(), settings);
    assert.equal(
        build_runtime_settings(reopened.get_settings()).scene_gameplay,
        "Band",
    );
});

test("profile names are unique and invalid saves preserve the stored settings", (context) => {
    const store = create_store(context);
    const settings = build_settings();
    store.write_settings(settings);
    const original = fs.readFileSync(store.file_path, "utf8");
    settings.profiles[1].name = "SINGLE PLAYER";
    assert.throws(() => store.write_settings(settings), /already exists/);
    assert.equal(fs.readFileSync(store.file_path, "utf8"), original);
    assert.equal(store.get_settings().profiles[1].name, "Multiplayer");
});

test("blank or matching scenes and missing active presets are rejected", () => {
    const settings = build_settings();
    settings.profiles[0].scene_gameplay = "Menus";
    assert.throws(() => validate_settings(settings), /different/);
    settings.profiles[0].scene_gameplay = "   ";
    assert.throws(() => validate_settings(settings), /both OBS/);
    settings.profiles[0].scene_gameplay = "Gameplay";
    settings.active_profile_id = "missing";
    assert.throws(() => validate_settings(settings), /existing preset/);
});

test("connection validation rejects malformed URLs and preserves password whitespace", () => {
    const settings = build_settings();
    for (const address of [
        "oops",
        "https://localhost",
        "ws://user:secret@localhost:4455",
    ]) {
        assert.throws(
            () => validate_connection({ ...settings, obs_address: address }),
            /OBS address/,
        );
    }
    assert.throws(
        () =>
            validate_connection({ ...settings, clone_hero_folder: "relative" }),
        /full folder path/,
    );
    assert.throws(
        () =>
            validate_connection({
                ...settings,
                clone_hero_folder: path.join(os.tmpdir(), "currentsong.txt"),
            }),
        /containing folder/,
    );
    assert.equal(
        validate_connection({ ...settings, obs_password: " keep spaces " })
            .obs_password,
        " keep spaces ",
    );
    assert.equal(build_runtime_settings(build_default_settings()), null);
});

test("OBS scene names retain exact intentional whitespace", () => {
    const settings = build_settings();
    settings.profiles[0].scene_menu = " Menus ";
    assert.equal(validate_settings(settings).profiles[0].scene_menu, " Menus ");
});

test("unavailable password encryption fails without overwriting saved presets", (context) => {
    const store = create_store(context);
    store.write_settings(build_settings());
    const original = fs.readFileSync(store.file_path, "utf8");
    store.secret_storage.isEncryptionAvailable = () => false;
    assert.throws(
        () => store.write_settings(build_settings()),
        /encryption is unavailable/,
    );
    assert.equal(fs.readFileSync(store.file_path, "utf8"), original);
});

test("corrupt settings are backed up and the application can be configured again", (context) => {
    const store = create_store(context);
    fs.writeFileSync(store.file_path, "{broken");
    assert.deepEqual(store.load_settings(), build_default_settings());
    assert.match(store.notice, /backup/);
    const backup = fs
        .readdirSync(store.directory)
        .find((name) => name.endsWith(".bak"));
    assert.equal(
        fs.readFileSync(path.join(store.directory, backup), "utf8"),
        "{broken",
    );
    store.write_settings(build_settings());
    assert.equal(store.notice, "");
});

test("a password from another Windows account can be replaced without losing presets", (context) => {
    const store = create_store(context);
    store.write_settings(build_settings());
    store.secret_storage.decryptString = () => {
        throw new Error("Wrong account");
    };
    const reopened = new SettingsStore(store.directory, store.secret_storage);
    const settings = reopened.load_settings();
    assert.equal(settings.obs_password, "");
    assert.equal(settings.profiles.length, 2);
    assert.match(reopened.notice, /unlocked/);
});

test("a failed atomic replacement leaves the previous settings in memory", (context) => {
    const store = create_store(context);
    store.write_settings(build_settings());
    const original = store.get_settings();
    fs.mkdirSync(`${store.file_path}.tmp`);
    assert.throws(() =>
        store.write_settings({
            ...original,
            obs_address: "ws://localhost:4455",
        }),
    );
    assert.deepEqual(store.get_settings(), original);
});
