"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { load_song_snapshot } = require("../src/song-file");

test("song snapshot rejects a write or replacement occurring during the read", async () => {
    for (const after of [
        { mtimeMs: 2, size: 4, ino: 10 },
        { mtimeMs: 1, size: 5, ino: 10 },
        { mtimeMs: 1, size: 4, ino: 11 },
    ]) {
        let reads = 0;
        await assert.rejects(
            load_song_snapshot("test-folder", {
                stat: async () =>
                    ++reads === 1 ? { mtimeMs: 1, size: 4, ino: 10 } : after,
                readFile: async () => "Song",
            }),
            { code: "EAGAIN" },
        );
    }
});

test("song snapshot distinguishes a fresh same-song rewrite", async () => {
    let timestamp = 1;
    const file_system = {
        stat: async () => ({ mtimeMs: timestamp, size: 4, ino: 10 }),
        readFile: async () => "Song",
    };
    const first = await load_song_snapshot("test-folder", file_system);
    timestamp = 2;
    const second = await load_song_snapshot("test-folder", file_system);
    assert.equal(first.text, second.text);
    assert.notEqual(first.version, second.version);
});
