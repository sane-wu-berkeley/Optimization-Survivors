(() => {
  if (window.__ccHostInstalled) return;
  window.__ccHostInstalled = true;

  const style = document.createElement('style');
  style.textContent = [
    'button[data-a="sendTeam"] { display: none !important; }',
    '#view > .row:has(> button[data-a="sendTeam"]:only-child) { display: none !important; }',
    '[data-cc-hidden-send="1"] { display: none !important; }',
    '#cc-unread { position: absolute; top: 8px; right: 8px; width: 11px; height: 11px; border-radius: 50%; background: #ff5f14; box-shadow: 0 0 0 2px #fff; display: none; pointer-events: none; z-index: 2; }',
    '#cc-unread.on { display: block; }',
    '.cc-wait { align-self: flex-end; max-width: 84%; margin-top: -4px; font-size: 11.5px; line-height: 1.35; color: #74747d; text-align: right; }',
    '.cc-from { display: block; font-size: 11px; font-weight: 700; color: #c2410c; margin-bottom: 3px; }',
  ].join('\n');
  document.documentElement.appendChild(style);

  function labelOf(el) {
    return (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function hideRowIfSendOnly(el) {
    const row = el.parentElement;
    if (!row || !row.parentElement || row.parentElement.id !== 'view') return;
    const controls = row.querySelectorAll('button, a, [role="button"]');
    if (controls.length !== 1) return;
    row.setAttribute('data-cc-hidden-send', '1');
    row.style.setProperty('display', 'none', 'important');
  }

  function hideSend() {
    document.querySelectorAll('button[data-a="sendTeam"]').forEach((btn) => {
      btn.setAttribute('data-cc-hidden-send', '1');
      btn.setAttribute('aria-hidden', 'true');
      btn.style.setProperty('display', 'none', 'important');
      hideRowIfSendOnly(btn);
    });
    document.querySelectorAll('button, a, [role="button"]').forEach((el) => {
      if (el.getAttribute('data-a') === 'sendTeam') return;
      if (labelOf(el) !== 'send to team') return;
      el.setAttribute('data-cc-hidden-send', '1');
      el.setAttribute('aria-hidden', 'true');
      el.style.setProperty('display', 'none', 'important');
      hideRowIfSendOnly(el);
    });
    const modal = document.getElementById('modal');
    if (!modal) return;
    const heading = modal.querySelector('h2');
    if (heading && heading.textContent.replace(/\s+/g, ' ').trim().toLowerCase() === 'send to team') {
      modal.innerHTML = '';
      modal.style.removeProperty('display');
    }
  }

  hideSend();
  const observer = new MutationObserver(() => hideSend());
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['style', 'class', 'hidden'],
  });

  function dumpLocalStorage() {
    const out = {};
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      const value = localStorage.getItem(key);
      try {
        out[key] = JSON.parse(value);
      } catch (err) {
        out[key] = value;
      }
    }
    return out;
  }

  function snapshot() {
    if (typeof teamText === 'function') {
      try {
        return { summary: teamText(), state: dumpLocalStorage() };
      } catch (err) {
        return null;
      }
    }
    return null;
  }

  let timer = null;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const snap = snapshot();
      if (!snap || typeof snap.summary !== 'string' || !snap.state) return;
      if (!window.campusCopilot || typeof window.campusCopilot.report !== 'function') return;
      try {
        await window.campusCopilot.report({ summary: snap.summary, state: snap.state });
      } catch (err) {
        // The window may be closing. The next change writes again.
      }
    }, 200);
  }

  const originalSet = localStorage.setItem.bind(localStorage);
  const originalRemove = localStorage.removeItem.bind(localStorage);
  const originalClear = localStorage.clear.bind(localStorage);
  localStorage.setItem = (key, value) => {
    originalSet(key, value);
    schedule();
  };
  localStorage.removeItem = (key) => {
    originalRemove(key);
    schedule();
  };
  localStorage.clear = () => {
    originalClear();
    schedule();
  };

  window.__ccHostSync = schedule;
  schedule();
  installDriveChat();
})();

function installDriveChat() {
  const form = document.getElementById('chatF');
  const quick = document.getElementById('quick');
  const msgs = document.getElementById('msgs');
  const chat = document.getElementById('chat');
  if (!form || !quick || !msgs || !chat || !window.campusCopilot) return;

  const WORKERS = ['Deadline Agent', 'Study Coach', 'Practice Builder', 'Career Scout'];
  const seenReplies = new Set();
  let primed = false;
  let localOnly = [];
  const pet = document.getElementById('copiPet');
  if (pet && !document.getElementById('cc-unread')) {
    const badge = document.createElement('span');
    badge.id = 'cc-unread';
    badge.setAttribute('aria-hidden', 'true');
    pet.style.position = 'relative';
    pet.appendChild(badge);
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function renderText(value) {
    const linked = esc(value).replace(/https:\/\/[^\s<]+/g, (url) => {
      const clean = url.replace(/[),.;]+$/g, '');
      const trail = url.slice(clean.length);
      return `<a href="${clean}" target="_blank" rel="noopener">${clean}</a>${trail}`;
    });
    return linked.replace(/\n/g, '<br>');
  }

  function setHeader(folder) {
    const small = document.querySelector('#chat .ch small');
    if (!small) return;
    const dot = small.querySelector('i');
    small.textContent = '';
    if (dot) small.appendChild(dot);
    small.append(' ', folder ? 'Synced via Google Drive' : 'Pick a sync folder in Preferences');
  }

  function mergeThread(outbox, inbox) {
    const users = (outbox && outbox.messages ? outbox.messages : [])
      .filter((item) => item && (item.role === 'user' || !item.replyTo))
      .map((item) => ({ ...item, kind: 'user' }))
      .sort((a, b) => String(a.sentAt).localeCompare(String(b.sentAt)));
    const replies = (inbox && inbox.messages ? inbox.messages : []).map((item) => ({ ...item, kind: 'reply' }));
    const known = new Set(users.map((item) => item.id));
    const grouped = new Map();
    const loose = [];
    replies.forEach((item) => {
      if (item.replyTo && known.has(item.replyTo)) {
        if (!grouped.has(item.replyTo)) grouped.set(item.replyTo, []);
        grouped.get(item.replyTo).push(item);
      } else loose.push(item);
    });
    grouped.forEach((list) => list.sort((a, b) => String(a.sentAt).localeCompare(String(b.sentAt))));
    loose.sort((a, b) => String(a.sentAt).localeCompare(String(b.sentAt)));
    const thread = [];
    users.forEach((item) => {
      thread.push(item);
      (grouped.get(item.id) || []).forEach((reply) => thread.push(reply));
    });
    loose.forEach((reply) => {
      const index = thread.findIndex((item) => String(item.sentAt) > String(reply.sentAt));
      if (index < 0) thread.push(reply);
      else thread.splice(index, 0, reply);
    });
    localOnly.forEach((item) => thread.push({ ...item, kind: 'user', local: true }));
    return thread;
  }

  function renderThread(payload) {
    if (!payload) return;
    const thread = mergeThread(payload.outbox, payload.inbox);
    const answered = new Set(thread.filter((item) => item.kind === 'reply' && item.replyTo).map((item) => item.replyTo));
    const open = chat.classList.contains('open');
    let fresh = false;
    msgs.replaceChildren();
    thread.forEach((item) => {
      if (item.kind === 'user') {
        const bubble = document.createElement('div');
        bubble.className = 'm me';
        bubble.dataset.id = item.id || '';
        bubble.textContent = item.text || '';
        msgs.appendChild(bubble);
        if (!answered.has(item.id)) {
          const note = document.createElement('div');
          note.className = 'cc-wait';
          note.dataset.wait = item.id || 'local';
          note.textContent = payload.folder && !item.local
            ? 'Queued in Google Drive — waiting for Campus Copilot…'
            : 'Pick a sync folder in Preferences (Command-,).';
          msgs.appendChild(note);
        }
        return;
      }
      if (primed && item.id && !seenReplies.has(item.id) && !open) fresh = true;
      if (item.id) seenReplies.add(item.id);
      const bubble = document.createElement('div');
      bubble.className = 'm bot';
      if (WORKERS.includes(item.from)) {
        const tag = document.createElement('span');
        tag.className = 'cc-from';
        tag.textContent = item.from;
        bubble.appendChild(tag);
      }
      const body = document.createElement('div');
      body.innerHTML = renderText(item.text || '');
      bubble.appendChild(body);
      msgs.appendChild(bubble);
    });
    primed = true;
    if (fresh) document.getElementById('cc-unread')?.classList.add('on');
    setHeader(payload.folder);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function currentContext() {
    const current = document.querySelector('#nav button.on span');
    const count = document.querySelector('#nav button[data-v="deadlines"] .count');
    const pendingDeadlines = count ? Number(count.textContent) : 0;
    return {
      view: current ? current.textContent.trim() : '',
      pendingDeadlines: Number.isFinite(pendingDeadlines) ? pendingDeadlines : 0,
    };
  }

  async function sendUserText(raw) {
    const text = String(raw || '').trim();
    if (!text) return;
    const input = document.getElementById('chatI');
    if (input) input.value = '';
    let result = null;
    try {
      result = await window.campusCopilot.sendChat({ text, context: currentContext() });
    } catch (err) {
      result = { ok: false, reason: 'no-folder' };
    }
    if (!result || !result.ok) {
      localOnly.push({ id: `local-${Date.now()}`, role: 'user', text, sentAt: new Date().toISOString(), local: true });
      const info = await window.campusCopilot.getChat().catch(() => ({ folder: null, outbox: { messages: [] }, inbox: { messages: [] } }));
      renderThread(info || { folder: null, outbox: { messages: [] }, inbox: { messages: [] } });
      return;
    }
    renderThread(result);
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    sendUserText(document.getElementById('chatI') && document.getElementById('chatI').value);
  }, true);
  quick.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    sendUserText(button.textContent);
  }, true);

  window.openChat = function openDriveChat() {
    chat.classList.add('open');
    const copi = document.getElementById('copi');
    if (copi) copi.classList.remove('open');
    document.getElementById('cc-unread')?.classList.remove('on');
    setTimeout(() => {
      const input = document.getElementById('chatI');
      if (input) input.focus();
    }, 200);
  };
  window.toggleChat = function toggleDriveChat() {
    if (chat.classList.contains('open')) chat.classList.remove('open');
    else window.openChat();
  };

  window.campusCopilot.onChatUpdate((payload) => {
    if (payload && payload.folder && localOnly.length) {
      const queued = localOnly.slice();
      localOnly = [];
      queued.reduce((chain, item) => chain.then(() => window.campusCopilot.sendChat({ text: item.text, context: currentContext() })), Promise.resolve())
        .then(() => window.campusCopilot.getChat())
        .then((next) => renderThread(next))
        .catch(() => {});
      return;
    }
    renderThread(payload);
  });
  window.campusCopilot.getChat().then((payload) => renderThread(payload)).catch(() => {});
}
