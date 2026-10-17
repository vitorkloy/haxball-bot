// Simulador headless com a física real do Haxball (Room.sandbox do node-haxball).
import HaxballAPI from 'node-haxball';
import { BotAI } from '../src/ai.js';
import { BotAI as LegacyAI } from '../src/ai-legacy.js';
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

  let t = 0;
  for (; t < ticks; t++) {
    const gs = sb.gameState;
    const state = sb.state;
    for (const c of ctrls) {
      const player = state.players.find((p) => p.id === c.id);
      if (!player || !player.disc) continue;
      const d = c.ctrl(gs, player, state, t * TICK_MS) || {};
      let key = encode(d.dirX, d.dirY, d.kick);
      // segurar o chute só chuta uma vez: solta e aperta de novo
      if (d.kick && key === c.last && !player.isKicking) key &= ~16;
      if (key !== c.last) { sb.playerInput(key, c.id); c.last = key; }
    }
    sb.runSteps(1);
    if (scoreLimit && (goals.red >= scoreLimit || goals.blue >= scoreLimit)) break;
  }
  try { sb.destroy(); } catch (e) { /* ignore */ }
  return { red: goals.red, blue: goals.blue, ticks: t };
}

/**
 * Joga n partidas A vs B alternando os lados (A de vermelho nas pares).
 * makeA/makeB: (seed, stadium) => controlador. size: jogadores por time.
 */
export function series(makeA, makeB, { n = 10, size = 1, ticks, seed = 1 } = {}) {
  let wins = 0, draws = 0, losses = 0, gf = 0, ga = 0;
  for (let i = 0; i < n; i++) {
    const aRed = i % 2 === 0;
    const s = seed * 1000 + i;
    const A = Array.from({ length: size }, (_, k) => (st) => makeA(s + k * 7, st));
    const B = Array.from({ length: size }, (_, k) => (st) => makeB(s + 100 + k * 7, st));
    const r = runMatch({ red: aRed ? A : B, blue: aRed ? B : A, ticks });
    const a = aRed ? r.red : r.blue;
    const b = aRed ? r.blue : r.red;
    gf += a; ga += b;
    if (a > b) wins++; else if (a < b) losses++; else draws++;
  }
  return { n, wins, draws, losses, gf, ga, winRate: wins / n, goalDiff: (gf - ga) / n };
}
