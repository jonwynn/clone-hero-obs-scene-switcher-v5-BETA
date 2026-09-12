"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { create_game_probe } = require("../src/game-process");

test("Windows process detection recognizes both Clone Hero executable names", async () => {
    for (const process_name of [
        "Clone Hero.exe",
        "CloneHero.exe",
        "CLONE HERO.EXE",
    ]) {
        const probe = create_game_probe({
            platform: "win32",
            exec_file: (file, args, options, callback) => {
                assert.equal(file, "tasklist.exe");
                assert.deepEqual(args, ["/FO", "CSV", "/NH"]);
                assert.equal(options.windowsHide, true);
                assert.equal(options.timeout, 5000);
                callback(
                    null,
                    `"${process_name}","1234","Console","1","100 K"\r\n`,
                );
            },
        });
        assert.equal(await probe(), true);
    }
});

test("process detection does not match other executables", async () => {
    const probe = create_game_probe({
        platform: "win32",
        exec_file: (file, args, options, callback) =>
            callback(
                null,
                '"OBS.exe","1234"\r\n"Not Clone Hero.exe","4567"\r\n',
            ),
    });
    assert.equal(await probe(), false);
});

test("concurrent calls share one process probe and cached result", async () => {
    let callback;
    let calls = 0;
    const probe = create_game_probe({
        platform: "win32",
        exec_file: (file, args, options, complete) => {
            calls += 1;
            callback = complete;
        },
    });
    const first_probe = probe();
    const second_probe = probe();
    callback(null, '"Clone Hero.exe","1234"');
    assert.deepEqual(await Promise.all([first_probe, second_probe]), [
        true,
        true,
    ]);
    assert.equal(await probe(), true);
    assert.equal(calls, 1);
});

test("failed probes return unknown with a diagnostic and recover on retry", async () => {
    let fail_probe = true;
    const diagnostics = [];
    const probe = create_game_probe({
        platform: "win32",
        interval_ms: 0,
        on_diagnostic: (message) => diagnostics.push(message),
        exec_file: (file, args, options, callback) => {
            callback(
                fail_probe ? new Error("Access denied") : null,
                '"CloneHero.exe","1234"',
            );
        },
    });
    assert.equal(await probe(), null);
    assert.match(diagnostics[0], /Unable to detect/);
    fail_probe = false;
    assert.equal(await probe(), true);
    assert.equal(diagnostics[1], "");
});

test("unsupported platforms use export-only detection without spawning a command", async () => {
    const diagnostics = [];
    const probe = create_game_probe({
        platform: "linux",
        on_diagnostic: (message) => diagnostics.push(message),
        exec_file: () =>
            assert.fail("Must not invoke Windows tasklist on another platform"),
    });
    assert.equal(await probe(), null);
    assert.equal(await probe(), null);
    assert.equal(diagnostics.length, 1);
});

test("invalid command output is unknown instead of falsely reporting a game exit", async () => {
    const probe = create_game_probe({
        platform: "win32",
        exec_file: (file, args, options, callback) =>
            callback(null, "ERROR: Unable to query processes."),
    });
    assert.equal(await probe(), null);
});

test("process-spawn failures and diagnostic failures cannot crash polling", async () => {
    const probe = create_game_probe({
        platform: "win32",
        exec_file: () => {
            throw new Error("Spawn failed");
        },
        on_diagnostic: () => {
            throw new Error("UI closed");
        },
    });
    assert.equal(await probe(), null);
});
