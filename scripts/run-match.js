#!/usr/bin/env node
// Partidas headless bot vs bot com a física real do Haxball (Room.sandbox).
// Uso: npm run match -- [--mode 1v1|2v2] [--red nova|antiga] [--blue nova|antiga]
//                       [--matches 10] [--minutes 3] [--difficulty hard]
import { parseArgs } from 'node:util';
import { runMatch, newAI, legacyAI } from './sim.js';

const { values } = parseArgs({
  options: {
    mode: { type: 'string', default: '1v1' },
    red: { type: 'string', default: 'nova' },
    blue: { type: 'string', default: 'antiga' },
    matches: { type: 'string', default: '10' },
    minutes: { type: 'string', default: '3' },
    difficulty: { type: 'string', default: 'hard' }
  }
});
const size = values.mode === '2v2' ? 2 : 1;
const ticks = Math.round(+values.minutes * 60 * 60);
const make = (kind, seed) => (stadium) =>
  kind === 'antiga' ? legacyAI({ stadium }) : newAI({ seed, difficulty: values.difficulty });

console.log(`⚽ ${values.mode}: vermelho = IA ${values.red}, azul = IA ${values.blue}, ${values.matches} partidas de ${values.minutes} min\n`);
const tot = { red: 0, blue: 0, rw: 0, bw: 0, d: 0 };
const t0 = Date.now();
for (let i = 0; i < +values.matches; i++) {
  const red = Array.from({ length: size }, (_, k) => make(values.red, i * 10 + k));
  const blue = Array.from({ length: size }, (_, k) => make(values.blue, i * 10 + 5 + k));
  const r = runMatch({ red, blue, ticks });
  tot.red += r.red; tot.blue += r.blue;
  if (r.red > r.blue) tot.rw++; else if (r.blue > r.red) tot.bw++; else tot.d++;
  console.log(`Partida ${i + 1}: vermelho ${r.red} x ${r.blue} azul`);
}
console.log(`\nResumo: vermelho ${tot.rw} vitórias, azul ${tot.bw}, empates ${tot.d} | gols ${tot.red} x ${tot.blue} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
