"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function build_default_settings() {
    return {
        obs_address: "ws://127.0.0.1:4455",
        obs_password: "",
        clone_hero_folder: "",
        profiles: [],
        active_profile_id: null,
    };
}

function validate_text(value, label, maximum_length = 512) {
    if (typeof value !== "string" || value.length > maximum_length) {
        throw new Error(
            `${label} must be text of at most ${maximum_length} characters.`,
        );
    }
    if (/[\u0000-\u001f]/.test(value)) {
        throw new Error(`${label} cannot contain control characters.`);
    }
    return value.trim();
}

function validate_connection(input, allow_empty_folder = false) {
    if (!input || typeof input !== "object") {
        throw new Error("Enter the OBS connection and Clone Hero folder.");
    }
    const obs_address = validate_text(input.obs_address, "OBS address", 2048);
    let address;
    try {
        address = new URL(obs_address);
    } catch {
        throw new Error(
            "Enter a valid OBS address, such as ws://127.0.0.1:4455.",
        );
    }
    if (
        !["ws:", "wss:"].includes(address.protocol) ||
        !address.hostname ||
        address.username ||
        address.password
    ) {
        throw new Error(
            "OBS address must start with ws:// or wss:// and contain no embedded credentials.",
        );
    }
    if (
        typeof input.obs_password !== "string" ||
        input.obs_password.length > 4096
    ) {
        throw new Error("Enter an OBS password of at most 4096 characters.");
    }
    let clone_hero_folder = validate_text(
        input.clone_hero_folder,
        "Clone Hero folder",
        32767,
    );
    clone_hero_folder = clone_hero_folder.replace(
        /%([^%]+)%/g,
        (match, name) => process.env[name] ?? match,
    );
    if (clone_hero_folder === "~" || /^~[\\/]/.test(clone_hero_folder)) {
        clone_hero_folder = path.join(os.homedir(), clone_hero_folder.slice(2));
    }
    if (!clone_hero_folder && !allow_empty_folder) {
        throw new Error(
            "Choose the folder that contains Clone Hero's currentsong.txt.",
        );
    }
    if (
        clone_hero_folder &&
        (!path.isAbsolute(clone_hero_folder) ||
            /%[^%]+%/.test(clone_hero_folder))
    ) {
        throw new Error(
            "Choose a full folder path or use Browse to locate currentsong.txt.",
        );
    }
    if (path.basename(clone_hero_folder).toLowerCase() === "currentsong.txt") {
        throw new Error(
            "Select the containing folder, rather than currentsong.txt itself.",
        );
    }
    return { obs_address, obs_password: input.obs_password, clone_hero_folder };
}

function validate_profile(input) {
    if (!input || typeof input !== "object") {
        throw new Error("Enter a preset name and two scene names.");
    }
    const name = validate_text(input.name, "Preset name", 80);
    // OBS names are exact strings; preserve intentional spaces around scene names.
    validate_text(input.scene_menu, "Menu scene name");
    validate_text(input.scene_gameplay, "Gameplay scene name");
    const scene_menu = input.scene_menu;
    const scene_gameplay = input.scene_gameplay;
    if (!name || !scene_menu.trim() || !scene_gameplay.trim()) {
        throw new Error("Enter a preset name and both OBS scene names.");
    }
    if (scene_menu === scene_gameplay) {
        throw new Error(
            "Choose two different OBS scenes for menus and gameplay.",
        );
    }
    const id = validate_text(input.id, "Preset ID", 100);
    if (!id) {
        throw new Error("The preset ID is missing.");
    }
    return { id, name, scene_menu, scene_gameplay };
}

function validate_settings(input) {
    const connection = validate_connection(input, true);
    if (!Array.isArray(input.profiles) || input.profiles.length > 100) {
        throw new Error("Settings must contain at most 100 presets.");
    }
    const profiles = input.profiles.map(validate_profile);
    if (
        new Set(profiles.map((profile) => profile.id)).size !== profiles.length
    ) {
        throw new Error("Each preset must have a unique ID.");
    }
    if (
        new Set(profiles.map((profile) => profile.name.toLowerCase())).size !==
        profiles.length
    ) {
        throw new Error(
            "A preset with that name already exists. Choose a different name.",
        );
    }
    if (
        profiles.length &&
        !profiles.some((profile) => profile.id === input.active_profile_id)
    ) {
        throw new Error("Choose an existing preset to activate.");
    }
    return {
        ...connection,
        profiles,
        active_profile_id: profiles.length ? input.active_profile_id : null,
    };
}

function build_runtime_settings(settings) {
    const profile = settings.profiles.find(
        (item) => item.id === settings.active_profile_id,
    );
    if (!profile || !settings.clone_hero_folder) {
        return null;
    }
    return {
        ...validate_connection(settings),
        scene_menu: profile.scene_menu,
        scene_gameplay: profile.scene_gameplay,
    };
}

class SettingsStore {
    constructor(directory, secret_storage) {
        this.directory = directory;
        this.file_path = path.join(directory, "settings.json");
        this.secret_storage = secret_storage;
        this.settings = build_default_settings();
        this.notice = "";
    }

    load_settings() {
        fs.mkdirSync(this.directory, { recursive: true });
        if (!fs.existsSync(this.file_path)) {
            return this.get_settings();
        }
        const text = fs.readFileSync(this.file_path, "utf8");
        let stored;
        try {
            stored = JSON.parse(text);
            if (stored.version !== 1) {
                throw new Error("Unsupported settings version.");
            }
            this.settings = validate_settings({ ...stored, obs_password: "" });
        } catch {
            const backup_path = `${this.file_path}.invalid-${Date.now()}.bak`;
            fs.copyFileSync(
                this.file_path,
                backup_path,
                fs.constants.COPYFILE_EXCL,
            );
            this.notice =
                "The settings file could not be read. A backup was saved beside it; please enter your settings again.";
            return this.get_settings();
        }
        if (stored.encrypted_password) {
            try {
                this.settings.obs_password = this.secret_storage.decryptString(
                    Buffer.from(stored.encrypted_password, "base64"),
                );
            } catch {
                this.notice =
                    "The saved OBS password could not be unlocked for this Windows account. Enter it again and save the connection.";
            }
        }
        return this.get_settings();
    }

    get_settings() {
        return structuredClone(this.settings);
    }

    write_settings(input) {
        const settings = validate_settings(input);
        if (
            settings.obs_password &&
            !this.secret_storage.isEncryptionAvailable()
        ) {
            throw new Error(
                "Windows password encryption is unavailable. Your settings were not saved; restart the application and try again.",
            );
        }
        const { obs_password, ...public_settings } = settings;
        const stored = {
            version: 1,
            ...public_settings,
            encrypted_password: obs_password
                ? this.secret_storage
                      .encryptString(obs_password)
                      .toString("base64")
                : "",
        };
        fs.mkdirSync(this.directory, { recursive: true });
        const temporary_path = `${this.file_path}.tmp`;
        let temporary_written = false;
        try {
            fs.writeFileSync(
                temporary_path,
                `${JSON.stringify(stored, null, 4)}\n`,
                { mode: 0o600 },
            );
            temporary_written = true;
            fs.renameSync(temporary_path, this.file_path);
        } catch {
            throw new Error(
                "Settings could not be saved. Check that your application data folder is writable and has free disk space.",
            );
        } finally {
            if (temporary_written && fs.existsSync(temporary_path)) {
                fs.rmSync(temporary_path, { force: true });
            }
        }
        this.settings = settings;
        this.notice = "";
        return this.get_settings();
    }
}

module.exports = {
    SettingsStore,
    build_default_settings,
    build_runtime_settings,
    validate_connection,
    validate_profile,
    validate_settings,
};
