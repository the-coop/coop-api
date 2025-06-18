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
      .setLinearDamping(10.0) // Higher damping for better control
      .setAngularDamping(10.0) // Prevent any rotation
      .lockRotations(); // Lock all rotations to prevent tipping
    const rigidBody = this.world.createRigidBody(rigidBodyDesc);
    
    // Use RAPIER directly for collider - fix capsule parameters
    // Capsule in Rapier is defined by half-height (distance between centers of hemispheres) and radius
    const halfHeight = (PlayerConstants.HEIGHT - PlayerConstants.RADIUS * 2) / 2;
    const colliderDesc = this.RAPIER.ColliderDesc.capsule(
      halfHeight, // halfHeight between sphere centers
      PlayerConstants.RADIUS // radius
    )
      .setFriction(0.5) // Add friction for better ground control
      .setRestitution(0.0); // No bouncing
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
      lookDirection: { x: 0, y: 0, z: -1 },
      vehicle: null,
      isGrounded: false,
      groundNormal: { x: 0, y: 1, z: 0 },
      groundDistance: null
    });

    this.broadcast({
      type: MessageTypes.PLAYER_JOINED,
      player: this.players.get(playerId)
    });
  }

  static removePlayer(playerId) {
    // If player was in a vehicle, remove them from it
    const player = this.players.get(playerId);
    if (player && player.vehicle) {
      const vehicle = this.vehicles.get(player.vehicle);
      if (vehicle) {
        vehicle.driver = null;
        this.broadcast({
          type: MessageTypes.VEHICLE_UPDATE,
          vehicle: vehicle
        });
      }
    }
    
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
      
      // Disable player collision by making it kinematic and moving far away
      playerBody.setBodyType(this.RAPIER.RigidBodyType.KinematicPositionBased, true);
      playerBody.setTranslation(new this.RAPIER.Vector3(0, -1000, 0), true);
      
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
    
    // Re-enable player physics
    playerBody.setBodyType(this.RAPIER.RigidBodyType.Dynamic, true);
    
    // Place player next to vehicle
    const vehiclePos = vehicleBody.translation();
    
    // Simple offset - just place player to the left of vehicle
    playerBody.setTranslation(new this.RAPIER.Vector3(
      vehiclePos.x + 3,
      vehiclePos.y + 1,
      vehiclePos.z
    ), true);
    
    // Reset player velocity
    playerBody.setLinvel(new this.RAPIER.Vector3(0, 0, 0), true);
    
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
      
      // Get current vehicle velocity for better control
      const currentVel = vehicleBody.linvel();
      const currentSpeed = Math.sqrt(currentVel.x * currentVel.x + currentVel.z * currentVel.z);
      
      // Get vehicle rotation as euler angles
      const rotation = vehicleBody.rotation();
      
      // Calculate forward vector from rotation
      // For a quaternion, we can extract the forward direction
      const forward = {
        x: 2 * (rotation.x * rotation.z + rotation.w * rotation.y),
        y: 2 * (rotation.y * rotation.z - rotation.w * rotation.x),
        z: 1 - 2 * (rotation.x * rotation.x + rotation.y * rotation.y)
      };
      
      // Normalize forward vector
      const forwardLength = Math.sqrt(forward.x * forward.x + forward.z * forward.z);
      if (forwardLength > 0) {
        forward.x /= forwardLength;
        forward.z /= forwardLength;
      }
      
      // Vehicle movement forces
      const force = new this.RAPIER.Vector3(0, 0, 0);
      const torque = new this.RAPIER.Vector3(0, 0, 0);
      
      if (input.moveForward) {
        force.x = forward.x * VehicleConstants.CAR_SPEED * 2;
        force.z = forward.z * VehicleConstants.CAR_SPEED * 2;
      }
      if (input.moveBackward) {
        force.x = -forward.x * VehicleConstants.CAR_SPEED;
        force.z = -forward.z * VehicleConstants.CAR_SPEED;
      }
      
      // Only allow turning when moving
      if (currentSpeed > 0.5 || input.moveForward || input.moveBackward) {
        if (input.moveLeft) {
          torque.y = VehicleConstants.CAR_TURN_SPEED;
        }
        if (input.moveRight) {
          torque.y = -VehicleConstants.CAR_TURN_SPEED;
        }
      }
      
      vehicleBody.applyImpulse(force, true);
      vehicleBody.applyTorqueImpulse(torque, true);
      
      // Add downward force to keep vehicle grounded
      vehicleBody.applyImpulse(new this.RAPIER.Vector3(0, -1.0, 0), true);
      
      return;
    }
    
    // Regular player movement
    const rigidBody = this.rigidBodies.get(playerId);
    if (!rigidBody) return;

    // Update look direction
    if (input.lookDirection) {
      player.lookDirection = input.lookDirection;
    }

    // Use the ground detection info from the update loop
    const isGrounded = player.isGrounded || false;
    const groundNormal = player.groundNormal || { x: 0, y: 1, z: 0 };

    // Calculate movement based on look direction
    const forward = { x: player.lookDirection.x, y: 0, z: player.lookDirection.z };
    const length = Math.sqrt(forward.x * forward.x + forward.z * forward.z);
    if (length > 0) {
      forward.x /= length;
      forward.z /= length;
    }
    
    const right = { x: -forward.z, y: 0, z: forward.x };
    
    // Calculate desired movement direction
    let moveDir = { x: 0, y: 0, z: 0 };
    
    if (input.moveForward) {
      moveDir.x += forward.x;
      moveDir.z += forward.z;
    }
    if (input.moveBackward) {
      moveDir.x -= forward.x;
      moveDir.z -= forward.z;
    }
    if (input.moveLeft) {
      moveDir.x -= right.x;
      moveDir.z -= right.z;
    }
    if (input.moveRight) {
      moveDir.x += right.x;
      moveDir.z += right.z;
    }
    
    // Normalize movement direction
    const moveDirLength = Math.sqrt(moveDir.x * moveDir.x + moveDir.z * moveDir.z);
    if (moveDirLength > 0) {
      moveDir.x /= moveDirLength;
      moveDir.z /= moveDirLength;
    }
    
    // Get current velocity
    const currentVel = rigidBody.linvel();
    
    // Calculate impulse
    const impulse = new this.RAPIER.Vector3(0, 0, 0);
    
    if (isGrounded) {
      // Project movement onto ground plane
      if (moveDirLength > 0) {
        // Project movement direction onto the plane perpendicular to ground normal
        const dot = moveDir.x * groundNormal.x + moveDir.y * groundNormal.y + moveDir.z * groundNormal.z;
        const projectedMove = {
          x: moveDir.x - groundNormal.x * dot,
          y: moveDir.y - groundNormal.y * dot,
          z: moveDir.z - groundNormal.z * dot
        };
        
        // Normalize projected movement
        const projLength = Math.sqrt(projectedMove.x * projectedMove.x + projectedMove.y * projectedMove.y + projectedMove.z * projectedMove.z);
        if (projLength > 0.001) {
          projectedMove.x /= projLength;
          projectedMove.y /= projLength;
          projectedMove.z /= projLength;
          
          // Apply movement force
          const targetSpeed = PlayerConstants.SPEED;
          const desiredVel = {
            x: projectedMove.x * targetSpeed,
            y: projectedMove.y * targetSpeed,
            z: projectedMove.z * targetSpeed
          };
          
          // Stronger impulse for better responsiveness
          impulse.x = (desiredVel.x - currentVel.x) * 0.25;
          impulse.y = (desiredVel.y - currentVel.y) * 0.25;
          impulse.z = (desiredVel.z - currentVel.z) * 0.25;
        }
      } else {
        // Apply friction when not moving
        const frictionForce = 0.3;
        impulse.x = -currentVel.x * frictionForce;
        impulse.y = -currentVel.y * frictionForce;
        impulse.z = -currentVel.z * frictionForce;
      }
      
      // Add a small downward force to keep grounded on slopes
      impulse.y -= 0.5;
    } else {
      // Air control
      if (moveDirLength > 0) {
        const airControl = 0.05;
        impulse.x = moveDir.x * airControl;
        impulse.z = moveDir.z * airControl;
      }
    }
    
    // Handle jumping - only when grounded
    if (input.jump && isGrounded && currentVel.y < 0.5) { // Prevent double jumps
      impulse.y = PlayerConstants.JUMP_FORCE;
    }

    // Apply the impulse
    rigidBody.applyImpulse(impulse, true);
    
    // Limit max velocity to prevent sliding
    const maxHorizontalSpeed = PlayerConstants.SPEED * 1.5;
    const horizontalSpeed = Math.sqrt(currentVel.x * currentVel.x + currentVel.z * currentVel.z);
    if (horizontalSpeed > maxHorizontalSpeed) {
      const scale = maxHorizontalSpeed / horizontalSpeed;
      rigidBody.setLinvel(new this.RAPIER.Vector3(
        currentVel.x * scale,
        currentVel.y,
        currentVel.z * scale
      ), true);
    }
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
      const player = this.players.get(playerId);
      if (!player) continue;
      
      // Skip updating position if player is in vehicle
      if (player.vehicle) continue;
      
      const translation = rigidBody.translation();
      const rotation = rigidBody.rotation();
      const linvel = rigidBody.linvel();
      
      player.position = { x: translation.x, y: translation.y, z: translation.z };
      player.rotation = { x: rotation.x, y: rotation.y, z: rotation.z };
      player.velocity = { x: linvel.x, y: linvel.y, z: linvel.z };
      
      // Perform ground detection for all players
      const playerPos = translation;
      const rayDir = new this.RAPIER.Vector3(0, -1, 0);
      // Start ray from center of capsule
      const maxToi = PlayerConstants.HEIGHT / 2 + 0.5; // From center to ground + margin
      
      // Create an array of ray origins around the capsule bottom
      const rayOffsets = [
        { x: 0, z: 0 }, // Center
        { x: PlayerConstants.RADIUS * 0.7, z: 0 }, // Right
        { x: -PlayerConstants.RADIUS * 0.7, z: 0 }, // Left
        { x: 0, z: PlayerConstants.RADIUS * 0.7 }, // Front
        { x: 0, z: -PlayerConstants.RADIUS * 0.7 }, // Back
      ];
      
      let isGrounded = false;
      let closestHit = null;
      let minDistance = Infinity;
      
      // Cast rays from multiple points
      for (const offset of rayOffsets) {
        const rayOrigin = new this.RAPIER.Vector3(
          playerPos.x + offset.x,
          playerPos.y, // Start from capsule center
          playerPos.z + offset.z
        );
        
        const ray = new this.RAPIER.Ray(rayOrigin, rayDir);
        
        const hit = this.world.castRay(
          ray,
          maxToi,
          true,
          this.RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
          undefined,
          undefined,
          rigidBody
        );
        
        if (hit) {
          const distance = hit.toi;
          // Check if within ground threshold (accounting for capsule bottom)
          const groundThreshold = PlayerConstants.HEIGHT / 2 + 0.1; // Small tolerance
          if (distance <= groundThreshold) {
            isGrounded = true;
            if (distance < minDistance) {
              minDistance = distance;
              closestHit = hit;
            }
          }
        }
      }
      
      // Update ground info
      player.isGrounded = isGrounded;
      player.groundNormal = closestHit && closestHit.normal ? 
        { x: closestHit.normal.x, y: closestHit.normal.y, z: closestHit.normal.z } : 
        { x: 0, y: 1, z: 0 };
      player.groundDistance = closestHit ? closestHit.toi : null;
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