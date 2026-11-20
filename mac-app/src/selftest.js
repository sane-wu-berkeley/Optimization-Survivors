const fs = require('fs');
const path = require('path');
const { app, Menu, session } = require('electron');
const { FILES } = require('./sync');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(check, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (await check()) return true;
    } catch (err) {
      // Keep polling until the file shows up.
    }
    await delay(100);
  }
  return false;
}

function menuDump() {
  const menu = Menu.getApplicationMenu();
  const rows = [];
  if (!menu) return rows;
  for (const item of menu.items) {
    const submenu = item.submenu ? item.submenu.items : [];
    for (const sub of submenu) {
      rows.push({
        menu: item.label,
        label: sub.label,
        role: sub.role || '',
        accelerator: sub.accelerator || '',
      });
    }
  }
  return rows;
}

function arm() {
  const resultPath = process.env.CAMPUS_COPILOT_RESULT;
  const mode = process.env.CAMPUS_COPILOT_TEST;
  const syncFolder = process.env.CAMPUS_COPILOT_SYNC
    ? require('./sync').resolveSyncFolder(process.env.CAMPUS_COPILOT_SYNC)
    : null;
  const result = { mode, errors: [], opened: [], menus: [], checks: {} };

  const { shell } = require('electron');
  const originalOpen = shell.openExternal.bind(shell);
  shell.openExternal = async (url) => {
    result.opened.push(String(url));
    if (process.env.CAMPUS_COPILOT_REAL_OPEN === '1') return originalOpen(url);
    return true;
  };

  let settled = false;
  const timer = setTimeout(() => {
    result.errors.push('timed out');
    finish(1);
  }, 40000);

  async function finish(code) {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    result.ok = code === 0;
    if (resultPath) fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
    try {
      await session.defaultSession.flushStorageData();
    } catch (err) {
      // Exit anyway. The result file already records what happened.
    }
    await delay(250);
    app.exit(code);
  }

  global.__ccSelfTest = { result, finish, mode, syncFolder };
}

function watchWindow(win) {
  const state = global.__ccSelfTest;
  if (!state || win.__ccWatched) return;
  win.__ccWatched = true;
  win.webContents.on('console-message', (event, level, message) => {
    let lvl = level;
    let msg = message;
    if (event && typeof event === 'object' && Object.prototype.hasOwnProperty.call(event, 'message')) {
      lvl = event.level;
      msg = event.message;
    }
    if (lvl === 3 || lvl === 'error') state.result.errors.push(String(msg));
  });
  win.webContents.on('did-fail-load', (_event, code, description, url) => {
    state.result.errors.push(`did-fail-load ${code} ${description} ${url}`);
  });
  win.webContents.on('did-finish-load', () => {
    if (!win.webContents.getURL().startsWith('copilot://local/dashboard.html')) return;
    if (state.mode === 'watch') {
      state.loads = (state.loads || 0) + 1;
      if (state.loads === 1) {
        const html = `<!DOCTYPE html><html><head><title>Updated</title></head><body><h1 id="marker">Updated dashboard</h1><p>${'pad '.repeat(40)}</p></body></html>`;
        fs.writeFileSync(path.join(state.syncFolder, FILES.dashboard), html);
        return;
      }
      win.webContents.executeJavaScript(`document.getElementById('marker') && document.getElementById('marker').textContent`).then((marker) => {
        state.result.checks.marker = marker;
        state.result.menus = menuDump();
        state.finish(marker === 'Updated dashboard' && state.result.errors.length === 0 ? 0 : 1);
      }).catch((err) => {
        state.result.errors.push(String(err));
        state.finish(1);
      });
      return;
    }
    if (win.__ccTested) return;
    win.__ccTested = true;
    run(win).catch((err) => {
      state.result.errors.push(String(err && err.stack ? err.stack : err));
      state.finish(1);
    });
  });
}

async function run(win) {
  const state = global.__ccSelfTest;
  const changes = path.join(state.syncFolder, FILES.changes);
  const stateFile = path.join(state.syncFolder, FILES.state);
  const history = path.join(state.syncFolder, FILES.history);

  const appeared = await waitFor(() => fs.existsSync(changes), 8000);
  if (!appeared) {
    state.result.errors.push('changes file was not written');
    state.finish(1);
    return;
  }

  async function settleAndShot(filename, fullPage) {
    await win.webContents.executeJavaScript(`
      (async function () {
        if (document.fonts && document.fonts.ready) {
          await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 4000))]);
        }
        const hide = document.querySelector('#copi .bubble [data-x], #copi [data-x]');
        if (hide) hide.click();
        window.scrollTo(0, 0);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      })()
    `);
    if (fullPage) {
      const height = await win.webContents.executeJavaScript('Math.ceil(Math.max(document.body.scrollHeight, document.documentElement.scrollHeight))');
      win.setContentSize(1400, Math.max(900, Math.min(height, 1900)));
    } else {
      win.setContentSize(1400, 1000);
    }
    await delay(250);
    if (process.env.CAMPUS_COPILOT_SHOTS && filename) {
      const image = await win.webContents.capturePage();
      fs.writeFileSync(path.join(process.env.CAMPUS_COPILOT_SHOTS, filename), image.toPNG());
    }
  }

  if (state.mode === 'persist') {
    const status = await win.webContents.executeJavaScript(`
      (function () {
        const raw = localStorage.getItem('campus-copilot-proto');
        if (!raw) return null;
        const saved = JSON.parse(raw);
        const item = (saved.deadlines || []).find((row) => row.id === 'g1');
        return item ? item.status : null;
      })()
    `);
    state.result.checks.persisted = status;
    const restored = await waitFor(async () => {
      const text = await win.webContents.executeJavaScript(`document.getElementById('msgs') ? document.getElementById('msgs').innerText : ''`);
      return text.includes('What is due tomorrow?') && text.includes('Homework 10 is due Friday morning') && text.includes('What should I do first?');
    }, 8000);
    state.result.checks.chatRestored = restored;
    state.result.menus = menuDump();
    state.finish(status === 'approved' && restored && state.result.errors.length === 0 ? 0 : 1);
    return;
  }

  await settleAndShot('home.png', true);

  await win.webContents.executeJavaScript(`
    document.querySelector('[data-a="go"][data-v="deadlines"]').click();
    true;
  `);
  await delay(200);
  await settleAndShot('deadlines.png', false);
  const linkClicked = await win.webContents.executeJavaScript(`
    (function () {
      const link = document.querySelector('a[href^="https://www.gradescope.com"], a[href^="https://bcourses.berkeley.edu"], a[href^="https://edstem.org"]');
      if (!link) return null;
      link.click();
      return link.href;
    })()
  `);
  await delay(200);
  state.result.checks.externalHref = linkClicked;
  state.result.checks.openedExternal = state.result.opened.some((url) => url.startsWith('https://www.gradescope.com') || url.startsWith('https://bcourses.berkeley.edu') || url.startsWith('https://edstem.org'));

  await win.webContents.executeJavaScript(`
    document.querySelector('button[data-a="dl"][data-op="approve"][data-id="g1"]').click();
    true;
  `);

  const updated = await waitFor(() => fs.readFileSync(changes, 'utf8').includes('Deadline Agent: approve 1'), 8000);
  if (!updated) {
    state.result.errors.push(`approve line was not written: ${fs.existsSync(changes) ? fs.readFileSync(changes, 'utf8').slice(0, 500) : 'missing'}`);
    state.finish(1);
    return;
  }

  const summary = fs.readFileSync(changes, 'utf8');
  const fromPage = await win.webContents.executeJavaScript('teamText()');
  const body = (text) => String(text).trim().split('\n').slice(1).join('\n');
  state.result.checks.summaryBody = body(summary) === body(fromPage);
  state.result.checks.approveLine = summary.includes('Deadline Agent: approve 1');
  state.result.checks.header = summary.startsWith('DASHBOARD CHANGES');

  const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  const proto = saved['campus-copilot-proto'];
  const row = proto && proto.deadlines.find((item) => item.id === 'g1');
  state.result.checks.stateApproved = row && row.status === 'approved';
  state.result.checks.history = fs.readFileSync(history, 'utf8').includes('Deadline Agent: approve 1');

  const hidden = await win.webContents.executeJavaScript(`
    (function () {
      const buttons = [...document.querySelectorAll('button[data-a="sendTeam"]')].map((el) => ({
        display: getComputedStyle(el).display,
        rects: el.getClientRects().length,
        text: (el.textContent || '').replace(/\\s+/g, ' ').trim()
      }));
      const row = document.querySelector('#view > .row');
      const rowDisplay = row ? getComputedStyle(row).display : null;
      const modalText = (document.getElementById('modal') || {}).textContent || '';
      const visibleSend = [...document.querySelectorAll('button, a')].filter((el) => {
        return (el.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase() === 'send to team' && el.getClientRects().length > 0;
      }).length;
      return { buttons, rowDisplay, modalText: modalText.trim(), visibleSend };
    })()
  `);
  state.result.checks.hidden = hidden;
  state.result.checks.hiddenButtons = hidden.buttons.length >= 2
    && hidden.buttons.every((button) => button.display === 'none' && button.rects === 0);
  state.result.checks.hiddenRow = hidden.rowDisplay === 'none';
  state.result.checks.modalHidden = hidden.modalText === '' && hidden.visibleSend === 0;

  win.setContentSize(1400, 900);
  await delay(150);
  await win.webContents.executeJavaScript(`window.openChat(); true`);
  await win.webContents.executeJavaScript(`
    const input = document.getElementById('chatI');
    input.value = 'What is due tomorrow?';
    document.getElementById('chatF').requestSubmit();
    true;
  `);
  const outboxPath = path.join(state.syncFolder, FILES.outbox);
  const wroteUser = await waitFor(() => fs.existsSync(outboxPath) && fs.readFileSync(outboxPath, 'utf8').includes('What is due tomorrow?'), 8000);
  state.result.checks.outboxWritten = wroteUser;
  if (wroteUser) {
    const outbox = JSON.parse(fs.readFileSync(outboxPath, 'utf8'));
    const first = outbox.messages && outbox.messages[0];
    state.result.checks.outboxShape = outbox.version === 1
      && first
      && first.role === 'user'
      && first.text === 'What is due tomorrow?'
      && /^msg-\d+-/.test(first.id)
      && first.context
      && first.context.view === 'Deadlines'
      && Number.isFinite(first.context.pendingDeadlines);
  }
  const queued = await waitFor(async () => {
    const text = await win.webContents.executeJavaScript(`document.getElementById('msgs').innerText`);
    return text.includes('What is due tomorrow?')
      && text.includes('Queued in Google Drive')
      && !text.includes('Prototype: answers come from the demo data')
      && !text.includes('things are due in the next 7 days');
  }, 5000);
  state.result.checks.queuedVisible = queued;
  await win.webContents.executeJavaScript(`document.querySelector('#quick button').click()`);
  const second = await waitFor(() => {
    try {
      const outbox = JSON.parse(fs.readFileSync(outboxPath, 'utf8'));
      return outbox.messages.length >= 2 && outbox.messages[1].text.includes('What should I do first?');
    } catch (err) {
      return false;
    }
  }, 5000);
  state.result.checks.quickQueued = second;
  const noDemo = await win.webContents.executeJavaScript(`
    const text = document.getElementById('msgs').innerText;
    !text.includes('students has 4 rows') && !text.includes('LEFT JOIN')
  `);
  state.result.checks.noDemoReply = noDemo === true;
  await win.webContents.executeJavaScript(`document.getElementById('chat').classList.remove('open'); true`);
  const outbox = JSON.parse(fs.readFileSync(outboxPath, 'utf8'));
  const inboxPath = path.join(state.syncFolder, FILES.inbox);
  const inbox = {
    version: 1,
    updatedAt: new Date().toISOString(),
    messages: [{
      id: 'reply-test-1',
      replyTo: outbox.messages[0].id,
      from: 'Deadline Agent',
      text: 'Homework 10 is due Friday morning.\nhttps://www.gradescope.com/courses/000000',
      sentAt: new Date().toISOString(),
    }],
  };
  const inboxTmp = `${inboxPath}.${process.pid}.tmp`;
  fs.writeFileSync(inboxTmp, `${JSON.stringify(inbox, null, 2)}\n`);
  fs.renameSync(inboxTmp, inboxPath);
  const badge = await waitFor(async () => win.webContents.executeJavaScript(`
    !!(document.getElementById('cc-unread') && document.getElementById('cc-unread').classList.contains('on'))
  `), 8000);
  state.result.checks.unreadBadge = badge === true;
  await win.webContents.executeJavaScript(`window.openChat(); true`);
  await delay(250);
  const shown = await win.webContents.executeJavaScript(`
    (function () {
      const text = document.getElementById('msgs').innerText;
      const link = document.querySelector('#msgs a[href^="https://www.gradescope.com"]');
      const waits = [...document.querySelectorAll('.cc-wait')].map((el) => el.textContent);
      return {
        text,
        hasReply: text.includes('Homework 10 is due Friday morning'),
        hasTag: text.includes('Deadline Agent'),
        hasLink: !!link,
        waitCount: waits.length,
        badge: document.getElementById('cc-unread').classList.contains('on'),
        header: document.querySelector('#chat .ch small').textContent,
      };
    })()
  `);
  state.result.checks.replyShown = shown.hasReply && shown.hasTag && shown.hasLink && !shown.badge;
  state.result.checks.waitingCleared = shown.waitCount === 1;
  state.result.checks.chatHeader = typeof shown.header === 'string' && shown.header.includes('Synced via Google Drive');
  if (process.env.CAMPUS_COPILOT_SHOTS) {
    const image = await win.webContents.capturePage();
    fs.writeFileSync(path.join(process.env.CAMPUS_COPILOT_SHOTS, 'chat.png'), image.toPNG());
  }

  state.result.menus = menuDump();
  const menus = state.result.menus;
  state.result.checks.menuOpen = menus.some((row) => row.label === 'Open Dashboard…' && /O$/.test(row.accelerator || ''));
  state.result.checks.menuReload = menus.some((row) => row.label === 'Reload' && /R$/.test(row.accelerator || ''));
  state.result.checks.menuQuit = menus.some((row) => row.role === 'quit');
  state.result.checks.menuClose = menus.some((row) => row.role === 'close');
  state.result.checks.menuPrefs = menus.some((row) => row.label === 'Preferences…');

  const required = [
    'summaryBody',
    'approveLine',
    'header',
    'stateApproved',
    'history',
    'hiddenButtons',
    'hiddenRow',
    'modalHidden',
    'openedExternal',
    'outboxWritten',
    'outboxShape',
    'queuedVisible',
    'quickQueued',
    'noDemoReply',
    'unreadBadge',
    'replyShown',
    'waitingCleared',
    'chatHeader',
    'menuOpen',
    'menuReload',
    'menuQuit',
    'menuClose',
    'menuPrefs',
  ];
  const failed = required.filter((key) => !state.result.checks[key]);
  state.result.failed = failed;
  state.finish(failed.length === 0 && state.result.errors.length === 0 ? 0 : 1);
}

module.exports = { arm, watchWindow };
