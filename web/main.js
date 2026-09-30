import { PhysicsPredictor } from './physics.js';
import { BotAI } from './ai.js';
import { BotController } from './bot-controller.js';
import { getConfig, GAME_STATES } from './config.js';

// Global state
let room = null;
let botController = null;
let updateInterval = null;

// UI Elements
const joinCard = document.getElementById('join-card');
const statusCard = document.getElementById('status-card');
const joinBtn = document.getElementById('join-btn');
const toggleBtn = document.getElementById('toggle-btn');
const disconnectBtn = document.getElementById('disconnect-btn');
const errorMsg = document.getElementById('error-message');

// Status elements
const connectionStatus = document.getElementById('connection-status');
const roomName = document.getElementById('room-name');
const teamStatus = document.getElementById('team-status');
const scoreDisplay = document.getElementById('score');
const aiState = document.getElementById('ai-state');
const botActive = document.getElementById('bot-active');

// Utility functions
function showError(message) {
  errorMsg.textContent = message;
  errorMsg.style.display = 'block';
  setTimeout(() => {
    errorMsg.style.display = 'none';
  }, 5000);
}

function logEvent(message) {
  const log = document.getElementById('event-log');
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  
  const time = new Date().toLocaleTimeString('pt-BR');
  entry.innerHTML = `<span class="log-time">[${time}]</span> ${message}`;
  
  log.insertBefore(entry, log.firstChild);
  
  // Keep only last 50 entries
  while (log.children.length > 50) {
    log.removeChild(log.lastChild);
  }
}

function parseRoomLink(link) {
  try {
    const url = new URL(link);
    if (!url.hostname.includes('haxball.com')) {
      throw new Error('Link inválido');
    }
    
    const roomId = url.searchParams.get('c');
    if (!roomId) {
      throw new Error('ID da sala não encontrado no link');
    }
    
    return roomId;
  } catch (error) {
    throw new Error('Link inválido. Use o formato: https://www.haxball.com/play?c=XXXXX');
  }
}

function updateStatus() {
  if (!room) return;

  try {
    // Connection
    connectionStatus.textContent = '✅ Conectado';
    connectionStatus.style.color = '#28a745';

    // Room name
    roomName.textContent = room.name || '-';

    // Team - use currentPlayer
    if (room.currentPlayer) {
      const player = room.currentPlayer;
      const teamNames = ['⚪ Espectador', '🔴 Vermelho', '🔵 Azul'];
      teamStatus.textContent = teamNames[player.team.id] || 'Espectador';
      
      // If spectator, bot should be idle
      if (player.team.id === 0 && botController && botController.isActive) {
        botController.setActive(false);
        updateToggleButton();
      }
    }

    // Score
    const scores = room.getScores && room.getScores();
    if (scores) {
      scoreDisplay.textContent = `${scores.red || 0} x ${scores.blue || 0}`;
    }

    // AI State
    if (botController) {
      const state = botController.getState();
      aiState.textContent = state.currentState.toUpperCase();
      
      botActive.textContent = state.isActive ? '✅ Sim' : '❌ Não';
      botActive.style.color = state.isActive ? '#28a745' : '#dc3545';
    }
  } catch (error) {
    console.error('Erro ao atualizar status:', error);
  }
}

function updateToggleButton() {
  if (botController && botController.isActive) {
    toggleBtn.textContent = '⏸️ Pausar Bot';
    toggleBtn.classList.add('active');
  } else {
    toggleBtn.textContent = '▶️ Ativar Bot';
    toggleBtn.classList.remove('active');
  }
}

// Join room function
async function joinRoom() {
  const linkInput = document.getElementById('room-link').value.trim();
  const password = document.getElementById('password').value;
  const botName = document.getElementById('bot-name').value.trim() || 'HaxBot';
  const difficulty = document.getElementById('difficulty').value;
  const avatar = document.getElementById('avatar').value || '🤖';

  if (!linkInput) {
    showError('Por favor, cole o link da sala');
    return;
  }

  try {
    joinBtn.disabled = true;
    joinBtn.innerHTML = '<span class="spinner"></span> Conectando...';

    const roomId = parseRoomLink(linkInput);
    logEvent(`Tentando entrar na sala: ${roomId}`);

    // Get node-haxball API from global scope (loaded via CDN)
    if (typeof abcHaxballAPI === 'undefined') {
      throw new Error('Biblioteca node-haxball não carregada. Recarregue a página.');
    }

    const API = abcHaxballAPI(window, {
      proxy: {
        WebSocketUrl: "wss://node-haxball.onrender.com/",
        HttpUrl: "https://node-haxball.onrender.com/rs/"
      }
    });
    const { Room, Utils } = API;

    logEvent('Usando proxy: node-haxball.onrender.com');

    // Generate auth
    logEvent('Gerando autenticação...');
    const [authKey, authObj] = await Utils.generateAuth();

    // Join room
    logEvent('Conectando à sala...');
    
    room = await Room.join({
      id: roomId,
      password: password || undefined,
      authObj: authObj
    }, {
      storage: {
        player_name: botName,
        avatar: avatar
      },
      onOpen: (r) => {
        room = r;
        logEvent(`✅ Conectado à sala: ${room.name}`);
        
        // Create bot controller
        const config = getConfig(difficulty, botName, avatar);
        botController = new BotController(room, config);
        botController.initialize();
        
        logEvent(`Bot inicializado`);

        // Setup event handlers
        setupRoomEvents();

        // Start update loop
        updateInterval = setInterval(() => {
          if (botController) {
            botController.update();
          }
          updateStatus();
        }, 1000 / 60); // 60 FPS

        // Show status card
        joinCard.style.display = 'none';
        statusCard.style.display = 'block';
        
        updateStatus();
      },
      onClose: () => {
        logEvent('❌ Desconectado da sala');
        disconnect();
      }
    });

  } catch (error) {
    console.error('Erro ao entrar:', error);
    
    let errorMessage = 'Erro ao conectar: ' + error.message;
    
    if (error.message.includes('recaptcha') || error.message.includes('captcha')) {
      errorMessage = '⚠️ Esta sala requer CAPTCHA. Infelizmente, bots não podem entrar em salas com CAPTCHA ativado.';
    } else if (error.message.includes('password')) {
      errorMessage = '❌ Senha incorreta';
    } else if (error.message.includes('full')) {
      errorMessage = '❌ Sala cheia';
    } else if (error.message.includes('banned')) {
      errorMessage = '❌ Você está banido desta sala';
    }
    
    showError(errorMessage);
    logEvent(errorMessage);
    
    joinBtn.disabled = false;
    joinBtn.textContent = '🎮 Entrar e Jogar';
  }
}

function setupRoomEvents() {
  if (!room) return;

  room.onPlayerJoin = (player) => {
    logEvent(`👋 ${player.name} entrou na sala`);
  };

  room.onPlayerLeave = (player) => {
    logEvent(`👋 ${player.name} saiu da sala`);
  };

  room.onGameStart = () => {
    logEvent('🎮 Jogo iniciado');
    if (botController && !botController.isActive) {
      // Auto-activate if on a team
      const player = room.currentPlayer;
      if (player && player.team.id !== 0) {
        botController.setActive(true);
        updateToggleButton();
        logEvent('Bot ativado automaticamente');
      }
    }
  };

  room.onGameStop = () => {
    logEvent('⏸️ Jogo pausado');
  };

  room.onTeamGoal = (teamId) => {
    const teamNames = { 1: 'Vermelho', 2: 'Azul' };
    logEvent(`⚽ GOL do time ${teamNames[teamId]}!`);
  };

  room.onTeamVictory = (scores) => {
    const winner = scores.red > scores.blue ? 'Vermelho' : 'Azul';
    logEvent(`🏆 Time ${winner} venceu! (${scores.red} x ${scores.blue})`);
  };

  room.onPlayerTeamChange = (player) => {
    if (botController && player.id === botController.botPlayerId) {
      const teamNames = ['Espectador', 'Vermelho', 'Azul'];
      logEvent(`Movido para: ${teamNames[player.team.id]}`);
      updateStatus();
    }
  };
}

function disconnect() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }

  if (room) {
    try {
      room.leave && room.leave();
    } catch (e) {}
    room = null;
  }

  botController = null;

  connectionStatus.textContent = '❌ Desconectado';
  connectionStatus.style.color = '#dc3545';

  joinCard.style.display = 'block';
  statusCard.style.display = 'none';
  
  joinBtn.disabled = false;
  joinBtn.textContent = '🎮 Entrar e Jogar';
  
  logEvent('Desconectado');
}

function toggleBot() {
  if (!botController) return;

  // Check if on a team
  const player = room.currentPlayer;
  if (player && player.team.id === 0) {
    showError('Bot precisa estar em um time para jogar');
    return;
  }

  botController.setActive(!botController.isActive);
  updateToggleButton();
  
  logEvent(botController.isActive ? 'Bot ativado' : 'Bot pausado');
}

// Event listeners
joinBtn.addEventListener('click', joinRoom);
toggleBtn.addEventListener('click', toggleBot);
disconnectBtn.addEventListener('click', disconnect);

// Allow Enter key to join
document.getElementById('room-link').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') joinRoom();
});

// Initial log
logEvent('Pronto para conectar');
console.log('Haxball Bot UI carregada');
