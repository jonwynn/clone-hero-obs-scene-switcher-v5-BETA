CLONE HERO SCENE SWITCHER 3.0.0
===============================

The Windows desktop application switches OBS between a menu scene and a
gameplay scene using Clone Hero's currentsong.txt export. It supports saved
scene presets and reconnects when OBS restarts.

INSTALL AND OPEN
---------------
Download and extract the Windows build artifact from:
https://github.com/jonwynn/clone-hero-obs-scene-switcher-v5-BETA/actions/workflows/build-windows.yml

Open Clone-Hero-Scene-Switcher-Setup-3.0.0-x64.exe to install the application.
Launch it from its desktop or Start menu shortcut. To run without installing,
open Clone-Hero-Scene-Switcher-Portable-3.0.0-x64.exe instead.

Both downloads include the runtime. Node.js and a terminal window are not
required for normal use. Builds are unsigned, so Windows may show an
unknown-publisher or SmartScreen prompt.

SETUP
-----
1. In OBS, create or identify the two scenes you want to use.
2. Enable Tools > WebSocket Server Settings. Enable authentication, apply
   the settings, and copy the connection password. The default port is 4455.
3. In Clone Hero, enable Settings > General > Export Current Song.
   Start a song once to create currentsong.txt.
4. Open the switcher and enter the OBS WebSocket address and password.
   On the same computer, use ws://127.0.0.1:4455.
5. Beside Clone Hero data folder, click Browse and select the folder
   containing currentsong.txt. Click Save connection.
6. Enter a Preset name and the exact Menu scene and Gameplay scene names.
   Click Save preset to save and activate that scene combination.
7. Play a song, then return to a menu to check that both scenes are selected.
   Use Start switching if switching is paused.

DAILY USE
---------
Use + New preset to create presets such as Single Player and Multiplayer.
Select a Saved preset and click Activate to apply its scenes immediately.

After setup, switching starts when you open the application. The game, OBS,
and the switcher can start in any order. Minimize the switcher while playing;
closing its window exits and stops switching. Pause switching temporarily
stops automation; Start switching resumes it.

The switcher stays open if OBS or Clone Hero closes. It reconnects to OBS
automatically and waits for the game or export file to become available.
After detecting a game shutdown, it waits for a refreshed export before
using a leftover gameplay state again.

Settings and presets are saved at:
%APPDATA%\Clone Hero Scene Switcher\settings.json

The saved OBS password is encrypted for your Windows account. Uninstalling
preserves saved settings. Open logs opens diagnostic logs. The desktop
application does not read the old settings.ini; enter those values in the
interface once when upgrading.

Read README.md for full setup, troubleshooting, build instructions, and the
manual Clone Hero/OBS verification checklist. Read QUICK_START.txt for a
short first-run checklist. Original-project attribution is in ATTRIBUTION.txt.
