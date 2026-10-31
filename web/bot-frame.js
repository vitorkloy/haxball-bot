// Roda UM bot dentro desta iframe. A página principal chama window.startBot(...).
import { BotController } from './bot-controller.js';
import { getConfig } from './config.js';

function closeReason(reason) {
  if (reason?.code === 8) return 'código 8: falha WebRTC com o host (NAT/firewall)';
  if (reason?.code === 5) return 'senha incorreta';
  let text = '';
  try { text = reason?.toString?.() || ''; } catch (e) {}
  if (!text || text === 'undefined' || text === '[object Object]') text = reason?.code != null ? `código ${reason.code}` : 'desconectado';
  if (/captcha/i.test(text)) return 'a sala exige CAPTCHA (bots não resolvem)';
  if (/full/i.test(text)) return 'sala cheia';
  if (/banned|kick/i.test(text)) return 'expulso/banido';
  return text;
}

/**
 * opts: { roomId, password, nick, avatar, difficulty }
 * cb:   { onDebug(msg), onClose(reasonText), onTeam() }
 * Retorna { promise (resolve ao entrar), cancel(), setDifficulty(d), team() }
 */
window.startBot = function startBot(opts, cb = {}) {
  let room = null, controller = null, interval = null, pending = null, done = false;
  let resolveJoin, rejectJoin;
  const promise = new Promise((res, rej) => { resolveJoin = res; rejectJoin = rej; });

  const cleanup = () => {
    if (interval) clearInterval(interval);
    interval = null;
    controller?.setActive(false);
    try { pending?.cancel?.(); } catch (e) {}
    pending = null;
    const r = room; room = null;
    try { r?.leave?.(); } catch (e) {}
  };

  (async () => {
    try {
      if (typeof abcHaxballAPI === 'undefined') throw new Error('Biblioteca node-haxball não carregada. Recarregue a página.');
      const { Room, Utils } = abcHaxballAPI(window, {
        proxy: { WebSocketUrl: 'wss://node-haxball.onrender.com/', HttpUrl: 'https://node-haxball.onrender.com/rs/' }
      });
      const [, authObj] = await Utils.generateAuth(); // identidade própria
      if (done) return;
      pending = Room.join({ id: opts.roomId, password: opts.password || undefined, authObj }, {
        storage: { player_name: opts.nick, avatar: opts.avatar || '🤖' },
        onConnInfo: (state) => cb.onDebug?.(`conexão: etapa ${state}`),
        onOpen: (r) => {
          pending = null;
          room = r;
          controller = new BotController(r, getConfig(opts.difficulty, opts.nick, opts.avatar));
          controller.onDebug = (m) => cb.onDebug?.(m);
          controller.initialize();
          const sync = () => {
            const playing = r.currentPlayer?.team?.id > 0 && !!r.gameState;
            if (playing && !controller.ai) controller.initialize();
            controller.setActive(playing);
            cb.onTeam?.();
          };
          sync();
          r.onGameStart = sync;
          r.onGameStop = () => controller.setActive(false);
          r.onGameTick = () => controller.update();
          r.onPlayerTeamChange = (pid) => { if (pid === r.currentPlayerId) sync(); };
          interval = setInterval(() => controller.update(), 1000 / 60);
          resolveJoin({ name: r.name });
        },
        onClose: (reason) => {
          const text = closeReason(reason);
          room = null;
          const wasOpen = !!controller;
          cleanup();
          if (!wasOpen) rejectJoin(new Error(text));
          else if (!done) cb.onClose?.(text);
          done = true;
        }
      });
    } catch (e) {
      cleanup();
      rejectJoin(e);
    }
  })();

  return {
    promise,
    cancel() { done = true; cleanup(); },
    setDifficulty(d) {
      if (!controller) return;
      controller.config = getConfig(d, opts.nick, opts.avatar);
      controller.ai = null;
    },
    team() { return room?.currentPlayer?.team?.id ?? null; }
  };
};
window.dispatchEvent(new Event('botframe-ready'));
window.botFrameReady = true;
