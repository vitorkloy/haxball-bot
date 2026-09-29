import { BotAI } from '../../ai.js';
import { PhysicsPredictor } from '../../physics.js';
import { GAME_STATES } from '../../config.js';

describe('BotAI', () => {
  let ai;
  let physics;
  let mockConfig;
  let mockStadium;

  beforeEach(() => {
    mockStadium = {
      width: 800,
      height: 350,
      goals: [
        {
          team: { id: 1 },
          p0: { x: -400, y: -60 },
          p1: { x: -400, y: 60 }
        },
        {
          team: { id: 2 },
          p0: { x: 400, y: -60 },
          p1: { x: 400, y: 60 }
        }
      ]
    };

    mockConfig = {
      ai: {
        reactionTime: 0,
        predictionTicks: 30,
        kickPower: 1.0,
        positioningWeight: 0.7,
        aggression: 0.5,
        maxSpeed: 1.0
      }
    };

    physics = new PhysicsPredictor(mockStadium);
    ai = new BotAI(mockConfig, physics);
  });

  describe('decide', () => {
    test('should return zero movement for invalid state', () => {
      const decision = ai.decide(null, null);

      expect(decision).toEqual({ dirX: 0, dirY: 0, kick: false });
    });

    test('should move toward ball', () => {
      const gameState = createMockGameState(0, 0, 100, 0);
      const botPlayer = createMockPlayer(1, 0, 0);

      const decision = ai.decide(gameState, botPlayer);

      expect(decision.dirX).toBe(1); // Should move right toward ball
      expect(decision.dirY).toBe(0);
    });

    test('should kick when close to ball', () => {
      const gameState = createMockGameState(0, 0, 10, 0);
      const botPlayer = createMockPlayer(1, 0, 0);

      const decision = ai.decide(gameState, botPlayer);

      expect(decision.kick).toBe(true);
    });
  });

  describe('determineGameState', () => {
    test('should enter SHOOT state near opponent goal', () => {
      const context = {
        ball: { x: 350, y: 0 },
        player: { x: 330, y: 0, maxSpeed: 1.0 },
        distanceToBall: 20,
        ownGoal: mockStadium.goals[0],
        targetGoal: mockStadium.goals[1],
        teammates: [],
        opponents: []
      };

      const state = ai.determineGameState(context);

      expect(state).toBe(GAME_STATES.SHOOT);
    });

    test('should enter DEFEND state when ball near own goal', () => {
      const context = {
        ball: { x: -350, y: 0 },
        player: { x: -300, y: 0, maxSpeed: 1.0 },
        distanceToBall: 50,
        ownGoal: mockStadium.goals[0],
        targetGoal: mockStadium.goals[1],
        teammates: [],
        opponents: []
      };

      const state = ai.determineGameState(context);

      expect(state).toBe(GAME_STATES.DEFEND);
    });

    test('should enter ATTACK state when close to ball', () => {
      const context = {
        ball: { x: 100, y: 0 },
        player: { x: 80, y: 0, maxSpeed: 1.0 },
        distanceToBall: 20,
        ownGoal: mockStadium.goals[0],
        targetGoal: mockStadium.goals[1],
        teammates: [],
        opponents: []
      };

      const state = ai.determineGameState(context);

      expect(state).toBe(GAME_STATES.ATTACK);
    });
  });

  describe('moveToward', () => {
    test('should calculate correct direction to target', () => {
      const player = { x: 0, y: 0 };
      const target = { x: 100, y: 50 };

      const result = ai.moveToward(player, target, false);

      expect(result.dirX).toBe(1);
      expect(result.dirY).toBe(1);
      expect(result.kick).toBe(false);
    });

    test('should stop when close to target', () => {
      const player = { x: 100, y: 100 };
      const target = { x: 101, y: 101 };

      const result = ai.moveToward(player, target, false);

      expect(result.dirX).toBe(0);
      expect(result.dirY).toBe(0);
    });

    test('should handle negative directions', () => {
      const player = { x: 100, y: 100 };
      const target = { x: -50, y: -50 };

      const result = ai.moveToward(player, target, false);

      expect(result.dirX).toBe(-1);
      expect(result.dirY).toBe(-1);
    });
  });

  describe('getDistance', () => {
    test('should calculate distance correctly', () => {
      const pos1 = { x: 0, y: 0 };
      const pos2 = { x: 3, y: 4 };

      const distance = ai.getDistance(pos1, pos2);

      expect(distance).toBe(5);
    });

    test('should return zero for same position', () => {
      const pos = { x: 100, y: 100 };

      const distance = ai.getDistance(pos, pos);

      expect(distance).toBe(0);
    });
  });

  // Helper functions
  function createMockGameState(playerX, playerY, ballX, ballY) {
    return {
      physicsState: {
        discs: [
          {
            pos: { x: ballX, y: ballY },
            xspeed: 0,
            yspeed: 0,
            radius: 10,
            damping: 0.99,
            invMass: 0.5
          }
        ]
      },
      stadium: mockStadium,
      players: [],
      scores: { red: 0, blue: 0, time: 0 }
    };
  }

  function createMockPlayer(teamId, x, y) {
    return {
      id: 1,
      team: { id: teamId },
      disc: {
        ext: {
          pos: { x, y },
          radius: 15
        }
      },
      isKicking: false
    };
  }
});
