# Clone Hero Scene Switcher

A Windows desktop application that switches OBS between your menu and gameplay scenes while you play Clone Hero. Enter any two existing OBS scene names, save them as a preset, and switch between single-player and multiplayer setups without editing a configuration file.

Version 3.0.0 replaces the normal batch-file workflow with a desktop interface, an installer, and a portable executable. The downloaded application includes its runtime; you do not need Node.js or a terminal window to use it.

## Install

Requirements: 64-bit Windows 10 or Windows 11, Clone Hero, and OBS Studio with WebSocket 5 support. OBS Studio 28 and newer include the WebSocket server. See the [OBS WebSocket documentation](https://github.com/obsproject/obs-websocket/blob/master/README.md).

Download the Windows artifact from a successful [Build Windows application run](https://github.com/jonwynn/clone-hero-obs-scene-switcher-v5-BETA/actions/workflows/build-windows.yml), then extract the downloaded ZIP. GitHub may require you to sign in to download build artifacts.

- **Install:** Open `Clone-Hero-Scene-Switcher-Setup-3.0.0-x64.exe`. Follow the installer, choose a folder in your Windows account, and launch **Clone Hero Scene Switcher** from the desktop or Start menu. The installer also adds a Windows uninstaller.
- **Portable:** Open `Clone-Hero-Scene-Switcher-Portable-3.0.0-x64.exe`. It runs without installation. Settings are still stored in your Windows account, so the portable executable does not carry passwords or presets between computers.

These builds are unsigned. Windows may show an unknown-publisher or SmartScreen prompt when opening them. The installer and portable application work offline after downloading; the switcher only needs access to OBS and the local Clone Hero export file.

## First setup

1. In OBS, identify two scenes in the active **Scene Collection**: one for menus and one for gameplay. Scene names can be anything, but must match OBS exactly, including capitalization, spaces, and punctuation.
2. In OBS, open **Tools > WebSocket Server Settings**. Enable the server and authentication, apply the settings, and copy the password from the connection information. The default port is `4455`.
3. In Clone Hero, enable **Settings > General > Export Current Song**, then start a song once to create `currentsong.txt`. This is the export supported by the [Clone Hero guide](https://wiki.clonehero.net/books/guides-and-tutorials/page/general-guides).
4. Open **Clone Hero Scene Switcher**. Enter `ws://127.0.0.1:4455` in **OBS WebSocket address** for OBS on the same computer and paste the **WebSocket password**.
5. Beside **Clone Hero data folder**, click **Browse** and select the folder containing `currentsong.txt`. Common places to check are `Documents\Clone Hero`, `OneDrive\Documents\Clone Hero`, and the `PlayerData` folder of a portable Clone Hero installation.
6. Click **Save connection**. Enter a **Preset name** such as **Single Player**, enter the exact **Menu scene** and **Gameplay scene** names, then click **Save preset**. Saving also activates the preset.
7. Confirm that the application shows OBS connected. Start a song and check that OBS uses the gameplay scene; finish or quit the song and check that it returns to the menu scene. Use **Start switching** if switching is paused.

The switcher changes the live **Program** scene in OBS, including when Studio Mode is enabled. Use a recording or a non-live OBS session for the first test.

## Presets and daily use

Each preset stores a name, a menu scene, and a gameplay scene. OBS connection settings and the Clone Hero folder are shared by all presets.

For example, keep **Single Player** with `Clone Hero - Menus` and `Clone Hero - Solo`. Click **+ New preset** and save **Multiplayer** with `Clone Hero - Menus` and `Clone Hero - Multiplayer`. Choose a **Saved preset** and click **Activate** when you want to change setups. Activation applies the scene pair to the current song state without restarting. Changes typed into a preset are only applied after **Save preset**. Use **Delete preset** to remove an unwanted preset.

Once settings are configured, switching starts automatically when you open the application. OBS, Clone Hero, and the switcher can start in any order. Use **Pause switching** to temporarily stop automation and **Start switching** to resume it. Minimize the switcher to keep it running while you play. Closing its window exits the application and stops scene switching.

The application runs independently of the game and OBS:

- If OBS closes or its WebSocket connection drops, the switcher stays open and retries the connection automatically. Reopening OBS resumes switching with the active preset.
- If Clone Hero closes, the switcher stays open and uses the menu scene when OBS is available. A leftover song export does not immediately trigger gameplay again after a detected game shutdown; the switcher waits for the export to refresh.
- A missing or temporarily unreadable export file shows a waiting status and is retried. Correcting the folder or allowing Clone Hero to recreate the file does not require an application restart.
- A missing scene is shown in the application. Restore the scene, select the correct OBS Scene Collection, or save the correct scene names. **Refresh scenes** reloads the scene list from OBS.

The application reads the Clone Hero export; it does not modify game files or create OBS scenes. The export reports whether a song is active, so pausing a song can leave the gameplay scene active. Game-process detection runs on the computer running the switcher; run it on the Clone Hero computer.

## Settings and troubleshooting

Settings and presets are saved in `%APPDATA%\Clone Hero Scene Switcher\settings.json`, separately from the installation folder. The OBS password is encrypted with Electron's Windows account protection before it is saved. Re-enter the password if you move settings to another Windows account. Uninstalling leaves saved settings available for a later reinstall. **Open logs** opens the application's diagnostic logs; the log file is `%APPDATA%\Clone Hero Scene Switcher\switcher.log`.

| Status or symptom                    | What to check                                                                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Waiting for OBS                      | Open OBS, enable its WebSocket server, and check the address and port. For the same computer, use `ws://127.0.0.1:4455`.                         |
| Authentication failed                | Copy the current password from OBS, enter it in the application, and click **Save connection** again.                                            |
| Scene missing                        | Check exact scene names and the active OBS Scene Collection. Enter scene names from the Scenes panel, not source names.                          |
| Waiting for song export              | Enable Export Current Song, play a song once, and select the folder containing the generated `currentsong.txt`.                                  |
| Gameplay scene stays active          | Check whether `currentsong.txt` actually clears when leaving the song. A paused song may still be active in the export.                          |
| Old export after restarting the game | Play and leave a song so Clone Hero refreshes its export. Check that the selected folder belongs to the running installation.                    |
| OBS on another computer              | Use that computer's local network address and WebSocket port. Keep authentication enabled and allow the connection on the trusted local network. |

If you used version 2.1, enter its connection values and scenes in the new interface once. The desktop application does not load `settings.ini`. The source repository retains the old script for compatibility; it is excluded from the Windows installer and portable application.

## Build from source

Development requires Windows x64 and Node.js 24 with npm. Open **PowerShell** in the repository folder. These are CPU and disk tasks; none uses GPU acceleration. Estimates below assume a modern desktop with NVMe storage. The first dependency install and first package build download the Electron runtime and packaging tools, so network speed, antivirus scanning, cached downloads, and background load can widen the ranges.

**PowerShell — install the locked dependencies, approximately 1–5 minutes:**

```powershell
npm ci
```

**PowerShell — open the development application, approximately 2–10 seconds; it remains running until you close it:**

```powershell
npm start
```

**PowerShell — check formatting and lint, approximately 5–30 seconds:**

```powershell
npm run check
```

**PowerShell — run automated settings and switching tests, approximately 5–30 seconds:**

```powershell
npm test
```

**PowerShell — run desktop interface tests, approximately 10–60 seconds:**

```powershell
npm run test:ui
```

**PowerShell — build the Windows installer and portable application, approximately 1–5 minutes after dependencies are installed:**

```powershell
npm run dist -- --publish never
```

The two executables are written to `dist`. The installer uses the assisted [electron-builder NSIS installer](https://www.electron.build/nsis/) with a current-user installation, folder selection, shortcuts, and an uninstaller. Runtime packaging uses an explicit application-file list and excludes local `settings.ini`, saved settings, tests, and development scripts. Production dependencies and the Electron runtime are included automatically.

For compatibility testing of the old terminal script, configure a private `settings.ini` from `settings.example.ini` first. **PowerShell — run the legacy script, approximately 2–10 seconds to start; it remains running until stopped and does not use GPU acceleration:**

```powershell
npm run start:legacy
```

The Windows GitHub Actions workflow runs the checks and tests, builds both executables, and uploads them with SHA-256 checksums. It runs for pushes and pull requests targeting `main`, and can also be started manually. It does not publish a GitHub release or require a signing certificate. Build artifacts expire after 30 days; rerun the workflow to produce a fresh download.

## Verify with Clone Hero and OBS

Automated tests use controlled song-file and OBS responses. Actual game and streaming behavior must also be checked on the intended computer:

1. Install the application, launch it from a shortcut, and confirm that no terminal is required.
2. Save arbitrary scene names, restart the switcher, and confirm settings persist.
3. Play, finish, and quit songs. Check menu/gameplay switching and confirm the expected behavior when pausing a song.
4. Save single-player and multiplayer presets. Change the active preset in a menu and during a song, then restart the app to confirm the active preset persists.
5. Close and reopen OBS while the switcher remains open. Confirm it reconnects and uses the appropriate scene.
6. Close and reopen Clone Hero during a song. Confirm the switcher stays open, uses the menu scene after game exit, and resumes after a fresh export.
7. Start the switcher before both other applications. Test a missing export, wrong password, renamed scene, and changed OBS Scene Collection; correct each condition and confirm recovery.
8. Minimize and restore the switcher, then close it and confirm switching stops. Uninstall and reinstall to confirm saved presets remain available.

## Attribution

Concept based on [jorgeramon/clone-hero-obs-scene-switcher](https://github.com/jorgeramon/clone-hero-obs-scene-switcher). The original project's package metadata identifies it as ISC-licensed. See [ATTRIBUTION.txt](ATTRIBUTION.txt) for the preserved attribution and [CHANGELOG.txt](CHANGELOG.txt) for revision history.
