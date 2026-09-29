// Real Match Simulation - Bot vs Bot / Bot vs Simple Opponent
import HaxballAPI from 'node-haxball';
import { BotController } from '../src/bot-controller.js';
import Config, { DIFFICULTY_PRESETS } from '../src/config.js';

const { Room } = HaxballAPI();

console.log('⚽ Iniciando simulação de partida real...\n');

// Classic stadium with real Haxball physics
const classicStadium = {
  name: "Classic",
  width: 420,
  height: 200,
  spawnDistance: 200,
  bg: { type: "grass", width: 420, height: 200, kickOffRadius: 75, cornerRadius: 0 },
  vertexes: [
    // Stadium boundaries
    { x: -420, y: 200, trait: "ballArea", cMask: ["ball"] },
    { x: -420, y: 64, trait: "ballArea", cMask: ["ball"] },
    { x: -420, y: -64, trait: "ballArea", cMask: ["ball"] },
    { x: -420, y: -200, trait: "ballArea", cMask: ["ball"] },
    { x: 420, y: 200, trait: "ballArea", cMask: ["ball"] },
    { x: 420, y: 64, trait: "ballArea", cMask: ["ball"] },
    { x: 420, y: -64, trait: "ballArea", cMask: ["ball"] },
    { x: 420, y: -200, trait: "ballArea", cMask: ["ball"] }
  ],
  segments: [
    // Walls
    { v0: 0, v1: 1, trait: "ballArea" },
    { v0: 2, v1: 3, trait: "ballArea" },
    { v0: 4, v1: 5, trait: "ballArea" },
    { v0: 6, v1: 7, trait: "ballArea" },
    { v0: 0, v1: 4, trait: "ballArea" },
    { v0: 3, v1: 7, trait: "ballArea" }
  ],
  goals: [
    { p0: [-420, 64], p1: [-420, -64], team: "red" },
    { p0: [420, 64], p1: [420, -64], team: "blue" }
  ],
  discs: [],
  planes: [
    { normal: [0, 1], dist: -200, trait: "ballArea" },
    { normal: [0, -1], dist: -200, trait: "ballArea" },
    { normal: [1, 0], dist: -420, trait: "ballArea" },
    { normal: [-1, 0], dist: -420, trait: "ballArea" }
  ],
  traits: {
    ballArea: { vis: true, bCoef: 1, cMask: ["ball"] }
  },
  playerPhysics: {
    radius: 15,
    bCoeff: 0.5,
    invMass: 0.5,
    damping: 0.96,
    acceleration: 0.1,
    kickingAcceleration: 0.07,
    kickingDamping: 0.96,
    kickStrength: 5
  },
  ballPhysics: {
    radius: 10,
    bCoeff: 0.5,
    invMass: 1,
    damping: 0.99,
    color: "FFFFFF",
    cMask: ["all"],
    cGroup: ["ball"]
  }
};

// Simple chase-and-kick opponent
class SimpleOpponent {
  constructor(sandbox, playerId, teamId) {
    this.sandbox = sandbox;
    this.playerId = playerId;
    this.teamId = teamId;
  }

  update() {
    const player = this.sandbox.state.getPlayer(this.playerId);
    if (!player || !player.disc) return;

    const ballDisc = this.sandbox.gameState?.physicsState?.discs?.[0];
    if (!ballDisc) return;

    const dx = ballDisc.pos.x - player.disc.ext.pos.x;
    const dy = ballDisc.pos.y - player.disc.ext.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const dirX = Math.abs(dx) < 2 ? 0 : Math.sign(dx);
    const dirY = Math.abs(dy) < 2 ? 0 : Math.sign(dy);
    const kick = dist < 30;

    let input = 0;
    if (dirX === 1) input |= 1;
    if (dirX === -1) input |= 2;
    if (dirY === 1) input |= 4;
    if (dirY === -1) input |= 8;
    if (kick) input |= 16;

    this.sandbox.playerInput(input, this.playerId);
  }
}

async function runMatch(matchType, durationMinutes = 3) {
  console.log(`\n🎮 Modo: ${matchType === 'bot-vs-bot' ? 'Bot vs Bot' : 'Bot vs Oponente Simples'}`);
  console.log(`⏱️  Duração: ${durationMinutes} minutos simulados\n`);

  // Create sandbox
  const sandbox = Room.sandbox({
    onPlayerJoin: (player) => {},
    onGameStart: () => {},
    onTeamGoal: (teamId) => {
      const scores = sandbox.state.getScores();
      if (scores) {
        console.log(`   ⚽ GOL! Placar: ${scores.red} x ${scores.blue}`);
      }
    }
  }, { delayedInit: true });

  sandbox.initialize();
  sandbox.setCurrentStadium(classicStadium);

  // Add players
  sandbox.playerJoin(1, 'SmartBot', 'BR', '🤖', 'bot1', 'auth1');
  sandbox.playerJoin(2, matchType === 'bot-vs-bot' ? 'SmartBot2' : 'ChaseBot', 'BR', '⚡', 'bot2', 'auth2');

  // Set teams
  sandbox.setPlayerTeam(1, 1); // Red
  sandbox.setPlayerTeam(2, 2); // Blue

  // Start game
  sandbox.startGame();

  // Create bot controllers
  const config1 = new Config({ BOT_DIFFICULTY: 'medium', BOT_REACTION_TIME: '30' });
  const bot1 = new BotController(sandbox, config1);
  bot1.setBotPlayerId(1);
  bot1.initialize();

  let bot2;
  let simpleOpp;
  if (matchType === 'bot-vs-bot') {
    const config2 = new Config({ BOT_DIFFICULTY: 'medium', BOT_REACTION_TIME: '30' });
    bot2 = new BotController(sandbox, config2);
    bot2.setBotPlayerId(2);
    bot2.initialize();
  } else {
    simpleOpp = new SimpleOpponent(sandbox, 2, 2);
  }

  // Run simulation
  const ticksPerSecond = 60;
  const totalTicks = durationMinutes * 60 * ticksPerSecond;
  const progressInterval = Math.floor(totalTicks / 20); // 20 updates

  console.log('🏁 Partida iniciada...\n');

  sandbox.setSimulationSpeed(0); // Stop for manual stepping

  let redGoals = 0;
  let blueGoals = 0;
  let ballPossessionRed = 0;
  let ballPossessionBlue = 0;
  let shotsRed = 0;
  let shotsBlue = 0;
  let lastKickerId = null;
  let lastBallX = 0;

  for (let tick = 0; tick < totalTicks; tick++) {
    // Update bots
    bot1.update();
    if (bot2) {
      bot2.update();
    } else {
      simpleOpp.update();
    }

    // Step simulation
    sandbox.runSteps(1);

    // Track stats
    if (sandbox.gameState) {
      const ball = sandbox.gameState.physicsState.discs[0];
      const player1 = sandbox.state.getPlayer(1);
      const player2 = sandbox.state.getPlayer(2);

      if (ball && player1 && player2 && player1.disc && player2.disc) {
        const dist1 = Math.sqrt(
          Math.pow(ball.pos.x - player1.disc.ext.pos.x, 2) +
          Math.pow(ball.pos.y - player1.disc.ext.pos.y, 2)
        );
        const dist2 = Math.sqrt(
          Math.pow(ball.pos.x - player2.disc.ext.pos.x, 2) +
          Math.pow(ball.pos.y - player2.disc.ext.pos.y, 2)
        );

        if (dist1 < 30) ballPossessionRed++;
        if (dist2 < 30) ballPossessionBlue++;

        // Count shots (ball moving toward goal)
        if (Math.abs(ball.pos.x - lastBallX) > 5) {
          if (ball.pos.x > lastBallX && ball.pos.x > 350) shotsRed++;
          if (ball.pos.x < lastBallX && ball.pos.x < -350) shotsBlue++;
        }
        lastBallX = ball.pos.x;
      }

      // Check goals
      const scores = sandbox.state.getScores();
      if (scores) {
        if (scores.red > redGoals) {
          redGoals = scores.red;
        }
        if (scores.blue > blueGoals) {
          blueGoals = scores.blue;
        }
      }
    }

    // Progress
    if (tick % progressInterval === 0 && tick > 0) {
      const progress = Math.floor((tick / totalTicks) * 100);
      const elapsed = Math.floor(tick / ticksPerSecond);
      process.stdout.write(`\r   Progresso: ${progress}% (${elapsed}s simulados)`);
    }
  }

  console.log('\r   Progresso: 100% (completo)       \n');

  // Final stats
  const finalScores = sandbox.state.getScores();
  const totalPossession = ballPossessionRed + ballPossessionBlue;
  const possessionRedPct = totalPossession > 0 ? (ballPossessionRed / totalPossession * 100).toFixed(1) : 0;
  const possessionBluePct = totalPossession > 0 ? (ballPossessionBlue / totalPossession * 100).toFixed(1) : 0;

  console.log('\n📊 RESULTADO FINAL\n');
  console.log(`   Placar: ${finalScores.red} x ${finalScores.blue}`);
  console.log(`   Vencedor: ${finalScores.red > finalScores.blue ? '🔴 Time Vermelho (Bot)' : finalScores.blue > finalScores.red ? '🔵 Time Azul' : '⚪ Empate'}`);
  console.log(`\n   Posse de Bola:`);
  console.log(`      🔴 Vermelho: ${possessionRedPct}%`);
  console.log(`      🔵 Azul: ${possessionBluePct}%`);
  console.log(`\n   Chutes ao Gol:`);
  console.log(`      🔴 Vermelho: ${shotsRed}`);
  console.log(`      🔵 Azul: ${shotsBlue}`);

  return {
    redGoals: finalScores.red,
    blueGoals: finalScores.blue,
    possessionRed: possessionRedPct,
    possessionBlue: possessionBluePct,
    shotsRed,
    shotsBlue
  };
}

// Run both matches
async function main() {
  try {
    console.log('=' .repeat(60));
    console.log('🤖 SIMULAÇÃO DE PARTIDAS REAIS - Física do Haxball');
    console.log('=' .repeat(60));

    const results = {};

    // Match 1: Bot vs Simple Opponent
    results.vsSimple = await runMatch('bot-vs-simple', 3);

    console.log('\n' + '=' .repeat(60));

    // Match 2: Bot vs Bot
    results.vsBo

t = await runMatch('bot-vs-bot', 3);

    console.log('\n' + '=' .repeat(60));
    console.log('\n✅ Simulações concluídas!');
    console.log('\n💡 Análise:');

    if (results.vsSimple.redGoals > results.vsSimple.blueGoals) {
      console.log('   ✅ Bot venceu o oponente simples');
    } else {
      console.log('   ⚠️  Bot não venceu o oponente simples');
    }

    console.log(`\n📈 Estatísticas gerais:`);
    console.log(`   Gols marcados pelo bot: ${results.vsSimple.redGoals + results.vsBot.redGoals}`);
    console.log(`   Gols sofridos: ${results.vsSimple.blueGoals + results.vsBot.blueGoals}`);
    console.log(`   Posse média: ${((parseFloat(results.vsSimple.possessionRed) + parseFloat(results.vsBot.possessionRed)) / 2).toFixed(1)}%`);

  } catch (error) {
    console.error('\n❌ Erro na simulação:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
