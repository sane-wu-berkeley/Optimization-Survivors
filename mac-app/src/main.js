const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { FILES, defaultPickerPath, resolveSyncFolder, isHtmlDashboard } = require('./sync');

if (process.env.CAMPUS_COPILOT_LINUX_NO_SANDBOX === '1') {
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('disable-gpu');
  app.disableHardwareAcceleration();
}

app.setName('Campus Copilot');
if (process.env.CAMPUS_COPILOT_USER_DATA) {
  app.setPath('userData', process.env.CAMPUS_COPILOT_USER_DATA);
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'copilot',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

const bundledDashboardPath = path.join(__dirname, '..', 'dashboard', 'dashboard.html');
const preferencesPath = path.join(__dirname, 'preferences.html');
const injectSource = fs.readFileSync(path.join(__dirname, 'inject.js'), 'utf8');

let config = {
  syncFolder: null,
  dashboardPath: null,
  syncSeenMtime: 0,
  syncDashboardHash: null,
};
let syncFolder = null;
let activeDashboardPath = bundledDashboardPath;
let mainWindow = null;
let preferencesWindow = null;
let watchTimer = null;
let pollTimer = null;
let watcher = null;
let lastSummary = null;
let reportTimer = null;
let pendingReport = null;
let inboxHash = '';

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function loadConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    config = { ...config, ...parsed };
  } catch (err) {
    config = { ...config };
  }
}

function saveConfig() {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2) + '\n');
}

function isExternalHttp(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:';
  } catch (err) {
    return false;
  }
}

function atomicWrite(file, text) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

function readSyncHtml() {
  if (!syncFolder) return null;
  const file = path.join(syncFolder, FILES.dashboard);
  if (!fs.existsSync(file)) return null;
  let stat;
  try {
    stat = fs.statSync(file);
  } catch (err) {
    return null;
  }
  if (!stat.isFile() || stat.size < 16) return null;
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    return null;
  }
  if (!isHtmlDashboard(text)) return null;
  return { file, mtimeMs: stat.mtimeMs, text };
}

function selectDashboard() {
  let chosen = bundledDashboardPath;
  if (config.dashboardPath && config.dashboardPath !== bundledDashboardPath && fs.existsSync(config.dashboardPath)) {
    chosen = config.dashboardPath;
  }
  const syncHtml = readSyncHtml();
  const seen = Number(config.syncSeenMtime || 0);
  if (syncHtml && syncHtml.mtimeMs > seen + 0.5) {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(syncHtml.text).digest('hex');
    chosen = syncHtml.file;
    config.syncSeenMtime = syncHtml.mtimeMs;
    config.syncDashboardHash = hash;
    config.dashboardPath = syncHtml.file;
    saveConfig();
  }
  activeDashboardPath = chosen;
  return chosen;
}

function dashboardURL() {
  return `copilot://local/dashboard.html?t=${Date.now()}`;
}

function loadActiveDashboard() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.loadURL(dashboardURL());
}

function considerSyncHtml() {
  const syncHtml = readSyncHtml();
  if (!syncHtml) return;
  const seen = Number(config.syncSeenMtime || 0);
  if (syncHtml.mtimeMs <= seen + 0.5) return;
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256').update(syncHtml.text).digest('hex');
  config.syncSeenMtime = syncHtml.mtimeMs;
  if (hash === config.syncDashboardHash && activeDashboardPath === syncHtml.file) {
    saveConfig();
    return;
  }
  config.syncDashboardHash = hash;
  config.dashboardPath = syncHtml.file;
  activeDashboardPath = syncHtml.file;
  saveConfig();
  loadActiveDashboard();
}

function scheduleSyncCheck() {
  clearTimeout(watchTimer);
  watchTimer = setTimeout(() => {
    considerSyncHtml();
    checkInbox();
  }, 400);
}

function startWatch() {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  clearInterval(pollTimer);
  if (!syncFolder) return;
  try {
    watcher = fs.watch(syncFolder, { persistent: true }, () => scheduleSyncCheck());
  } catch (err) {
    watcher = null;
  }
  rememberInbox();
  pollTimer = setInterval(() => {
    considerSyncHtml();
    checkInbox();
  }, 2000);
}

function readJsonFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return null;
  }
}

function emptyChatLog() {
  return { version: 1, updatedAt: new Date().toISOString(), messages: [] };
}

function normalizeChatLog(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.messages)) return emptyChatLog();
  return {
    version: 1,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
    messages: data.messages.filter((item) => item && typeof item === 'object'),
  };
}

function chatPayload() {
  if (!syncFolder) return { folder: null, outbox: emptyChatLog(), inbox: emptyChatLog() };
  return {
    folder: syncFolder,
    outbox: normalizeChatLog(readJsonFile(path.join(syncFolder, FILES.outbox))),
    inbox: normalizeChatLog(readJsonFile(path.join(syncFolder, FILES.inbox))),
  };
}

function broadcastChat() {
  const payload = chatPayload();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('chat-update', payload);
}

function rememberInbox() {
  if (!syncFolder) {
    inboxHash = '';
    return;
  }
  try {
    const text = fs.readFileSync(path.join(syncFolder, FILES.inbox), 'utf8');
    JSON.parse(text);
    inboxHash = crypto.createHash('sha256').update(text).digest('hex');
  } catch (err) {
    inboxHash = '';
  }
}

function checkInbox() {
  if (!syncFolder) return;
  const file = path.join(syncFolder, FILES.inbox);
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    return;
  }
  try {
    JSON.parse(text);
  } catch (err) {
    return;
  }
  const hash = crypto.createHash('sha256').update(text).digest('hex');
  if (hash === inboxHash) return;
  inboxHash = hash;
  broadcastChat();
}

function flushReport() {
  if (!pendingReport || !syncFolder) return;
  const { summary, state } = pendingReport;
  pendingReport = null;
  fs.mkdirSync(syncFolder, { recursive: true });
  const changes = summary.endsWith('\n') ? summary : `${summary}\n`;
  atomicWrite(path.join(syncFolder, FILES.changes), changes);
  atomicWrite(path.join(syncFolder, FILES.state), `${JSON.stringify(state, null, 2)}\n`);
  const normalized = changes.trim();
  if (normalized !== lastSummary) {
    const stamp = new Date().toISOString();
    fs.appendFileSync(
      path.join(syncFolder, FILES.history),
      `===== ${stamp} =====\n${changes}\n`,
    );
    lastSummary = normalized;
  }
}

function rememberExistingSummary() {
  if (!syncFolder) return;
  const file = path.join(syncFolder, FILES.changes);
  try {
    lastSummary = fs.readFileSync(file, 'utf8').trim();
  } catch (err) {
    lastSummary = null;
  }
}

async function pickSyncFolder() {
  const result = await dialog.showOpenDialog({
    title: 'Choose where Campus Copilot syncs',
    defaultPath: defaultPickerPath(),
    buttonLabel: 'Sync here',
    message: 'Campus Copilot will create a Campus Copilot folder here and write change files into it.',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const folder = resolveSyncFolder(result.filePaths[0]);
  fs.mkdirSync(folder, { recursive: true });
  return folder;
}

async function ensureSyncFolder() {
  if (process.env.CAMPUS_COPILOT_SYNC) {
    syncFolder = resolveSyncFolder(process.env.CAMPUS_COPILOT_SYNC);
    fs.mkdirSync(syncFolder, { recursive: true });
    config.syncFolder = syncFolder;
    saveConfig();
    return true;
  }
  if (config.syncFolder && fs.existsSync(config.syncFolder)) {
    syncFolder = config.syncFolder;
    return true;
  }
  while (!syncFolder) {
    const picked = await pickSyncFolder();
    if (picked) {
      syncFolder = picked;
      config.syncFolder = picked;
      saveConfig();
      return true;
    }
    const choice = await dialog.showMessageBox({
      type: 'info',
      message: 'Campus Copilot needs a sync folder',
      detail: 'Pick a folder so each change can reach your team. A Campus Copilot folder is created inside the one you choose. If Google Drive for desktop is installed, the picker opens in My Drive.',
      buttons: ['Choose Folder', 'Quit'],
      defaultId: 0,
      cancelId: 1,
    });
    if (choice.response === 1) {
      app.quit();
      return false;
    }
  }
  return true;
}

function installProtocol() {
  protocol.handle('copilot', (request) => {
    let pathname = '/';
    try {
      pathname = new URL(request.url).pathname;
    } catch (err) {
      return new Response('Bad request', { status: 400 });
    }
    let filePath = null;
    if (pathname === '/preferences.html') filePath = preferencesPath;
    else if (pathname === '/dashboard.html' || pathname === '/') filePath = activeDashboardPath;
    if (!filePath) return new Response('Not found', { status: 404 });
    try {
      const text = fs.readFileSync(filePath, 'utf8');
      return new Response(text, {
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
        },
      });
    } catch (err) {
      return new Response('Not found', { status: 404 });
    }
  });
}

function attachNavigationGuards(contents) {
  contents.setWindowOpenHandler(({ url }) => {
    if (isExternalHttp(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (url.startsWith('copilot://local/')) return;
    event.preventDefault();
    if (isExternalHttp(url)) shell.openExternal(url);
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: 'Campus Copilot',
    backgroundColor: '#f2f1ee',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  attachNavigationGuards(mainWindow.webContents);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.on('did-finish-load', () => {
    const url = mainWindow.webContents.getURL();
    if (!url.startsWith('copilot://local/dashboard.html')) return;
    mainWindow.webContents.executeJavaScript(injectSource).catch((err) => {
      console.error(err);
    });
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  if (process.env.CAMPUS_COPILOT_TEST) {
    require('./selftest').watchWindow(mainWindow);
  }
  loadActiveDashboard();
}

function openPreferences() {
  if (preferencesWindow && !preferencesWindow.isDestroyed()) {
    preferencesWindow.focus();
    return;
  }
  preferencesWindow = new BrowserWindow({
    width: 520,
    height: 420,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: 'Preferences',
    backgroundColor: '#f4f0e6',
    parent: mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  preferencesWindow.setMenuBarVisibility(false);
  preferencesWindow.loadURL('copilot://local/preferences.html');
  preferencesWindow.on('closed', () => {
    preferencesWindow = null;
  });
}

async function openDashboard() {
  const result = await dialog.showOpenDialog({
    title: 'Open Dashboard',
    filters: [{ name: 'Dashboard HTML', extensions: ['html', 'htm'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths[0]) return;
  const file = result.filePaths[0];
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    dialog.showErrorBox('Could not open dashboard', err.message);
    return;
  }
  if (!isHtmlDashboard(text)) {
    dialog.showErrorBox('Could not open dashboard', 'Choose an HTML dashboard file.');
    return;
  }
  activeDashboardPath = file;
  config.dashboardPath = file;
  const syncHtml = readSyncHtml();
  if (syncHtml) config.syncSeenMtime = syncHtml.mtimeMs;
  saveConfig();
  loadActiveDashboard();
}

function buildMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Preferences…',
          accelerator: 'CommandOrControl+,',
          click: () => openPreferences(),
        },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Dashboard…',
          accelerator: 'CommandOrControl+O',
          click: () => openDashboard(),
        },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CommandOrControl+R',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) loadActiveDashboard();
          },
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle('sync-report', (_event, payload) => {
  if (!payload || typeof payload.summary !== 'string' || !payload.state || typeof payload.state !== 'object') {
    return { ok: false };
  }
  pendingReport = { summary: payload.summary, state: payload.state };
  clearTimeout(reportTimer);
  reportTimer = setTimeout(flushReport, 200);
  return { ok: true };
});

ipcMain.handle('sync-info', () => ({
  folder: syncFolder,
  files: FILES,
}));

ipcMain.handle('chat-get', () => chatPayload());

ipcMain.handle('chat-send', (_event, body) => {
  if (!syncFolder) return { ok: false, reason: 'no-folder' };
  const text = body && typeof body.text === 'string' ? body.text.trim() : '';
  if (!text || text.length > 8000) return { ok: false, reason: 'empty' };
  const contextIn = body && body.context && typeof body.context === 'object' ? body.context : {};
  const now = new Date().toISOString();
  const message = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: 'user',
    text,
    sentAt: now,
    context: {
      view: typeof contextIn.view === 'string' ? contextIn.view.slice(0, 80) : '',
      pendingDeadlines: Number.isFinite(Number(contextIn.pendingDeadlines)) ? Number(contextIn.pendingDeadlines) : 0,
    },
  };
  const file = path.join(syncFolder, FILES.outbox);
  const existing = normalizeChatLog(readJsonFile(file));
  existing.messages.push(message);
  existing.updatedAt = now;
  existing.version = 1;
  fs.mkdirSync(syncFolder, { recursive: true });
  atomicWrite(file, `${JSON.stringify(existing, null, 2)}\n`);
  return { ok: true, message, ...chatPayload() };
});

ipcMain.handle('choose-sync-folder', async () => {
  const picked = await pickSyncFolder();
  if (!picked) return syncFolder;
  syncFolder = picked;
  config.syncFolder = picked;
  saveConfig();
  rememberExistingSummary();
  startWatch();
  broadcastChat();
  if (pendingReport) flushReport();
  else if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.executeJavaScript('window.__ccHostSync && window.__ccHostSync()').catch(() => {});
  }
  return syncFolder;
});

ipcMain.on('open-external', (_event, url) => {
  if (typeof url === 'string' && url.length < 8000 && isExternalHttp(url)) shell.openExternal(url);
});

app.whenReady().then(async () => {
  app.setAboutPanelOptions({
    applicationName: 'Campus Copilot',
    applicationVersion: app.getVersion(),
    version: '',
    copyright: 'Local only. No account and no network service.',
  });
  installProtocol();
  loadConfig();
  const ready = await ensureSyncFolder();
  if (!ready) return;
  rememberExistingSummary();
  selectDashboard();
  buildMenu();
  startWatch();
  if (process.env.CAMPUS_COPILOT_TEST) require('./selftest').arm();
  createMainWindow();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  flushReport();
});
