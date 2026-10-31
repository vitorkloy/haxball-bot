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
