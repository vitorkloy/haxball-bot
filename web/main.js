import { BotController } from './bot-controller.js';
import { getConfig } from './config.js';
import { BotManager, STATUS, JOIN_STAGGER_MS } from './multi-bot.js';

const manager = new BotManager();
// id -> { room, controller, pendingJoin, timer, interval }
const runtime = new Map();
let api = null;

const $ = (id) => document.getElementById(id);
const listEl = $('bot-list');
const errorMsg = $('error-message');
const TEAM = ['⚪ Espec.', '🔴 Verm.', '🔵 Azul'];
const STATUS_LABEL = {
  [STATUS.IDLE]: '⏹️ Parado', [STATUS.JOINING]: '⏳ Conectando', [STATUS.CONNECTED]: '✅ Na sala', [STATUS.ERROR]: '❌ Erro'
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

function getAPI() {
  if (api) return api;
  if (typeof abcHaxballAPI === 'undefined') throw new Error('Biblioteca node-haxball não carregada. Recarregue a página.');
  api = abcHaxballAPI(window, {
    proxy: { WebSocketUrl: 'wss://node-haxball.onrender.com/', HttpUrl: 'https://node-haxball.onrender.com/rs/' }
  });
  return api;
}

function closeReason(reason) {
  if (reason?.code === 8) return 'código 8: falha WebRTC com o host (NAT/firewall). Tente outra rede ou npm run join';
  if (reason?.code === 5) return 'senha incorreta';
  let text = '';
  try { text = reason?.toString?.() || ''; } catch (e) {}
  if (!text || text === 'undefined' || text === '[object Object]') text = reason?.code != null ? `código ${reason.code}` : '';
  if (/captcha/i.test(text)) return 'a sala exige CAPTCHA (bots não resolvem)';
  if (/full/i.test(text)) return 'sala cheia';
  if (/banned|kick/i.test(text)) return 'expulso/banido';
  return text;
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
      const rt = runtime.get(bot.id);
      if (rt?.controller) { // aplica na hora, recriando a IA
        rt.controller.config = getConfig(e.target.value, bot.nick, $('avatar').value || '🤖');
        rt.controller.ai = null;
      }
    });
    row.querySelector('.bot-toggle').addEventListener('click', () => {
      const b = manager.get(bot.id);
      if (b.status === STATUS.JOINING || b.status === STATUS.CONNECTED) stopBot(bot.id);
      else joinBot(bot.id);
    });
    row.querySelector('.bot-remove').addEventListener('click', () => removeBot(bot.id));
    listEl.appendChild(row);
  }
  const busy = bot.status === STATUS.JOINING || bot.status === STATUS.CONNECTED;
  const rt = runtime.get(bot.id);
  const team = rt?.room?.currentPlayer?.team?.id;
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
  $('stop-all-btn').disabled = manager.active().length === 0 && ![...runtime.values()].some((r) => r.timer);
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

// ---------- Conexão por bot ----------
async function joinBot(id) {
  const bot = manager.get(id);
  if (!bot) return;
  let roomId;
  try { roomId = parseRoomLink($('room-link').value); } catch (e) { showError(e.message); return; }
  if (!$('room-link').value.trim()) { showError('Por favor, cole o link da sala'); return; }
  const password = $('password').value || undefined;
  const avatar = $('avatar').value || '🤖';
  const rt = { room: null, controller: null, pendingJoin: null, timer: null, interval: null, stopped: false };
  runtime.set(id, rt);
  setStatus(id, STATUS.JOINING, { error: '', debug: '' });
  logEvent(`[${bot.nick}] entrando na sala ${roomId}...`);
  try {
    const { Room, Utils } = getAPI();
    // identidade própria por bot (cada conexão é um jogador distinto)
    const [, authObj] = await Utils.generateAuth();
    if (rt.stopped) return;
    rt.pendingJoin = Room.join({ id: roomId, password, authObj }, {
      storage: { player_name: bot.nick, avatar },
      onOpen: (room) => {
        rt.pendingJoin = null;
        rt.room = room;
        const controller = new BotController(room, getConfig(bot.difficulty, bot.nick, avatar));
        controller.onDebug = (msg) => { manager.update(id, { debug: msg }); renderRow(manager.get(id) || bot); };
        controller.initialize();
        controller.setActive(!!room.gameState && room.currentPlayer?.team?.id > 0);
        rt.controller = controller;
        setupRoomEvents(id, rt);
        rt.interval = setInterval(() => { controller.update(); }, 1000 / 60);
        setStatus(id, STATUS.CONNECTED);
        logEvent(`[${bot.nick}] ✅ conectado: ${room.name}`);
      },
      onClose: (reason) => {
        const text = closeReason(reason);
        logEvent(`[${bot.nick}] ❌ desconectado${text ? ` (${text})` : ''}`);
        rt.room = null; // já fechada
        cleanup(id, rt);
        if (!rt.stopped) setStatus(id, STATUS.ERROR, { error: text || 'desconectado' });
      }
    });
  } catch (e) {
    console.error(e);
    cleanup(id, rt);
    setStatus(id, STATUS.ERROR, { error: e.message });
    logEvent(`[${bot.nick}] ❌ ${e.message}`);
  }
}

function setupRoomEvents(id, rt) {
  const { room, controller } = rt;
  const nick = () => manager.get(id)?.nick || '?';
  const activateIfPlaying = () => {
    const team = room.currentPlayer?.team?.id;
    if (team > 0 && room.gameState) {
      if (!controller.ai) controller.initialize();
      controller.setActive(true);
    } else controller.setActive(false);
    renderRow(manager.get(id));
  };
  room.onGameStart = activateIfPlaying;
  room.onGameTick = () => controller.update(); // timers são limitados em abas em segundo plano
  room.onPlayerTeamChange = (playerId) => { if (playerId === room.currentPlayerId) activateIfPlaying(); };
  room.onGameStop = () => controller.setActive(false);
}

function cleanup(id, rt) {
  if (rt.timer) { clearTimeout(rt.timer); rt.timer = null; }
  if (rt.pendingJoin) { try { rt.pendingJoin.cancel?.(); } catch (e) {} rt.pendingJoin = null; }
  if (rt.interval) { clearInterval(rt.interval); rt.interval = null; }
  if (rt.controller) { rt.controller.setActive(false); rt.controller = null; }
  if (rt.room) { const r = rt.room; rt.room = null; try { r.leave?.(); } catch (e) {} }
  if (runtime.get(id) === rt) runtime.delete(id);
}

function stopBot(id, silent = false) {
  const rt = runtime.get(id);
  if (rt) { rt.stopped = true; cleanup(id, rt); }
  if (manager.get(id)) {
    setStatus(id, STATUS.IDLE, { debug: '' });
    if (!silent && rt) logEvent(`[${manager.get(id).nick}] parado`);
  }
}

function joinAll() {
  try { parseRoomLink($('room-link').value); } catch (e) { showError(e.message); return; }
  const plan = manager.joinPlan(JOIN_STAGGER_MS);
  if (plan.length > 1) logEvent(`Entrando com ${plan.length} bots (um a cada ${JOIN_STAGGER_MS / 1000}s)`);
  for (const { id, delay } of plan) {
    if (delay === 0) { joinBot(id); continue; }
    const placeholder = { timer: null, stopped: false };
    placeholder.timer = setTimeout(() => { if (runtime.get(id) === placeholder) runtime.delete(id); joinBot(id); }, delay);
    runtime.set(id, placeholder);
    setStatus(id, STATUS.JOINING, { error: '', debug: `na fila (${delay / 1000}s)` });
  }
}

function stopAll() {
  for (const b of [...manager.bots]) stopBot(b.id, true);
  logEvent('Todos os bots parados');
}

// atualiza time/estado periodicamente
setInterval(() => { for (const [id, rt] of runtime) if (rt.room) renderRow(manager.get(id)); }, 1000);

$('add-bot-btn').addEventListener('click', addBot);
$('join-all-btn').addEventListener('click', joinAll);
$('stop-all-btn').addEventListener('click', stopAll);
$('room-link').addEventListener('keypress', (e) => { if (e.key === 'Enter') joinAll(); });
window.addEventListener('beforeunload', stopAll);

addBot();
logEvent('Pronto. Adicione bots e clique em "Entrar com todos".');
window.__haxbotManager = manager; // depuração
