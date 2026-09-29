#!/usr/bin/env node
import HaxballAPI from 'node-haxball';
import dotenv from 'dotenv';
import { parseArgs } from 'node:util';
import Config from './config.js';
import { BotController } from './bot-controller.js';

dotenv.config();

const { Room, Utils } = HaxballAPI();

console.log('🤖 Haxball Bot - Modo Join\n');

// Parse command line arguments
const { values } = parseArgs({
  options: {
    link: { type: 'string' },
    password: { type: 'string', default: '' },
    name: { type: 'string', default: process.env.BOT_NAME || 'HaxBot' },
    avatar: { type: 'string', default: process.env.BOT_AVATAR || '🤖' },
    difficulty: { type: 'string', default: process.env.BOT_DIFFICULTY || 'medium' }
  },
  allowPositionals: true
});

function parseRoomLink(link) {
  try {
    const url = new URL(link);
    if (!url.hostname.includes('haxball.com')) {
      throw new Error('Link inválido');
    }
    
    const roomId = url.searchParams.get('c');
    if (!roomId) {
      throw new Error('ID da sala não encontrado');
    }
    
    return roomId;
  } catch (error) {
    throw new Error('Link inválido. Use: https://www.haxball.com/play?c=XXXXX');
  }
}

async function joinRoom() {
  const link = values.link || process.env.ROOM_LINK;
  
  if (!link) {
    console.error('❌ Erro: Link da sala não fornecido\n');
    console.log('Uso: npm run join -- --link <url> [--password <pw>] [--name <nick>] [--difficulty <level>]');
    console.log('\nOu configure ROOM_LINK no arquivo .env');
    console.log('\nExemplo:');
    console.log('  npm run join -- --link "https://www.haxball.com/play?c=ABC123" --name "MeuBot"');
    process.exit(1);
  }

  try {
    const roomId = parseRoomLink(link);
    console.log(`🔗 ID da sala: ${roomId}`);
    console.log(`👤 Nome: ${values.name}`);
    console.log(`🎮 Dificuldade: ${values.difficulty}\n`);

    // Generate auth
    console.log('🔑 Gerando autenticação...');
    const [authKey, authObj] = await Utils.generateAuth();

    // Join room
    console.log('🏠 Entrando na sala...\n');
    
    const config = new Config({
      BOT_NAME: values.name,
      BOT_AVATAR: values.avatar,
      BOT_DIFFICULTY: values.difficulty
    });

    const room = await Room.join({
      id: roomId,
      password: values.password || undefined,
      authObj: authObj
    }, {
      storage: {
        player_name: values.name,
        avatar: values.avatar
      },
      onOpen: (r) => {
        console.log(`✅ Conectado à sala: ${r.name}\n`);
        
        // Find bot player
        const players = r.getPlayerList();
        const botPlayer = players.find(p => p.name === values.name);
        
        if (!botPlayer) {
          console.error('❌ Erro: Bot player não encontrado');
          return;
        }

        console.log(`🤖 Bot ID: ${botPlayer.id}`);
        console.log(`👥 Time: ${['Espectador', 'Vermelho', 'Azul'][botPlayer.team.id]}\n`);

        // Create bot controller
        const botController = new BotController(r, config);
        botController.setBotPlayerId(botPlayer.id);

        // Setup event handlers
        r.onPlayerJoin = (player) => {
          console.log(`👋 ${player.name} entrou`);
        };

        r.onPlayerLeave = (player) => {
          console.log(`👋 ${player.name} saiu`);
        };

        r.onGameStart = () => {
          console.log('🎮 Jogo iniciado');
          botController.initialize();
          
          // Auto-activate if on a team
          const player = r.state.getPlayer(botPlayer.id);
          if (player && player.team.id !== 0) {
            botController.setActive(true);
            console.log('✅ Bot ativado\n');
          } else {
            console.log('⏸️  Bot aguardando (espectador)\n');
          }
        };

        r.onGameStop = () => {
          console.log('⏸️  Jogo pausado');
        };

        r.onTeamGoal = (teamId) => {
          const scores = r.getScores();
          console.log(`⚽ GOL! Placar: ${scores.red} x ${scores.blue}`);
        };

        r.onTeamVictory = (scores) => {
          console.log(`🏆 Fim de jogo: ${scores.red} x ${scores.blue}\n`);
        };

        r.onPlayerTeamChange = (player) => {
          if (player.id === botPlayer.id) {
            const teamName = ['Espectador', 'Vermelho', 'Azul'][player.team.id];
            console.log(`📍 Movido para: ${teamName}`);
            
            // Activate/deactivate based on team
            if (player.team.id === 0) {
              botController.setActive(false);
              console.log('⏸️  Bot pausado (espectador)');
            } else if (r.gameState) {
              botController.initialize();
              botController.setActive(true);
              console.log('✅ Bot ativado');
            }
          }
        };

        r.onGameTick = () => {
          botController.update();
        };

        console.log('📋 Comandos no chat:');
        console.log('   Digite !help na sala para ver os comandos\n');
        console.log('💡 Pressione Ctrl+C para sair\n');
      },
      onClose: () => {
        console.log('\n❌ Desconectado da sala');
        process.exit(0);
      }
    });

  } catch (error) {
    console.error('\n❌ Erro ao conectar:', error.message);
    
    if (error.message.includes('recaptcha') || error.message.includes('captcha')) {
      console.error('\n⚠️  Esta sala requer CAPTCHA.');
      console.error('Infelizmente, bots não podem resolver CAPTCHAs.');
      console.error('Tente outra sala ou peça ao host para desativar o CAPTCHA.');
    } else if (error.message.includes('password')) {
      console.error('\n⚠️  Senha incorreta. Use: --password "sua_senha"');
    } else if (error.message.includes('full')) {
      console.error('\n⚠️  Sala cheia. Aguarde uma vaga.');
    } else if (error.message.includes('banned')) {
      console.error('\n⚠️  Você está banido desta sala.');
    }
    
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Saindo...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n👋 Saindo...');
  process.exit(0);
});

joinRoom();
