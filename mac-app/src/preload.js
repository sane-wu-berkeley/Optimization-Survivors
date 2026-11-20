const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('campusCopilot', {
  report(payload) {
    return ipcRenderer.invoke('sync-report', payload);
  },
  getSyncInfo() {
    return ipcRenderer.invoke('sync-info');
  },
  chooseSyncFolder() {
    return ipcRenderer.invoke('choose-sync-folder');
  },
  getChat() {
    return ipcRenderer.invoke('chat-get');
  },
  sendChat(body) {
    return ipcRenderer.invoke('chat-send', body);
  },
  onChatUpdate(callback) {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('chat-update', handler);
    return () => ipcRenderer.removeListener('chat-update', handler);
  },
});

function openIfExternal(event) {
  const target = event.target;
  if (!target || typeof target.closest !== 'function') return;
  const anchor = target.closest('a[href]');
  if (!anchor) return;
  const href = anchor.href;
  let url;
  try {
    url = new URL(href);
  } catch (err) {
    return;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:' && url.protocol !== 'mailto:') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  ipcRenderer.send('open-external', href);
}

window.addEventListener('click', openIfExternal, true);
window.addEventListener('auxclick', (event) => {
  if (event.button !== 1) return;
  openIfExternal(event);
}, true);
