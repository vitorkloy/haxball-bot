#!/usr/bin/env node
// Liga de self-play contínua.
// - Campeão atual: src/ai-params.json. Cada geração cria variações (mutação gaussiana nas faixas
//   de PARAM_SPACE) que jogam contra o campeão no simulador (física real do Haxball).
// - Objetivo por partida (diferença candidato - adversário na mesma partida):
//     saldo de gols + W_DRIB * dribles bem-sucedidos - W_KEYS * trocas de direção por segundo
// - Promoção só com confiança estatística (média - z * erro padrão > 0, z = 1.64 ~ 95% unilateral)
//   e sem regressão contra o Hall da Fama (campeões anteriores) nem contra a IA do PR #5.
// - Cada promoção salva os parâmetros (checkpoint) e entra no Hall da Fama (training/hall-of-fame.json).
//
// npm run train                 -> 20 gerações
// npm run train:loop            -> roda até Ctrl+C (ou --gens N / --minutes M)
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { parseArgs } from 'node:util';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

if (!isMainThread) {
  const { series, newAI, pr5AI } = await import('./sim.js');
  parentPort.on('message', (job) => {
    const A = (s) => newAI({ params: job.cand, seed: s, difficulty: 'hard' });
    const B = job.opp === 'pr5'
      ? (s) => pr5AI({ seed: s, difficulty: 'hard' })
      : (s) => newAI({ params: job.opp, seed: s, difficulty: 'hard' });
    const r = series(A, B, { n: job.matches, ticks: job.ticks, seed: job.seed, size: job.size });
    parentPort.postMessage({ id: job.id, r });
  });
} else {
  const { values } = parseArgs({
    options: {
      gens: { type: 'string', default: 'Infinity' },
      minutes: { type: 'string', default: 'Infinity' },
      pop: { type: 'string', default: '16' },
      screen: { type: 'string', default: '16' },
      confirm: { type: 'string', default: '64' },
      ticks: { type: 'string', default: '3600' },
      sigma: { type: 'string', default: '0.12' },
      seed: { type: 'string', default: String(Date.now() % 100000) },
      wDrib: { type: 'string', default: '0.5' },
      wKeys: { type: 'string', default: '0.05' },
      z: { type: 'string', default: '1.64' },
      workers: { type: 'string', default: String(Math.max(1, os.cpus().length)) }
    }
  });
  const GENS = +values.gens, POP = +values.pop, TICKS = +values.ticks, SIGMA = +values.sigma;
  const W_DRIB = +values.wDrib, W_KEYS = +values.wKeys, Z = +values.z;
  const deadline = Date.now() + +values.minutes * 60000;

  const { PARAM_SPACE } = await import('../src/ai.js');
  const { rng } = await import('./sim.js');
  const rand = rng(+values.seed);
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
  const keys = Object.keys(PARAM_SPACE);

  const paramsJson = path.join(ROOT, 'src/ai-params.json');
  const hofPath = path.join(ROOT, 'training/hall-of-fame.json');
  const logPath = path.join(ROOT, 'training/league-log.jsonl');
  fs.mkdirSync(path.dirname(hofPath), { recursive: true });
  let champion = JSON.parse(fs.readFileSync(paramsJson, 'utf8'));
  for (const k of keys) if (champion[k] === undefined) champion[k] = (PARAM_SPACE[k][0] + PARAM_SPACE[k][1]) / 2;
  let hof = fs.existsSync(hofPath) ? JSON.parse(fs.readFileSync(hofPath, 'utf8')) : [];
  if (!hof.length) hof.push({ gen: 0, at: new Date().toISOString(), params: champion });

  const mutate = (p, sigma) => {
    const c = { ...p };
    for (const k of keys) {
      if (rand() < 0.6) continue;
      const [lo, hi] = PARAM_SPACE[k];
      c[k] = Math.min(hi, Math.max(lo, c[k] + gauss() * sigma * (hi - lo)));
    }
    return c;
  };

  // pool de workers
  const workers = Array.from({ length: +values.workers }, () => new Worker(__filename));
  const pending = new Map();
  let nextId = 0, rr = 0;
  for (const w of workers) w.on('message', (m) => { pending.get(m.id)(m.r); pending.delete(m.id); });
  const run = (job) => new Promise((res) => { const id = nextId++; pending.set(id, res); workers[rr++ % workers.length].postMessage({ ...job, id }); });
  const play = async (cand, opp, matches, seed, size = 1) => {
    const chunks = Math.min(workers.length, Math.max(1, Math.floor(matches / 2)));
    const per = Math.ceil(matches / chunks / 2) * 2;
    const parts = await Promise.all(Array.from({ length: chunks }, (_, i) => run({ cand, opp, matches: per, ticks: TICKS, seed: seed + i * 101, size })));
    const pm = parts.flatMap((p) => p.perMatch);
    const n = pm.length;
    const sum = (f) => parts.reduce((a, p) => a + f(p), 0);
    return {
      n, perMatch: pm,
      winRate: sum((p) => p.wins) / n,
      points: (sum((p) => p.wins) + sum((p) => p.draws) / 2) / n,
      goalDiff: sum((p) => p.gf - p.ga) / n,
      dribbles: sum((p) => p.dribbles * p.n) / n,
      keys: sum((p) => p.keyChangesPerSec * p.n) / n
    };
  };
  const objective = (m) => m.gd + W_DRIB * m.drib - W_KEYS * m.keys;
  const stats = (pm) => {
    const xs = pm.map(objective);
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, xs.length - 1));
    return { mean, se: sd / Math.sqrt(xs.length) };
  };
  const save = (params) => {
    const rounded = Object.fromEntries(keys.map((k) => [k, Math.round(params[k] * 1000) / 1000]));
    const json = JSON.stringify(rounded, null, 2);
    fs.writeFileSync(paramsJson, json + '\n');
    const mod = `// Gerado por \`npm run train\` (scripts/train.js). Também salvo em src/ai-params.json.\nexport default ${json};\n`;
    fs.writeFileSync(path.join(ROOT, 'src/ai-params.js'), mod);
    fs.writeFileSync(path.join(ROOT, 'web/ai-params.js'), mod);
    fs.writeFileSync(hofPath, JSON.stringify(hof, null, 1) + '\n');
  };

  let stop = false;
  process.on('SIGINT', () => { if (stop) process.exit(1); stop = true; console.log('\nParando ao fim da geração atual (Ctrl+C de novo para sair já)...'); });

  let promotions = 0;
  const t0 = Date.now();
  console.log(`Liga de self-play: pop ${POP}, triagem ${values.screen} partidas, confirmação ${values.confirm}, z=${Z}, Hall da Fama ${hof.length}`);
  for (let g = 1; g <= GENS && !stop && Date.now() < deadline; g++) {
    const sigma = SIGMA * (0.5 + rand());
    const cands = Array.from({ length: POP }, () => mutate(champion, sigma));
    const screened = [];
    // triagem com parada antecipada (teste sequencial): metade das partidas primeiro;
    // se o candidato já está claramente pior que o campeão, descarta sem jogar o resto
    let dropped = 0;
    for (const cand of cands) {
      const seed = g * 7919 + screened.length * 31 + dropped * 17;
      const half = Math.max(4, Math.floor(+values.screen / 2));
      const r1 = await play(cand, champion, half, seed);
      const s1 = stats(r1.perMatch);
      if (s1.mean + Z * s1.se < 0) { dropped++; continue; }
      const r2 = await play(cand, champion, +values.screen - half, seed + 5);
      screened.push({ cand, r: { ...r2, perMatch: r1.perMatch.concat(r2.perMatch) } });
    }
    if (!screened.length) { console.log(`geração ${g}: todos os ${dropped} candidatos descartados cedo (${((Date.now() - t0) / 1000).toFixed(0)}s)`); continue; }
    screened.sort((a, b) => stats(b.r.perMatch).mean - stats(a.r.perMatch).mean);
    const top = screened[0];
    let line = `geração ${g}: ${dropped} descartados cedo, melhor triagem ${stats(top.r.perMatch).mean.toFixed(2)}`;
    if (stats(top.r.perMatch).mean > 0) {
      const seed = g * 104729;
      const vsChamp = await play(top.cand, champion, +values.confirm, seed); // (+ 2v2 abaixo)
      const vsChamp2 = await play(top.cand, champion, Math.max(8, +values.confirm / 4), seed + 1, 2);
      const st = stats(vsChamp.perMatch.concat(vsChamp2.perMatch));
      line += ` | confirmação vs campeão: ${(vsChamp.winRate * 100).toFixed(0)}% vitórias, ${(vsChamp.points * 100).toFixed(0)}% pontos, objetivo ${st.mean.toFixed(2)}±${st.se.toFixed(2)}`;
      if (st.mean - Z * st.se > 0) {
        const vsPr5 = await play(top.cand, 'pr5', 32, seed + 2);
        const sample = hof.slice(-4);
        const vsHof = await Promise.all(sample.map((h, i) => play(top.cand, h.params, 16, seed + 3 + i)));
        const hofGd = vsHof.reduce((a, r) => a + r.goalDiff, 0) / vsHof.length;
        const ok = vsPr5.points >= 0.48 && hofGd >= -0.05;
        line += ` | vs PR#5 ${(vsPr5.points * 100).toFixed(0)}% pts, vs Hall da Fama saldo ${hofGd.toFixed(2)}`;
        if (ok) {
          champion = top.cand;
          promotions++;
          hof.push({ gen: g, at: new Date().toISOString(), vsPrevChampionWinRate: vsChamp.winRate, vsPrevChampionPoints: vsChamp.points, params: champion });
          if (hof.length > 20) hof = hof.slice(-20);
          save(champion);
          line += ` -> PROMOVIDO (#${promotions}, checkpoint salvo)`;
        }
        fs.appendFileSync(logPath, JSON.stringify({ gen: g, at: new Date().toISOString(), promoted: ok, vsChampion: { winRate: vsChamp.winRate, points: vsChamp.points, objective: st.mean, se: st.se, dribbles: vsChamp.dribbles, keys: vsChamp.keys }, vsPr5: vsPr5.points, hofGd }) + '\n');
      }
    }
    console.log(`${line} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  console.log(`\nFim: ${promotions} promoções. Parâmetros em src/ai-params.json (+ src/ai-params.js, web/ai-params.js); Hall da Fama em training/hall-of-fame.json`);
  for (const w of workers) w.terminate();
}
