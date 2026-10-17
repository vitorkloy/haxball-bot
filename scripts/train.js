#!/usr/bin/env node
// Treino por self-play: estratégia evolutiva simples (1+λ) sobre os parâmetros da IA.
// Cada candidato joga contra o melhor atual e contra a IA antiga no simulador
// headless (física real do Haxball). Resultado salvo em src/ai-params.json/.js e web/ai-params.js.
//
// Uso: npm run train -- [--gens 20] [--pop 16] [--matches 8] [--ticks 3600] [--sigma 0.15] [--seed 1]
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { parseArgs } from 'node:util';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

if (!isMainThread) {
  const { series, newAI, legacyAI } = await import('./sim.js');
  parentPort.on('message', (job) => {
    const { cand, best, matches, ticks, seed, size } = job;
    const A = (s) => newAI({ params: cand, seed: s, difficulty: 'hard' });
    const res = {};
    if (job.vsLegacy) res.legacy = series(A, (s, st) => legacyAI({ stadium: st }), { n: matches, ticks, seed, size });
    if (best) res.best = series(A, (s) => newAI({ params: best, seed: s, difficulty: 'hard' }), { n: matches, ticks, seed: seed + 7, size });
    parentPort.postMessage({ id: job.id, res });
  });
} else {
  const { values } = parseArgs({
    options: {
      gens: { type: 'string', default: '20' },
      pop: { type: 'string', default: '16' },
      matches: { type: 'string', default: '8' },
      ticks: { type: 'string', default: '3600' },
      sigma: { type: 'string', default: '0.15' },
      seed: { type: 'string', default: '1' },
      workers: { type: 'string', default: String(Math.max(1, os.cpus().length)) },
      out: { type: 'string', default: 'src/ai-params.json' }
    }
  });
  const GENS = +values.gens, POP = +values.pop, MATCHES = +values.matches, TICKS = +values.ticks;
  const SIGMA = +values.sigma;
  const { PARAM_SPACE } = await import('../src/ai.js');
  const start = (await import('../src/ai-params.js')).default;
  const { rng } = await import('./sim.js');
  const rand = rng(+values.seed);
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());

  const keys = Object.keys(PARAM_SPACE);
  const mutate = (p) => {
    const c = { ...p };
    for (const k of keys) {
      if (rand() < 0.5) continue; // muta ~metade dos parâmetros por vez
      const [lo, hi] = PARAM_SPACE[k];
      c[k] = Math.min(hi, Math.max(lo, c[k] + gauss() * SIGMA * (hi - lo)));
    }
    return c;
  };

  const workers = Array.from({ length: +values.workers }, () => new Worker(__filename));
  let nextId = 0;
  const pending = new Map();
  for (const w of workers) w.on('message', (m) => { pending.get(m.id)(m.res); pending.delete(m.id); });
  let rr = 0;
  const run = (job) => new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    workers[rr++ % workers.length].postMessage({ ...job, id });
  });
  // divide uma avaliação em pedaços para usar todos os núcleos
  const evalSplit = async (job, chunks) => {
    const parts = await Promise.all(Array.from({ length: chunks }, (_, i) =>
      run({ ...job, matches: Math.ceil(job.matches / chunks / 2) * 2, seed: job.seed + i * 101 })));
    const merge = (key) => {
      const xs = parts.map((p) => p[key]).filter(Boolean);
      if (!xs.length) return null;
      const s = xs.reduce((a, b) => ({ n: a.n + b.n, wins: a.wins + b.wins, draws: a.draws + b.draws, losses: a.losses + b.losses, gf: a.gf + b.gf, ga: a.ga + b.ga }));
      return { ...s, winRate: s.wins / s.n, goalDiff: (s.gf - s.ga) / s.n };
    };
    return { legacy: merge('legacy'), best: merge('best') };
  };

  let best = { ...start };
  const t0 = Date.now();
  let bestLegacy = (await evalSplit({ cand: best, best: null, vsLegacy: true, matches: MATCHES * 4, ticks: TICKS, seed: 999, size: 1 }, workers.length)).legacy;
  console.log(`inicial vs IA antiga: ${(bestLegacy.winRate * 100).toFixed(0)}% vitórias, saldo ${bestLegacy.goalDiff.toFixed(2)}/partida`);

  for (let g = 1; g <= GENS; g++) {
    const cands = Array.from({ length: POP }, () => mutate(best));
    const results = await Promise.all(cands.map((cand, i) =>
      run({ cand, best, vsLegacy: true, matches: MATCHES, ticks: TICKS, seed: g * 7919 + i * 31, size: (i % 4 === 3) ? 2 : 1 })));
    const scored = results.map((r, i) => ({ cand: cands[i], r, fit: r.best.goalDiff + 0.5 * r.legacy.goalDiff }))
      .sort((a, b) => b.fit - a.fit);
    const top = scored[0];
    let accepted = false;
    if (top.r.best.goalDiff > 0) {
      // confirma com mais partidas (1v1 e 2v2) antes de aceitar
      const v1 = await evalSplit({ cand: top.cand, best, vsLegacy: true, matches: MATCHES * 4, ticks: TICKS, seed: g * 104729, size: 1 }, workers.length);
      const v2 = await evalSplit({ cand: top.cand, best, vsLegacy: false, matches: MATCHES * 2, ticks: TICKS, seed: g * 15485863, size: 2 }, workers.length);
      if (v1.best.goalDiff + 0.5 * v2.best.goalDiff > 0.1 && v1.legacy.goalDiff >= bestLegacy.goalDiff - 0.25) {
        best = top.cand;
        bestLegacy = v1.legacy;
        accepted = true;
      }
    }
    console.log(`geração ${g}/${GENS}: melhor candidato saldo vs atual ${top.r.best.goalDiff.toFixed(2)}, vs antiga ${top.r.legacy.goalDiff.toFixed(2)} ` +
      `${accepted ? '-> ACEITO' : ''} | atual vs antiga: ${(bestLegacy.winRate * 100).toFixed(0)}% (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }

  const rounded = Object.fromEntries(Object.entries(best).map(([k, v]) => [k, Math.round(v * 1000) / 1000]));
  const json = JSON.stringify(rounded, null, 2);
  fs.writeFileSync(path.join(ROOT, values.out), json + '\n');
  const mod = `// Gerado por \`npm run train\` (scripts/train.js). Também salvo em src/ai-params.json.\nexport default ${json};\n`;
  fs.writeFileSync(path.join(ROOT, 'src/ai-params.js'), mod);
  fs.writeFileSync(path.join(ROOT, 'web/ai-params.js'), mod);
  console.log(`\nParâmetros salvos em ${values.out}, src/ai-params.js e web/ai-params.js`);
  for (const w of workers) w.terminate();
}
