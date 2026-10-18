// IA de decisão do bot (ataque, apoio, defesa, recuperação), baseada em geometria
// e em previsão da trajetória da bola. Trabalha num referencial "canônico" em que
// o time do bot sempre ataca para +x; as direções são convertidas na saída.
import DEFAULT_PARAMS from './ai-params-pr7.js';
import { GAME_STATES } from '../../src/config.js';

// Física padrão do Haxball (playerPhysics / ballPhysics do Classic)
const PLAYER_ACCEL = 0.1;
const PLAYER_DAMPING = 0.96;
const VMAX = (PLAYER_ACCEL * PLAYER_DAMPING) / (1 - PLAYER_DAMPING); // ~2.4 px/tick
const BALL_DAMPING = 0.99;
const WALL_BOUNCE = 0.5;
const ZERO = Object.freeze({ dirX: 0, dirY: 0, kick: false });

// Faixas usadas pelo treino (scripts/train.js)
export const PARAM_SPACE = {
  shootRange: [120, 420],
  closeShot: [40, 160],
  shotClearance: [5, 50],
  aimPost: [0.2, 0.9],
  farPostBias: [0, 25],
  behindDist: [0, 18],
  aroundDist: [4, 30],
  alignTol: [3, 25],
  kickReach: [1, 6],
  kickAngle: [0.1, 0.8],
  pushDist: [0, 30],
  dribbleAvoid: [30, 140],
  sidestep: [20, 120],
  clearZone: [40, 250],
  clearMargin: [-20, 40],
  threatMargin: [-10, 30],
  pressLine: [-150, 370],
  threatReach: [20, 50],
  blockDist: [20, 120],
  blockMargin: [0, 40],
  defendDist: [25, 220],
  defendFrac: [0.2, 0.8],
  guardLead: [0, 30],
  supportDist: [50, 200],
  passAhead: [0, 120],
  passClearance: [10, 50],
  steerGain: [0.04, 0.4],
  deadzone: [0.02, 0.5],
  cutSide: [20, 120],
  hyst: [0.1, 1],
  holdMs: [0, 120],
  lookahead: [0, 12],
  arriveK: [3, 30],
  nearDist: [2, 15],
  carrySpeed: [0.8, 2.4],
  slowSpeed: [0.6, 2.4],
  engageDist: [40, 140],
  commitVel: [0, 2.5],
  selfPassDist: [25, 90],
  selfPassLead: [10, 100],
  shieldDist: [20, 80],
  shieldBlend: [0, 1],
  cutForward: [0, 60],
  predictTicks: [60, 200]
};

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
const dot = (a, b) => a.x * b.x + a.y * b.y;
const cross = (a, b) => a.x * b.y - a.y * b.x;
const len = (a) => Math.hypot(a.x, a.y);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const unit = (a) => { const l = len(a); return l > 1e-9 ? { x: a.x / l, y: a.y / l } : { x: 1, y: 0 }; };
const perp = (a) => ({ x: -a.y, y: a.x });
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Distância de p ao segmento a-b */
function segDist(p, a, b) {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 > 0 ? clamp(dot(sub(p, a), ab) / l2, 0, 1) : 0;
  return dist(p, add(a, mul(ab, t)));
}

/** Distância percorrida por um jogador em t ticks, partindo com velocidade v0 na direção do alvo */
export function distanceCovered(t, v0 = 0) {
  const k = 1 / (1 - PLAYER_DAMPING); // 25
  return VMAX * t - (VMAX - v0) * PLAYER_DAMPING * k * (1 - Math.pow(PLAYER_DAMPING, t));
}

/**
 * Prevê a trajetória da bola (amortecimento + quiques nas paredes e nas traves).
 * Coordenadas canônicas: gol próprio em x = -goalX, gol adversário em x = +goalX.
 */
export function predictBall(ball, geo, ticks) {
  const path = [];
  let { x, y, vx, vy } = ball;
  const r = ball.r || 10;
  const posts = [
    { x: geo.goalX, y: geo.postY }, { x: geo.goalX, y: -geo.postY },
    { x: -geo.goalX, y: geo.postY }, { x: -geo.goalX, y: -geo.postY }
  ];
  const postR = 8;
  for (let t = 1; t <= ticks; t++) {
    x += vx; y += vy;
    vx *= BALL_DAMPING; vy *= BALL_DAMPING;
    // paredes laterais
    if (y > geo.fieldY - r) { y = geo.fieldY - r; vy = -vy * WALL_BOUNCE; }
    else if (y < -geo.fieldY + r) { y = -geo.fieldY + r; vy = -vy * WALL_BOUNCE; }
    // linhas de fundo / gols
    let goal = null;
    if (Math.abs(x) >= geo.goalX) {
      if (Math.abs(y) < geo.postY) {
        goal = x > 0 ? 'opp' : 'own';
      } else if (Math.abs(x) > geo.goalX - r) {
        x = Math.sign(x) * (geo.goalX - r);
        vx = -vx * WALL_BOUNCE;
      }
    }
    // traves
    for (const p of posts) {
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < r + postR && d > 0) {
        const n = { x: (x - p.x) / d, y: (y - p.y) / d };
        const vn = vx * n.x + vy * n.y;
        if (vn < 0) { vx -= (1 + WALL_BOUNCE) * vn * n.x; vy -= (1 + WALL_BOUNCE) * vn * n.y; }
        x = p.x + n.x * (r + postR); y = p.y + n.y * (r + postR);
      }
    }
    path.push({ x, y, vx, vy, t, goal });
    if (goal) break;
    if (Math.abs(vx) + Math.abs(vy) < 0.02) {
      // bola parada: repete a posição até o fim do horizonte (sem custo extra)
      path.push({ x, y, vx: 0, vy: 0, t: ticks, goal: null, still: true });
      break;
    }
  }
  return path;
}

/** Primeiro ponto da trajetória que o jogador consegue alcançar a tempo */
export function interceptPoint(player, path, reach) {
  for (const p of path) {
    const d = Math.max(0, dist(player, p) - reach);
    const dir = unit(sub(p, player));
    const v0 = Math.max(0, dot({ x: player.vx || 0, y: player.vy || 0 }, dir));
    if (p.still) {
      // bola parada: tempo = tempo para cobrir a distância
      let t = 0;
      while (distanceCovered(t, v0) < d && t < 600) t += 2;
      return { x: p.x, y: p.y, t: Math.max(t, path.length), goal: null };
    }
    if (distanceCovered(p.t, v0) >= d) return p;
  }
  const last = path[path.length - 1];
  return last ? { ...last, t: Infinity } : null;
}

export class BotAI {
  constructor(config = {}, physics = null, params = null) {
    this.config = config;
    this.physics = physics; // mantido por compatibilidade
    this.params = { ...DEFAULT_PARAMS, ...(config?.ai?.params || {}), ...(params || {}) };
    this.currentState = GAME_STATES.IDLE;
    this.lastDecisionTime = -Infinity;
    this.lastDecision = ZERO;
    this.rng = config?.ai?.rng || Math.random;
    this.debug = null;
    this.move = null; // jogada de drible atual (para o log)
    this.held = { x: 0, y: 0, since: -Infinity };
  }

  /**
   * Decide a ação do tick.
   * @param gameState GameState do node-haxball (physicsState.discs[0] = bola)
   * @param botPlayer Player controlado (com .disc e .team)
   * @param roomState RoomState (players, stadium) — opcional
   * @param now tempo em ms (simulador passa o tempo simulado)
   */
  decide(gameState, botPlayer, roomState = null, now = Date.now()) {
    if (!gameState || !botPlayer || !botPlayer.disc) return { ...ZERO };
    const reaction = this.config?.ai?.reactionTime ?? 0;
    if (now - this.lastDecisionTime < reaction) return this.lastDecision;
    this.lastDecisionTime = now;
    this.now = now;

    const ctx = this.buildContext(gameState, botPlayer, roomState);
    const decision = ctx ? this.think(ctx) : { ...ZERO };
    this.lastDecision = decision;
    return decision;
  }

  geometry(stadium, team) {
    const goals = stadium?.goals || [];
    const own = goals.find((g) => (g.team?.id ?? g.team) === team);
    let attack = team === 1 ? 1 : -1;
    let goalX = 370;
    let postY = 64;
    if (own?.p0 && own?.p1) {
      goalX = Math.abs((own.p0.x + own.p1.x) / 2) || goalX;
      postY = Math.abs(own.p0.y - own.p1.y) / 2 || postY;
      const sx = Math.sign((own.p0.x + own.p1.x) / 2);
      if (sx !== 0) attack = -sx;
    }
    const fieldY = stadium?.height ? Math.max(postY + 40, stadium.height - 30) : 170;
    return { attack, goalX, postY, fieldY };
  }

  buildContext(gameState, botPlayer, roomState) {
    const ballDisc = gameState.physicsState?.discs?.[0];
    if (!ballDisc || !ballDisc.pos) return null;
    const myDisc = botPlayer.disc?.ext || botPlayer.disc;
    if (!myDisc || !myDisc.pos) return null;
    const team = botPlayer.team?.id ?? botPlayer.team;
    if (team !== 1 && team !== 2) return null;

    const stadium = roomState?.stadium || gameState.stadium;
    const geo = this.geometry(stadium, team);
    const a = geo.attack;
    const conv = (d) => ({
      x: d.pos.x * a, y: d.pos.y,
      vx: (d.speed?.x || 0) * a, vy: d.speed?.y || 0,
      r: d.radius || 15
    });

    const me = { ...conv(myDisc), isKicking: !!botPlayer.isKicking, id: botPlayer.id };
    const ball = conv(ballDisc);
    ball.r = ballDisc.radius || 10;
    const mates = [];
    const opps = [];
    for (const p of roomState?.players || gameState.players || []) {
      const d = p.disc?.ext || p.disc;
      if (!d || !d.pos || p.id === botPlayer.id) continue;
      const tid = p.team?.id ?? p.team;
      const e = { ...conv(d), id: p.id };
      if (tid === team) mates.push(e);
      else if (tid === 1 || tid === 2) opps.push(e);
    }
    const kickoff = gameState.state === 0;
    return { me, ball, mates, opps, geo, kickoff };
  }

  think(ctx) {
    this.lastMe = ctx.me; // usado no steering
    const P = this.params;
    const { me, ball, mates, opps, geo } = ctx;
    const reach = me.r + ball.r;
    const path = predictBall(ball, geo, Math.round(P.predictTicks));
    const myI = interceptPoint(me, path, reach);
    const oppI = opps.map((o) => interceptPoint(o, path, o.r + ball.r)).sort((x, y) => x.t - y.t)[0];
    const mateI = mates.map((m) => ({ m, i: interceptPoint(m, path, m.r + ball.r) })).sort((x, y) => x.i.t - y.i.t)[0];
    const tMe = myI ? myI.t : Infinity;
    const tOpp = oppI ? oppI.t : Infinity;
    const tMate = mateI ? mateI.i.t : Infinity;
    const ownGoalHit = path.find((p) => p.goal === 'own');

    const debug = { tMe, tOpp, ball: { x: ball.x, y: ball.y } };
    let out;

    // 1) Recuperação: bola indo para o nosso gol
    if (ownGoalHit && (tMe <= ownGoalHit.t || tMate > tMe)) {
      const save = this.firstReachableBefore(me, path, reach, ownGoalHit.t) || ownGoalHit;
      this.currentState = GAME_STATES.INTERCEPT;
      this.move = null;
      out = this.attackBall(ctx, save, 'clear');
    } else {
      const chaser = tMe <= tMate || (tMe === tMate && me.id < (mateI?.m.id ?? Infinity));
      // bola parada e adversários parados (ex.: AFK colado na bola): não espera, vai na bola
      const stalled = Math.hypot(ball.vx, ball.vy) < 0.05 && opps.every((o) => Math.hypot(o.vx, o.vy) < 0.05);
      if (chaser && (!(tOpp + P.threatMargin < tMe) || ball.x > P.pressLine || stalled)) {
        out = this.attack(ctx, myI || { x: ball.x, y: ball.y, t: 0 }, tOpp - tMe);
      } else if (chaser || ball.x < 0 || mates.length === 0) {
        this.currentState = GAME_STATES.DEFEND;
        this.move = null;
        out = this.defend(ctx, path);
        out.urgent = true;
        out.arrive = !out.kick;
      } else {
        this.currentState = GAME_STATES.POSITION;
        out = this.support(ctx);
        out.arrive = true;
      }
    }
    this.debug = debug;
    return this.applyNoiseAndConvert(out, geo);
  }

  firstReachableBefore(me, path, reach, tMax) {
    for (const p of path) {
      if (p.t > tMax) break;
      const d = Math.max(0, dist(me, p) - reach);
      const v0 = Math.max(0, dot({ x: me.vx, y: me.vy }, unit(sub(p, me))));
      if (distanceCovered(p.t, v0) >= d) return p;
    }
    return null;
  }

  /** Escolhe o alvo do chute no gol adversário (prefere a trave longe e linha livre) */
  bestShot(from, opps, geo) {
    const P = this.params;
    const ys = [-geo.postY * P.aimPost, 0, geo.postY * P.aimPost];
    let best = null;
    for (const y of ys) {
      const aim = { x: geo.goalX + 10, y };
      let clearance = Infinity;
      for (const o of opps) {
        if (o.x < from.x - 5) continue; // só quem está à frente atrapalha
        clearance = Math.min(clearance, segDist(o, from, aim) - o.r - 10);
      }
      const far = y !== 0 && Math.sign(y) !== Math.sign(from.y || 1) ? P.farPostBias : 0;
      const score = Math.min(clearance, 200) + far;
      if (!best || score > best.score) best = { aim, clearance, score };
    }
    best.dist = dist(from, best.aim);
    return best;
  }

  attack(ctx, target, lead) {
    const P = this.params;
    const { me, ball, mates, opps, geo } = ctx;
    const near = dist(me, ball) < me.r + ball.r + 40;
    const B = near ? { x: ball.x + ball.vx * 2, y: ball.y + ball.vy * 2 } : target;

    // zona de perigo: perto do nosso gol e adversário chegando -> afastar
    if (B.x < -geo.goalX + P.clearZone && lead < P.clearMargin) {
      this.currentState = GAME_STATES.DEFEND;
      return this.attackBall(ctx, B, 'clear');
    }
    const shot = this.bestShot(B, opps, geo);
    if (shot.dist < P.closeShot || (shot.dist < P.shootRange && shot.clearance > P.shotClearance)) {
      this.currentState = GAME_STATES.SHOOT;
      return this.attackBall(ctx, B, 'shoot', shot.aim);
    }
    // passe (2v2): companheiro mais à frente com linha livre
    for (const m of mates) {
      if (m.x > B.x + P.passAhead) {
        let clearance = Infinity;
        for (const o of opps) clearance = Math.min(clearance, segDist(o, B, m) - o.r - 10);
        if (clearance > P.passClearance) {
          this.currentState = GAME_STATES.PASS;
          return this.attackBall(ctx, B, 'pass', { x: m.x + m.vx * 10, y: m.y + m.vy * 10 });
        }
      }
    }
    // condução / drible
    this.currentState = GAME_STATES.ATTACK;
    return this.dribble(ctx, B);
  }

  /**
   * Drible: escolhe a jogada pela posição e velocidade do defensor principal.
   * - conduzir: sem marcação, toques suaves com o corpo (sem chute), bola um pouco à frente
   * - proteger: defensor ao lado/atrás -> corpo entre a bola e ele, levando a bola para longe
   * - finta: defensor à frente e longe -> aproxima devagar "armando o chute" na direção do gol
   * - corte: defensor perto -> mudança brusca de direção para o lado livre, acelerando
   * - autopasse: defensor perto e vindo com tudo -> toque curto no espaço ao lado/atrás dele
   */
  dribble(ctx, B) {
    const P = this.params;
    const { opps, geo } = ctx;
    const goalAim = { x: geo.goalX, y: 0 };
    const dirGoal = unit(sub(goalAim, B));
    let D = null;
    let best = Infinity;
    for (const o of opps) {
      const dd = dist(o, B);
      if (dd < P.engageDist * 1.6 && dd < best) { best = dd; D = o; }
    }
    if (!D) {
      this.move = 'conduzir';
      return this.attackBall(ctx, B, 'dribble', goalAim, { maxSpeed: P.carrySpeed });
    }
    const rel = sub(D, B);
    const ahead = dot(rel, dirGoal);
    const latOff = cross(dirGoal, rel);
    const closing = dot({ x: D.vx, y: D.vy }, unit(sub(B, D)));
    if (ahead < 0) {
      if (best < P.shieldDist) {
        this.move = 'proteger';
        const away = unit(sub(B, D));
        const dir = unit(add(mul(away, P.shieldBlend), mul(dirGoal, 1 - P.shieldBlend)));
        return this.attackBall(ctx, B, 'dribble', add(B, mul(dir, 100)), { maxSpeed: P.carrySpeed });
      }
      this.move = 'conduzir';
      return this.attackBall(ctx, B, 'dribble', goalAim, { maxSpeed: P.carrySpeed });
    }
    let side = latOff > 0 ? -1 : 1; // lado oposto ao defensor
    const side0 = perp(dirGoal);
    if (Math.abs(B.y + side * P.cutSide) > geo.fieldY - 30) side = -side;
    const inLane = Math.abs(latOff) < D.r + 10 + 20;
    if (!inLane) {
      // defensor fora da linha até o gol: segue conduzindo (rápido se ele está longe)
      this.move = 'conduzir';
      return this.attackBall(ctx, B, 'dribble', goalAim, { maxSpeed: best > P.engageDist ? VMAX : P.carrySpeed });
    }
    if (best > P.engageDist) {
      this.move = 'finta';
      return this.attackBall(ctx, B, 'dribble', goalAim, { maxSpeed: P.slowSpeed });
    }
    if (closing > P.commitVel && best < P.selfPassDist) {
      this.move = 'autopasse';
      const space = add(D, add(mul(side0, side * P.cutSide), mul(dirGoal, P.selfPassLead)));
      space.y = clamp(space.y, -geo.fieldY + 20, geo.fieldY - 20);
      return this.attackBall(ctx, B, 'pass', space);
    }
    this.move = 'corte';
    const aim = { x: B.x + ahead + P.cutForward, y: B.y + side * P.cutSide };
    return this.attackBall(ctx, B, 'dribble', aim, { maxSpeed: VMAX });
  }

  /**
   * Chega por trás da bola em relação ao alvo e executa a ação.
   * mode: 'shoot' | 'pass' | 'clear' | 'dribble'
   */
  attackBall(ctx, B, mode, aim = null, opts = {}) {
    const P = this.params;
    const { me, ball, geo } = ctx;
    const reach = me.r + ball.r;
    if (!aim) {
      // afastar: para frente e para a lateral do lado da bola
      aim = { x: B.x + 200, y: Math.sign(B.y || 1) * geo.fieldY };
    }
    const u = unit(sub(aim, B));
    const v = sub(me, B);
    const along = dot(v, u);
    const lat = cross(u, v);
    const behind = add(B, mul(u, -(reach + P.behindDist)));

    let target;
    let kick = false;
    if (along > -reach * 0.5) {
      // estou do lado errado: contornar a bola pelo lado em que já estou
      const side = lat >= 0 ? 1 : -1;
      target = add(behind, mul(perp(u), side * (reach + P.aroundDist)));
      if (mode === 'clear' && dist(me, ball) <= reach + P.kickReach) {
        // em perigo, qualquer toque que não vá para o nosso gol serve
        const n = unit(sub(ball, me));
        kick = n.x > 0.1;
      }
    } else if (Math.abs(lat) > P.alignTol && mode !== 'clear') {
      target = behind;
    } else {
      const push = mode === 'dribble' ? P.pushDist : 10;
      target = add(B, mul(u, push));
      if (mode !== 'dribble') {
        const n = unit(sub(ball, me));
        const ang = Math.acos(clamp(dot(n, u), -1, 1));
        kick = dist(me, ball) <= reach + P.kickReach && ang < (mode === 'clear' ? P.kickAngle * 2 : P.kickAngle);
      }
    }
    return { target, kick, aimAngle: Math.atan2(u.y, u.x), maxSpeed: opts.maxSpeed, urgent: mode === 'clear' };
  }

  defend(ctx, path) {
    const P = this.params;
    const { me, ball, opps, geo } = ctx;
    const goal = { x: -geo.goalX, y: 0 };

    // antecipa o chute: adversário em alcance da bola -> linha provável do chute
    for (const o of opps) {
      if (dist(o, ball) < o.r + ball.r + P.threatReach) {
        const dir = unit(sub(ball, o));
        if (dir.x < -0.05) {
          const tHit = (-geo.goalX - ball.x) / dir.x;
          const yHit = ball.y + dir.y * tHit;
          if (Math.abs(yHit) < geo.postY + P.blockMargin) {
            const hit = { x: -geo.goalX, y: yHit };
            const lineLen = dist(ball, hit);
            const proj = clamp(dot(sub(me, ball), dir), ball.r + me.r + 5, Math.max(ball.r + me.r + 5, lineLen - 10));
            const s = Math.min(proj, Math.max(P.blockDist, ball.r + me.r + 5));
            const block = add(ball, mul(dir, Math.min(s, lineLen - 10)));
            if (dist(me, ball) <= me.r + ball.r + P.kickReach && dot(unit(sub(ball, me)), { x: 1, y: 0 }) > 0.2) {
              return { target: block, kick: true };
            }
            return { target: block, kick: false };
          }
        }
      }
    }
    // guarda: entre a bola (prevista) e o centro do nosso gol
    const idx = Math.min(path.length - 1, Math.round(P.guardLead));
    const Bf = idx >= 0 ? path[idx] : ball;
    // fica a `defendDist` da bola, na linha bola–gol (marcação), sem passar do ponto
    // `defendFrac` do caminho (mais perto do gol quando a bola está longe)
    const toBall = sub(Bf, goal);
    const L = len(toBall);
    const d = Math.min(Math.max(L - P.defendDist, me.r + 5), Math.max(L * (1 - P.defendFrac), L - P.defendDist, me.r + 5));
    const target = add(goal, mul(unit(toBall), d));
    target.x = Math.max(target.x, -geo.goalX + me.r);
    let kick = false;
    if (dist(me, ball) <= me.r + ball.r + P.kickReach && unit(sub(ball, me)).x > 0.2) kick = true;
    return { target, kick };
  }

  support(ctx) {
    const P = this.params;
    const { ball, geo } = ctx;
    const y = clamp(-ball.y * 0.6, -geo.fieldY + 40, geo.fieldY - 40);
    const target = { x: clamp(ball.x - P.supportDist, -geo.goalX + 40, geo.goalX - 60), y };
    return { target, kick: false };
  }

  /**
   * Movimento suave: "arrive" (desacelera soltando as teclas antes do alvo, já que parado o
   * jogador ainda anda ~24x a velocidade), alvo visto a partir da posição prevista (`lookahead`),
   * histerese por eixo e tempo mínimo segurando uma direção (`holdMs`) para não tremer.
   */
  applyNoiseAndConvert(out, geo) {
    const P = this.params;
    let { target } = out;
    const m = this.lastMe || { x: 0, y: 0, vx: 0, vy: 0 };
    const noise = this.config?.ai?.noise || 0;
    if (noise > 0 && target) {
      const ang = (this.rng() - 0.5) * 2 * noise;
      const c = Math.cos(ang), s = Math.sin(ang);
      const rel = sub(target, m);
      target = add(m, { x: rel.x * c - rel.y * s, y: rel.x * s + rel.y * c });
    }
    const look = { x: m.x + m.vx * P.lookahead, y: m.y + m.vy * P.lookahead };
    const to = sub(target, look);
    const d = len(to);
    const vmax = Math.min(out.maxSpeed ?? VMAX, VMAX);
    // arrive só em alvos de posição (defesa/apoio); perseguindo a bola vai com tudo
    const speed = out.arrive ? Math.min(vmax, d / P.arriveK) : Math.min(vmax, d * P.steerGain);
    const vd = d > 1e-6 ? mul(to, speed / d) : { x: 0, y: 0 };
    const dv = { x: vd.x - m.vx, y: vd.y - m.vy };
    const h = this.held;
    const axis = (cur, comp) => {
      if (cur !== 0 && Math.sign(comp) === cur && Math.abs(comp) > P.deadzone * P.hyst) return cur;
      return Math.abs(comp) > P.deadzone ? Math.sign(comp) : 0;
    };
    let dirX = axis(h.x, dv.x);
    let dirY = axis(h.y, dv.y);
    if (dist(m, target) < P.nearDist && len({ x: m.vx, y: m.vy }) < 0.6) { dirX = 0; dirY = 0; }
    const now = this.now ?? 0;
    const hold = out.urgent || out.kick ? P.holdMs * 0.3 : P.holdMs;
    if ((dirX !== h.x || dirY !== h.y)) {
      // inverter sentido é o que mais "treme": só depois do tempo mínimo
      const reversing = (h.x !== 0 && dirX === -h.x) || (h.y !== 0 && dirY === -h.y);
      if (now - h.since < (reversing ? hold : hold * 0.5)) { dirX = h.x; dirY = h.y; }
      else { h.x = dirX; h.y = dirY; h.since = now; }
    }
    this.lastTarget = { x: target.x * geo.attack, y: target.y };
    return { dirX: dirX * geo.attack || 0, dirY: dirY || 0, kick: !!out.kick };
  }
}
