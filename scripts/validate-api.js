// API Validation Script - Tests all node-haxball APIs used in production
import HaxballAPI from 'node-haxball';

const { Room, Utils, EventFactory } = HaxballAPI();

console.log('🔍 Validando APIs do node-haxball...\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ ${name}: ${error.message}`);
    failed++;
  }
}

// Create a simple stadium for tests
const testStadium = {
  name: "Test",
  width: 420,
  height: 200,
  bg: { type: "grass" },
  vertexes: [
    { x: -420, y: -200, trait: "ballArea" },
    { x: -420, y: 200, trait: "ballArea" },
    { x: 420, y: 200, trait: "ballArea" },
    { x: 420, y: -200, trait: "ballArea" }
  ],
  segments: [
    { v0: 0, v1: 1, trait: "ballArea" },
    { v0: 1, v1: 2, trait: "ballArea" },
    { v0: 2, v1: 3, trait: "ballArea" },
    { v0: 3, v1: 0, trait: "ballArea" }
  ],
  goals: [
    { p0: [-420, -60], p1: [-420, 60], team: "red" },
    { p0: [420, -60], p1: [420, 60], team: "blue" }
  ],
  discs: [],
  planes: [],
  traits: {
    ballArea: { vis: true, bCoef: 1, cMask: ["ball"] }
  },
  playerPhysics: {
    radius: 15,
    bCoef: 0.5,
    invMass: 0.5,
    damping: 0.96,
    acceleration: 0.1,
    kickingAcceleration: 0.07,
    kickingDamping: 0.96,
    kickStrength: 5
  },
  ballPhysics: {
    radius: 10,
    bCoef: 0.5,
    invMass: 1,
    damping: 0.99,
    color: "FFFFFF",
    cMask: ["all"],
    cGroup: ["ball"]
  }
};

// Test 1: Room.sandbox exists
test('Room.sandbox() exists', () => {
  if (typeof Room.sandbox !== 'function') {
    throw new Error('Room.sandbox is not a function');
  }
});

// Test 2: Room.join exists (for join mode)
test('Room.join() exists', () => {
  if (typeof Room.join !== 'function') {
    throw new Error('Room.join is not a function');
  }
});

// Test 3: Sandbox creation
test('Can create sandbox', () => {
  const sandbox = Room.sandbox({}, { delayedInit: true });
  if (!sandbox || typeof sandbox !== 'object') {
    throw new Error('Sandbox not created');
  }
});

// Test 4: Sandbox initialization
test('Can initialize sandbox', () => {
  const sandbox = Room.sandbox({}, { delayedInit: true });
  sandbox.initialize();
  if (!sandbox.state) {
    throw new Error('State not created');
  }
});

// Test 5: Stadium setup
test('Can set stadium', () => {
  const sandbox = Room.sandbox({}, { delayedInit: true });
  sandbox.initialize();
  sandbox.setCurrentStadium(testStadium);
  if (!sandbox.state.stadium) {
    throw new Error('Stadium not set');
  }
  if (sandbox.state.stadium.width !== 420) {
    throw new Error('Stadium dimensions incorrect');
  }
});

// Test 6: Player join/leave
test('Can add/remove players', () => {
  const sandbox = Room.sandbox({}, { delayedInit: true });
  sandbox.initialize();
  sandbox.setCurrentStadium(testStadium);
  
  sandbox.playerJoin(1, 'TestBot', 'BR', '🤖', 'c1', 'a1');
  const player = sandbox.state.getPlayer(1);
  if (!player || player.name !== 'TestBot') {
    throw new Error('Player not added');
  }
  
  sandbox.playerLeave(1);
  if (sandbox.state.getPlayer(1) !== null) {
    throw new Error('Player not removed');
  }
});

// Test 7: Team assignment
test('Can assign teams', () => {
  const sandbox = Room.sandbox({}, { delayedInit: true });
  sandbox.initialize();
  sandbox.setCurrentStadium(testStadium);
  sandbox.playerJoin(1, 'P1', 'BR', '🤖', 'c1', 'a1');
  
  sandbox.setPlayerTeam(1, 1); // Red team
  const player = sandbox.state.getPlayer(1);
  if (player.team.id !== 1) {
    throw new Error('Team not set');
  }
});

// Test 8: Game start/stop
test('Can start/stop game', () => {
  const sandbox = Room.sandbox({}, { delayedInit: true });
  sandbox.initialize();
  sandbox.setCurrentStadium(testStadium);
  sandbox.playerJoin(1, 'P1', 'BR', '🤖', 'c1', 'a1');
  sandbox.playerJoin(2, 'P2', 'BR', '🤖', 'c2', 'a2');
  sandbox.setPlayerTeam(1, 1);
  sandbox.setPlayerTeam(2, 2);
  
  sandbox.startGame();
  if (!sandbox.gameState) {
    throw new Error('Game not started');
  }
  
  sandbox.stopGame();
  if (sandbox.gameState) {
    throw new Error('Game not stopped');
  }
});

// Test 9: Simulation control
test('Can control simulation', () => {
  const sandbox = Room.sandbox({}, { delayedInit: true });
  sandbox.initialize();
  sandbox.setCurrentStadium(testStadium);
  
  sandbox.setSimulationSpeed(0);
  sandbox.runSteps(10);
  sandbox.setSimulationSpeed(1);
});

// Test 10: Player input
test('Can send player input', () => {
  const sandbox = Room.sandbox({}, { delayedInit: true });
  sandbox.initialize();
  sandbox.setCurrentStadium(testStadium);
  sandbox.playerJoin(1, 'P1', 'BR', '🤖', 'c1', 'a1');
  sandbox.setPlayerTeam(1, 1);
  sandbox.startGame();
  
  sandbox.playerInput(17, 1); // Right + kick
});

// Test 11: State access
test('Can access state', () => {
  const sandbox = Room.sandbox({}, { delayedInit: true });
  sandbox.initialize();
  sandbox.setCurrentStadium(testStadium);
  sandbox.playerJoin(1, 'P1', 'BR', '🤖', 'c1', 'a1');
  sandbox.setPlayerTeam(1, 1);
  sandbox.startGame();
  
  const player = sandbox.state.getPlayer(1);
  if (!player || !player.disc) {
    throw new Error('Cannot access player disc');
  }
  
  const ball = sandbox.gameState.physicsState.discs[0];
  if (!ball || typeof ball.pos.x !== 'number') {
    throw new Error('Cannot access ball');
  }
});

// Test 12: Disc properties
test('Can access disc properties', () => {
  const sandbox = Room.sandbox({}, { delayedInit: true });
  sandbox.initialize();
  sandbox.setCurrentStadium(testStadium);
  sandbox.playerJoin(1, 'P1', 'BR', '🤖', 'c1', 'a1');
  sandbox.setPlayerTeam(1, 1);
  sandbox.startGame();
  
  const discProps = sandbox.state.getDiscProperties(0);
  if (!discProps || typeof discProps.x !== 'number') {
    throw new Error('Cannot get disc properties');
  }
});

// Test 13: Extrapolation
test('Can extrapolate state', () => {
  const sandbox = Room.sandbox({}, { delayedInit: true });
  sandbox.initialize();
  sandbox.setCurrentStadium(testStadium);
  sandbox.playerJoin(1, 'P1', 'BR', '🤖', 'c1', 'a1');
  sandbox.setPlayerTeam(1, 1);
  sandbox.startGame();
  
  const extState = sandbox.extrapolate(0);
  if (!extState) {
    throw new Error('Extrapolation failed');
  }
});

// Test 14: Snapshot/restore
test('Can snapshot/restore', () => {
  const sandbox = Room.sandbox({}, { delayedInit: true });
  sandbox.initialize();
  sandbox.setCurrentStadium(testStadium);
  sandbox.playerJoin(1, 'P1', 'BR', '🤖', 'c1', 'a1');
  
  const snapshot = sandbox.takeSnapshot();
  if (!snapshot) {
    throw new Error('Snapshot failed');
  }
  
  sandbox.playerJoin(2, 'P2', 'BR', '🤖', 'c2', 'a2');
  sandbox.useSnapshot(snapshot);
  
  if (sandbox.state.getPlayer(2) !== null) {
    throw new Error('Restore failed');
  }
});

// Test 15: Utils.keyState
test('Utils.keyState() works', () => {
  if (typeof Utils.keyState !== 'function') {
    throw new Error('Utils.keyState missing');
  }
  
  const state = Utils.keyState(1, 0, false);
  if (typeof state !== 'number') {
    throw new Error('keyState did not return number');
  }
});

// Test 16: Utils.generateAuth
test('Utils.generateAuth() exists', () => {
  if (typeof Utils.generateAuth !== 'function') {
    throw new Error('Utils.generateAuth missing');
  }
});

// Test 17: EventFactory
test('EventFactory.sendInput() exists', () => {
  if (typeof EventFactory.sendInput !== 'function') {
    throw new Error('EventFactory.sendInput missing');
  }
});

console.log(`\n📊 Resultado: ${passed} ✅ | ${failed} ❌`);

if (failed > 0) {
  console.log('\n⚠️  Algumas APIs falharam na validação');
  process.exit(1);
}

console.log('\n✅ Todas as APIs do node-haxball validadas com sucesso!');
console.log('   - Room.sandbox() com controle completo de simulação');
console.log('   - Room.join() disponível para modo cliente');
console.log('   - Player input, state access, e extrapolation funcionando');
console.log('   - Utils e EventFactory operacionais');
