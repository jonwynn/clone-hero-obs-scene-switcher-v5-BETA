"use strict";

const { execFile: execute_file } = require("node:child_process");

function create_game_probe({
    platform = process.platform,
    exec_file = execute_file,
    interval_ms = 2000,
    on_diagnostic = () => {},
} = {}) {
    let last_checked_at = 0;
    let last_result = null;
    let pending_probe = null;
    let last_diagnostic = "";

    function handle_diagnostic(message) {
        if (message !== last_diagnostic) {
            last_diagnostic = message;
            try {
                on_diagnostic(message);
            } catch {
                // Diagnostic consumers must not interrupt the process probe.
            }
        }
    }

    return async function is_game_running() {
        if (platform !== "win32") {
            handle_diagnostic(
                "Clone Hero process detection is available on Windows only.",
            );
            return null;
        }
        if (pending_probe) {
            return pending_probe;
        }
        if (Date.now() - last_checked_at < interval_ms) {
            return last_result;
        }
        pending_probe = new Promise((resolve) => {
            try {
                exec_file(
                    "tasklist.exe",
                    ["/FO", "CSV", "/NH"],
                    {
                        windowsHide: true,
                        timeout: 5000,
                        maxBuffer: 2 * 1024 * 1024,
                    },
                    (error, stdout) => {
                        if (
                            error ||
                            !/^"[^"\r\n]+"\s*,\s*"\d+"/m.test(stdout)
                        ) {
                            handle_diagnostic(
                                "Unable to detect the Clone Hero process; using currentsong.txt until process detection recovers.",
                            );
                            resolve(null);
                            return;
                        }
                        handle_diagnostic("");
                        resolve(/^"Clone ?Hero\.exe"\s*,/im.test(stdout));
                    },
                );
            } catch {
                handle_diagnostic(
                    "Unable to launch process detection; using currentsong.txt until process detection recovers.",
                );
                resolve(null);
            }
        });
        try {
            last_result = await pending_probe;
            last_checked_at = Date.now();
            return last_result;
        } finally {
            pending_probe = null;
        }
    };
}

module.exports = { create_game_probe };
