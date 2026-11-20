const fs = require('fs');
const path = require('path');
const os = require('os');

const FILES = {
  changes: 'campus-copilot-changes.txt',
  state: 'campus-copilot-state.json',
  history: 'campus-copilot-history.log',
  dashboard: 'dashboard.html',
  outbox: 'campus-copilot-chat-outbox.json',
  inbox: 'campus-copilot-chat-inbox.json',
};

function findGoogleDriveMyDrive(home = os.homedir(), fsImpl = fs) {
  const root = path.join(home, 'Library', 'CloudStorage');
  if (!fsImpl.existsSync(root)) return null;
  let names = [];
  try {
    names = fsImpl.readdirSync(root);
  } catch (err) {
    return null;
  }
  const drives = names.filter((name) => name.startsWith('GoogleDrive-')).sort();
  for (const name of drives) {
    const myDrive = path.join(root, name, 'My Drive');
    try {
      if (fsImpl.existsSync(myDrive) && fsImpl.statSync(myDrive).isDirectory()) return myDrive;
    } catch (err) {
      // Skip an entry we cannot stat and keep looking.
    }
  }
  return null;
}

function defaultPickerPath(home = os.homedir(), fsImpl = fs) {
  return findGoogleDriveMyDrive(home, fsImpl) || home;
}

function resolveSyncFolder(chosen) {
  const base = path.resolve(chosen);
  if (path.basename(base) === 'Campus Copilot') return base;
  return path.join(base, 'Campus Copilot');
}

function isHtmlDashboard(text) {
  return /<!doctype\s+html/i.test(text) || /<html[\s>]/i.test(text);
}

module.exports = {
  FILES,
  findGoogleDriveMyDrive,
  defaultPickerPath,
  resolveSyncFolder,
  isHtmlDashboard,
};
