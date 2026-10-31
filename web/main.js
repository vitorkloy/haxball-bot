import { BotManager, STATUS, JOIN_STAGGER_MS, connectWithRetry, runSequential } from './multi-bot.js';

const manager = new BotManager();
// id -> { room, controller, pendingJoin, timer, interval }
const runtime = new Map();

const $ = (id) => document.getElementById(id);
const listEl = $('bot-list');
const errorMsg = $('error-message');
const TEAM = ['⚪ Espec.', '🔴 Verm.', '🔵 Azul'];
const STATUS_LABEL = {
  [STATUS.IDLE]: '⏹️ Parado', [STATUS.JOINING]: '⏳ Conectando…', [STATUS.CONNECTED]: '✅ Na sala', [STATUS.ERROR]: '❌ Erro'
};

function showError(message) {
  errorMsg.textContent = message;
  errorMsg.style.display = 'block';
  setTimeout(() => { errorMsg.style.display = 'none'; }, 6000);
}

function logEvent(message) {
  const log = $('event-log');
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  const time = document.createElement('span');
  time.className = 'log-time';
  time.textContent = `[${new Date().toLocaleTimeString('pt-BR')}] `;
  entry.append(time, message);
  log.insertBefore(entry, log.firstChild);
  while (log.children.length > 80) log.removeChild(log.lastChild);
}

function parseRoomLink(link) {
  const text = String(link || '').trim();
  const fromParam = text.match(/[?&#]c=([A-Za-z0-9_-]+)/);
  if (fromParam) return fromParam[1];
  if (/^[A-Za-z0-9_-]{6,}$/.test(text)) return text;
  throw new Error('Link inválido. Use o formato: https://www.haxball.com/play?c=XXXXX (ou só o ID da sala)');
}

// ---------- UI ----------
function renderRow(bot) {
  let row = listEl.querySelector(`[data-id="${bot.id}"]`);
  if (!row) {
    row = document.createElement('div');
    row.className = 'bot-row';
    row.dataset.id = bot.id;
    row.innerHTML = `
      <input class="bot-nick" maxlength="15" aria-label="Nick do bot">
      <select class="bot-diff" aria-label="Dificuldade">
        <option value="easy">Fácil</option><option value="medium">Médio</option>
        <option value="hard">Difícil</option><option value="insane">Insano</option>
      </select>
      <span class="bot-status"></span>
      <button class="bot-toggle btn-secondary"></button>
      <button class="bot-remove btn-danger" title="Remover">🗑️</button>
      <div class="bot-debug"></div>`;
    row.querySelector('.bot-nick').value = bot.nick;
    row.querySelector('.bot-diff').value = bot.difficulty;
    row.querySelector('.bot-nick').addEventListener('change', (e) => {
      manager.update(bot.id, { nick: e.target.value.trim() || bot.nick });
      e.target.value = manager.get(bot.id).nick;
    });
    row.querySelector('.bot-diff').addEventListener('change', (e) => {
      manager.update(bot.id, { difficulty: e.target.value });
      runtime.get(bot.id)?.handle?.setDifficulty(e.target.value); // aplica na hora
    });
    row.querySelector('.bot-toggle').addEventListener('click', () => {
      const b = manager.get(bot.id);
      if (b.status === STATUS.JOINING || b.status === STATUS.CONNECTED) stopBot(bot.id);
      else joinBot(bot.id).catch(() => {});
    });
    row.querySelector('.bot-remove').addEventListener('click', () => removeBot(bot.id));
    listEl.appendChild(row);
  }
  const busy = bot.status === STATUS.JOINING || bot.status === STATUS.CONNECTED;
  const rt = runtime.get(bot.id);
  const team = rt?.handle?.team?.();
  row.querySelector('.bot-status').textContent =
    STATUS_LABEL[bot.status] + (bot.status === STATUS.CONNECTED && team != null ? ` ${TEAM[team] || ''}` : '');
  row.querySelector('.bot-status').title = bot.error || '';
  row.querySelector('.bot-toggle').textContent = busy ? '⏹️ Parar' : '▶️ Entrar';
  row.querySelector('.bot-nick').disabled = busy;
  row.querySelector('.bot-debug').textContent = bot.error ? `⚠️ ${bot.error}` : bot.debug;
}

function renderAll() {
  for (const b of manager.bots) renderRow(b);
  $('bot-count').textContent = `(${manager.bots.length}/${manager.max})`;
  $('add-bot-btn').disabled = !manager.canAdd();
  $('join-all-btn').disabled = manager.joinPlan().length === 0;
  $('stop-all-btn').disabled = manager.active().length === 0 && !joiningAll;
}

function setStatus(id, status, extra = {}) {
  if (!manager.update(id, { status, ...extra })) return;
  renderAll();
}

function addBot() {
  try {
    const bot = manager.add({ difficulty: 'medium' });
    renderAll();
    return bot;
  } catch (e) { showError(e.message); return null; }
}

function removeBot(id) {
  stopBot(id, true);
  manager.remove(id);
  listEl.querySelector(`[data-id="${id}"]`)?.remove();
  renderAll();
}

// ---------- Conexão por bot (cada bot numa iframe isolada) ----------
function frameUrl() {
  return new URL('bot-frame.html', document.baseURI).href;
}

/** Cria uma iframe nova e espera o startBot dela ficar pronto. */
function createFrame() {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.className = 'bot-frame';
    iframe.style.display = 'none';
    iframe.src = frameUrl();
    const t = setTimeout(() => reject(new Error('iframe do bot não carregou')), 15000);
    const check = () => {
      const w = iframe.contentWindow;
      if (w?.botFrameReady && w.startBot) { clearTimeout(t); resolve(iframe); return true; }
      return false;
    };
    iframe.addEventListener('load', () => {
      if (check()) return;
      iframe.contentWindow.addEventListener('botframe-ready', check);
      const poll = setInterval(() => { if (check()) clearInterval(poll); }, 100);
      setTimeout(() => clearInterval(poll), 15000);
    });
    document.body.appendChild(iframe);
  });
}

/** Uma tentativa de conexão: { promise, cancel } (formato do connectWithRetry). */
function attemptJoin(id, rt, params) {
  let iframe = null, handle = null, cancelled = false;
  const destroy = () => {
    try { handle?.cancel(); } catch (e) {}
    handle = null;
    iframe?.remove();
    iframe = null;
  };
  const promise = (async () => {
    iframe = await createFrame();
    if (cancelled) throw new Error('cancelado');
    const bot = manager.get(id);
    handle = iframe.contentWindow.startBot({ ...params, nick: bot.nick, difficulty: bot.difficulty }, {
      onDebug: (m) => {
        const joining = manager.get(id)?.status === STATUS.JOINING;
        if (manager.update(id, { debug: joining ? `${rt.label} · ${m}` : m })) renderRow(manager.get(id));
      },
      onTeam: () => manager.get(id) && renderRow(manager.get(id)),
      onClose: (text) => {
        logEvent(`[${manager.get(id)?.nick || '?'}] ❌ desconectado (${text})`);
        destroy();
        if (runtime.get(id) === rt) runtime.delete(id);
        setStatus(id, STATUS.ERROR, { error: text });
      }
    });
    const info = await handle.promise;
    rt.handle = handle;
    rt.destroy = destroy;
    return info;
  })();
  return { promise, cancel: () => { cancelled = true; destroy(); } };
}

async function joinBot(id) {
  const bot = manager.get(id);
  if (!bot) return;
  let roomId;
  try { roomId = parseRoomLink($('room-link').value); } catch (e) { showError(e.message); throw e; }
  const params = { roomId, password: $('password').value || undefined, avatar: $('avatar').value || '🤖' };
  const old = runtime.get(id);
  if (old) { old.stopped = true; old.cancel?.(); old.destroy?.(); }
  const rt = { stopped: false, handle: null, destroy: null, cancel: null };
  runtime.set(id, rt);
  setStatus(id, STATUS.JOINING, { error: '', debug: '' });
  logEvent(`[${bot.nick}] entrando na sala ${roomId}...`);
  let current = null;
  rt.cancel = () => current?.cancel();
  try {
    const info = await connectWithRetry((n) => (current = attemptJoin(id, rt, params)), {
      isCancelled: () => rt.stopped,
      onAttempt: (n, total) => {
        if (n > 1) logEvent(`[${bot.nick}] nova tentativa ${n}/${total}`);
        rt.label = `Conectando (tentativa ${n}/${total})`;
        setStatus(id, STATUS.JOINING, { debug: rt.label });
      }
    });
    if (rt.stopped) return;
    setStatus(id, STATUS.CONNECTED, { debug: '' });
    logEvent(`[${bot.nick}] ✅ conectado: ${info?.name || ''}`);
  } catch (e) {
    if (rt.stopped) return;
    if (runtime.get(id) === rt) runtime.delete(id);
    const msg = e.message?.startsWith('código 8')
      ? `${e.message}. Se só 1 bot conecta, a rede/host pode estar limitando conexões`
      : e.message;
    setStatus(id, STATUS.ERROR, { error: msg });
    logEvent(`[${bot.nick}] ❌ ${msg}`);
    throw e;
  }
}

function stopBot(id, silent = false) {
  const rt = runtime.get(id);
  if (rt) { rt.stopped = true; rt.cancel?.(); rt.destroy?.(); runtime.delete(id); }
  if (manager.get(id)) {
    setStatus(id, STATUS.IDLE, { debug: '', error: '' });
    if (!silent && rt) logEvent(`[${manager.get(id).nick}] parado`);
  }
}

let joiningAll = false;
async function joinAll() {
  if (joiningAll) return;
  try { parseRoomLink($('room-link').value); } catch (e) { showError(e.message); return; }
  const ids = manager.joinPlan().map((p) => p.id);
  if (!ids.length) return;
  joiningAll = true;
  for (const id of ids) setStatus(id, STATUS.JOINING, { error: '', debug: 'na fila' });
  if (ids.length > 1) logEvent(`Entrando com ${ids.length} bots, um de cada vez`);
  try {
    // o próximo só começa depois que o anterior entrou ou falhou de vez
    await runSequential(ids, (id) => (manager.get(id)?.status === STATUS.JOINING ? joinBot(id) : null),
      { gapMs: JOIN_STAGGER_MS });
  } finally {
    joiningAll = false;
    renderAll();
  }
}

function stopAll() {
  for (const b of [...manager.bots]) stopBot(b.id, true);
  logEvent('Todos os bots parados');
}

// atualiza time/estado periodicamente
setInterval(() => { for (const [id, rt] of runtime) if (rt.handle) renderRow(manager.get(id)); }, 1000);

$('add-bot-btn').addEventListener('click', addBot);
$('join-all-btn').addEventListener('click', joinAll);
$('stop-all-btn').addEventListener('click', stopAll);
$('room-link').addEventListener('keypress', (e) => { if (e.key === 'Enter') joinAll(); });
window.addEventListener('beforeunload', stopAll);

addBot();
logEvent('Pronto. Adicione bots e clique em "Entrar com todos".');
window.__haxbotManager = manager; // depuração
