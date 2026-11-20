# Campus Copilot Mac App

A local macOS Electron wrapper for the Campus Copilot HTML dashboard. It keeps the exact original dashboard layout, CSS, and mascot, adds direct Google Drive folder sync (removing the manual "Send to team" copy step), and wires the in-app mascot chat drawer to two-way JSON files so Grok Bot can read and reply automatically.

## What it syncs

On launch (or via **Preferences**, `Cmd-,`), the app picks a sync folder — defaulting to `Campus Copilot` inside Google Drive for desktop (`~/Library/CloudStorage/GoogleDrive-*/My Drive/Campus Copilot`).

Files in the sync folder:

- `campus-copilot-state.json` — written by the app on every dashboard state change.
- `campus-copilot-changes.txt` — plain-text summary of changes since the last dashboard update, written on every change.
- `campus-copilot-history.log` — timestamped append-only log of dashboard changes.
- `dashboard.html` — optional live dashboard dropped in by Campus Copilot; the app watches it and reloads automatically.
- `campus-copilot-chat-outbox.json` — written by the app when the student sends a message from the mascot chat drawer.
- `campus-copilot-chat-inbox.json` — written by Campus Copilot and watched by the app (`fs.watch` + 2-second poll); replies appear in the drawer with sender tags and an unread indicator on the mascot when closed.

## Run locally

```bash
cd mac-app
npm install
npm start
```

## Build macOS `.zip` packages

```bash
cd mac-app
npm install
npm run build:mac        # builds both arm64 (Apple silicon) and x64 (Intel) into dist/
# or build one architecture:
npm run build:mac:arm64
npm run build:mac:x64
```

Builds are unsigned (`"identity": null`). On first launch, right-click `Campus Copilot.app` and choose **Open** (or clear quarantine if macOS warns the app is damaged):

```bash
xattr -cr "/Applications/Campus Copilot.app"
```

## Privacy note

`dashboard/dashboard.html` bundled here contains only the generic sample dataset (no personal student emails, course links, or grades). To use live student data, have Campus Copilot write `dashboard.html` into the synced Google Drive `Campus Copilot` folder instead of committing it to this repository.
