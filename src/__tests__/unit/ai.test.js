import { BotAI, predictBall, interceptPoint, distanceCovered } from '../../ai.js';
import { GAME_STATES } from '../../config.js';

// Objetos no mesmo formato do node-haxball (Room.state / gameState / Player / Disc)
const stadium = {
  width: 420,
  height: 200,
  goals: [
    { team: { id: 2 }, p0: { x: 370, y: -64 }, p1: { x: 370, y: 64 } },
    { team: { id: 1 }, p0: { x: -370, y: -64 }, p1: { x: -370, y: 64 } }
  ]
};
const disc = (x, y, vx = 0, vy = 0, radius = 15) => ({ pos: { x, y }, speed: { x: vx, y: vy }, radius, ext: null });
const player = (id, team, x, y, vx = 0, vy = 0) => ({ id, team: { id: team }, isKicking: false, disc: disc(x, y, vx, vy) });
function world(ball, players, state = 1) {
  return {
    gameState: { state, stadium, physicsState: { discs: [disc(ball.x, ball.y, ball.vx || 0, ball.vy || 0, 10)] } },
    roomState: { stadium, players }
  };
}
const geo = { attack: 1, goalX: 370, postY: 64, fieldY: 170 };
const cfg = { ai: { reactionTime: 0, noise: 0 } };

describe('previsão da bola', () => {
  test('aplica amortecimento', () => {
    const p = predictBall({ x: 0, y: 0, vx: 2, vy: 0, r: 10 }, geo, 10);
    expect(p[9].vx).toBeLessThan(2);
    expect(p[9].x).toBeGreaterThan(15);
  });
  test('quica na parede lateral', () => {
    const p = predictBall({ x: 0, y: 150, vx: 0, vy: 5, r: 10 }, geo, 10);
    expect(p.some((s) => s.vy < 0)).toBe(true);
    expect(Math.max(...p.map((s) => s.y))).toBeLessThanOrEqual(160);
  });
  test('detecta bola entrando no nosso gol', () => {
    const p = predictBall({ x: -200, y: 0, vx: -6, vy: 0, r: 10 }, geo, 120);
    expect(p[p.length - 1].goal).toBe('own');
  });
  test('quica na linha de fundo fora do gol', () => {
    const p = predictBall({ x: 300, y: 120, vx: 6, vy: 0, r: 10 }, geo, 60);
    expect(p.some((s) => s.goal)).toBe(false);
    expect(p[p.length - 1].vx).toBeLessThan(0);
  });
  test('ponto de interceptação alcançável', () => {
    const path = predictBall({ x: 0, y: 0, vx: -3, vy: 0, r: 10 }, geo, 120);
    const i = interceptPoint({ x: -200, y: 0, vx: 0, vy: 0 }, path, 25);
    expect(i.t).toBeLessThan(60);
    expect(distanceCovered(i.t)).toBeGreaterThanOrEqual(Math.abs(-200 - i.x) - 25 - 1);
  });
});

describe('decisões da IA', () => {
  test('estado inválido -> parado', () => {
    const ai = new BotAI(cfg);
    expect(ai.decide(null, null)).toEqual({ dirX: 0, dirY: 0, kick: false });
  });

  // posiciona o bot exatamente atrás da bola na linha do alvo escolhido pela IA
  function behindBall(ai, ball, sign) {
    const { aim } = ai.bestShot({ x: ball.x * sign, y: ball.y }, [], geo);
    const dx = aim.x - ball.x * sign, dy = aim.y - ball.y;
    const l = Math.hypot(dx, dy);
    return { x: (ball.x * sign - (dx / l) * 24) * sign, y: ball.y - (dy / l) * 24 };
  }

  test('chuta com linha livre perto do gol (vermelho)', () => {
    const ai = new BotAI(cfg);
    const b = { x: 220, y: 0 };
    const pos = behindBall(ai, b, 1);
    const me = player(1, 1, pos.x, pos.y);
    const { gameState, roomState } = world(b, [me, player(2, 2, -300, 100)]);
    const d = ai.decide(gameState, me, roomState, 0);
    expect(ai.currentState).toBe(GAME_STATES.SHOOT);
    expect(d.kick).toBe(true);
    expect(d.dirX).toBe(1);
  });

  test('time azul usa coordenadas espelhadas', () => {
    const ai = new BotAI(cfg);
    const b = { x: -220, y: 0 };
    const pos = behindBall(ai, b, -1);
    const me = player(1, 2, pos.x, pos.y);
    const { gameState, roomState } = world(b, [me, player(2, 1, 300, 100)]);
    const d = ai.decide(gameState, me, roomState, 0);
    expect(ai.currentState).toBe(GAME_STATES.SHOOT);
    expect(d.kick).toBe(true);
    expect(d.dirX).toBe(-1);
  });

  test('não chuta quando a bola está fora de alcance', () => {
    const me = player(1, 1, 0, 0);
    const { gameState, roomState } = world({ x: 200, y: 50 }, [me, player(2, 2, 330, -150)]);
    const d = new BotAI(cfg).decide(gameState, me, roomState, 0);
    expect(d.kick).toBe(false);
  });

  test('contorna a bola quando está do lado errado (não empurra para o próprio gol)', () => {
    const me = player(1, 1, 60, 0); // à frente da bola, entre a bola e o gol adversário
    const { gameState, roomState } = world({ x: 30, y: 0 }, [me, player(2, 2, 330, 150)]);
    const d = new BotAI(cfg).decide(gameState, me, roomState, 0);
    expect(d.kick).toBe(false);
    expect(d.dirY).not.toBe(0); // desvia para o lado
  });

  test('bola indo para o nosso gol -> intercepta', () => {
    const me = player(1, 1, -300, 40);
    const { gameState, roomState } = world({ x: -100, y: 0, vx: -7, vy: 0 }, [me, player(2, 2, 100, 0)]);
    const ai = new BotAI(cfg);
    ai.decide(gameState, me, roomState, 0);
    expect(ai.currentState).toBe(GAME_STATES.INTERCEPT);
  });

  test('antecipa o chute adversário e vai para a linha do chute', () => {
    const me = player(1, 1, -250, -120);
    const opp = player(2, 2, -100, 0); // atrás da bola, mirando o nosso gol
    const { gameState, roomState } = world({ x: -125, y: 0 }, [me, opp]);
    const ai = new BotAI(cfg);
    const d = ai.decide(gameState, me, roomState, 0);
    expect(ai.currentState).toBe(GAME_STATES.DEFEND);
    expect(d.dirY).toBe(1); // desce em direção à linha bola–gol (y = 0)
  });

  test('respeita o tempo de reação', () => {
    const me = player(1, 1, 0, 0);
    const { gameState, roomState } = world({ x: 100, y: 0 }, [me]);
    const ai = new BotAI({ ai: { reactionTime: 100, noise: 0 } });
    const d1 = ai.decide(gameState, me, roomState, 1000);
    gameState.physicsState.discs[0].pos = { x: -100, y: 0 };
    const d2 = ai.decide(gameState, me, roomState, 1050);
    expect(d2).toBe(d1);
  });
});
