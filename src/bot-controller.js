import { PhysicsPredictor } from './physics.js';
import { BotAI } from './ai.js';

export class BotController {
  constructor(room, config) {
    this.room = room;
    this.config = config;
    this.botPlayerId = null;
    this.isActive = false;
    this.physics = null;
    this.ai = null;
    this.lastKeyState = 0;
  }

  /**
   * Initializes the bot when game starts
   */
  initialize() {
    if (!this.room.state?.stadium) {
      console.log('⏳ Aguardando carregamento do estádio...');
      return;
    }

    this.physics = new PhysicsPredictor(this.room.state.stadium);
    this.ai = new BotAI(this.config, this.physics);
    this.isActive = true;
    
    console.log('✅ Bot inicializado e pronto para jogar');
  }

  /**
   * Updates bot player ID
   */
  setBotPlayerId(playerId) {
    this.botPlayerId = playerId;
  }

  /**
   * Main update loop - called on every game tick
   */
  update() {
    if (!this.isActive || !this.botPlayerId) return;

    try {
      // Ensure state is extrapolated
      this.room.extrapolate();

      const { state, gameState, gameStateExt } = this.room;
      const currentGameState = gameStateExt || gameState;

      if (!currentGameState || !state) return;

      const botPlayer = state.getPlayer(this.botPlayerId);
      if (!botPlayer || !botPlayer.disc) return;

      // Get AI decision
      const decision = this.ai.decide(currentGameState, botPlayer);

      // Convert to key state and send input
      this.executeDecision(decision, botPlayer);
    } catch (error) {
      console.error('❌ Erro no update do bot:', error.message);
    }
  }

  /**
   * Executes the AI decision by sending input
   */
  executeDecision(decision, botPlayer) {
    const { dirX, dirY, kick } = decision;
    
    // Convert direction to key state
    // KeyState encoding: bits 0-3 for direction, bit 4 for kick
    const keyState = this.encodeKeyState(dirX, dirY, kick);

    // Only send input if it changed or we need to kick
    if (keyState !== this.lastKeyState || (kick && !botPlayer.isKicking)) {
      // If trying to kick but not kicking, release and press again
      if (keyState === this.lastKeyState && kick && !botPlayer.isKicking) {
        this.room.setKeyState(keyState & ~16); // Release kick (clear bit 4)
      }
      
      this.room.setKeyState(keyState);
      this.lastKeyState = keyState;
    }
  }

  /**
   * Encodes direction and kick into key state
   * @param {number} dirX - -1, 0, or 1
   * @param {number} dirY - -1, 0, or 1
   * @param {boolean} kick - whether to kick
   * @returns {number} encoded key state (0-31)
   */
  encodeKeyState(dirX, dirY, kick) {
    let state = 0;

    // Direction bits (0-3)
    if (dirX === 1) state |= 1;  // Right
    if (dirX === -1) state |= 2; // Left
    if (dirY === 1) state |= 4;  // Down
    if (dirY === -1) state |= 8; // Up

    // Kick bit (4)
    if (kick) state |= 16;

    return state;
  }

  /**
   * Resets bot state
   */
  reset() {
    this.lastKeyState = 0;
    this.isActive = false;
  }

  /**
   * Activates/deactivates the bot
   */
  setActive(active) {
    this.isActive = active;
    if (!active) {
      this.lastKeyState = 0;
    }
  }

  /**
   * Gets current bot state for debugging
   */
  getState() {
    return {
      playerId: this.botPlayerId,
      isActive: this.isActive,
      currentState: this.ai?.currentState || 'unknown',
      lastKeyState: this.lastKeyState
    };
  }
}
