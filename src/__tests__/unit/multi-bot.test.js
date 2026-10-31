import { BotManager, nextNick, STATUS, MAX_BOTS } from '../../multi-bot.js';
import { runMatch, newAI } from '../../../scripts/sim.js';

describe('nextNick', () => {
  test('sufixo incremental e preenche buracos', () => {
    expect(nextNick('Bot', [])).toBe('Bot1');
    expect(nextNick('Bot', ['Bot1', 'Bot2'])).toBe('Bot3');
    expect(nextNick('Bot', ['Bot2'])).toBe('Bot1');
    expect(nextNick('', [])).toBe('Bot1');
    expect(nextNick('NomeMuitoGrandeX', []).length).toBeLessThanOrEqual(15);
  });
});

describe('BotManager', () => {
  test('adiciona até o máximo com nicks únicos', () => {
    const m = new BotManager();
    for (let i = 0; i < MAX_BOTS; i++) m.add();
    expect(m.bots.map((b) => b.nick)).toEqual(['Bot1', 'Bot2', 'Bot3', 'Bot4', 'Bot5', 'Bot6']);
    expect(m.canAdd()).toBe(false);
    expect(() => m.add()).toThrow();
  });
  test('nick duplicado vira automático; remove libera', () => {
    const m = new BotManager();
    const a = m.add({ nick: 'Zé' });
    expect(m.add({ nick: 'Zé' }).nick).toBe('Bot1');
    m.remove(a.id);
    expect(m.bots.length).toBe(1);
    expect(m.remove(999)).toBeNull();
  });
  test('joinPlan escalona só bots fora da sala', () => {
    const m = new BotManager();
    const a = m.add(); const b = m.add(); const c = m.add();
    m.update(b.id, { status: STATUS.CONNECTED });
    m.update(c.id, { status: STATUS.ERROR });
    expect(m.joinPlan(1000)).toEqual([{ id: a.id, delay: 0 }, { id: c.id, delay: 1000 }]);
    expect(m.active().map((x) => x.id)).toEqual([b.id]);
  });
});

describe('2 IAs no mesmo time', () => {
  test('não correm as duas atrás da bola', () => {
    let both = 0, total = 0;
    const pos = {};
    const track = (seed) => () => {
      const f = newAI({ seed });
      return (gs, p, state, now) => {
        pos[p.id] = p.disc.ext?.pos || p.disc.pos;
        const ball = gs.physicsState.discs[0].pos;
        if (seed === 1 && pos[1] && pos[2]) {
          total++;
          const near = [pos[1], pos[2]].filter((q) => Math.hypot(q.x - ball.x, q.y - ball.y) < 60).length;
          if (near === 2) both++;
        }
        return f(gs, p, state, now);
      };
    };
    const r = runMatch({ red: [track(1), track(2)], blue: [() => newAI({ seed: 3 })], ticks: 3600 });
    expect(total).toBeGreaterThan(0);
    console.log(`2v1: ambos perto da bola em ${(100 * both / total).toFixed(1)}% dos ticks; placar ${r.red}x${r.blue}`);
    expect(both / total).toBeLessThan(0.2);
  }, 30000);
});

import { connectWithRetry, runSequential, isFatalError } from '../../multi-bot.js';
const noSleep = () => Promise.resolve();

describe('connectWithRetry', () => {
  test('timeout + nova tentativa até conectar', async () => {
    const seen = []; let cancels = 0;
    const attempt = (n) => ({
      promise: n < 3 ? new Promise(() => {}) : Promise.resolve('ok'),
      cancel: () => cancels++
    });
    const r = await connectWithRetry(attempt, { timeoutMs: 10, sleep: noSleep, onAttempt: (n, t) => seen.push(`${n}/${t}`) });
    expect(r).toBe('ok');
    expect(seen).toEqual(['1/3', '2/3', '3/3']);
    expect(cancels).toBe(2);
  });
  test('desiste após 3 tentativas', async () => {
    const attempt = () => ({ promise: Promise.reject(new Error('código 8')) });
    let n = 0;
    await expect(connectWithRetry(attempt, { sleep: noSleep, onAttempt: () => n++ })).rejects.toThrow('código 8');
    expect(n).toBe(3);
  });
  test('erro fatal não repete', async () => {
    let n = 0;
    await expect(connectWithRetry(() => ({ promise: Promise.reject(new Error('senha incorreta')) }), { sleep: noSleep, onAttempt: () => n++ })).rejects.toThrow();
    expect(n).toBe(1);
    expect(isFatalError('sala cheia')).toBe(true);
    expect(isFatalError('código 8')).toBe(false);
  });
});

describe('runSequential', () => {
  test('um de cada vez, falhas isoladas', async () => {
    let running = 0, max = 0;
    const r = await runSequential([1, 2, 3], async (x) => {
      running++; max = Math.max(max, running);
      await new Promise((res) => setTimeout(res, 5));
      running--;
      if (x === 2) throw new Error('falhou');
      return x;
    }, { sleep: noSleep });
    expect(max).toBe(1);
    expect(r.map((x) => x.ok)).toEqual([true, false, true]);
  });
});
