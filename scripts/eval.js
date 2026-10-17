#!/usr/bin/env node
// Avalia a IA atual (src/ai-params.js) contra a IA antiga no simulador.
// Uso: npm run eval -- [--matches 200] [--size 1] [--difficulty hard] [--ticks 3600]
import { parseArgs } from 'node:util';
import { series, newAI, legacyAI } from './sim.js';

const { values } = parseArgs({
  options: {
    matches: { type: 'string', default: '200' },
    size: { type: 'string', default: '1' },
    difficulty: { type: 'string', default: 'hard' },
    legacy: { type: 'string', default: 'medium' },
    ticks: { type: 'string', default: '3600' },
    seed: { type: 'string', default: '424242' }
  }
});
const t0 = Date.now();
const r = series(
  (s) => newAI({ seed: s, difficulty: values.difficulty }),
  (s, st) => legacyAI({ stadium: st, difficulty: values.legacy }),
  { n: +values.matches, size: +values.size, ticks: +values.ticks, seed: +values.seed }
);
const min = (+values.ticks / 3600).toFixed(1);
console.log(`IA nova (${values.difficulty}) vs IA antiga (${values.legacy}), ${values.size}v${values.size}, ${r.n} partidas de ${min} min:`);
console.log(`  vitórias ${r.wins}  empates ${r.draws}  derrotas ${r.losses}  (${(r.winRate * 100).toFixed(1)}% vitórias)`);
console.log(`  gols ${r.gf} x ${r.ga}  saldo médio ${r.goalDiff.toFixed(2)}/partida  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
