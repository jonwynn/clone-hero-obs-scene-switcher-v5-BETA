"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

async function load_song_snapshot(folder, file_system = fs) {
    const song_path = path.join(folder, "currentsong.txt");
    const before = await file_system.stat(song_path);
    const text = await file_system.readFile(song_path, "utf8");
    const after = await file_system.stat(song_path);
    if (
        before.mtimeMs !== after.mtimeMs ||
        before.size !== after.size ||
        before.ino !== after.ino
    ) {
        const error = new Error(
            "The song export changed while it was being read.",
        );
        error.code = "EAGAIN";
        throw error;
    }
    return { text, version: `${after.ino}:${after.mtimeMs}:${after.size}` };
}

module.exports = { load_song_snapshot };
