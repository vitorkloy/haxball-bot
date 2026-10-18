#!/usr/bin/env node
// Copia os módulos compartilhados de src/ para web/ (a página usa cópias locais).
import fs from 'node:fs';
for (const f of ['ai.js', 'ai-params.js', 'bot-controller.js', 'physics.js', 'planner.js']) {
  fs.copyFileSync(`src/${f}`, `web/${f}`);
  console.log(`src/${f} -> web/${f}`);
}
