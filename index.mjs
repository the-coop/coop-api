import { WebSocketServer } from 'ws';

// Dynamic import for Rapier3D
import RAPIER from '@dimforge/rapier3d';
console.log('Rapier3D loaded successfully');

// Game state
const gameState = {
  players: new Map(),
  dynamicObjects: new Map(),
  staticObjects: new Map()
};

// Physics world
let physicsWorld;
const PHYSICS_TIMESTEP = 1000 / 60; // 60 Hz physics
const BROADCAST_RATE = 1000 / 20; // 20 Hz network updates

// Initialize physics world
function initPhysics() {
  // Create physics world with no gravity (we'll apply custom planet gravity)
  physicsWorld = new RAPIER.World({ x: 0, y: 0, z: 0 });
  
  // Create planet at center
  const planetRadius = 200;
  const planetY = -250;
  
  const planetBodyDesc = RAPIER.RigidBodyDesc.fixed()
    .setTranslation(0, planetY, 0);
  const planetBody = physicsWorld.createRigidBody(planetBodyDesc);
  
  // Simple sphere collider for planet (you can replace with trimesh later)
  const planetColliderDesc = RAPIER.ColliderDesc.ball(planetRadius)
    .setFriction(0.8)
    .setRestitution(0.1);
  physicsWorld.createCollider(planetColliderDesc, planetBody);
  
  // Create platform
  const platformBodyDesc = RAPIER.RigidBodyDesc.fixed()
    .setTranslation(0, 30, 0);
  const platformBody = physicsWorld.createRigidBody(platformBodyDesc);
  
  const platformColliderDesc = RAPIER.ColliderDesc.cuboid(25, 1.5, 25)
    .setFriction(0.8)
    .setRestitution(0.2);
  physicsWorld.createCollider(platformColliderDesc, platformBody);
  
  console.log('Physics world initialized');
}

// Create WebSocket server
const wss = new WebSocketServer({ 
  port: process.env.PORT || 3000,
  perMessageDeflate: false // Disable compression for lower latency
});

// Handle new connections
wss.on('connection', (ws) => {
  const playerId = generatePlayerId();
  console.log(`Player ${playerId} connected`);
  
  // Create player physics body
  const playerData = createPlayer(playerId);
  gameState.players.set(playerId, {
    ws,
    body: playerData.body,
    lastInput: {},
    inputSequence: 0
  });
  
  // Send initial state to player
  ws.send(JSON.stringify({
    type: 'init',
    playerId,
    state: serializeGameState()
  }));
  
  // Handle messages from player
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      handlePlayerMessage(playerId, message);
    } catch (e) {
      console.error('Error parsing message:', e);
    }
  });
  
  // Handle disconnection
  ws.on('close', () => {
    console.log(`Player ${playerId} disconnected`);
    removePlayer(playerId);
  });
});

// Create player physics body
function createPlayer(playerId) {
  const spawnHeight = 35;
  const playerHeight = 1.8;
  const playerRadius = 0.4;
  
  const playerBodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0, spawnHeight, 0)
    .setLinearDamping(0.1)
    .setAngularDamping(1.0)
    .setCanSleep(false)
    .lockRotations();
  
  const playerBody = physicsWorld.createRigidBody(playerBodyDesc);
  
  const playerColliderDesc = RAPIER.ColliderDesc.capsule(
    playerHeight / 2 - playerRadius,
    playerRadius
  )
  .setFriction(0.0)
  .setRestitution(0.0)
  .setDensity(1.0);
  
  physicsWorld.createCollider(playerColliderDesc, playerBody);
  
  return { body: playerBody };
}

// Remove player
function removePlayer(playerId) {
  const player = gameState.players.get(playerId);
  if (!player) return;
  
  physicsWorld.removeRigidBody(player.body);
  gameState.players.delete(playerId);
  
  // Notify other players
  broadcast({
    type: 'playerLeft',
    playerId
  }, playerId);
}

// Handle player input
function handlePlayerMessage(playerId, message) {
  const player = gameState.players.get(playerId);
  if (!player) return;
  
  switch (message.type) {
    case 'input':
      player.lastInput = message.input;
      player.inputSequence = message.sequence;
      break;
    case 'ping':
      player.ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      break;
  }
}

// Physics update loop
function updatePhysics() {
  // Apply planet gravity to all dynamic bodies
  const planetCenter = { x: 0, y: -250, z: 0 };
  const gravityStrength = 25;
  
  gameState.players.forEach((player) => {
    const pos = player.body.translation();
    
    // Calculate gravity direction
    const gravityDir = {
      x: planetCenter.x - pos.x,
      y: planetCenter.y - pos.y,
      z: planetCenter.z - pos.z
    };
    
    // Normalize
    const dist = Math.sqrt(gravityDir.x ** 2 + gravityDir.y ** 2 + gravityDir.z ** 2);
    gravityDir.x /= dist;
    gravityDir.y /= dist;
    gravityDir.z /= dist;
    
    // Apply gravity force
    const vel = player.body.linvel();
    const gravityForce = gravityStrength * PHYSICS_TIMESTEP / 1000;
    
    player.body.setLinvel({
      x: vel.x + gravityDir.x * gravityForce,
      y: vel.y + gravityDir.y * gravityForce,
      z: vel.z + gravityDir.z * gravityForce
    });
    
    // Apply player input
    applyPlayerInput(player);
  });
  
  // Step physics
  physicsWorld.step();
}

// Apply player input to physics body
function applyPlayerInput(player) {
  const input = player.lastInput;
  const body = player.body;
  
  if (!input) return;
  
  const vel = body.linvel();
  
  // Movement based on input
  let moveForward = 0;
  let moveRight = 0;
  
  if (input.forward) moveForward += 1;
  if (input.backward) moveForward -= 1;
  if (input.left) moveRight -= 1;
  if (input.right) moveRight += 1;
  
  // Normalize movement
  const moveLength = Math.sqrt(moveForward ** 2 + moveRight ** 2);
  if (moveLength > 0) {
    moveForward /= moveLength;
    moveRight /= moveLength;
  }
  
  // Apply movement (simplified - you'll want to add proper grounding checks)
  const speed = input.run ? 16 : 8;
  const moveAccel = 100 * PHYSICS_TIMESTEP / 1000;
  
  // Get player rotation for movement direction
  const rotation = body.rotation();
  
  // Simple forward/right calculation (you'll want proper quaternion math here)
  const newVel = {
    x: vel.x + moveForward * moveAccel * Math.sin(rotation.y),
    y: vel.y,
    z: vel.z + moveForward * moveAccel * Math.cos(rotation.y)
  };
  
  // Apply velocity
  body.setLinvel(newVel);
  
  // Handle rotation from mouse input
  if (input.yaw !== undefined) {
    body.setRotation({
      x: 0,
      y: input.yaw,
      z: 0,
      w: 1
    });
  }
}

// Broadcast state to all players
function broadcast(message, excludePlayerId = null) {
  const data = JSON.stringify(message);
  gameState.players.forEach((player, playerId) => {
    if (playerId !== excludePlayerId && player.ws.readyState === 1) {
      player.ws.send(data);
    }
  });
}

// Serialize game state for network
function serializeGameState() {
  const players = {};
  
  gameState.players.forEach((player, playerId) => {
    const pos = player.body.translation();
    const rot = player.body.rotation();
    const vel = player.body.linvel();
    
    players[playerId] = {
      position: { x: pos.x, y: pos.y, z: pos.z },
      rotation: { x: rot.x, y: rot.y, z: rot.z, w: rot.w },
      velocity: { x: vel.x, y: vel.y, z: vel.z },
      inputSequence: player.inputSequence
    };
  });
  
  return { players };
}

// Generate unique player ID
function generatePlayerId() {
  return 'player_' + Math.random().toString(36).substr(2, 9);
}

// Start physics loop
initPhysics();
setInterval(updatePhysics, PHYSICS_TIMESTEP);

// Start network broadcast loop
setInterval(() => {
  if (gameState.players.size > 0) {
    broadcast({
      type: 'state',
      state: serializeGameState(),
      timestamp: Date.now()
    });
  }
}, BROADCAST_RATE);

console.log(`WebSocket server running on port ${process.env.PORT || 3000}`);