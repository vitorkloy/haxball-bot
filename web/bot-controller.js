import { PhysicsPredictor } from './physics.js';
import { BotAI } from './ai.js';

export class BotController {
  constructor(room, config) {
    this.room = room;
    this.config = config;
    // Optional explicit player id (host mode). When null, the controller
    // drives `room.currentPlayer` (client mode via Room.join).
    this.botPlayerId = null;
    this.isActive = false;
    this.physics = null;
    this.ai = null;
    this.lastKeyState = 0;
  }

  /**
   * Initializes the bot when the stadium is available
   */
  initialize() {
    const stadium = this.room.state?.stadium || this.room.stadium;
    if (!stadium) {
      console.log('⏳ Aguardando carregamento do estádio...');
      return false;
    }

    this.physics = new PhysicsPredictor(stadium);
    this.ai = new BotAI(this.config, this.physics);
    this.isActive = true;

    console.log('✅ Bot inicializado e pronto para jogar');
    return true;
  }

  /**
   * Sets an explicit player id to control (optional, host mode).
   */
  setBotPlayerId(playerId) {
    this.botPlayerId = playerId;
  }

  /**
   * Returns the player object controlled by the bot.
   */
  getBotPlayer() {
    const room = this.room;
    if (this.botPlayerId == null) {
      return room.currentPlayer || null;
    }
    return (
      room.getPlayer?.(this.botPlayerId) ||
      room.state?.getPlayer?.(this.botPlayerId) ||
      room.state?.players?.find?.((p) => p.id === this.botPlayerId) ||
      null
    );
  }

  /**
   * Main update loop - called on every game tick
   */
  update() {
    if (!this.isActive) return;

    try {
      if (!this.ai && !this.initialize()) return;

      // Ensure extrapolated (`ext`) values are up to date
      this.room.extrapolate?.();

      const { state, gameState, gameStateExt } = this.room;
      const currentGameState = gameStateExt || gameState;

      if (!currentGameState || !state) return;

      const botPlayer = this.getBotPlayer();
      if (!botPlayer || !botPlayer.disc) return;

      const decision = this.ai.decide(currentGameState, botPlayer, state, Date.now());
      this.executeDecision(decision, botPlayer);

      // Debug snapshot (~1s) for the UI event log
      const now = Date.now();
      if (this.onDebug && now - (this.lastDebugAt || 0) > 1000) {
        this.lastDebugAt = now;
        const me = botPlayer.disc.ext || botPlayer.disc;
        const ball = currentGameState.physicsState?.discs?.[0];
        const f = (v) => (v == null ? '?' : Math.round(v));
        this.onDebug(
          `bot(${f(me?.pos?.x)},${f(me?.pos?.y)}) bola(${f(ball?.pos?.x)},${f(ball?.pos?.y)}) ` +
          `dir(${decision.dirX},${decision.dirY}) chute=${decision.kick ? 1 : 0} teclas=${this.lastKeyState} estado=${this.ai.currentState}`
        );
      }
    } catch (error) {
      console.error('❌ Erro no update do bot:', error.message);
    }
  }

  /**
   * Executes the AI decision by sending input
   */
  executeDecision(decision, botPlayer) {
    const { dirX, dirY, kick } = decision;
    const keyState = this.encodeKeyState(dirX, dirY, kick);

    // Holding kick only kicks once; release and press again to kick repeatedly.
    const needsRekick = kick && keyState === this.lastKeyState && !botPlayer.isKicking;

    if (keyState !== this.lastKeyState || needsRekick) {
      if (needsRekick) {
        this.room.setKeyState(keyState & ~16);
      }
      this.room.setKeyState(keyState);
      this.lastKeyState = keyState;
    }
  }

  /**
   * Encodes direction and kick into key state (same as Utils.keyState)
   * @returns {number} encoded key state (0-31)
   */
  encodeKeyState(dirX, dirY, kick) {
    let state = 0;
    // Real Haxball bits (same as node-haxball Utils.keyState):
    // up = 1, down = 2, left = 4, right = 8, kick = 16
    if (dirY === -1) state |= 1; // Up
    if (dirY === 1) state |= 2;  // Down
    if (dirX === -1) state |= 4; // Left
    if (dirX === 1) state |= 8;  // Right
    if (kick) state |= 16;       // Kick
    return state;
  }

  /**
   * Releases all keys so the player stops moving
   */
  releaseKeys() {
    if (this.lastKeyState !== 0) {
      try {
        this.room.setKeyState?.(0);
      } catch (e) {
        // ignore
      }
    }
    this.lastKeyState = 0;
  }

  /**
   * Resets bot state
   */
  reset() {
    this.releaseKeys();
    this.isActive = false;
  }

  /**
   * Activates/deactivates the bot
   */
  setActive(active) {
    this.isActive = active;
    if (!active) {
      this.releaseKeys();
    }
  }

  /**
   * Gets current bot state for debugging
   */
  getState() {
    return {
      playerId: this.botPlayerId ?? this.room.currentPlayerId ?? null,
      isActive: this.isActive,
      currentState: this.ai?.currentState || 'unknown',
      lastKeyState: this.lastKeyState
    };
  }
}
