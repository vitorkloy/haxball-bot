import HaxballAPI from 'node-haxball';
import dotenv from 'dotenv';
import Config from './config.js';
import { BotController } from './bot-controller.js';

dotenv.config();

const { Room, Utils } = HaxballAPI();

export class HaxballBotRoom {
  constructor(config) {
    this.config = config;
    this.room = null;
    this.botController = null;
    this.roomLink = null;
  }

  async start() {
    console.log('🤖 Iniciando Bot de Haxball...\n');

    // Validate configuration
    try {
      this.config.validate();
    } catch (error) {
      console.error('❌ Erro de configuração:', error.message);
      process.exit(1);
    }

    // Generate auth
    console.log('🔑 Gerando autenticação...');
    const [authKey, authObj] = await Utils.generateAuth();

    // Create room
    console.log('🏠 Criando sala...');
    
    const roomConfig = {
      name: this.config.room.name,
      password: this.config.room.password,
      showInRoomList: this.config.room.public,
      maxPlayerCount: this.config.room.maxPlayers,
      geo: this.config.room.geo,
      token: this.config.room.token,
      noPlayer: false
    };

    const roomOptions = {
      storage: {
        player_name: this.config.bot.name,
        avatar: this.config.bot.avatar
      },
      onOpen: (room) => this.onRoomOpen(room),
      onClose: (room) => this.onRoomClose(room)
    };

    try {
      this.room = await Room.create(roomConfig, roomOptions);
    } catch (error) {
      console.error('❌ Erro ao criar sala:', error.message);
      console.error('\n💡 Dicas:');
      console.error('  - Verifique se o token está configurado corretamente no .env');
      console.error('  - Obtenha um novo token em: https://www.haxball.com/headlesstoken');
      console.error('  - Tokens expiram periodicamente e precisam ser renovados');
      process.exit(1);
    }
  }

  onRoomOpen(room) {
    this.room = room;
    this.botController = new BotController(room, this.config);

    console.log(`✅ Sala criada com sucesso!`);
    console.log(`👤 Bot: ${this.config.bot.name} ${this.config.bot.avatar}`);
    console.log(`🎮 Dificuldade: ${this.config.ai.difficulty}`);

    // Setup event handlers
    this.setupEventHandlers();

    // Wait for room link
    room.onAfterRoomLink = (roomLink) => {
      this.roomLink = roomLink;
      console.log(`\n🔗 Link da sala: ${roomLink}`);
      console.log(`\n📋 Comandos disponíveis no chat:`);
      console.log(`   !help - Mostra ajuda`);
      console.log(`   !start - Inicia o jogo`);
      console.log(`   !pause - Pausa o jogo`);
      console.log(`   !bot on/off - Liga/desliga o bot`);
      console.log(`   !teams - Move jogadores para os times`);
      console.log(`\n⏳ Aguardando jogadores...\n`);
    };
  }

  setupEventHandlers() {
    const room = this.room;

    // Player join
    room.onPlayerJoin = (player) => {
      console.log(`👋 ${player.name} entrou na sala`);
      
      // Set bot player ID
      if (player.name === this.config.bot.name) {
        this.botController.setBotPlayerId(player.id);
        console.log(`🤖 Bot player ID: ${player.id}`);
      }

      // Send welcome message
      room.sendChat(`Bem-vindo ${player.name}! Digite !help para ver os comandos.`);
    };

    // Player leave
    room.onPlayerLeave = (player) => {
      console.log(`👋 ${player.name} saiu da sala`);
    };

    // Chat commands
    room.onPlayerChat = (player, message) => {
      if (message.startsWith('!')) {
        return this.handleCommand(player, message);
      }
      return true;
    };

    // Game start
    room.onGameStart = (byPlayer) => {
      console.log('🎮 Jogo iniciado!');
      this.botController.initialize();
    };

    // Game stop
    room.onGameStop = (byPlayer) => {
      console.log('⏸️  Jogo pausado');
      this.botController.reset();
    };

    // Game tick - main bot update loop
    room.onGameTick = () => {
      this.botController.update();
    };

    // Goal scored
    room.onTeamGoal = (teamId) => {
      const scores = room.getScores();
      console.log(`⚽ GOL! Placar: ${scores.red} x ${scores.blue}`);
    };

    // Team victory
    room.onTeamVictory = (scores) => {
      console.log(`🏆 Fim de jogo! Placar final: ${scores.red} x ${scores.blue}`);
    };
  }

  handleCommand(player, message) {
    const args = message.toLowerCase().split(' ');
    const command = args[0];

    switch (command) {
      case '!help':
        this.room.sendChat('Comandos: !start, !pause, !bot on/off, !teams, !status');
        return false;

      case '!start':
        if (this.room.getPlayerList().length < 2) {
          this.room.sendChat('Precisa de pelo menos 2 jogadores para iniciar');
        } else {
          this.room.startGame();
        }
        return false;

      case '!pause':
        this.room.pauseGame(!this.room.getScores().time);
        return false;

      case '!stop':
        this.room.stopGame();
        return false;

      case '!bot':
        if (args[1] === 'on') {
          this.botController.setActive(true);
          this.room.sendChat('🤖 Bot ativado');
        } else if (args[1] === 'off') {
          this.botController.setActive(false);
          this.room.sendChat('🤖 Bot desativado');
        }
        return false;

      case '!teams':
        this.autoAssignTeams();
        return false;

      case '!status':
        const state = this.botController.getState();
        this.room.sendChat(`Bot: ${state.isActive ? 'Ativo' : 'Inativo'} | Estado: ${state.currentState}`);
        return false;

      default:
        return true;
    }
  }

  autoAssignTeams() {
    const players = this.room.getPlayerList().filter(p => p.team === 0);
    players.forEach((player, index) => {
      const team = index % 2 === 0 ? 1 : 2; // Alternate between red and blue
      this.room.setPlayerTeam(player.id, team);
    });
    this.room.sendChat('Times organizados!');
  }

  onRoomClose(room) {
    console.log('\n❌ Sala fechada');
    process.exit(0);
  }
}

// Main execution
async function main() {
  const config = new Config(process.env);
  const botRoom = new HaxballBotRoom(config);
  
  try {
    await botRoom.start();
  } catch (error) {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  }
}

// Handle shutdown gracefully
process.on('SIGINT', () => {
  console.log('\n\n👋 Encerrando bot...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n👋 Encerrando bot...');
  process.exit(0);
});

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default HaxballBotRoom;
