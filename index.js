"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const settingsPath = path.join(__dirname, "settings.ini");
const watchIntervalMs = 250;

function timestamp() {
    return new Date().toISOString();
}

function log(level, message) {
    console.log(`${timestamp()} [${level}] - ${message}`);
}

function parseIni(text) {
    const result = {};
    let section = null;

    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();

        if (!line || line.startsWith(";") || line.startsWith("#")) {
            continue;
        }

        if (line.startsWith("[") && line.endsWith("]")) {
            section = line.slice(1, -1).trim();
            result[section] = result[section] || {};
            continue;
        }

        if (!section) {
            continue;
        }

        const equalsIndex = line.indexOf("=");
        if (equalsIndex < 0) {
            continue;
        }

        const key = line.slice(0, equalsIndex).trim();
        let value = line.slice(equalsIndex + 1).trim();

        if (
            value.length >= 2 &&
            ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'")))
        ) {
            value = value.slice(1, -1);
        }

        result[section][key] = value;
    }

    return result;
}

function looksLikePlaceholder(value) {
    if (typeof value !== "string") {
        return false;
    }

    const normalized = value.trim().toUpperCase();
    return (
        normalized.startsWith("PASTE_") ||
        normalized.startsWith("REPLACE_") ||
        normalized.startsWith("ENTER_") ||
        normalized.startsWith("TYPE_") ||
        normalized.includes("YOUR_") ||
        /^<.*>$/.test(normalized) ||
        /^\[.*\]$/.test(normalized)
    );
}

function requiredConfigured(config, section, key, friendlyName) {
    const value = config[section]?.[key];

    if (value === undefined || value === null || value.trim() === "") {
        throw new Error(
            `The ${friendlyName} is missing from settings.ini. Add a value for [${section}] ${key}.`
        );
    }

    if (looksLikePlaceholder(value)) {
        throw new Error(
            `settings.ini has not been fully configured. Replace the placeholder for ${friendlyName}: [${section}] ${key}=${value}`
        );
    }

    return value.trim();
}

function expandEnvironmentVariables(value) {
    let expanded = value.replace(/%([^%]+)%/g, (match, variableName) => {
        return process.env[variableName] ?? match;
    });

    if (expanded === "~") {
        expanded = os.homedir();
    } else if (expanded.startsWith(`~${path.sep}`) || expanded.startsWith("~/")) {
        expanded = path.join(os.homedir(), expanded.slice(2));
    }

    return expanded;
}

function validateObsAddress(address) {
    let parsed;

    try {
        parsed = new URL(address);
    } catch (_) {
        throw new Error(
            `The OBS WebSocket address is invalid: "${address}". For OBS on the same PC, use ws://127.0.0.1:4455`
        );
    }

    if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
        throw new Error(
            `The OBS WebSocket address must begin with ws:// or wss://. Current value: "${address}"`
        );
    }

    return address;
}

function loadSettings() {
    if (!fs.existsSync(settingsPath)) {
        throw new Error(
            `Cannot find ${settingsPath}. Keep settings.ini in the same folder as setup_and_run.cmd and index.js.`
        );
    }

    const config = parseIni(fs.readFileSync(settingsPath, "utf8"));

    const obsAddressRaw = config.obs?.address?.trim() || "ws://127.0.0.1:4455";
    if (looksLikePlaceholder(obsAddressRaw)) {
        throw new Error(
            `Replace the OBS WebSocket address placeholder in settings.ini. For OBS on the same PC, use ws://127.0.0.1:4455`
        );
    }

    const passwordFromEnvironment = process.env.OBS_WEBSOCKET_PASSWORD;
    const passwordFromFile = config.obs?.password?.trim() || "";

    if (
        passwordFromEnvironment === undefined &&
        looksLikePlaceholder(passwordFromFile)
    ) {
        throw new Error(
            "Replace PASTE_OBS_WEBSOCKET_PASSWORD_HERE in settings.ini with the password shown in OBS under Tools -> WebSocket Server Settings -> Show Connect Info."
        );
    }

    const sceneMenu = requiredConfigured(
        config,
        "obs",
        "scene_menu",
        "OBS menu/not-in-song scene name"
    );
    const sceneGameplay = requiredConfigured(
        config,
        "obs",
        "scene_gameplay",
        "OBS gameplay/in-song scene name"
    );

    if (sceneMenu === sceneGameplay) {
        throw new Error(
            "scene_menu and scene_gameplay are identical. They must name two different OBS scenes."
        );
    }

    const cloneHeroFolderRaw = requiredConfigured(
        config,
        "clonehero",
        "folder",
        "Clone Hero folder"
    );

    const cloneHeroFolderExpanded = expandEnvironmentVariables(cloneHeroFolderRaw);

    if (/%[^%]+%/.test(cloneHeroFolderExpanded)) {
        throw new Error(
            `The Clone Hero folder contains an unknown environment variable: "${cloneHeroFolderRaw}". Enter the full Windows folder path instead.`
        );
    }

    return {
        obsAddress: validateObsAddress(obsAddressRaw),
        obsPassword:
            passwordFromEnvironment !== undefined
                ? passwordFromEnvironment
                : passwordFromFile,
        sceneMenu,
        sceneGameplay,
        cloneHeroFolder: path.resolve(cloneHeroFolderExpanded),
    };
}

function formatSceneList(sceneNames) {
    return [...sceneNames]
        .sort((a, b) => a.localeCompare(b))
        .map((name) => `  - ${name}`)
        .join("\n");
}

async function main() {
    log("info", "================================== [ START ] ==================================");
    log("info", `Reading ${settingsPath}`);

    const settings = loadSettings();
    const currentSongPath = path.join(settings.cloneHeroFolder, "currentsong.txt");

    log("info", `OBS address: ${settings.obsAddress}`);
    log("info", `Menu scene: ${settings.sceneMenu}`);
    log("info", `Gameplay scene: ${settings.sceneGameplay}`);
    log("info", `Clone Hero folder: ${settings.cloneHeroFolder}`);

    log("info", "Looking for currentsong.txt file...");
    if (!fs.existsSync(currentSongPath)) {
        throw new Error(
            `currentsong.txt was not found at:\n${currentSongPath}\n\nIn Clone Hero, open Settings -> General, enable Export Current Song, start any song once, and set [clonehero] folder in settings.ini to the folder that contains currentsong.txt.`
        );
    }
    log("info", `File located at ${currentSongPath}`);

    const { OBSWebSocket } = require("obs-websocket-js");
    const obs = new OBSWebSocket();

    log("info", `Connecting to OBS at ${settings.obsAddress}...`);
    try {
        const connectionInfo = await obs.connect(
            settings.obsAddress,
            settings.obsPassword
        );
        log(
            "info",
            `Connected to OBS WebSocket ${connectionInfo.obsWebSocketVersion || "5.x"}`
        );
    } catch (error) {
        const details = error?.message || String(error);
        throw new Error(
            `Could not connect to OBS at ${settings.obsAddress}: ${details}\n\nCheck all of the following:\n  1. OBS is open.\n  2. Tools -> WebSocket Server Settings -> Enable WebSocket server is checked.\n  3. The port is 4455.\n  4. The password in settings.ini exactly matches OBS.\n  5. Click Apply and OK in OBS after changing WebSocket settings.`
        );
    }

    const sceneList = await obs.call("GetSceneList");
    const sceneNames = new Set(sceneList.scenes.map((scene) => scene.sceneName));

    for (const sceneName of [settings.sceneMenu, settings.sceneGameplay]) {
        if (!sceneNames.has(sceneName)) {
            throw new Error(
                `OBS scene not found: "${sceneName}"\n\nThe scene name in settings.ini must match exactly, including spaces and capitalization.\n\nScenes currently available in OBS:\n${formatSceneList(sceneNames)}`
            );
        }
    }

    let lastInSongState = null;
    let updateChain = Promise.resolve();

    async function updateScene(force = false) {
        const songText = fs.readFileSync(currentSongPath, "utf8").trim();
        const inSong = songText.length > 0;

        if (!force && inSong === lastInSongState) {
            return;
        }

        lastInSongState = inSong;
        const targetScene = inSong
            ? settings.sceneGameplay
            : settings.sceneMenu;

        const currentScene = await obs.call("GetCurrentProgramScene");
        if (currentScene.currentProgramSceneName === targetScene) {
            log("info", `OBS is already on scene: ${targetScene}`);
            return;
        }

        await obs.call("SetCurrentProgramScene", {
            sceneName: targetScene,
        });
        log(
            "info",
            `${inSong ? "Song detected" : "No active song"}; switched OBS to: ${targetScene}`
        );
    }

    function queueUpdate(force = false) {
        updateChain = updateChain
            .then(() => updateScene(force))
            .catch((error) => {
                log("error", error?.message || String(error));
            });
    }

    obs.on("ConnectionClosed", () => {
        log(
            "error",
            "The OBS WebSocket connection closed. Close this window, reopen OBS, and run setup_and_run.cmd again."
        );
    });

    fs.watchFile(currentSongPath, { interval: watchIntervalMs }, () => {
        queueUpdate(false);
    });

    await updateScene(true);
    log("info", `Watching ${currentSongPath}`);
    log("info", "Setup is complete. Leave this window open while using Clone Hero and OBS.");

    process.on("SIGINT", async () => {
        fs.unwatchFile(currentSongPath);
        try {
            await obs.disconnect();
        } catch (_) {
            // OBS may already be closed.
        }
        process.exit(0);
    });
}

main().catch((error) => {
    log("error", error?.message || String(error));
    console.log("");
    console.log("Review README.txt, correct settings.ini, and run setup_and_run.cmd again.");
    process.exitCode = 1;
});
