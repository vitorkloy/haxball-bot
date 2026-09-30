import { PhysicsPredictor } from './physics.js';
import { BotAI } from './ai.js';

export class BotController {
  constructor(room, config) {
    this.room = room;
    this.config = config;
    this.isActive = false;
    this.physics = null;
    this.ai = null;
    this.lastKeyState = 0;
    this.useCurrentPlayer = true; // For client join mode
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
   * Main update loop - called on every game tick
   */
  update() {
    if (!this.isActive) return;

    try {
      // Ensure state is extrapolated
      this.room.extrapolate();

      const { state, gameState, gameStateExt } = this.room;
      const currentGameState = gameStateExt || gameState;

      if (!currentGameState || !state) return;

      // Get current player (for joined room) or bot player (for hosted room)
      const botPlayer = this.room.currentPlayer;
      
      if (!botPlayer || !botPlayer.disc) return;
      
      const playerDisc = botPlayer.disc.ext;
      if (!playerDisc) return;

      // Get AI decision
      const decision = this.ai.decide(currentGameState, botPlayer);

      // Execute decision
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
    
    // Use Utils.keyState to encode direction + kick
    // Import Utils from wherever it's available globally or via require
    const keyState = this.encodeKeyState(dirX, dirY, kick);

    // Only send input if it changed
    if (keyState !== this.lastKeyState) {
      this.room.setKeyState(keyState);
      this.lastKeyState = keyState;
    }
  }

  /**
   * Encodes direction and kick into key state
   * Same as Utils.keyState but inline for clarity
   */
  encodeKeyState(dirX, dirY, kick) {
    let state = 0;
    if (dirX === 1) state |= 1;  // Right
    if (dirX === -1) state |= 2; // Left
    if (dirY === 1) state |= 4;  // Down
    if (dirY === -1) state |= 8; // Up
    if (kick) state |= 16;       // Kick
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
      isActive: this.isActive,
      currentState: this.ai?.currentState || 'unknown',
      lastKeyState: this.lastKeyState
    };
  }
}
