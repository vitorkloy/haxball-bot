import HaxballAPI from 'node-haxball';
import Config from '../../config.js';
import { BotController } from '../../bot-controller.js';

const { Room, Utils } = HaxballAPI();

describe('E2E Bot Integration', () => {
  let room;
  let config;
  let botController;

  beforeAll(() => {
    config = new Config({
      BOT_NAME: 'TestBot',
      BOT_DIFFICULTY: 'medium',
      BOT_REACTION_TIME: '0'
    });
  });

  afterEach(() => {
    if (room) {
      try {
        room.state?.close?.();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  });

  test('bot should initialize with valid room', async () => {
    // Create mock room
    room = await createMockRoom();
    botController = new BotController(room, config);

    // Set bot player ID
    botController.setBotPlayerId(1);

    // Initialize bot
    botController.initialize();

    expect(botController.isActive).toBe(true);
    expect(botController.physics).toBeDefined();
    expect(botController.ai).toBeDefined();
  }, 10000);

  test('bot should make decisions based on game state', async () => {
    room = await createMockRoom();
    botController = new BotController(room, config);
    botController.setBotPlayerId(1);
    botController.initialize();

    // Create mock game state
    setupMockGameState(room);

    // Update should not throw
    expect(() => botController.update()).not.toThrow();

    const state = botController.getState();
    expect(state.isActive).toBe(true);
  }, 10000);

  test('bot should encode key states correctly', () => {
    const testCases = [
      { dirX: 0, dirY: 0, kick: false, expected: 0 },
      { dirX: 1, dirY: 0, kick: false, expected: 1 },
      { dirX: -1, dirY: 0, kick: false, expected: 2 },
      { dirX: 0, dirY: 1, kick: false, expected: 4 },
      { dirX: 0, dirY: -1, kick: false, expected: 8 },
      { dirX: 1, dirY: 1, kick: false, expected: 5 },
      { dirX: 0, dirY: 0, kick: true, expected: 16 },
      { dirX: 1, dirY: 0, kick: true, expected: 17 }
    ];

    room = createSimpleMockRoom();
    botController = new BotController(room, config);

    for (const testCase of testCases) {
      const result = botController.encodeKeyState(
        testCase.dirX,
        testCase.dirY,
        testCase.kick
      );
      expect(result).toBe(testCase.expected);
    }
  });

  // Helper functions
  async function createMockRoom() {
    return {
      state: {
        stadium: {
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
        },
        getPlayer: (id) => ({
          id,
          team: { id: 1 },
          disc: {
            ext: {
              pos: { x: 0, y: 0 },
              radius: 15
            }
          },
          isKicking: false
        }),
        players: []
      },
      gameState: {
        physicsState: {
          discs: [
            {
              pos: { x: 100, y: 0 },
              xspeed: 0,
              yspeed: 0,
              radius: 10,
              damping: 0.99,
              invMass: 0.5
            }
          ]
        },
        scores: { red: 0, blue: 0, time: 0 },
        stadium: {
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
        }
      },
      extrapolate: () => {},
      setKeyState: (state) => {}
    };
  }

  function createSimpleMockRoom() {
    return {
      setKeyState: () => {}
    };
  }

  function setupMockGameState(room) {
    room.extrapolate = () => {};
    room.state.players = [
      {
        id: 1,
        team: { id: 1 },
        disc: {
          ext: {
            pos: { x: 0, y: 0 },
            radius: 15
          }
        }
      }
    ];
  }
});
