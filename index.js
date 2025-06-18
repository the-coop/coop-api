import RAPIER from '@dimforge/rapier3d-compat';
import { WebSocketServer } from 'ws';
import { MessageTypes, PhysicsConstants, PlayerConstants, GameConstants, Physics, WeaponConstants, VehicleConstants, VehicleTypes, GhostConstants, GhostTypes } from '@game/shared';

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
  static ghosts = new Map();
  static ghostRigidBodies = new Map();
  static ghostId = 0;

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
    this.createGhostEntities(); // Create some ghost entities
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
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        velocity: { x: 0, y: 0, z: 0 },
        driver: null
      });
    }
    
    // Create helicopters
    const helicopterPositions = [
      { x: -10, y: 1, z: -10 },
      { x: 20, y: 1, z: 15 }
    ];
    
    for (const pos of helicopterPositions) {
      const vehicleId = `vehicle_${this.vehicleId++}`;
      
      const rigidBodyDesc = this.RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, pos.y, pos.z)
        .setLinearDamping(1.0) // Less damping for flight
        .setAngularDamping(1.5);
      const rigidBody = this.world.createRigidBody(rigidBodyDesc);
      
      const colliderDesc = this.RAPIER.ColliderDesc.cuboid(
        VehicleConstants.HELICOPTER_SIZE.width / 2,
        VehicleConstants.HELICOPTER_SIZE.height / 2,
        VehicleConstants.HELICOPTER_SIZE.length / 2
      );
      this.world.createCollider(colliderDesc, rigidBody);
      
      this.vehicleRigidBodies.set(vehicleId, rigidBody);
      this.vehicles.set(vehicleId, {
        id: vehicleId,
        type: VehicleTypes.HELICOPTER,
        position: pos,
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        velocity: { x: 0, y: 0, z: 0 },
        driver: null,
        engineOn: false
      });
    }
    
    // Create planes
    const planePositions = [
      { x: 30, y: 1, z: -30 }
    ];
    
    for (const pos of planePositions) {
      const vehicleId = `vehicle_${this.vehicleId++}`;
      
      const rigidBodyDesc = this.RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, pos.y, pos.z)
        .setLinearDamping(0.5) // Low damping for gliding
        .setAngularDamping(1.0);
      const rigidBody = this.world.createRigidBody(rigidBodyDesc);
      
      const colliderDesc = this.RAPIER.ColliderDesc.cuboid(
        VehicleConstants.PLANE_SIZE.width / 2,
        VehicleConstants.PLANE_SIZE.height / 2,
        VehicleConstants.PLANE_SIZE.length / 2
      );
      this.world.createCollider(colliderDesc, rigidBody);
      
      this.vehicleRigidBodies.set(vehicleId, rigidBody);
      this.vehicles.set(vehicleId, {
        id: vehicleId,
        type: VehicleTypes.PLANE,
        position: pos,
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        velocity: { x: 0, y: 0, z: 0 },
        driver: null,
        throttle: 0
      });
    }
  }

  static createGhostEntities() {
    // Create various ghost objects around the map
    const ghostConfigs = [
      { type: GhostTypes.BOX, position: { x: 5, y: 2, z: 5 }, size: { width: 1, height: 1, depth: 1 }, mass: 10 },
      { type: GhostTypes.BOX, position: { x: -5, y: 2, z: 5 }, size: { width: 0.5, height: 2, depth: 0.5 }, mass: 15 },
      { type: GhostTypes.SPHERE, position: { x: 0, y: 2, z: -5 }, size: { radius: 0.6 }, mass: 8 },
      { type: GhostTypes.CYLINDER, position: { x: 10, y: 2, z: -10 }, size: { radius: 0.4, height: 1.5 }, mass: 12 },
      { type: GhostTypes.BOX, position: { x: -10, y: 2, z: 0 }, size: { width: 1.5, height: 0.5, depth: 1.5 }, mass: 20 }
    ];

    for (const config of ghostConfigs) {
      const ghostId = `ghost_${this.ghostId++}`;
      
      // Create ghost rigid body
      const rigidBodyDesc = this.RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(config.position.x, config.position.y, config.position.z)
        .setLinearDamping(0.5)
        .setAngularDamping(0.5);
      const rigidBody = this.world.createRigidBody(rigidBodyDesc);
      
      // Create appropriate collider based on type
      let colliderDesc;
      switch (config.type) {
        case GhostTypes.BOX:
          colliderDesc = this.RAPIER.ColliderDesc.cuboid(
            config.size.width / 2,
            config.size.height / 2,
            config.size.depth / 2
          );
          break;
        case GhostTypes.SPHERE:
          colliderDesc = this.RAPIER.ColliderDesc.ball(config.size.radius);
          break;
        case GhostTypes.CYLINDER:
          colliderDesc = this.RAPIER.ColliderDesc.cylinder(
            config.size.height / 2,
            config.size.radius
          );
          break;
      }
      
      colliderDesc.setDensity(config.mass / (config.size.width * config.size.height * config.size.depth || 1));
      colliderDesc.setFriction(GhostConstants.DEFAULT_FRICTION);
      colliderDesc.setRestitution(GhostConstants.DEFAULT_RESTITUTION);
      
      this.world.createCollider(colliderDesc, rigidBody);
      
      this.ghostRigidBodies.set(ghostId, rigidBody);
      this.ghosts.set(ghostId, {
        id: ghostId,
        type: config.type,
        size: config.size,
        position: config.position,
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        velocity: { x: 0, y: 0, z: 0 },
        mass: config.mass,
        carrier: null,
        color: Math.floor(Math.random() * 0xffffff)
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
      case MessageTypes.GRAB_GHOST:
        this.handleGrabGhost(playerId, message.ghostId);
        break;
      case MessageTypes.DROP_GHOST:
        this.handleDropGhost(playerId);
        break;
      case MessageTypes.THROW_GHOST:
        this.handleThrowGhost(playerId, message.direction);
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
      groundDistance: null,
      carryingGhost: null
    });

    this.broadcast({
      type: MessageTypes.PLAYER_JOINED,
      player: this.players.get(playerId)
    });
  }

  static removePlayer(playerId) {
    const player = this.players.get(playerId);
    if (player && player.carryingGhost) {
      // Drop any carried ghost
      const ghost = this.ghosts.get(player.carryingGhost);
      if (ghost) {
        ghost.carrier = null;
        const ghostBody = this.ghostRigidBodies.get(player.carryingGhost);
        if (ghostBody) {
          ghostBody.setBodyType(this.RAPIER.RigidBodyType.Dynamic, true);
        }
      }
    }
    
    // If player was in a vehicle, remove them from it
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

  static handleGrabGhost(playerId, ghostId) {
    const player = this.players.get(playerId);
    const ghost = this.ghosts.get(ghostId);
    const playerBody = this.rigidBodies.get(playerId);
    const ghostBody = this.ghostRigidBodies.get(ghostId);
    
    if (!player || !ghost || !playerBody || !ghostBody || ghost.carrier || player.carryingGhost) return;
    
    // Check distance
    const playerPos = playerBody.translation();
    const ghostPos = ghostBody.translation();
    const distance = Math.sqrt(
      (playerPos.x - ghostPos.x) ** 2 +
      (playerPos.y - ghostPos.y) ** 2 +
      (playerPos.z - ghostPos.z) ** 2
    );
    
    if (distance <= GhostConstants.INTERACTION_RANGE && ghost.mass <= GhostConstants.MAX_CARRY_MASS) {
      ghost.carrier = playerId;
      player.carryingGhost = ghostId;
      
      // Make ghost kinematic
      ghostBody.setBodyType(this.RAPIER.RigidBodyType.KinematicPositionBased, true);
      
      this.broadcast({
        type: MessageTypes.GHOST_UPDATE,
        ghost: ghost
      });
    }
  }

  static handleDropGhost(playerId) {
    const player = this.players.get(playerId);
    if (!player || !player.carryingGhost) return;
    
    const ghost = this.ghosts.get(player.carryingGhost);
    const ghostBody = this.ghostRigidBodies.get(player.carryingGhost);
    
    if (!ghost || !ghostBody) return;
    
    // Make ghost dynamic again
    ghostBody.setBodyType(this.RAPIER.RigidBodyType.Dynamic, true);
    
    // Apply small downward velocity
    ghostBody.setLinvel(new this.RAPIER.Vector3(0, -1, 0), true);
    
    ghost.carrier = null;
    player.carryingGhost = null;
    
    this.broadcast({
      type: MessageTypes.GHOST_UPDATE,
      ghost: ghost
    });
  }

  static handleThrowGhost(playerId, direction) {
    const player = this.players.get(playerId);
    if (!player || !player.carryingGhost) return;
    
    const ghost = this.ghosts.get(player.carryingGhost);
    const ghostBody = this.ghostRigidBodies.get(player.carryingGhost);
    
    if (!ghost || !ghostBody) return;
    
    // Make ghost dynamic
    ghostBody.setBodyType(this.RAPIER.RigidBodyType.Dynamic, true);
    
    // Apply throw force
    const throwVelocity = {
      x: direction.x * GhostConstants.THROW_FORCE,
      y: direction.y * GhostConstants.THROW_FORCE,
      z: direction.z * GhostConstants.THROW_FORCE
    };
    ghostBody.setLinvel(new this.RAPIER.Vector3(throwVelocity.x, throwVelocity.y, throwVelocity.z), true);
    
    ghost.carrier = null;
    player.carryingGhost = null;
    
    this.broadcast({
      type: MessageTypes.GHOST_UPDATE,
      ghost: ghost
    });
  }

  static handleInput(playerId, input) {
    const player = this.players.get(playerId);
    if (!player) return;
    
    // If player is in a vehicle, handle vehicle controls
    if (player.vehicle) {
      const vehicle = this.vehicles.get(player.vehicle);
      const vehicleBody = this.vehicleRigidBodies.get(player.vehicle);
      if (!vehicleBody || !vehicle) return;
      
      const currentVel = vehicleBody.linvel();
      const currentSpeed = Math.sqrt(currentVel.x * currentVel.x + currentVel.z * currentVel.z);
      
      if (vehicle.type === VehicleTypes.HELICOPTER) {
        // Helicopter controls
        const force = new this.RAPIER.Vector3(0, 0, 0);
        const torque = new this.RAPIER.Vector3(0, 0, 0);
        
        // Get current rotation for forward direction
        const rotation = vehicleBody.rotation();
        const forward = {
          x: 2 * (rotation.x * rotation.z + rotation.w * rotation.y),
          y: 0,
          z: 1 - 2 * (rotation.x * rotation.x + rotation.y * rotation.y)
        };
        
        // Normalize
        const forwardLength = Math.sqrt(forward.x * forward.x + forward.z * forward.z);
        if (forwardLength > 0) {
          forward.x /= forwardLength;
          forward.z /= forwardLength;
        }
        
        // Vertical movement (Space for up, Shift/Z for down)
        if (input.jump) { // Space key - up
          force.y = VehicleConstants.HELICOPTER_LIFT_FORCE;
          vehicle.engineOn = true;
        } else if (input.shift || input.descend) { // Shift or Z - down
          force.y = -VehicleConstants.HELICOPTER_LIFT_FORCE * 0.5;
        } else {
          // Hover with slight downward drift
          force.y = 2.0; // Counter gravity
        }
        
        // Forward/backward with tilt
        if (input.moveForward) {
          force.x = forward.x * VehicleConstants.HELICOPTER_FORWARD_SPEED;
          force.z = forward.z * VehicleConstants.HELICOPTER_FORWARD_SPEED;
          // Tilt forward
          torque.x = -VehicleConstants.HELICOPTER_TILT_ANGLE;
        }
        if (input.moveBackward) {
          force.x = -forward.x * VehicleConstants.HELICOPTER_FORWARD_SPEED * 0.5;
          force.z = -forward.z * VehicleConstants.HELICOPTER_FORWARD_SPEED * 0.5;
          // Tilt backward
          torque.x = VehicleConstants.HELICOPTER_TILT_ANGLE;
        }
        
        // Rotation
        if (input.moveLeft) {
          torque.y = VehicleConstants.HELICOPTER_TURN_SPEED;
        }
        if (input.moveRight) {
          torque.y = -VehicleConstants.HELICOPTER_TURN_SPEED;
        }
        
        // Altitude limit
        const currentY = vehicleBody.translation().y;
        if (currentY > VehicleConstants.HELICOPTER_MAX_ALTITUDE && force.y > 0) {
          force.y = 0;
        }
        
        vehicleBody.applyImpulse(force, true);
        vehicleBody.applyTorqueImpulse(torque, true);
        
      } else if (vehicle.type === VehicleTypes.PLANE) {
        // Plane controls - needs forward speed to fly
        const force = new this.RAPIER.Vector3(0, 0, 0);
        const torque = new this.RAPIER.Vector3(0, 0, 0);
        
        // Get forward direction
        const rotation = vehicleBody.rotation();
        const forward = {
          x: 2 * (rotation.x * rotation.z + rotation.w * rotation.y),
          y: 2 * (rotation.y * rotation.z - rotation.w * rotation.x),
          z: 1 - 2 * (rotation.x * rotation.x + rotation.y * rotation.y)
        };
        
        // Throttle control
        if (input.moveForward) {
          vehicle.throttle = Math.min(1, vehicle.throttle + 0.02);
        } else if (input.moveBackward) {
          vehicle.throttle = Math.max(0, vehicle.throttle - 0.02);
        }
        
        // Apply thrust
        const thrust = vehicle.throttle * VehicleConstants.PLANE_ACCELERATION;
        force.x = forward.x * thrust;
        force.y = forward.y * thrust;
        force.z = forward.z * thrust;
        
        // Calculate lift based on speed
        const speed = Math.sqrt(currentVel.x * currentVel.x + currentVel.y * currentVel.y + currentVel.z * currentVel.z);
        if (speed > VehicleConstants.PLANE_MIN_SPEED) {
          const liftMagnitude = Math.min(speed * VehicleConstants.PLANE_LIFT_COEFFICIENT, 15);
          force.y += liftMagnitude;
        }
        
        // Pitch control (up/down)
        if (input.jump) { // Pull up
          torque.x = -VehicleConstants.PLANE_PITCH_SPEED;
        } else if (input.shift || input.descend) { // Push down - now both Shift and Z work
          torque.x = VehicleConstants.PLANE_PITCH_SPEED;
        }
        
        // Roll and yaw
        if (input.moveLeft) {
          torque.z = VehicleConstants.PLANE_TURN_SPEED;
          torque.y = VehicleConstants.PLANE_TURN_SPEED * 0.5; // Some yaw with roll
        }
        if (input.moveRight) {
          torque.z = -VehicleConstants.PLANE_TURN_SPEED;
          torque.y = -VehicleConstants.PLANE_TURN_SPEED * 0.5;
        }
        
        vehicleBody.applyImpulse(force, true);
        vehicleBody.applyTorqueImpulse(torque, true);
        
      } else {
        // Existing car controls
        const rotation = vehicleBody.rotation();
        
        // Calculate forward vector from rotation
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
      }
      
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
      // Ground movement with consistent forces
      if (moveDirLength > 0) {
        // Simple movement without complex ground projection
        const targetSpeed = PlayerConstants.SPEED;
        const acceleration = 0.15; // Consistent acceleration
        
        impulse.x = moveDir.x * targetSpeed * acceleration;
        impulse.z = moveDir.z * targetSpeed * acceleration;
        
        // Apply velocity damping directly
        const dampingFactor = 0.9;
        const newVelX = currentVel.x * dampingFactor + impulse.x;
        const newVelZ = currentVel.z * dampingFactor + impulse.z;
        
        // Set velocity directly for more consistent movement
        rigidBody.setLinvel(new this.RAPIER.Vector3(
          newVelX,
          currentVel.y,
          newVelZ
        ), true);
        
        // Don't apply impulse since we're setting velocity directly
        impulse.x = 0;
        impulse.z = 0;
      } else {
        // Friction when not moving
        rigidBody.setLinvel(new this.RAPIER.Vector3(
          currentVel.x * 0.8,
          currentVel.y,
          currentVel.z * 0.8
        ), true);
      }
      
      // Small downward force to stay grounded
      impulse.y = -0.2;
    } else {
      // Air control (minimal)
      if (moveDirLength > 0) {
        const airControl = 0.02;
        impulse.x = moveDir.x * airControl;
        impulse.z = moveDir.z * airControl;
      }
    }
    
    // Handle jumping - only when grounded
    if (input.jump && isGrounded && currentVel.y < 0.5) {
      impulse.y = PlayerConstants.JUMP_FORCE;
    }

    // Apply the impulse only if there's something to apply
    if (impulse.x !== 0 || impulse.y !== 0 || impulse.z !== 0) {
      rigidBody.applyImpulse(impulse, true);
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

    // Update carried ghosts
    for (const [playerId, player] of this.players) {
      if (player.carryingGhost && !player.vehicle) {
        const ghost = this.ghosts.get(player.carryingGhost);
        const ghostBody = this.ghostRigidBodies.get(player.carryingGhost);
        const playerBody = this.rigidBodies.get(playerId);
        
        if (ghost && ghostBody && playerBody) {
          // Position ghost in front of player
          const playerPos = playerBody.translation();
          const carryPosition = {
            x: playerPos.x + player.lookDirection.x * GhostConstants.CARRY_DISTANCE,
            y: playerPos.y + 0.5 + player.lookDirection.y * GhostConstants.CARRY_DISTANCE,
            z: playerPos.z + player.lookDirection.z * GhostConstants.CARRY_DISTANCE
          };
          
          ghostBody.setTranslation(new this.RAPIER.Vector3(
            carryPosition.x,
            carryPosition.y,
            carryPosition.z
          ), true);
        }
      }
    }

    // Update ghosts
    for (const [ghostId, rigidBody] of this.ghostRigidBodies) {
      const translation = rigidBody.translation();
      const rotation = rigidBody.rotation();
      const linvel = rigidBody.linvel();
      
      const ghost = this.ghosts.get(ghostId);
      if (ghost) {
        ghost.position = { x: translation.x, y: translation.y, z: translation.z };
        ghost.rotation = { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w };
        ghost.velocity = { x: linvel.x, y: linvel.y, z: linvel.z };
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
      vehicles: Array.from(this.vehicles.values()),
      ghosts: Array.from(this.ghosts.values())
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