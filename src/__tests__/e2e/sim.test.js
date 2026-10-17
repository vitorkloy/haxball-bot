import { runMatch, newAI } from '../../../scripts/sim.js';

describe('Simulador headless (física real do Haxball)', () => {
  test('partida 1v1 roda e a bola se move', () => {
    let moved = false;
    const spy = (st) => {
      const f = newAI({ seed: 1 });
      return (gs, p, state, now) => {
        const b = gs.physicsState.discs[0].pos;
        if (Math.abs(b.x) > 1 || Math.abs(b.y) > 1) moved = true;
        return f(gs, p, state, now);
      };
    };
    const r = runMatch({ red: [spy], blue: [(st) => newAI({ seed: 2 })], ticks: 1200 });
    expect(r.ticks).toBe(1200);
    expect(typeof r.red).toBe('number');
    expect(moved).toBe(true);
  }, 20000);

  test('nova IA marca gol contra adversário parado', () => {
    const idle = () => () => ({ dirX: 0, dirY: 0, kick: false });
    const r = runMatch({ red: [(st) => newAI({ seed: 3 })], blue: [idle], ticks: 3600, scoreLimit: 1 });
    expect(r.red).toBeGreaterThanOrEqual(1);
  }, 20000);
});
