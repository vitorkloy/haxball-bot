// Simulador headless com a física real do Haxball (Room.sandbox do node-haxball).
import HaxballAPI from 'node-haxball';
import { BotAI } from '../src/ai.js';
import { BotAI as LegacyAI } from '../src/ai-legacy.js';
import { BotAI as Pr5AI } from './baselines/ai-pr5.js';
import { BotAI as Pr7AI } from './baselines/ai-pr7.js';
import { PhysicsPredictor } from '../src/physics.js';
import { DIFFICULTY_PRESETS } from '../src/config.js';

const { Room, Utils } = HaxballAPI();
const STADIUMS = Utils.getDefaultStadiums();
export const TICK_MS = 1000 / 60;

/** RNG determinístico (mulberry32) */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function encode(dirX, dirY, kick) {
  let s = 0;
  if (dirY === -1) s |= 1;
  if (dirY === 1) s |= 2;
  if (dirX === -1) s |= 4;
  if (dirX === 1) s |= 8;
  if (kick) s |= 16;
  return s;
}

/** Fábricas de controladores. Cada controlador: (gs, player, state, nowMs) -> {dirX,dirY,kick} */
export function newAI({ params = null, difficulty = 'hard', seed = 1 } = {}) {
  const preset = DIFFICULTY_PRESETS[difficulty] || DIFFICULTY_PRESETS.hard;
  const ai = new BotAI({ ai: { ...preset, rng: rng(seed) } }, null, params);
  const f = (gs, player, state, now) => ai.decide(gs, player, state, now);
  f.ai = ai;
  return f;
}

/** IA do PR #5 (referência para não haver regressão) */
export function pr5AI({ difficulty = 'hard', seed = 1 } = {}) {
  const preset = DIFFICULTY_PRESETS[difficulty] || DIFFICULTY_PRESETS.hard;
  const ai = new Pr5AI({ ai: { ...preset, rng: rng(seed) } });
  return (gs, player, state, now) => ai.decide(gs, player, state, now);
}

/** IA do PR #7 (main antes do lookahead) */
export function pr7AI({ difficulty = 'hard', seed = 1 } = {}) {
  const preset = DIFFICULTY_PRESETS[difficulty] || DIFFICULTY_PRESETS.hard;
  const ai = new Pr7AI({ ai: { ...preset, rng: rng(seed) } });
  return (gs, player, state, now) => ai.decide(gs, player, state, now);
}

export function legacyAI({ difficulty = 'medium', stadium } = {}) {
  const preset = DIFFICULTY_PRESETS[difficulty] || DIFFICULTY_PRESETS.medium;
  // reactionTime 0: a IA antiga usa Date.now(), que não avança no simulador
  const ai = new LegacyAI({ ai: { ...preset, reactionTime: 0 } }, new PhysicsPredictor(stadium));
  const wrap = (p) => ({ id: p.id, team: p.team, isKicking: p.isKicking, disc: p.disc && { ext: p.disc } });
  return (gs, player, state) => {
    const view = { physicsState: gs.physicsState, players: state.players.map(wrap), stadium: state.stadium };
    return ai.decide(view, wrap(player));
  };
}

/**
 * Roda uma partida. red/blue: arrays de fábricas (stadium) => controlador.
 * Retorna { red, blue, ticks }.
 */
export function runMatch({ red, blue, ticks = 60 * 60 * 2, stadiumIndex = 0, scoreLimit = 0 } = {}) {
  const stadium = STADIUMS[stadiumIndex];
  const goals = { red: 0, blue: 0 };
  const sb = Room.sandbox(
    { onTeamGoal: (teamId) => { if (teamId === 1) goals.red++; else goals.blue++; } },
    { controlledPlayerId: 0, requestAnimationFrame: () => 1, cancelAnimationFrame: () => {} }
  );
  const ctrls = [];
  let id = 1;
  for (const [team, list] of [[1, red], [2, blue]]) {
    for (const make of list) {
      sb.playerJoin(id, `${team === 1 ? 'R' : 'B'}${id}`, '', '', '', '');
      sb.setPlayerTeam(id, team, 0);
      ctrls.push({ id, ctrl: make(stadium), last: 0 });
      id++;
    }
  }
  sb.setCurrentStadium(stadium, 0);
  sb.setTimeLimit(0, 0);
  sb.setScoreLimit(0, 0);
  sb.startGame(0);
  sb.setSimulationSpeed(0);

  // métricas: trocas de tecla (suavidade) e dribles bem-sucedidos
  const stats = { 1: { keyChanges: 0, dribbles: 0, attempts: 0, pressTouches: 0, pressTicks: 0, players: red.length }, 2: { keyChanges: 0, dribbles: 0, attempts: 0, pressTouches: 0, pressTicks: 0, players: blue.length } };
  const teamOf = new Map(ctrls.map((c) => [c.id, c.id <= red.length ? 1 : 2]));
  let attempt = null; // { pid, team, oppId, start }

  let t = 0;
  for (; t < ticks; t++) {
    const gs = sb.gameState;
    const state = sb.state;
    if (gs && gs.state === 1) trackDribble(gs, state, t);
    for (const c of ctrls) {
      const player = state.players.find((p) => p.id === c.id);
      if (!player || !player.disc) continue;
      const d = c.ctrl(gs, player, state, t * TICK_MS) || {};
      let key = encode(d.dirX, d.dirY, d.kick);
      // segurar o chute só chuta uma vez: solta e aperta de novo
      if (d.kick && key === c.last && !player.isKicking) key &= ~16;
      if (key !== c.last) {
        if ((key & 15) !== (c.last & 15)) stats[teamOf.get(c.id)].keyChanges++;
        sb.playerInput(key, c.id); c.last = key;
      }
    }
    sb.runSteps(1);
    if (scoreLimit && (goals.red >= scoreLimit || goals.blue >= scoreLimit)) break;
  }
  try { sb.destroy(); } catch (e) { /* ignore */ }
  return { red: goals.red, blue: goals.blue, ticks: t, stats };

  function trackDribble(gs, state, tick) {
    const ball = gs.physicsState.discs[0];
    const b = ball.pos;
    const touching = [];
    for (const p of state.players) {
      if (!p.disc || !teamOf.has(p.id)) continue;
      if (Math.hypot(p.disc.pos.x - b.x, p.disc.pos.y - b.y) <= p.disc.radius + ball.radius + 1.5) touching.push(p);
    }
    // posse sob pressão: tick em que só um time está com a bola colada (<= 8 px do contato)
    // e há um adversário a menos de 60 px da bola; toques = contatos nessas condições
    const owners = new Set();
    for (const p of state.players) {
      if (!p.disc || !teamOf.has(p.id)) continue;
      if (Math.hypot(p.disc.pos.x - b.x, p.disc.pos.y - b.y) <= p.disc.radius + ball.radius + 8) owners.add(teamOf.get(p.id));
    }
    if (owners.size === 1) {
      const team = [...owners][0];
      const pressed = state.players.some((o) => o.disc && teamOf.has(o.id) && teamOf.get(o.id) !== team &&
        Math.hypot(o.disc.pos.x - b.x, o.disc.pos.y - b.y) < 60);
      if (pressed) {
        stats[team].pressTicks++;
        if (touching.some((p) => teamOf.get(p.id) === team)) stats[team].pressTouches++;
      }
    }
    if (attempt && tick - attempt.start > 150) attempt = null;
    for (const p of touching) {
      const team = teamOf.get(p.id);
      const sgn = team === 1 ? 1 : -1;
      if (attempt) {
        if (team !== attempt.team) { attempt = null; continue; } // adversário tocou: perdeu
        if (p.id === attempt.pid) {
          const o = state.players.find((q) => q.id === attempt.oppId);
          if (o?.disc && (b.x - o.disc.pos.x) * sgn > 15 && (p.disc.pos.x - o.disc.pos.x) * sgn > 0) {
            stats[team].dribbles++;
            attempt = null;
          }
        }
        continue;
      }
      // começa tentativa: defensor à frente da bola
      for (const o of state.players) {
        if (!o.disc || teamOf.get(o.id) === team || !teamOf.has(o.id)) continue;
        const dx = (o.disc.pos.x - b.x) * sgn;
        if (dx > 0 && dx < 90 && Math.abs(o.disc.pos.y - b.y) < 50) {
          attempt = { pid: p.id, team, oppId: o.id, start: tick };
          stats[team].attempts++;
          break;
        }
      }
    }
  }
}

/**
 * Joga n partidas A vs B alternando os lados (A de vermelho nas pares).
 * makeA/makeB: (seed, stadium) => controlador. size: jogadores por time.
 */
export function series(makeA, makeB, { n = 10, size = 1, ticks, seed = 1 } = {}) {
  let wins = 0, draws = 0, losses = 0, gf = 0, ga = 0, dribbles = 0, attempts = 0, keyRate = 0, pressA = 0, pressB = 0, touchA = 0, touchB = 0, oppDribbles = 0;
  const perMatch = [];
  for (let i = 0; i < n; i++) {
    const aRed = i % 2 === 0;
    const s = seed * 1000 + i;
    const A = Array.from({ length: size }, (_, k) => (st) => makeA(s + k * 7, st));
    const B = Array.from({ length: size }, (_, k) => (st) => makeB(s + 100 + k * 7, st));
    const r = runMatch({ red: aRed ? A : B, blue: aRed ? B : A, ticks });
    const a = aRed ? r.red : r.blue;
    const b = aRed ? r.blue : r.red;
    gf += a; ga += b;
    const sa = r.stats[aRed ? 1 : 2];
    const sb2 = r.stats[aRed ? 2 : 1];
    perMatch.push({ gd: a - b, drib: sa.dribbles - sb2.dribbles, keys: sa.keyChanges / sa.players / (r.ticks / 60) - sb2.keyChanges / sb2.players / (r.ticks / 60) });
    dribbles += sa.dribbles; attempts += sa.attempts; oppDribbles += sb2.dribbles;
    pressA += sa.pressTicks; pressB += sb2.pressTicks; touchA += sa.pressTouches; touchB += sb2.pressTouches;
    keyRate += sa.keyChanges / sa.players / (r.ticks / 60);
    if (a > b) wins++; else if (a < b) losses++; else draws++;
  }
  return {
    n, wins, draws, losses, gf, ga, winRate: wins / n, goalDiff: (gf - ga) / n,
    dribbles: dribbles / n, // dribles bem-sucedidos por partida
    dribbleRate: attempts ? dribbles / attempts : 0,
    oppDribbles: oppDribbles / n,
    pressSecA: pressA / n / 60, pressSecB: pressB / n / 60, // s de posse sob pressão por partida
    pressTouchA: touchA / n, pressTouchB: touchB / n,
    keyChangesPerSec: keyRate / n, // trocas de direção por segundo, por jogador
    perMatch // diferenças A-B por partida (gols, dribles, trocas de tecla/s)
  };
}
