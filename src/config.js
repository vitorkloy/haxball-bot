export const DIFFICULTY_PRESETS = {
  easy: {
    reactionTime: 150,
    predictionTicks: 15,
    kickPower: 0.7,
    positioningWeight: 0.5,
    aggression: 0.3,
    maxSpeed: 0.7
  },
  medium: {
    reactionTime: 50,
    predictionTicks: 30,
    kickPower: 1.0,
    positioningWeight: 0.7,
    aggression: 0.5,
    maxSpeed: 1.0
  },
  hard: {
    reactionTime: 20,
    predictionTicks: 45,
    kickPower: 1.0,
    positioningWeight: 0.85,
    aggression: 0.7,
    maxSpeed: 1.0
  },
  insane: {
    reactionTime: 10,
    predictionTicks: 60,
    kickPower: 1.0,
    positioningWeight: 0.95,
    aggression: 0.9,
    maxSpeed: 1.0
  }
};

export const PHYSICS_CONSTANTS = {
  DEFAULT_PLAYER_RADIUS: 15,
  DEFAULT_BALL_RADIUS: 10,
  DEFAULT_KICK_STRENGTH: 5,
  DEFAULT_DAMPING: 0.99,
  DEFAULT_INV_MASS: 0.5,
  TICKS_PER_SECOND: 60,
  GOAL_WIDTH: 120
};

export const GAME_STATES = {
  IDLE: 'idle',
  KICKOFF: 'kickoff',
  ATTACK: 'attack',
  DEFEND: 'defend',
  INTERCEPT: 'intercept',
  POSITION: 'position',
  PASS: 'pass',
  SHOOT: 'shoot'
};

export default class Config {
  constructor(envVars = {}) {
    this.bot = {
      name: envVars.BOT_NAME || 'HaxBot',
      avatar: envVars.BOT_AVATAR || '🤖'
    };

    this.room = {
      name: envVars.ROOM_NAME || 'Sala de Treino do Bot',
      password: envVars.ROOM_PASSWORD || '',
      maxPlayers: parseInt(envVars.ROOM_MAX_PLAYERS) || 4,
      public: envVars.ROOM_PUBLIC === 'true',
      geo: {
        code: envVars.ROOM_GEO_CODE || 'BR',
        lat: parseFloat(envVars.ROOM_GEO_LAT) || -23.55,
        lon: parseFloat(envVars.ROOM_GEO_LON) || -46.63
      },
      token: envVars.HEADLESS_TOKEN || ''
    };

    const difficulty = envVars.BOT_DIFFICULTY || 'medium';
    const preset = DIFFICULTY_PRESETS[difficulty] || DIFFICULTY_PRESETS.medium;

    this.ai = {
      difficulty,
      reactionTime: parseInt(envVars.BOT_REACTION_TIME) || preset.reactionTime,
      predictionTicks: parseInt(envVars.BOT_PREDICTION_TICKS) || preset.predictionTicks,
      kickPower: parseFloat(envVars.BOT_KICK_POWER) || preset.kickPower,
      positioningWeight: parseFloat(envVars.BOT_POSITIONING_WEIGHT) || preset.positioningWeight,
      aggression: parseFloat(envVars.BOT_AGGRESSION) || preset.aggression,
      maxSpeed: preset.maxSpeed
    };
  }

  validate() {
    if (!this.room.token && process.env.NODE_ENV !== 'test') {
      throw new Error(
        'HEADLESS_TOKEN não configurado. Obtenha um token em https://www.haxball.com/headlesstoken'
      );
    }
    return true;
  }
}
