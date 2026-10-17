#!/usr/bin/env node
// Avalia a IA atual (src/ai.js + src/ai-params.js) contra a IA do PR #5 e a IA antiga.
// Uso: npm run eval -- [--matches 200] [--size 1] [--vs pr5|antiga|nova] [--difficulty hard] [--ticks 3600]
import { parseArgs } from 'node:util';
import { series, newAI, legacyAI, pr5AI } from './sim.js';

const { values } = parseArgs({
  options: {
    matches: { type: 'string', default: '200' },
    size: { type: 'string', default: '1' },
    vs: { type: 'string', default: 'pr5' },
    a: { type: 'string', default: 'nova' },
    difficulty: { type: 'string', default: 'hard' },
    ticks: { type: 'string', default: '3600' },
    seed: { type: 'string', default: '424242' }
  }
});
const make = (kind) => (s, st) =>
  kind === 'antiga' ? legacyAI({ stadium: st }) :
  kind === 'pr5' ? pr5AI({ seed: s, difficulty: values.difficulty }) :
  newAI({ seed: s, difficulty: values.difficulty });
const t0 = Date.now();
const r = series(make(values.a), make(values.vs), { n: +values.matches, size: +values.size, ticks: +values.ticks, seed: +values.seed });
const min = (+values.ticks / 3600).toFixed(1);
console.log(`IA ${values.a} vs IA ${values.vs} (${values.difficulty}), ${values.size}v${values.size}, ${r.n} partidas de ${min} min:`);
console.log(`  vitórias ${r.wins}  empates ${r.draws}  derrotas ${r.losses}  (${(r.winRate * 100).toFixed(1)}% vitórias, ${(((r.wins + r.draws / 2) / r.n) * 100).toFixed(1)}% pontos)`);
console.log(`  gols ${r.gf} x ${r.ga}  saldo médio ${r.goalDiff.toFixed(2)}/partida`);
console.log(`  dribles bem-sucedidos ${r.dribbles.toFixed(2)}/partida (${(r.dribbleRate * 100).toFixed(0)}% das tentativas)  trocas de direção ${r.keyChangesPerSec.toFixed(2)}/s por jogador  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
