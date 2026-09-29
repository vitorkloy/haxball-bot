// Browser-compatible version of config
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

export function getConfig(difficulty = 'medium', botName = 'HaxBot', avatar = '🤖') {
  const preset = DIFFICULTY_PRESETS[difficulty] || DIFFICULTY_PRESETS.medium;
  
  return {
    bot: {
      name: botName,
      avatar: avatar
    },
    ai: {
      difficulty,
      ...preset
    }
  };
}
