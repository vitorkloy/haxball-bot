// Gerenciador de estado da lista de bots (sem DOM / sem rede: testável em Node).
export const MAX_BOTS = 6;
export const JOIN_STAGGER_MS = 1500;
export const STATUS = { IDLE: 'parado', JOINING: 'conectando', CONNECTED: 'conectado', ERROR: 'erro' };

/** Gera nick único: base + menor sufixo livre (Bot1, Bot2...), máx. 15 chars. */
export function nextNick(base, used) {
  const b = (String(base || '').trim() || 'Bot').slice(0, 13);
  const taken = new Set(used);
  for (let i = 1; ; i++) {
    const nick = `${b}${i}`.slice(0, 15);
    if (!taken.has(nick)) return nick;
  }
}

export class BotManager {
  constructor({ max = MAX_BOTS, base = 'Bot' } = {}) {
    this.max = max;
    this.base = base;
    this.bots = [];
    this.seq = 0;
  }
  canAdd() { return this.bots.length < this.max; }
  add({ nick, difficulty = 'medium' } = {}) {
    if (!this.canAdd()) throw new Error(`Máximo de ${this.max} bots`);
    const used = this.bots.map((b) => b.nick);
    let n = (nick || '').trim().slice(0, 15);
    if (!n || used.includes(n)) n = nextNick(this.base, used);
    const bot = { id: ++this.seq, nick: n, difficulty, status: STATUS.IDLE, debug: '', error: '' };
    this.bots.push(bot);
    return bot;
  }
  remove(id) {
    const i = this.bots.findIndex((b) => b.id === id);
    if (i < 0) return null;
    return this.bots.splice(i, 1)[0];
  }
  get(id) { return this.bots.find((b) => b.id === id) || null; }
  update(id, patch) {
    const b = this.get(id);
    if (b) Object.assign(b, patch);
    return b;
  }
  /** Bots que ainda não estão em sala, com o atraso (ms) de cada entrada escalonada. */
  joinPlan(stagger = JOIN_STAGGER_MS) {
    return this.bots
      .filter((b) => b.status === STATUS.IDLE || b.status === STATUS.ERROR)
      .map((b, i) => ({ id: b.id, delay: i * stagger }));
  }
  active() { return this.bots.filter((b) => b.status === STATUS.JOINING || b.status === STATUS.CONNECTED); }
}

export const CONNECT_TIMEOUT_MS = 20000;
export const MAX_RETRIES = 2;

/** Erros que não adianta repetir (senha errada, sala cheia, ban, captcha). */
export function isFatalError(msg) {
  return /senha|cheia|banido|expulso|captcha|inválido/i.test(String(msg || ''));
}

/**
 * Tenta conectar com timeout e novas tentativas.
 * attempt(n) -> { promise, cancel }: a promise resolve ao conectar e rejeita com Error ao falhar.
 * Resolve com o valor da conexão; rejeita com o último erro. `isCancelled()` interrompe.
 */
export async function connectWithRetry(attempt, {
  timeoutMs = CONNECT_TIMEOUT_MS, retries = MAX_RETRIES, onAttempt = () => {},
  isCancelled = () => false, retryDelayMs = 2000, sleep = (ms) => new Promise((r) => setTimeout(r, ms))
} = {}) {
  let lastErr;
  for (let n = 1; n <= retries + 1; n++) {
    if (isCancelled()) throw new Error('cancelado');
    onAttempt(n, retries + 1);
    const h = attempt(n);
    let timer;
    try {
      return await Promise.race([
        h.promise,
        new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`tempo esgotado (${timeoutMs / 1000}s) conectando`)), timeoutMs); })
      ]);
    } catch (e) {
      lastErr = e;
      try { h.cancel?.(); } catch (_) {}
      if (isFatalError(e.message) || isCancelled()) throw e;
      if (n <= retries) await sleep(retryDelayMs);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

/** Executa tarefas assíncronas uma por vez (a próxima só começa quando a anterior conectou ou falhou). */
export async function runSequential(items, fn, { gapMs = 1000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const results = [];
  for (let i = 0; i < items.length; i++) {
    if (i > 0 && gapMs) await sleep(gapMs);
    try { results.push({ ok: true, value: await fn(items[i], i) }); } catch (e) { results.push({ ok: false, error: e }); }
  }
  return results;
}
