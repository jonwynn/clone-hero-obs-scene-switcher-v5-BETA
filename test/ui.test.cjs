"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { _electron: electron, expect } = require("@playwright/test");

test(
    "desktop setup, presets, recovery controls, drafts, and saved settings",
    { timeout: 120000 },
    async (test_context) => {
        const project_directory = path.resolve(__dirname, "..");
        const data_directory = fs.mkdtempSync(
            path.join(os.tmpdir(), "clone-hero-ui-"),
        );
        const game_directory = path.join(data_directory, "game-data");
        fs.mkdirSync(game_directory);
        const environment = {
            ...process.env,
            SCENE_SWITCHER_DATA_DIRECTORY: data_directory,
        };
        delete environment.ELECTRON_RUN_AS_NODE;
        let application;
        const page_errors = [];

        test_context.after(async () => {
            if (application) {
                await application.close();
            }
            assert.equal(
                path.dirname(data_directory),
                path.resolve(os.tmpdir()),
            );
            assert.ok(
                path.basename(data_directory).startsWith("clone-hero-ui-"),
            );
            fs.rmSync(data_directory, {
                recursive: true,
                force: true,
                maxRetries: 5,
                retryDelay: 200,
            });
        });

        async function load_window() {
            application = await electron.launch({
                args: [
                    process.env.SCENE_SWITCHER_APP_PATH || project_directory,
                ],
                env: environment,
            });
            const page = await application.firstWindow();
            page.on("pageerror", (error) => page_errors.push(error.message));
            await expect(page.locator("#save_profile")).toBeEnabled();
            return page;
        }

        let page = await load_window();
        assert.equal(
            await page
                .locator(".brand-mark")
                .evaluate((icon) => icon.complete && icon.naturalWidth > 0),
            true,
        );
        await expect(page.locator("h1")).toHaveText(
            "Clone Hero Scene Switcher",
        );
        assert.equal(await page.evaluate(() => typeof require), "undefined");
        await expect(page.locator("#active_profile_label")).toHaveText(
            "No active preset",
        );
        await page.locator("#toggle_running").click();
        await expect(page.locator("#feedback")).toContainText(
            "Save the connection",
        );

        await page.locator("#obs_address").fill("https://127.0.0.1:1");
        await page.locator("#clone_hero_folder").fill(game_directory);
        await page.locator("#save_connection").click();
        await expect(page.locator("#feedback")).toContainText(
            "ws:// or wss://",
        );
        await page.locator("#obs_address").fill("ws://127.0.0.1:1");
        await page.locator("#obs_password").fill("ui-test-password");
        await page.locator("#toggle_password").click();
        await expect(page.locator("#obs_password")).toHaveAttribute(
            "type",
            "text",
        );
        await page.locator("#toggle_password").click();
        await expect(page.locator("#obs_password")).toHaveAttribute(
            "type",
            "password",
        );
        await page.locator("#save_connection").click();
        await expect(page.locator("#feedback")).toHaveText(
            "Connection settings saved.",
        );

        await page.locator("#profile_name").fill("Single player");
        await page.locator("#scene_menu").fill("Song selection");
        await page.locator("#scene_gameplay").fill("Song selection");
        await page.locator("#save_profile").click();
        await expect(page.locator("#feedback")).toContainText(
            "two different OBS scenes",
        );
        await page.locator("#scene_gameplay").fill("Solo gameplay");
        await page.locator("#save_profile").click();
        await expect(page.locator("#active_profile_label")).toHaveText(
            "Active preset: Single player",
        );
        await expect(page.locator("#running_status")).toHaveText("Running");
        await expect(page.locator("#obs_status")).toHaveText("Waiting for OBS");
        const solo_id = await page.locator("#profile_select").inputValue();

        await page.locator("#obs_address").fill("ws://127.0.0.1:2");
        await page.locator("#new_profile").click();
        await page.locator("#profile_name").fill("Multiplayer");
        await page.locator("#scene_menu").fill("Multiplayer lobby");
        await page.locator("#scene_gameplay").fill("Multiplayer gameplay");
        await page.locator("#save_profile").click();
        await expect(page.locator("#active_profile_label")).toHaveText(
            "Active preset: Multiplayer",
        );
        await expect(page.locator("#obs_address")).toHaveValue(
            "ws://127.0.0.1:2",
        );
        await expect(page.locator("#connection_dirty")).toBeVisible();
        const multiplayer_id = await page
            .locator("#profile_select")
            .inputValue();

        await page.locator("#profile_name").fill("Unsaved multiplayer draft");
        await application.evaluate(({ BrowserWindow: browser_window }) => {
            browser_window
                .getAllWindows()[0]
                .webContents.send("switcher-status", {
                    running: true,
                    obs_state: "disconnected",
                    game_state: "waiting",
                    message:
                        "Waiting for OBS and Clone Hero; the switcher will retry.",
                    scene_names: ["Song selection", "Solo gameplay"],
                    current_scene: "",
                });
        });
        await expect(page.locator("#status_message")).toContainText(
            "the switcher will retry",
        );
        await expect(page.locator("#profile_name")).toHaveValue(
            "Unsaved multiplayer draft",
        );
        await expect(page.locator("#obs_address")).toHaveValue(
            "ws://127.0.0.1:2",
        );
        await expect(page.locator("#scene_names option")).toHaveCount(2);

        await page.locator("#profile_select").selectOption(solo_id);
        await expect(page.locator("#confirmation_dialog")).toBeVisible();
        await page.locator("#cancel_confirmation").click();
        await expect(page.locator("#profile_name")).toHaveValue(
            "Unsaved multiplayer draft",
        );
        await expect(page.locator("#profile_select")).toHaveValue(
            multiplayer_id,
        );
        await page.locator("#profile_select").selectOption(solo_id);
        await page.locator("#accept_confirmation").click();
        await expect(page.locator("#profile_name")).toHaveValue(
            "Single player",
        );
        await expect(page.locator("#active_profile_label")).toHaveText(
            "Active preset: Multiplayer",
        );
        await page.locator("#activate_profile").click();
        await expect(page.locator("#active_profile_label")).toHaveText(
            "Active preset: Single player",
        );

        await page
            .locator("#profile_name")
            .fill("Draft kept while saving connection");
        await page.locator("#obs_address").fill("ws://127.0.0.1:1");
        await page.locator("#save_connection").click();
        await expect(page.locator("#feedback")).toHaveText(
            "Connection settings saved.",
        );
        await expect(page.locator("#profile_name")).toHaveValue(
            "Draft kept while saving connection",
        );
        await page.locator("#new_profile").click();
        await page.locator("#cancel_confirmation").click();
        await expect(page.locator("#profile_name")).toHaveValue(
            "Draft kept while saving connection",
        );
        await page.locator("#new_profile").click();
        await page.locator("#accept_confirmation").click();
        await expect(page.locator("#profile_name")).toHaveValue("");
        await page.locator("#profile_name").fill("Single player");
        await page.locator("#scene_menu").fill("Duplicate menu");
        await page.locator("#scene_gameplay").fill("Duplicate gameplay");
        await page.locator("#save_profile").click();
        await expect(page.locator("#feedback")).toContainText("already exists");
        await page.locator("#profile_select").selectOption(multiplayer_id);
        await page.locator("#accept_confirmation").click();
        await page.locator("#activate_profile").click();
        await expect(page.locator("#active_profile_label")).toHaveText(
            "Active preset: Multiplayer",
        );

        await page.locator("#toggle_running").click();
        await expect(page.locator("#running_status")).toHaveText("Paused");
        await page.locator("#toggle_running").click();
        await expect(page.locator("#running_status")).toHaveText("Running");

        const settings_text = fs.readFileSync(
            path.join(data_directory, "settings.json"),
            "utf8",
        );
        assert.equal(settings_text.includes("ui-test-password"), false);
        assert.equal(JSON.parse(settings_text).profiles.length, 2);
        await application.close();
        application = null;
        page = await load_window();
        await expect(page.locator("#active_profile_label")).toHaveText(
            "Active preset: Multiplayer",
        );
        await expect(page.locator("#profile_name")).toHaveValue("Multiplayer");
        await expect(page.locator("#scene_gameplay")).toHaveValue(
            "Multiplayer gameplay",
        );
        await expect(page.locator("#obs_password")).toHaveValue(
            "ui-test-password",
        );
        await expect(page.locator("#running_status")).toHaveText("Running");

        await application.evaluate(({ BrowserWindow: browser_window }) => {
            browser_window.getAllWindows()[0].setSize(1050, 800);
        });
        fs.mkdirSync(path.join(project_directory, "test-results"), {
            recursive: true,
        });
        await expect(page.locator("#obs_status")).toHaveText("Waiting for OBS");
        await page.screenshot({
            path: path.join(
                project_directory,
                "test-results",
                "application.png",
            ),
            fullPage: true,
            animations: "disabled",
        });
        assert.equal(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
            true,
        );
        await application.evaluate(({ BrowserWindow: browser_window }) => {
            browser_window.getAllWindows()[0].setSize(850, 650);
        });
        assert.equal(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
            true,
        );

        await page.locator("#delete_profile").click();
        await page.locator("#cancel_confirmation").click();
        await expect(page.locator("#profile_select option")).toHaveCount(2);
        await page.locator("#delete_profile").click();
        await page.locator("#accept_confirmation").click();
        await expect(page.locator("#active_profile_label")).toHaveText(
            "Active preset: Single player",
        );
        await page.locator("#delete_profile").click();
        await expect(page.locator("#confirmation_message")).toContainText(
            "Switching will pause",
        );
        await page.locator("#accept_confirmation").click();
        await expect(page.locator("#active_profile_label")).toHaveText(
            "No active preset",
        );
        await expect(page.locator("#running_status")).toHaveText("Paused");
        assert.deepEqual(page_errors, []);
    },
);
