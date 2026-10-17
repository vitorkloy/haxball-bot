// Simplified Match Simulation - Bot (controlled) vs Stationary opponent
import HaxballAPI from 'node-haxball';
import { PhysicsPredictor } from '../src/physics.js';
import { BotAI } from '../src/ai.js';
import Config from '../src/config.js';

const { Room, Utils } = HaxballAPI();

console.log('⚽ Simulação Simplificada - Bot vs Oponente Parado\n');

// Minimal valid stadium
const stadium = JSON.stringify({
  "name": "Test",
  "width": 420,
  "height": 200,
  "bg": { "type": "grass" },
  "vertexes": [],
  "segments": [],
  "goals": [
    { "p0": [-420, 64], "p1": [-420, -64], "team": "red" },
    { "p0": [420, 64], "p1": [420, -64], "team": "blue" }
  ],
  "discs": [],
  "planes": [
    { "normal": [0, 1], "dist": -200 },
    { "normal": [0, -1], "dist": -200 },
    { "normal": [1, 0], "dist": -420 },
    { "normal": [-1, 0], "dist": -420 }
  ],
  "playerPhysics": {
    "radius": 15,
    "invMass": 0.5,
    "damping": 0.96,
    "acceleration": 0.1,
    "kickStrength": 5
  },
  "ballPhysics": {
    "radius": 10,
    "invMass": 1,
    "damping": 0.99
  }
});

async function runMatch(durationMinutes = 3) {
  console.log(`⏱️  Duração: ${durationMinutes} minutos\n`);

  const stats = {
    goals: { red: 0, blue: 0 },
    possession: { red: 0, blue: 0 }
  };

  // Create sandbox with controlled player
  const sandbox = Room.sandbox({
    onPlayerJoin: (player) => {
      console.log(`   👤 ${player.name} entrou`);
    },
    onGameStart: () => {
      console.log('   🎮 Jogo iniciado\n');
    },
    onTeamGoal: (teamId) => {
      const teamName = teamId === 1 ? 'red' : 'blue';
      stats.goals[teamName]++;
      const gs = sandbox.state.gameState;
      console.log(`   ⚽ GOL ${teamName.toUpperCase()}! Placar: ${gs?.redScore || 0} x ${gs?.blueScore || 0}`);
    }
  }, {
    controlledPlayerId: 1, // Bot controls player 1
    delayedInit: true
  });

  sandbox.initialize();
  sandbox.setCurrentStadium(stadium, 0);

  // Add players
  sandbox.playerJoin(1, 'SmartBot', 'BR', '🤖', 'bot1', 'auth1');
  sandbox.playerJoin(2, 'StationaryOpp', 'BR', '⚡', 'bot2', 'auth2');

  // Set teams
  sandbox.setPlayerTeam(1, 1, 0); // Red (controlled by bot)
  sandbox.setPlayerTeam(2, 2, 0); // Blue (stationary)

  // Start game
  sandbox.startGame(0);

  // Create bot AI
  const config = new Config({ BOT_DIFFICULTY: 'medium' });
  const physics = new PhysicsPredictor(sandbox.state.stadium);
  const ai = new BotAI(config, physics);

  console.log('▶️  Rodando simulação...\n');

  const ticksPerSecond = 60;
  const totalTicks = durationMinutes * 60 * ticksPerSecond;
  const reportEvery = 30 * ticksPerSecond;

  let movementDetected = false;
  let lastPos = null;

  for (let tick = 0; tick < totalTicks; tick++) {
    const gameState = sandbox.state.gameState;
    if (!gameState) continue;

    const botPlayer = sandbox.state.getPlayer(1);
    if (botPlayer && botPlayer.disc) {
      const decision = ai.decide(gameState, botPlayer);
      if (decision) {
        const { dirX, dirY, kick } = decision;
        const keyState = Utils.keyState(dirX, dirY, kick);
        sandbox.setKeyState(keyState); // Use setKeyState for controlled player
      }

      // Detect movement
      if (!movementDetected && botPlayer.disc.pos) {
        if (!lastPos) {
          lastPos = { x: botPlayer.disc.pos.x, y: botPlayer.disc.pos.y };
        } else {
          const dx = botPlayer.disc.pos.x - lastPos.x;
          const dy = botPlayer.disc.pos.y - lastPos.y;
          if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
            movementDetected = true;
            console.log(`   ✅ Movimento detectado! Bot moveu de (${lastPos.x.toFixed(1)}, ${lastPos.y.toFixed(1)}) para (${botPlayer.disc.pos.x.toFixed(1)}, ${botPlayer.disc.pos.y.toFixed(1)})\n`);
          }
        }
      }
    }

    sandbox.runSteps(1);

    // Track possession
    const ball = gameState.physicsState?.discs?.[0];
    if (ball) {
      for (let pid of [1, 2]) {
        const p = sandbox.state.getPlayer(pid);
        if (p?.disc) {
          const dx = ball.pos.x - p.disc.pos.x;
          const dy = ball.pos.y - p.disc.pos.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 20) {
            const teamName = p.team.id === 1 ? 'red' : 'blue';
            stats.possession[teamName]++;
          }
        }
      }
    }

    // Progress report
    if (tick > 0 && tick % reportEvery === 0) {
      const elapsed = Math.floor(tick / ticksPerSecond);
      console.log(`   ⏱️  ${Math.floor(elapsed / 60)}:${(elapsed % 60).toString().padStart(2, '0')} - Placar: ${gameState.redScore || 0} x ${gameState.blueScore || 0}`);
    }
  }

  sandbox.stopGame(0);

  const finalGS = sandbox.state.gameState;
  const redScore = finalGS?.redScore || 0;
  const blueScore = finalGS?.blueScore || 0;

  console.log('\n═══════════════════════════════════════════');
  console.log('📊 ESTATÍSTICAS FINAIS');
  console.log('═══════════════════════════════════════════\n');
  console.log('🏆 Placar Final:');
  console.log(`   SmartBot (Red):        ${redScore}`);
  console.log(`   StationaryOpp (Blue):  ${blueScore}\n`);
  console.log('⚽ Gols:');
  console.log(`   Red:  ${stats.goals.red}`);
  console.log(`   Blue: ${stats.goals.blue}\n`);

  const totalPoss = stats.possession.red + stats.possession.blue;
  const redPossPct = totalPoss > 0 ? ((stats.possession.red / totalPoss) * 100).toFixed(1) : 0;
  const bluePossPct = totalPoss > 0 ? ((stats.possession.blue / totalPoss) * 100).toFixed(1) : 0;

  console.log('⏱️  Posse de Bola:');
  console.log(`   Red:  ${redPossPct}%`);
  console.log(`   Blue: ${bluePossPct}%\n`);

  if (redScore > blueScore) {
    console.log('🏆 VITÓRIA: SmartBot!\n');
  } else if (blueScore > redScore) {
    console.log('🏆 VITÓRIA: StationaryOpp!\n');
  } else {
    console.log('🤝 EMPATE!\n');
  }

  console.log('═══════════════════════════════════════════\n');

  if (!movementDetected) {
    console.log('⚠️  AVISO: Nenhum movimento do bot foi detectado durante a simulação.');
  }

  return { winner: redScore > blueScore ? 'red' : blueScore > redScore ? 'blue' : 'draw', scores: { red: redScore, blue: blueScore }, stats };
}

runMatch(3)
  .then(() => {
    console.log('✅ Simulação concluída\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro:', error);
    process.exit(1);
  });
