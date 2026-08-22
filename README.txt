CLONE HERO OBS SCENE SWITCHER - OBS WEBSOCKET 5.x
=================================================

PURPOSE
-------
This utility automatically switches OBS between two scenes:

1. A menu/not-in-song scene when Clone Hero is not actively playing a song.
2. A gameplay/in-song scene when a Clone Hero song is active.

It watches Clone Hero's currentsong.txt file. When the file contains song
information, the gameplay scene is selected. When the file becomes empty,
the menu scene is selected.

This package is designed for Windows 10 or Windows 11, OBS Studio 28 or
newer, and a current Windows version of Clone Hero.


IMPORTANT SECURITY NOTE
-----------------------
The file settings.ini stores the OBS WebSocket password in plain text.

- Keep the configured settings.ini private.
- Do not upload or send a configured settings.ini to other people.
- To share this utility, share the original template package with placeholders.
- If a password is accidentally shared, generate a new password in OBS under:
  Tools -> WebSocket Server Settings


WHAT IS INCLUDED
----------------
- index.js              Main scene-switching program
- setup_and_run.cmd     Installs the dependency and starts the program
- OPEN_SETTINGS.cmd     Opens settings.ini in Notepad
- settings.ini          File that must be configured before first use
- settings.example.ini  Example configuration with fake values
- package.json          Node.js dependency information
- QUICK_START.txt       Short setup checklist
- README.txt            This complete guide
- CHANGELOG.txt         Summary of changes in this shareable release
- ATTRIBUTION.txt       Original-project attribution

Do not rename, move, or delete individual files inside the folder after setup.
The entire folder can be moved as a unit.


REQUIREMENTS
------------
Before starting, confirm that the computer has:

1. Windows 10 or Windows 11, 64-bit.
2. Clone Hero installed and working.
3. OBS Studio 28 or newer.
4. Two OBS scenes: one for menus and one for gameplay.
5. Node.js LTS installed.
6. An internet connection for the first run only, so npm can install one
   required JavaScript package.

OBS Studio 28 and newer include OBS WebSocket 5.x automatically. Do not
install the obsolete OBS WebSocket 4.x plugin for this utility.


PART 1 - EXTRACT THE PACKAGE
----------------------------
1. Locate the downloaded ZIP file in File Explorer.
2. Right-click the ZIP file.
3. Click "Extract All...".
4. Choose a normal writable folder, such as:

   C:\Tools\Clone Hero OBS Scene Switcher

   or:

   C:\Users\YOUR_WINDOWS_NAME\Documents\Clone Hero OBS Scene Switcher

5. Click "Extract".
6. Open the extracted folder.

Do not run setup_and_run.cmd while viewing files inside the ZIP. The files
must be extracted first.

Avoid placing the utility inside C:\Program Files because Windows may block
npm from creating the node_modules folder there.


PART 2 - CREATE OR IDENTIFY THE TWO OBS SCENES
----------------------------------------------
The utility needs the exact names of two existing OBS scenes.

A. Menu/not-in-song scene
   This scene is displayed while browsing songs, changing settings, viewing
   results, or otherwise not actively playing a song.

B. Gameplay/in-song scene
   This scene is displayed while a song is active.

To create a scene in OBS:

1. Open OBS Studio.
2. Find the "Scenes" panel, normally in the lower-left corner.
3. Click the + button under the Scenes panel.
4. Click "Add Scene" if OBS asks what to create.
5. Enter a clear name, for example:

   Clone Hero - Menus

6. Click OK.
7. Repeat the process for the gameplay scene, for example:

   Clone Hero - Gameplay

8. Add the desired camera, game capture, overlays, and audio sources to each
   scene before testing the switcher.

The scene names may be anything. However, the names typed into settings.ini
must match OBS exactly, including:

- Capitalization
- Spaces
- Hyphens
- Punctuation

To copy a scene name accurately:

1. Right-click the scene in OBS.
2. Click "Rename".
3. Press Ctrl+A, then Ctrl+C to copy the complete name.
4. Press Escape to cancel renaming without changing it.
5. Paste the copied name into settings.ini later.

Do not use the same scene name for both settings.


PART 3 - ENABLE THE OBS WEBSOCKET SERVER
----------------------------------------
1. Keep OBS Studio open.
2. At the top of OBS, click "Tools".
3. Click "WebSocket Server Settings".

If "WebSocket Server Settings" is missing, the OBS version is probably older
than version 28. Update OBS from the official OBS website before continuing.

4. Check "Enable WebSocket server".
5. Set "Server Port" to:

   4455

6. Check "Enable Authentication".
7. Click "Generate Password" if a password is not already present.
8. Click "Apply".
9. Click "Show Connect Info".
10. Use the copy button beside the password, or carefully copy the complete
    password.
11. Paste the password temporarily into Notepad so it is not lost.
12. Click OK to close the connection-information window.
13. Click OK to close WebSocket Server Settings.

Keep the password private. Anyone with network access and the password may be
able to control OBS remotely.

When OBS and this switcher run on the same computer, the correct address is:

   ws://127.0.0.1:4455

Leave that address unchanged in settings.ini.


PART 4 - ENABLE EXPORT CURRENT SONG IN CLONE HERO
-------------------------------------------------
1. Open Clone Hero.
2. Open "Settings".
3. Open "General".
4. Find "Export Current Song".
5. Set "Export Current Song" to Enabled/On.
6. Return to the song list.
7. Start any song.
8. Allow the song to begin, then quit or finish it.

Clone Hero creates currentsong.txt after a song starts for the first time.
The scene switcher cannot work until this file exists.


PART 5 - FIND THE FOLDER THAT CONTAINS CURRENTSONG.TXT
------------------------------------------------------
The value entered into settings.ini must be the folder containing
currentsong.txt, not the path to currentsong.txt itself.

Common locations for a normal Windows installation are:

   C:\Users\YOUR_WINDOWS_NAME\Documents\Clone Hero

or, when Documents is synchronized by OneDrive:

   C:\Users\YOUR_WINDOWS_NAME\OneDrive\Documents\Clone Hero

For a portable Clone Hero installation, currentsong.txt is normally inside
the PlayerData folder within the portable Clone Hero installation.

Easiest method:

1. Open File Explorer.
2. Click "Documents" in the left sidebar.
3. Open the "Clone Hero" folder.
4. Look for currentsong.txt.

If it is not there:

1. Check OneDrive -> Documents -> Clone Hero.
2. Check the PlayerData folder for a portable install.
3. In File Explorer, click "This PC".
4. Type currentsong.txt into the search box in the upper-right corner.
5. Wait for the search to finish.
6. Right-click the result and select "Open file location".

After locating the file:

1. Click an empty area of the File Explorer address bar.
2. Press Ctrl+C to copy the folder path.
3. Save that path for the settings.ini step.

Correct example:

   folder=C:\Users\ExampleUser\Documents\Clone Hero

Incorrect example:

   folder=C:\Users\ExampleUser\Documents\Clone Hero\currentsong.txt


PART 6 - INSTALL NODE.JS LTS
----------------------------
Node.js is required to run the scene switcher.

Use the LTS release, not the "Current" release.

Graphical installer method:

1. Open a web browser.
2. Go to:

   https://nodejs.org/en/download

3. Select the current LTS release.
4. Select Windows.
5. Select x64.
6. Download the Windows Installer (.msi).
7. Open the downloaded .msi file.
8. Click Next.
9. Accept the license agreement.
10. Click Next.
11. Keep the default installation folder.
12. On the feature-selection screen, leave these enabled:

    - Node.js runtime
    - npm package manager
    - Add to PATH

13. Continue through the installer.
14. If offered optional tools for native modules, they are not required by
    this utility.
15. Click Install.
16. Approve the Windows administrator prompt.
17. Click Finish.
18. Restart any open Command Prompt or terminal windows.

Verify the installation:

1. Press Windows Key + R.
2. Type:

   cmd

3. Press Enter.
4. Enter:

   node --version

5. Press Enter. A version beginning with v should appear.
6. Enter:

   npm --version

7. Press Enter. An npm version number should appear.
8. Close Command Prompt.

Alternative command-line installation for users familiar with winget:

   winget install --id OpenJS.NodeJS.LTS --exact

After winget finishes, open a new Command Prompt and verify node and npm as
shown above.


PART 7 - CONFIGURE SETTINGS.INI
-------------------------------
The settings.ini inside this scene-switcher folder is separate from Clone
Hero's own settings.ini. Do not paste these sections into Clone Hero's file.

1. In the extracted scene-switcher folder, double-click OPEN_SETTINGS.cmd.
2. Notepad will open the correct settings.ini file.
3. If OPEN_SETTINGS.cmd is blocked, right-click settings.ini, click "Open with",
   and select Notepad.
4. Do not delete the [obs] or [clonehero] headings.
5. Replace each placeholder described below.

A. OBS WebSocket password

Find:

   password=PASTE_OBS_WEBSOCKET_PASSWORD_HERE

Replace only the placeholder with the password copied from OBS. Example:

   password=ExamplePasswordOnly

Do not use the example password. Use the actual password from OBS.

B. Menu/not-in-song scene name

Find:

   scene_menu=PASTE_EXACT_OBS_MENU_SCENE_NAME_HERE

Replace the placeholder with the exact OBS scene name. Example:

   scene_menu=Clone Hero - Menus

C. Gameplay/in-song scene name

Find:

   scene_gameplay=PASTE_EXACT_OBS_GAMEPLAY_SCENE_NAME_HERE

Replace the placeholder with the exact OBS scene name. Example:

   scene_gameplay=Clone Hero - Gameplay

D. Clone Hero folder

Find:

   folder=PASTE_CLONE_HERO_FOLDER_PATH_HERE

Replace the placeholder with the folder containing currentsong.txt. Example:

   folder=C:\Users\ExampleUser\Documents\Clone Hero

A completed settings.ini will resemble this:

   [obs]
   address=ws://127.0.0.1:4455
   password=ExamplePasswordOnly
   scene_menu=Clone Hero - Menus
   scene_gameplay=Clone Hero - Gameplay

   [clonehero]
   folder=C:\Users\ExampleUser\Documents\Clone Hero

6. In Notepad, click File -> Save.
7. Close Notepad.

Do not add quotation marks unless they are already present. Paths containing
spaces work without quotation marks.

The switcher also supports environment variables in the folder path. For a
normal installation, this may work:

   folder=%USERPROFILE%\Documents\Clone Hero

However, use the complete path if Documents is stored in OneDrive or if the
portable installation uses a different location.


PART 8 - FIRST RUN
------------------
Start programs in this order:

1. Open OBS Studio.
2. Confirm that the desired OBS scene collection is loaded.
3. Open Clone Hero.
4. Open the extracted scene-switcher folder.
5. Double-click setup_and_run.cmd.

Do not run setup_and_run.cmd as administrator unless OBS is also running as
administrator. Normally, neither program needs administrator privileges.

On the first run, the command window displays:

   Installing the required OBS WebSocket package...

The first run requires an internet connection and may take up to a minute.
After installation, the window should display messages similar to:

   Connected to OBS WebSocket 5.x
   OBS is already on scene: Clone Hero - Menus
   Watching C:\...\currentsong.txt
   Setup is complete. Leave this window open while using Clone Hero and OBS.

Keep the command window open. Closing it stops automatic scene switching.

Later runs normally start immediately because the required package is already
installed.


PART 9 - TEST THE SCENE SWITCHER
--------------------------------
1. With Clone Hero sitting in a menu or song list, observe OBS.
2. OBS should select the scene configured as scene_menu.
3. Start any Clone Hero song.
4. Within approximately one second, OBS should select scene_gameplay.
5. Finish the song or quit back to the menu.
6. OBS should return to scene_menu.

The switcher checks currentsong.txt four times per second, so the typical
switching delay is approximately 0.25 seconds plus normal file-update time.

The switcher changes the OBS Program scene directly. If Studio Mode is
active, the live Program side changes rather than only changing Preview.


NORMAL DAILY USE
----------------
For future streams:

1. Open OBS.
2. Open Clone Hero.
3. Double-click setup_and_run.cmd.
4. Leave the command window open.
5. Stream normally.
6. When finished, close the command window or press Ctrl+C inside it.

Only one copy of the switcher should be running at a time.


TROUBLESHOOTING
---------------
ERROR: Node.js is not installed or is not on PATH.

- Install the current Node.js LTS release.
- Close and reopen Command Prompt after installation.
- Restart Windows if node is still not recognized.
- Confirm C:\Program Files\nodejs exists.


ERROR: npm was not found.

- Reinstall Node.js LTS.
- During installation, keep npm package manager and Add to PATH enabled.


ERROR: npm install failed.

- Confirm the computer has internet access.
- Run setup_and_run.cmd again.
- Move the utility out of C:\Program Files into Documents or C:\Tools.
- Temporarily check whether antivirus or controlled-folder access blocked npm.
- Do not download node_modules from an unknown third party.


ERROR: settings.ini has not been fully configured.

- Open settings.ini.
- Replace every value beginning with PASTE_ or containing YOUR_.
- Save the file and run setup_and_run.cmd again.


ERROR: Could not connect to OBS / ECONNREFUSED.

- Open OBS before starting the switcher.
- In OBS, open Tools -> WebSocket Server Settings.
- Check Enable WebSocket server.
- Confirm the port is 4455.
- Click Apply and OK.
- Leave address=ws://127.0.0.1:4455 for a same-PC setup.


ERROR: Authentication failed.

- The password in settings.ini does not match OBS.
- In OBS, open Tools -> WebSocket Server Settings -> Show Connect Info.
- Copy the password again.
- Replace the password line in settings.ini.
- Save and restart the switcher.

If the OBS password is changed, settings.ini must also be updated.


ERROR: OBS scene not found.

- Copy each OBS scene name again.
- Check capitalization, spaces, punctuation, and hyphens.
- Make sure OBS is using the correct Scene Collection.
- The error message lists all scenes visible to the switcher.
- Do not enter a source name; enter a scene name from the Scenes panel.


ERROR: currentsong.txt was not found.

- In Clone Hero, enable Settings -> General -> Export Current Song.
- Start a song once to generate the file.
- Find currentsong.txt in File Explorer.
- Set folder= to the folder containing the file.
- Do not include \currentsong.txt at the end of the folder value.


The switcher connects, but scenes do not change.

1. Open currentsong.txt in Notepad while Clone Hero is in a menu.
2. It should be empty or contain only blank space.
3. Start a song.
4. Reopen or refresh currentsong.txt.
5. It should now contain the current song information.

If the file never changes, Export Current Song is not operating correctly or
the wrong Clone Hero folder was configured.

Also confirm:

- scene_menu and scene_gameplay are not reversed.
- The configured scenes are in the currently loaded OBS Scene Collection.
- Only one switcher process is running.
- OBS and the switcher are running under the same Windows user session.


The switcher worked, then stopped after OBS was closed.

- Close the switcher command window.
- Reopen OBS.
- Run setup_and_run.cmd again.

The utility does not automatically reconnect after OBS is restarted.


The command window opens and immediately reports an error.

- Read the first ERROR line shown in the window.
- The batch file pauses after the program stops, so the error remains visible.
- Correct the named setting and run setup_and_run.cmd again.


The wrong scene collection is being controlled.

- OBS WebSocket reports scenes from the currently active Scene Collection.
- In OBS, use Scene Collection at the top menu to select the intended
  collection before starting the switcher.


ADVANCED: OBS ON ANOTHER COMPUTER
---------------------------------
The default configuration assumes OBS and Clone Hero run on the same PC.

For a two-PC setup, change address in settings.ini to the OBS computer's local
IP address, for example:

   address=ws://192.168.1.50:4455

This requires both computers to be on the same trusted local network, the OBS
computer's firewall to allow the connection, and OBS WebSocket authentication
to remain enabled.

Do not expose port 4455 directly to the public internet.

The Clone Hero folder and currentsong.txt must remain accessible to the
computer that runs this script. The simplest supported configuration is to
run this scene switcher on the same computer as Clone Hero and OBS.


UNINSTALLING
------------
The utility does not install a Windows service and does not modify OBS or
Clone Hero files.

To remove it:

1. Close the switcher command window.
2. Delete the extracted scene-switcher folder.

Node.js may be kept for other applications or uninstalled through Windows
Settings -> Apps -> Installed apps.


SHARING THIS PACKAGE
--------------------
Before sending the package to another person:

1. Use the original ZIP containing placeholder values.
2. Do not send a settings.ini containing a real OBS password.
3. Do not include the node_modules folder; setup_and_run.cmd creates it on the
   recipient's computer.
4. Send the entire ZIP, not individual files.


WHY THIS VERSION EXISTS
-----------------------
The original jorgeramon/clone-hero-obs-scene-switcher was written for the
obsolete OBS WebSocket 4.x protocol, used localhost:4444, and called the old
SetCurrentScene request. Current OBS versions include OBS WebSocket 5.x,
normally on port 4455, and are not compatible with that unmodified program.

This revision uses OBS WebSocket 5.x and adds:

- Current WebSocket connection support
- Exact scene-name validation
- Initial scene switching at startup
- Detailed connection and configuration errors
- Placeholder detection for shareable settings
- Whitespace-safe current-song detection
- Environment-variable support in the Clone Hero folder path


ATTRIBUTION
-----------
Concept based on:

https://github.com/jorgeramon/clone-hero-obs-scene-switcher

The original project's package metadata identifies it as ISC-licensed.
This revision updates the OBS integration to WebSocket 5.x and adds the
features listed above.
