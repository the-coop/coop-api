import RAPIER from '@dimforge/rapier3d-compat';
import { WebSocketServer } from 'ws';
import { MessageTypes, PhysicsConstants, PlayerConstants, GameConstants, Physics, WeaponConstants, VehicleConstants, VehicleTypes } from '@game/shared';

class GameServer {
  static world = null;
  static RAPIER = null;
  static clients = new Map();
  static players = new Map();
  static rigidBodies = new Map();
  static projectiles = new Map();
  static projectileId = 0;
  static levelObjects = [];
  static vehicles = new Map();
  static vehicleRigidBodies = new Map();
  static vehicleId = 0;

  static async init(RapierModule) {
    this.RAPIER = RapierModule;
    this.world = new RapierModule.World(new RapierModule.Vector3(
      PhysicsConstants.GRAVITY.x, 
      PhysicsConstants.GRAVITY.y, 
      PhysicsConstants.GRAVITY.z
    ));
    this.createGround();
    this.createLevel();
    this.createVehicles(); // Create some vehicles
  }

  static createGround() {
    const groundDesc = this.RAPIER.RigidBodyDesc.fixed()
      .setTranslation(0, -0.5, 0);
    const ground = this.world.createRigidBody(groundDesc);
    
    // Use RAPIER directly instead of the Physics helper
    const groundCollider = this.RAPIER.ColliderDesc.cuboid(50, 0.5, 50);
    this.world.createCollider(groundCollider, ground);
  }

  static createLevel() {
    // Generate decorative cubes on server
    for (let i = 0; i < 10; i++) {
      const cube = {
        id: `cube_${i}`,
        type: 'cube',
        position: {
          x: (Math.random() - 0.5) * 80,
          y: 1,
          z: (Math.random() - 0.5) * 80
        },
        size: { x: 2, y: 2, z: 2 },
        color: Math.floor(Math.random() * 0xffffff)
      };
      
      // Create physics body for cube
      const cubeDesc = this.RAPIER.RigidBodyDesc.fixed()
        .setTranslation(cube.position.x, cube.position.y, cube.position.z);
      const cubeBody = this.world.createRigidBody(cubeDesc);
      
      const colliderDesc = this.RAPIER.ColliderDesc.cuboid(
        cube.size.x / 2, 
        cube.size.y / 2, 
        cube.size.z / 2
      );
      this.world.createCollider(colliderDesc, cubeBody);
      
      this.levelObjects.push(cube);
    }
  }

  static createVehicles() {
    // Create a few cars around the map
    const carPositions = [
      { x: 10, y: 1, z: 10 },
      { x: -15, y: 1, z: 5 },
      { x: 5, y: 1, z: -20 }
    ];

    for (const pos of carPositions) {
      const vehicleId = `vehicle_${this.vehicleId++}`;
      
      // Create vehicle rigid body
      const rigidBodyDesc = this.RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, pos.y, pos.z)
        .setLinearDamping(2.0)
        .setAngularDamping(2.0);
      const rigidBody = this.world.createRigidBody(rigidBodyDesc);
      
      // Create vehicle collider (box shape)
      const colliderDesc = this.RAPIER.ColliderDesc.cuboid(
        VehicleConstants.CAR_SIZE.width / 2,
        VehicleConstants.CAR_SIZE.height / 2,
        VehicleConstants.CAR_SIZE.length / 2
      );
      this.world.createCollider(colliderDesc, rigidBody);
      
      this.vehicleRigidBodies.set(vehicleId, rigidBody);
      this.vehicles.set(vehicleId, {
        id: vehicleId,
        type: VehicleTypes.CAR,
        position: pos,
        rotation: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        driver: null
      });
    }
  }

  static handleConnection(ws) {
    const playerId = this.generateId();
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        this.handleMessage(playerId, message, ws);
      } catch (error) {
        console.error('Invalid message:', error);
      }
    });

    ws.on('close', () => {
      this.removePlayer(playerId);
    });

    ws.send(JSON.stringify({
      type: MessageTypes.INIT,
      playerId,
      level: this.levelObjects // Send level data on init
    }));
  }

  static handleMessage(playerId, message, ws) {
    switch (message.type) {
      case MessageTypes.JOIN:
        this.addPlayer(playerId, ws);
        break;
      case MessageTypes.INPUT:
        this.handleInput(playerId, message.input);
        break;
      case MessageTypes.FIRE:
        this.handleFire(playerId, message.direction, message.origin);
        break;
      case MessageTypes.ENTER_VEHICLE:
        this.handleEnterVehicle(playerId, message.vehicleId);
        break;
      case MessageTypes.EXIT_VEHICLE:
        this.handleExitVehicle(playerId);
        break;
    }
  }

  static addPlayer(playerId, ws) {
    // Use RAPIER directly for rigid body creation
    const rigidBodyDesc = this.RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, 5, 0)
      .setLinearDamping(0.5);
    const rigidBody = this.world.createRigidBody(rigidBodyDesc);
    
    // Use RAPIER directly for collider
    const colliderDesc = this.RAPIER.ColliderDesc.capsule(PlayerConstants.HEIGHT / 2, PlayerConstants.RADIUS);
    this.world.createCollider(colliderDesc, rigidBody);
    
    this.clients.set(playerId, ws);
    this.rigidBodies.set(playerId, rigidBody);
    this.players.set(playerId, {
      id: playerId,
      position: { x: 0, y: 5, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      health: PlayerConstants.MAX_HEALTH,
      lastFireTime: 0,
      lookDirection: { x: 0, y: 0, z: -1 }
    });

    this.broadcast({
      type: MessageTypes.PLAYER_JOINED,
      player: this.players.get(playerId)
    });
  }

  static removePlayer(playerId) {
    const rigidBody = this.rigidBodies.get(playerId);
    if (rigidBody) {
      this.world.removeRigidBody(rigidBody);
    }
    
    this.clients.delete(playerId);
    this.rigidBodies.delete(playerId);
    this.players.delete(playerId);

    this.broadcast({
      type: MessageTypes.PLAYER_LEFT,
      playerId
    });
  }

  static handleEnterVehicle(playerId, vehicleId) {
    const player = this.players.get(playerId);
    const vehicle = this.vehicles.get(vehicleId);
    const playerBody = this.rigidBodies.get(playerId);
    const vehicleBody = this.vehicleRigidBodies.get(vehicleId);
    
    if (!player || !vehicle || !playerBody || !vehicleBody || vehicle.driver) return;
    
    // Check distance
    const playerPos = playerBody.translation();
    const vehiclePos = vehicleBody.translation();
    const distance = Math.sqrt(
      (playerPos.x - vehiclePos.x) ** 2 +
      (playerPos.y - vehiclePos.y) ** 2 +
      (playerPos.z - vehiclePos.z) ** 2
    );
    
    if (distance <= VehicleConstants.INTERACTION_RANGE) {
      vehicle.driver = playerId;
      player.vehicle = vehicleId;
      
      // Hide player mesh by moving it far away
      playerBody.setTranslation(new this.RAPIER.Vector3(0, -100, 0), true);
      
      this.broadcast({
        type: MessageTypes.VEHICLE_UPDATE,
        vehicle: vehicle
      });
    }
  }

  static handleExitVehicle(playerId) {
    const player = this.players.get(playerId);
    if (!player || !player.vehicle) return;
    
    const vehicle = this.vehicles.get(player.vehicle);
    const playerBody = this.rigidBodies.get(playerId);
    const vehicleBody = this.vehicleRigidBodies.get(player.vehicle);
    
    if (!vehicle || !playerBody || !vehicleBody) return;
    
    // Place player next to vehicle
    const vehiclePos = vehicleBody.translation();
    playerBody.setTranslation(new this.RAPIER.Vector3(
      vehiclePos.x + 3,
      vehiclePos.y + 1,
      vehiclePos.z
    ), true);
    
    vehicle.driver = null;
    player.vehicle = null;
    
    this.broadcast({
      type: MessageTypes.VEHICLE_UPDATE,
      vehicle: vehicle
    });
  }

  static handleInput(playerId, input) {
    const player = this.players.get(playerId);
    if (!player) return;
    
    // If player is in a vehicle, handle vehicle controls
    if (player.vehicle) {
      const vehicleBody = this.vehicleRigidBodies.get(player.vehicle);
      if (!vehicleBody) return;
      
      const rotation = vehicleBody.rotation();
      let forward = new this.RAPIER.Vector3(0, 0, -1);
      forward = rotation.vmul(forward);
      
      // Vehicle movement
      const force = { x: 0, y: 0, z: 0 };
      const torque = { x: 0, y: 0, z: 0 };
      
      if (input.moveForward) {
        force.x = forward.x * VehicleConstants.CAR_SPEED;
        force.z = forward.z * VehicleConstants.CAR_SPEED;
      }
      if (input.moveBackward) {
        force.x = -forward.x * VehicleConstants.CAR_SPEED * 0.5;
        force.z = -forward.z * VehicleConstants.CAR_SPEED * 0.5;
      }
      if (input.moveLeft) {
        torque.y = VehicleConstants.CAR_TURN_SPEED;
      }
      if (input.moveRight) {
        torque.y = -VehicleConstants.CAR_TURN_SPEED;
      }
      
      vehicleBody.applyImpulse(new this.RAPIER.Vector3(force.x, force.y, force.z), true);
      vehicleBody.applyTorqueImpulse(new this.RAPIER.Vector3(torque.x, torque.y, torque.z), true);
      
      return;
    }
    
    // Regular player movement
    const rigidBody = this.rigidBodies.get(playerId);
    if (!rigidBody) return;

    // Update look direction
    if (input.lookDirection) {
      player.lookDirection = input.lookDirection;
    }

    // Calculate movement based on look direction
    const forward = { x: player.lookDirection.x, y: 0, z: player.lookDirection.z };
    const length = Math.sqrt(forward.x * forward.x + forward.z * forward.z);
    if (length > 0) {
      forward.x /= length;
      forward.z /= length;
    }
    
    const right = { x: -forward.z, y: 0, z: forward.x };
    
    const impulse = { x: 0, y: 0, z: 0 };
    const speed = 0.5;
    
    if (input.moveForward) {
      impulse.x += forward.x * speed;
      impulse.z += forward.z * speed;
    }
    if (input.moveBackward) {
      impulse.x -= forward.x * speed;
      impulse.z -= forward.z * speed;
    }
    if (input.moveLeft) {
      impulse.x -= right.x * speed;
      impulse.z -= right.z * speed;
    }
    if (input.moveRight) {
      impulse.x += right.x * speed;
      impulse.z += right.z * speed;
    }
    if (input.jump && Math.abs(rigidBody.translation().y - 1) < 0.1) {
      impulse.y = PlayerConstants.JUMP_FORCE;
    }

    rigidBody.applyImpulse(new this.RAPIER.Vector3(impulse.x, impulse.y, impulse.z), true);
  }

  static handleFire(playerId, direction, origin) {
    const player = this.players.get(playerId);
    if (!player) return;

    const now = Date.now() / 1000;
    if (now - player.lastFireTime < WeaponConstants.FIRE_RATE) return;
    
    player.lastFireTime = now;

    // Create projectile
    const projectileId = `proj_${this.projectileId++}`;
    const projectileDesc = this.RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(origin.x, origin.y, origin.z)
      .setLinearDamping(0);
    
    const projectileBody = this.world.createRigidBody(projectileDesc);
    
    const colliderDesc = this.RAPIER.ColliderDesc.ball(WeaponConstants.PROJECTILE_RADIUS);
    this.world.createCollider(colliderDesc, projectileBody);
    
    // Apply velocity
    const velocity = {
      x: direction.x * WeaponConstants.PROJECTILE_SPEED,
      y: direction.y * WeaponConstants.PROJECTILE_SPEED,
      z: direction.z * WeaponConstants.PROJECTILE_SPEED
    };
    projectileBody.setLinvel(new this.RAPIER.Vector3(velocity.x, velocity.y, velocity.z), true);
    
    this.projectiles.set(projectileId, {
      id: projectileId,
      owner: playerId,
      body: projectileBody,
      createdAt: now
    });

    this.broadcast({
      type: MessageTypes.PROJECTILE_SPAWN,
      projectile: {
        id: projectileId,
        position: origin,
        velocity: velocity,
        owner: playerId
      }
    });
  }

  static start() {
    setInterval(() => {
      this.update();
    }, 1000 / GameConstants.TICK_RATE);
  }

  static update() {
    this.world.step();
    
    // Update players
    for (const [playerId, rigidBody] of this.rigidBodies) {
      const translation = rigidBody.translation();
      const rotation = rigidBody.rotation();
      const linvel = rigidBody.linvel();
      
      const player = this.players.get(playerId);
      if (player) {
        player.position = { x: translation.x, y: translation.y, z: translation.z };
        player.rotation = { x: rotation.x, y: rotation.y, z: rotation.z };
        player.velocity = { x: linvel.x, y: linvel.y, z: linvel.z };
      }
    }

    // Update vehicles
    for (const [vehicleId, rigidBody] of this.vehicleRigidBodies) {
      const translation = rigidBody.translation();
      const rotation = rigidBody.rotation();
      const linvel = rigidBody.linvel();
      
      const vehicle = this.vehicles.get(vehicleId);
      if (vehicle) {
        vehicle.position = { x: translation.x, y: translation.y, z: translation.z };
        vehicle.rotation = { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w };
        vehicle.velocity = { x: linvel.x, y: linvel.y, z: linvel.z };
      }
    }

    // Update and check projectiles
    const now = Date.now() / 1000;
    const projectilesToRemove = [];
    
    for (const [projectileId, projectile] of this.projectiles) {
      const translation = projectile.body.translation();
      
      // Remove old projectiles
      if (now - projectile.createdAt > 5) {
        projectilesToRemove.push(projectileId);
        continue;
      }
      
      // Check collisions with players
      for (const [playerId, player] of this.players) {
        if (playerId === projectile.owner) continue;
        
        const distance = Math.sqrt(
          (player.position.x - translation.x) ** 2 +
          (player.position.y - translation.y) ** 2 +
          (player.position.z - translation.z) ** 2
        );
        
        if (distance < PlayerConstants.RADIUS + WeaponConstants.PROJECTILE_RADIUS) {
          player.health -= WeaponConstants.PROJECTILE_DAMAGE;
          projectilesToRemove.push(projectileId);
          
          this.broadcast({
            type: MessageTypes.HIT,
            target: playerId,
            damage: WeaponConstants.PROJECTILE_DAMAGE,
            health: player.health
          });
          
          if (player.health <= 0) {
            // Respawn player
            player.health = PlayerConstants.MAX_HEALTH;
            const rigidBody = this.rigidBodies.get(playerId);
            if (rigidBody) {
              rigidBody.setTranslation(new this.RAPIER.Vector3(0, 5, 0), true);
              rigidBody.setLinvel(new this.RAPIER.Vector3(0, 0, 0), true);
            }
          }
        }
      }
    }
    
    // Remove projectiles
    for (const projectileId of projectilesToRemove) {
      const projectile = this.projectiles.get(projectileId);
      if (projectile) {
        this.world.removeRigidBody(projectile.body);
        this.projectiles.delete(projectileId);
        
        this.broadcast({
          type: MessageTypes.PROJECTILE_REMOVE,
          projectileId
        });
      }
    }
    
    // Send game state
    const gameState = {
      players: Array.from(this.players.values()),
      projectiles: Array.from(this.projectiles.entries()).map(([id, proj]) => ({
        id,
        position: Physics.rapierToVector3(proj.body.translation()),
        velocity: Physics.rapierToVector3(proj.body.linvel())
      })),
      vehicles: Array.from(this.vehicles.values())
    };
    
    this.broadcast({
      type: MessageTypes.GAME_STATE,
      state: gameState
    });
  }

  static broadcast(message) {
    const data = JSON.stringify(message);
    for (const ws of this.clients.values()) {
      if (ws.readyState === ws.OPEN) {
        ws.send(data);
      }
    }
  }

  static generateId() {
    return Math.random().toString(36).substring(2, 15);
  }
}

// Initialize server
async function startServer() {
  await RAPIER.init();
  await GameServer.init(RAPIER);

  // Start WebSocket server
  const wss = new WebSocketServer({ port: 8080 });
  wss.on('connection', (ws) => GameServer.handleConnection(ws));

  // Start game loop
  GameServer.start();
  console.log('Game server running on ws://localhost:8080');
}

startServer().catch(console.error);