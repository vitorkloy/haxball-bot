// Planejador por busca curta (lookahead de 2 níveis) com a física do Haxball.
// Nada de treino: para cada ação candidata (8 direções + parado, com ou sem chute)
// simula alguns ticks com o modelo físico e pontua o estado final com uma avaliação
// escrita à mão (posse, progresso, risco de desarme, chute no gol).
// Referencial canônico: atacamos para +x, gol adversário em x = +goalX.

// Física padrão (playerPhysics / ballPhysics do Classic e Big)
export const PHYS = {
  accel: 0.1, kickAccel: 0.07, pDamp: 0.96, bDamp: 0.99,
  kickStrength: 5, kickReach: 4, pInv: 0.5, bInv: 1, bCoef: 0.25
};
const DIRS = [[0, 0], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

/** Avança um tick: jogador(es) acelera(m), integra, amortece, colide com a bola, chuta. */
function step(s, dx, dy, kickHeld, geo, opps) {
  const me = s.me, b = s.ball;
  const l = Math.hypot(dx, dy) || 1;
  const acc = kickHeld ? PHYS.kickAccel : PHYS.accel;
  if (dx || dy) { me.vx += (dx / l) * acc; me.vy += (dy / l) * acc; }
  for (const o of opps) {
    // modelo do adversário: persegue a bola em linha reta
    const ex = b.x - o.x, ey = b.y - o.y, el = Math.hypot(ex, ey) || 1;
    o.vx += (ex / el) * PHYS.accel; o.vy += (ey / el) * PHYS.accel;
    o.x += o.vx; o.y += o.vy; o.vx *= PHYS.pDamp; o.vy *= PHYS.pDamp;
  }
  me.x += me.vx; me.y += me.vy; me.vx *= PHYS.pDamp; me.vy *= PHYS.pDamp;
  b.x += b.vx; b.y += b.vy; b.vx *= PHYS.bDamp; b.vy *= PHYS.bDamp;
  if (b.y > geo.fieldY - b.r) { b.y = geo.fieldY - b.r; b.vy = -b.vy * 0.5; }
  else if (b.y < -geo.fieldY + b.r) { b.y = -geo.fieldY + b.r; b.vy = -b.vy * 0.5; }
  if (Math.abs(b.x) > geo.goalX - b.r && Math.abs(b.y) > geo.postY) { b.x = Math.sign(b.x) * (geo.goalX - b.r); b.vx = -b.vx * 0.5; }
  collide(me, b);
  for (const o of opps) collide(o, b);
  if (kickHeld && !s.kicked) {
    const ex = b.x - me.x, ey = b.y - me.y, d = Math.hypot(ex, ey);
    if (d - me.r - b.r < PHYS.kickReach) {
      b.vx += (ex / d) * PHYS.kickStrength * PHYS.bInv; b.vy += (ey / d) * PHYS.kickStrength * PHYS.bInv;
      s.kicked = true;
    }
  }
}

function collide(p, b) {
  const ex = b.x - p.x, ey = b.y - p.y, d = Math.hypot(ex, ey), rs = p.r + b.r;
  if (d >= rs || d === 0) return;
  const nx = ex / d, ny = ey / d, inv = PHYS.pInv + PHYS.bInv, ov = rs - d;
  p.x -= nx * ov * PHYS.pInv / inv; p.y -= ny * ov * PHYS.pInv / inv;
  b.x += nx * ov * PHYS.bInv / inv; b.y += ny * ov * PHYS.bInv / inv;
  const vn = (b.vx - p.vx) * nx + (b.vy - p.vy) * ny;
  if (vn < 0) {
    const j = -(1 + PHYS.bCoef) * vn / inv;
    b.vx += nx * j * PHYS.bInv; b.vy += ny * j * PHYS.bInv;
    p.vx -= nx * j * PHYS.pInv; p.vy -= ny * j * PHYS.pInv;
  }
}

const clone = (s) => ({ me: { ...s.me }, ball: { ...s.ball }, opps: s.opps.map((o) => ({ ...o })), kicked: s.kicked });

/** Chute: a bola (já chutada) entra no gol antes de algum adversário alcançá-la? */
function shotValue(ball, opps, geo) {
  if (ball.vx <= 0.5) return 0;
  let { x, y, vx, vy } = ball;
  for (let t = 1; t < 160; t++) {
    x += vx; y += vy; vx *= PHYS.bDamp; vy *= PHYS.bDamp;
    if (Math.abs(y) > geo.fieldY - ball.r) { vy = -vy * 0.5; y = Math.sign(y) * (geo.fieldY - ball.r); }
    for (const o of opps) {
      // alcance do adversário em t ticks (aprox.: velocidade máx. 2.4 após aceleração)
      const reachT = Math.max(0, 2.4 * t - 30) + o.r + ball.r + 4;
      if (Math.hypot(x - o.x, y - o.y) < reachT * 0.85) return 0;
    }
    if (x >= geo.goalX) return Math.abs(y) < geo.postY - 4 ? 1 - t / 400 : 0;
    if (Math.hypot(vx, vy) < 0.3) return 0;
  }
  return 0;
}

/** Avaliação do estado após a simulação */
export function evaluate(s, geo, W, start) {
  const { me, ball } = s;
  const reach = me.r + ball.r;
  const dMe = Math.hypot(ball.x - me.x, ball.y - me.y);
  let v = 0;
  v += W.progress * (ball.x - start.ball.x); // levar a bola em direção ao gol
  v -= W.glue * Math.max(0, dMe - reach - 2); // bola colada
  // bola à frente do corpo (na direção do gol) facilita conduzir e chutar
  v += W.front * Math.max(-1, Math.min(1, (ball.x - me.x) / reach));
  // velocidade relativa da bola: bola "fugindo" do jogador perde o controle
  const rvx = ball.vx - me.vx, rvy = ball.vy - me.vy;
  v -= W.loose * Math.hypot(rvx, rvy);
  for (const o of s.opps) {
    const dO = Math.hypot(ball.x - o.x, ball.y - o.y);
    // quem chega antes na bola? (corpo entre a bola e o defensor = proteção)
    v -= W.race * Math.max(0, dMe - dO + 12);
    v -= W.pressure * Math.max(0, W.safeDist - (dO - o.r - ball.r));
    // defensor à frente: tirar a bola da linha dele (empurrar para o lado oposto)
    if (o.x > ball.x - 5 && o.x - ball.x < 120) v += W.lateral * Math.min(45, Math.abs(ball.y - o.y));
  }
  // não encostar a bola na lateral
  v -= W.wall * Math.max(0, Math.abs(ball.y) - (geo.fieldY - 25));
  return v;
}

export const DEFAULT_WEIGHTS = {
  progress: 1.0, glue: 2.2, front: 6, loose: 6, race: 1.6, pressure: 0.55, safeDist: 40,
  wall: 1.5, shot: 400, keep: 8, reverse: 12, plyA: 5, plyB: 9, holdMs: 50, lateral: 0.3
};

/**
 * Escolhe a melhor ação. state: {me, ball, opps} canônico. prev: {x,y} direção anterior.
 * Retorna {dirX, dirY, kick, score, shot}.
 */
export function plan(state, geo, prev = { x: 0, y: 0 }, W = DEFAULT_WEIGHTS) {
  const root = { me: { ...state.me }, ball: { ...state.ball }, opps: state.opps.map((o) => ({ ...o })), kicked: false };
  let best = null;
  for (const kick of [false, true]) {
    for (const [dx, dy] of DIRS) {
      const s = clone(root);
      for (let t = 0; t < W.plyA; t++) step(s, dx, dy, kick, geo, s.opps);
      if (kick && !s.kicked) continue; // chute que não pega na bola não serve
      let val;
      let shot = 0;
      if (s.kicked) {
        // chute: vale pelo gol provável; senão, pela posição em que a bola fica
        shot = shotValue(s.ball, state.opps, geo);
        const s2 = clone(s);
        for (let t = 0; t < W.plyB; t++) step(s2, dx, dy, false, geo, s2.opps);
        val = evaluate(s2, geo, W, root) + W.shot * shot;
      } else {
        // 2º nível: melhor continuação (sem chute) por mais plyB ticks
        val = -Infinity;
        for (const [ex, ey] of DIRS) {
          const s2 = clone(s);
          for (let t = 0; t < W.plyB; t++) step(s2, ex, ey, false, geo, s2.opps);
          val = Math.max(val, evaluate(s2, geo, W, root));
        }
      }
      // suavidade: preferir manter as teclas; inverter é o que mais "trava"
      if (dx !== prev.x || dy !== prev.y) val -= W.keep;
      if ((prev.x && dx === -prev.x) || (prev.y && dy === -prev.y)) val -= W.reverse;
      if (!best || val > best.score) best = { dirX: dx, dirY: dy, kick, score: val, shot };
    }
  }
  return best;
}
