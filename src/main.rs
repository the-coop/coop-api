use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
    routing::get,
    Router,
};
use futures::{sink::SinkExt, stream::StreamExt};
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{mpsc, RwLock};
use tower_http::cors::CorsLayer;
use uuid::Uuid;
use nalgebra::{Vector3, UnitQuaternion};
use tracing::{info, error, debug};
use rapier3d::prelude::{RigidBodyBuilder, ColliderBuilder, ActiveCollisionTypes, ActiveEvents, InteractionGroups};

mod dynamic_objects;
mod game_state;
mod level;
mod messages;
mod physics;
mod player;
mod projectiles;
mod spawns;
mod vehicles; // Add vehicles module

use dynamic_objects::DynamicObjectManager;
use game_state::AppState;
use level::Level;
use messages::{ClientMessage, ServerMessage, Position, Rotation, Velocity};
use physics::{PhysicsWorld, PhysicsManager};
use player::PlayerManager;
use spawns::SpawnManager;
use vehicles::VehicleManager;
use projectiles::ProjectileManager;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    // Create level and physics
    let level = Level::create_default_multiplayer_level();
    let mut physics = PhysicsWorld::new();
    
    // Build physics world from level
    info!("Building physics world from level with {} objects", level.objects.len());
    level.build_physics(&mut physics);
    info!("Physics world built with {} bodies and {} colliders", 
        physics.rigid_body_set.len(), 
        physics.collider_set.len());
    
    // Track dynamic platforms from level in dynamic objects manager
    let mut dynamic_objects = DynamicObjectManager::new();
    
    // Initialize spawn manager with level data
    let mut spawn_manager = SpawnManager::new();
    let initial_spawn_messages = spawn_manager.initialize_from_level(&level);
    info!("Initialized {} vehicle spawns and {} weapon spawns from level", 
        spawn_manager.vehicle_spawns.len(), 
        spawn_manager.weapon_spawns.len());
    
    // Spawn the dynamic platform above the water pool as a proper dynamic object
    {
        // Platform position: above water (water is at y=36.5, so put platform at y=44.5)
        let platform_pos = nalgebra::Vector3::new(15.0, 44.5, 0.0);
        let platform_scale = nalgebra::Vector3::new(4.0, 0.5, 4.0);
        
        // Create physics body
        let rigid_body = RigidBodyBuilder::dynamic()
            .translation(platform_pos)
            .linear_damping(1.0)
            .angular_damping(2.0)
            .ccd_enabled(true) // Enable continuous collision detection
            .build();
        
        let body_handle = physics.rigid_body_set.insert(rigid_body);
        
        // Create collider with proper collision settings
        let half_extents = Vector3::new(platform_scale.x / 2.0, platform_scale.y / 2.0, platform_scale.z / 2.0);
        let volume = platform_scale.x * platform_scale.y * platform_scale.z;
        let mass = 5.0;
        
        let collider = ColliderBuilder::cuboid(half_extents.x, half_extents.y, half_extents.z)
            .density(mass / volume)
            .friction(0.8)
            .restitution(0.2)
            // Enable all collision types
            .active_collision_types(ActiveCollisionTypes::all())
            // Enable collision events
            .active_events(ActiveEvents::COLLISION_EVENTS | ActiveEvents::CONTACT_FORCE_EVENTS)
            // Set solver groups to interact with everything
            .solver_groups(InteractionGroups::all())
            // Set collision groups to detect everything  
            .collision_groups(InteractionGroups::all())
            .build();
        
        let collider_handle = physics.collider_set.insert_with_parent(collider, body_handle, &mut physics.rigid_body_set);
        
        // Track as dynamic platform in physics world
        physics.dynamic_platforms.push(body_handle);
        
        // Track in dynamic objects
        let platform_id = "pool_dynamic_platform";
        dynamic_objects.spawn_object(
            platform_id,
            "dynamic_platform".to_string(),
            nalgebra::Vector3::new(platform_pos.x as f64, platform_pos.y as f64, platform_pos.z as f64),
            Some(body_handle),
            Some(collider_handle),
            1.0
        );
        
        info!("Spawned dynamic platform above pool at {:?} with CCD enabled", platform_pos);
    }

    let state = Arc::new(RwLock::new(AppState {
        players: PlayerManager::new(),
        physics: PhysicsManager::new(),
        dynamic_objects,
        vehicles: VehicleManager::new(),
        projectiles: ProjectileManager::new(),
        level,
        spawn_manager,
    }));
    
    // Store initial spawn messages to send to connecting players
    let _initial_spawns = Arc::new(initial_spawn_messages);
    
    // Spawn physics update loop
    let physics_state = state.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_millis(16)); // 60 FPS
        let start_time = std::time::Instant::now();
        let mut frame_count = 0u64;
        let mut last_broadcast_time = std::time::Instant::now();
        let mut last_platform_broadcast = std::time::Instant::now(); // Track platform broadcast time
        let mut initial_spawns_processed = false;
        
        loop {
            interval.tick().await;
            let mut state = physics_state.write().await;
            
            // Process initial spawns on first frame
            if !initial_spawns_processed {
                initial_spawns_processed = true;
                
                // First, collect all the spawn data we need
                let vehicle_spawns: Vec<(String, String, Vector3<f32>, UnitQuaternion<f32>)> = 
                    state.spawn_manager.spawned_vehicles.iter()
                        .filter_map(|(vehicle_id, spawned_item)| {
                            state.spawn_manager.vehicle_spawns.iter()
                                .find(|sp| sp.id == spawned_item.spawn_point_id)
                                .map(|spawn_point| {
                                    let position = Vector3::new(
                                        spawn_point.position.x,
                                        spawn_point.position.y,
                                        spawn_point.position.z
                                    );
                                    let rotation = UnitQuaternion::new_normalize(nalgebra::Quaternion::new(
                                        spawn_point.rotation.w,
                                        spawn_point.rotation.x,
                                        spawn_point.rotation.y,
                                        spawn_point.rotation.z
                                    ));
                                    (
                                        vehicle_id.clone(),
                                        spawn_point.vehicle_type.clone(),
                                        position,
                                        rotation
                                    )
                                })
                        })
                        .collect();
                
                // Process vehicle spawns
                for (vehicle_id, vehicle_type, position, rotation) in vehicle_spawns {
                    // Spawn vehicle in manager with correct position
                    state.vehicles.spawn_vehicle_with_id(
                        vehicle_id.clone(),
                        vehicle_type.clone(),
                        Vector3::new(position.x as f64, position.y as f64, position.z as f64),
                        Some(rotation),
                        None
                    );
                    
                    // Create physics body based on vehicle type
                    let body_handle = match vehicle_type.as_str() {
                        "spaceship" => {
                            let body = RigidBodyBuilder::dynamic()
                                .translation(position)
                                .rotation(rotation.scaled_axis())
                                .linear_damping(0.5)
                                .angular_damping(1.0)
                                .ccd_enabled(true)
                                .build();
                            Some(state.physics.world.rigid_body_set.insert(body))
                        }
                        "helicopter" => {
                            let body = RigidBodyBuilder::dynamic()
                                .translation(position)
                                .rotation(rotation.scaled_axis())
                                .linear_damping(2.0)
                                .angular_damping(2.0)
                                .ccd_enabled(true)
                                .build();
                            Some(state.physics.world.rigid_body_set.insert(body))
                        }
                        "plane" => {
                            let body = RigidBodyBuilder::dynamic()
                                .translation(position)
                                .rotation(rotation.scaled_axis())
                                .linear_damping(0.1)
                                .angular_damping(0.5)
                                .ccd_enabled(true)
                                .build();
                            Some(state.physics.world.rigid_body_set.insert(body))
                        }
                        "car" => {
                            let body = RigidBodyBuilder::dynamic()
                                .translation(position)
                                .rotation(rotation.scaled_axis())
                                .linear_damping(1.0)
                                .angular_damping(2.0)
                                .ccd_enabled(true)
                                .build();
                            Some(state.physics.world.rigid_body_set.insert(body))
                        }
                        _ => None,
                    };
                    
                    // Update vehicle with physics handle
                    if let Some(handle) = body_handle {
                        // Update vehicle with body handle
                        if let Some(mut vehicle) = state.vehicles.vehicles.get_mut(&vehicle_id) {
                            vehicle.body_handle = Some(handle);
                        }
                        
                        // Create and add the collider
                        let collider = match vehicle_type.as_str() {
                            "spaceship" => {
                                ColliderBuilder::cuboid(2.5, 1.0, 4.0)
                                    .density(0.5)
                                    .friction(0.5)
                                    .restitution(0.2)
                                    .build()
                            }
                            "helicopter" => {
                                ColliderBuilder::cuboid(2.0, 1.5, 3.0)
                                    .density(0.3)
                                    .friction(0.5)
                                    .restitution(0.2)
                                    .build()
                            }
                            "plane" => {
                                ColliderBuilder::cuboid(3.0, 0.8, 4.0)
                                    .density(0.4)
                                    .friction(0.3)
                                    .restitution(0.2)
                                    .build()
                            }
                            "car" => {
                                ColliderBuilder::cuboid(1.5, 0.8, 2.0)
                                    .density(0.8)
                                    .friction(0.8)
                                    .restitution(0.3)
                                    .build()
                            }
                            _ => {
                                ColliderBuilder::cuboid(1.0, 1.0, 1.0)
                                    .density(0.5)
                                    .build()
                            }
                        };
                        
                        let physics_world = &mut state.physics.world;
                        let collider_handle = physics_world.collider_set.insert_with_parent(
                            collider,
                            handle,
                            &mut physics_world.rigid_body_set
                        );
                        
                        if let Some(mut vehicle) = state.vehicles.vehicles.get_mut(&vehicle_id) {
                            vehicle.collider_handle = Some(collider_handle);
                        }
                    }
                    
                    // Broadcast vehicle spawn to all connected players
                    let spawn_msg = ServerMessage::VehicleSpawned {
                        vehicle_id: vehicle_id.clone(),
                        vehicle_type: vehicle_type.clone(),
                        position: Position { x: position.x, y: position.y, z: position.z },
                        rotation: Rotation { 
                            x: rotation.i, 
                            y: rotation.j, 
                            z: rotation.k, 
                            w: rotation.w 
                        },
                    };
                    state.players.broadcast_to_all(&spawn_msg).await;
                }
                
                // Broadcast initial weapon spawns
                for (weapon_id, spawned_item) in state.spawn_manager.spawned_weapons.iter() {
                    if !spawned_item.picked_up {
                        if let Some(spawn_point) = state.spawn_manager.weapon_spawns.iter()
                            .find(|sp| sp.id == spawned_item.spawn_point_id) {
                            let weapon_msg = ServerMessage::WeaponSpawn {
                                weapon_id: weapon_id.clone(),
                                weapon_type: spawn_point.weapon_type.clone(),
                                position: spawn_point.position.clone(),
                            };
                            state.players.broadcast_to_all(&weapon_msg).await;
                        }
                    }
                }
                
                info!("Initialized {} vehicles and {} weapons with physics bodies", 
                    state.spawn_manager.spawned_vehicles.len(),
                    state.spawn_manager.spawned_weapons.len());
            }
            
            // Update spawn manager
            state.spawn_manager.update(Duration::from_millis(16));
            
            // Check for respawns
            let players_to_respawn: Vec<(Uuid, Vector3<f32>)> = state.players.iter()
                .filter_map(|entry| {
                    let player = entry.value();
                    if player.is_dead && player.respawn_time.map(|t| std::time::Instant::now() >= t).unwrap_or(false) {
                        // Use a spawn position from spawn manager or default
                        let spawn_pos = state.spawn_manager.get_random_player_spawn()
                            .map(|sp| Vector3::new(sp.position.x, sp.position.y, sp.position.z))
                            .unwrap_or_else(|| Vector3::new(0.0, 80.0, 0.0));
                        Some((*entry.key(), spawn_pos))
                    } else {
                        None
                    }
                })
                .collect();
            
            // Respawn players
            for (player_id, spawn_pos) in players_to_respawn {
                state.players.respawn_player(player_id, spawn_pos);
                
                // Update physics body position
                let body_handle = state.players.get_player(player_id)
                    .and_then(|p| p.body_handle);
                
                if let Some(body_handle) = body_handle {
                    if let Some(body) = state.physics.world.rigid_body_set.get_mut(body_handle) {
                        body.set_translation(spawn_pos, true);
                        body.set_linvel(Vector3::zeros(), true);
                    }
                }
                
                // Broadcast respawn
                if let Some(player) = state.players.get_player(player_id) {
                    let respawn_msg = ServerMessage::PlayerRespawned {
                        player_id: player_id.to_string(),
                        position: Position { x: spawn_pos.x, y: spawn_pos.y, z: spawn_pos.z },
                        health: player.health,
                    };
                    state.players.broadcast_to_all(&respawn_msg).await;
                }
            }
            
            // Check and respawn items/vehicles
            let level = state.level.clone(); // Clone the level to avoid borrow issues
            let spawn_messages = state.spawn_manager.check_respawns(&level);
            for msg in spawn_messages {
                state.players.broadcast_to_all(&msg).await;
            }
            
            // Update moving platforms
            let elapsed = start_time.elapsed().as_secs_f32();
            state.physics.world.update_moving_platforms(elapsed);
            
            // Broadcast moving platform positions every 50ms (20Hz)
            let now = std::time::Instant::now();
            if now.duration_since(last_platform_broadcast) >= Duration::from_millis(50) {
                last_platform_broadcast = now;
                
                // Get platform positions from physics
                for (i, (handle, _initial_x, _properties)) in state.physics.world.moving_platforms.iter().enumerate() {
                    if let Some(body) = state.physics.world.rigid_body_set.get(*handle) {
                        let pos = body.translation();
                        
                        // Broadcast platform position to all players
                        let platform_msg = ServerMessage::PlatformUpdate {
                            platform_id: format!("moving_platform_{}", i),
                            position: Position {
                                x: pos.x,
                                y: pos.y,
                                z: pos.z,
                            },
                        };
                        
                        for player_entry in state.players.iter() {
                            player_entry.value().send_message(&platform_msg).await;
                        }
                    }
                }
            }
            
            // Step physics (this applies gravity to dynamic platforms)
            state.physics.step();
            
            // Log every 60 frames (1 second)
            frame_count += 1;
            if frame_count % 60 == 0 {
                let body_count = state.physics.world.rigid_body_set.len();
                let dynamic_count = state.physics.world.rigid_body_set.iter()
                    .filter(|(_, b)| b.is_dynamic())
                    .count();
                
                // Log a sample dynamic body position
                if let Some(entry) = state.dynamic_objects.iter().next() {
                    let id = entry.key();
                    let obj = entry.value();
                    if let Some(handle) = obj.body_handle {
                        if let Some(body) = state.physics.world.rigid_body_set.get(handle) {
                            let pos = body.translation();
                            let world_pos = obj.get_world_position();
                            debug!("Rock {} - physics: ({:.2}, {:.2}, {:.2}), world: ({:.2}, {:.2}, {:.2})", 
                                id, pos.x, pos.y, pos.z, world_pos.x, world_pos.y, world_pos.z);
                        }
                    }
                }
                
                debug!("Physics update: {} bodies ({} dynamic), gravity at {:?}", 
                    body_count, dynamic_count, state.physics.world.gravity);
            }
            
            // Update dynamic objects from physics
            let updates: Vec<(String, Vector3<f32>, UnitQuaternion<f32>, Vector3<f32>)> = state.dynamic_objects
                .iter()
                .filter_map(|entry| {
                    let obj = entry.value();
                    if let Some(handle) = obj.body_handle {
                        state.physics.get_body_state(handle).map(|(pos, rot, vel)| {
                            (obj.id.clone(), pos, rot, vel)
                        })
                    } else {
                        None
                    }
                })
                .collect();
            
            // Apply updates
            for (id, pos, rot, vel) in updates {
                // Physics position is in world space
                state.dynamic_objects.update_from_physics_world_position(&id, pos, rot, vel);
            }
            
            // Broadcast dynamic object updates more frequently (every 2 frames = 30Hz)
            let now = std::time::Instant::now();
            if now.duration_since(last_broadcast_time) >= Duration::from_millis(33) { // ~30Hz
                last_broadcast_time = now;
                
                let object_updates: Vec<(String, Vector3<f64>, UnitQuaternion<f32>, Vector3<f32>)> = 
                    state.dynamic_objects.iter()
                    .filter_map(|entry| {
                        let obj = entry.value();
                        if obj.body_handle.is_some() {
                            // Get fresh physics state for broadcast
                            if let Some(handle) = obj.body_handle {
                                state.physics.get_body_state(handle).map(|(_pos, rot, vel)| {
                                    let world_pos = obj.get_world_position();
                                    (obj.id.clone(), world_pos, rot, vel)
                                })
                            } else {
                                None
                            }
                        } else {
                            None
                        }
                    })
                    .collect();
                
                for (object_id, world_pos, rotation, velocity) in object_updates {
                    for player_entry in state.players.iter() {
                        let receiver = player_entry.value();
                        let relative_pos = world_pos - receiver.world_origin;
                        
                        let update_msg = ServerMessage::DynamicObjectUpdate {
                            object_id: object_id.clone(),
                            position: Position {
                                x: relative_pos.x as f32,
                                y: relative_pos.y as f32,
                                z: relative_pos.z as f32,
                            },
                            rotation: Rotation {
                                x: rotation.i,
                                y: rotation.j,
                                z: rotation.k,
                                w: rotation.w,
                            },
                            velocity: Velocity {
                                x: velocity.x,
                                y: velocity.y,
                                z: velocity.z,
                            },
                        };
                        
                        receiver.send_message(&update_msg).await;
                    }
                }
            }
            
            // Check vehicle respawns
            let vehicle_respawns = state.vehicles.check_respawns();
            for (vehicle_id, vehicle_type, world_pos) in vehicle_respawns {
                // Create physics body for respawned vehicle
                let body_handle = match vehicle_type.as_str() {
                    "spaceship" => {
                        let body = RigidBodyBuilder::dynamic()
                            .translation(Vector3::new(world_pos.x as f32, world_pos.y as f32, world_pos.z as f32))
                            .linear_damping(0.5)
                            .angular_damping(1.0)
                            .build();
                        Some(state.physics.world.rigid_body_set.insert(body))
                    }
                    "helicopter" => {
                        let body = RigidBodyBuilder::dynamic()
                            .translation(Vector3::new(world_pos.x as f32, world_pos.y as f32, world_pos.z as f32))
                            .linear_damping(2.0)
                            .angular_damping(2.0)
                            .build();
                        Some(state.physics.world.rigid_body_set.insert(body))
                    }
                    "plane" => {
                        let body = RigidBodyBuilder::dynamic()
                            .translation(Vector3::new(world_pos.x as f32, world_pos.y as f32, world_pos.z as f32))
                            .linear_damping(0.1)
                            .angular_damping(0.5)
                            .build();
                        Some(state.physics.world.rigid_body_set.insert(body))
                    }
                    "car" => {
                        let body = RigidBodyBuilder::dynamic()
                            .translation(Vector3::new(world_pos.x as f32, world_pos.y as f32, world_pos.z as f32))
                            .linear_damping(1.0)
                            .angular_damping(2.0)
                            .build();
                        Some(state.physics.world.rigid_body_set.insert(body))
                    }
                    _ => None,
                };
                
                // Update vehicle with physics handle
                if let Some(handle) = body_handle {
                    // Update vehicle with body handle
                    if let Some(mut vehicle) = state.vehicles.vehicles.get_mut(&vehicle_id) {
                        vehicle.body_handle = Some(handle);
                    }
                    
                    // Create and add the collider
                    let collider = match vehicle_type.as_str() {
                        "spaceship" => {
                            ColliderBuilder::cuboid(2.5, 1.0, 4.0)
                                .density(0.5)
                                .friction(0.5)
                                .restitution(0.2)
                                .build()
                        }
                        "helicopter" => {
                            ColliderBuilder::cuboid(2.0, 1.5, 3.0)
                                .density(0.3)
                                .friction(0.5)
                                .restitution(0.2)
                                .build()
                        }
                        "plane" => {
                            ColliderBuilder::cuboid(3.0, 0.8, 4.0)
                                .density(0.4)
                                .friction(0.3)
                                .restitution(0.2)
                                .build()
                        }
                        "car" => {
                            ColliderBuilder::cuboid(1.5, 0.8, 2.0)
                                .density(0.8)
                                .friction(0.8)
                                .restitution(0.3)
                                .build()
                        }
                        _ => {
                            ColliderBuilder::cuboid(1.0, 1.0, 1.0)
                                .density(0.5)
                                .build()
                        }
                    };
                    
                    // Get mutable reference to physics world components
                    let physics_world = &mut state.physics.world;
                    let collider_handle = physics_world.collider_set.insert_with_parent(
                        collider,
                        handle,
                        &mut physics_world.rigid_body_set
                    );
                    
                    // Finally update the vehicle with the collider handle
                    if let Some(mut vehicle) = state.vehicles.vehicles.get_mut(&vehicle_id) {
                        vehicle.collider_handle = Some(collider_handle);
                    }
                }
                
                // Broadcast respawn
                let spawn_msg = ServerMessage::VehicleSpawned {
                    vehicle_id: vehicle_id.clone(),
                    vehicle_type: vehicle_type.clone(),
                    position: Position { x: world_pos.x as f32, y: world_pos.y as f32, z: world_pos.z as f32 },
                    rotation: Rotation { x: 0.0, y: 0.0, z: 0.0, w: 1.0 },
                };
                state.players.broadcast_to_all(&spawn_msg).await;
            }
            
            // Remove expired projectiles
            let expired_projectiles = state.projectiles.remove_expired();
            for proj_id in expired_projectiles {
                // Broadcast removal
                let remove_msg = ServerMessage::ProjectileImpact {
                    projectile_id: proj_id,
                    position: Position { x: 0.0, y: 0.0, z: 0.0 }, // Would need actual position
                    explosion_radius: None,
                    damage: 0.0,
                };
                state.players.broadcast_to_all(&remove_msg).await;
            }
            
            // Update game state (vehicles, projectiles, etc.)
            state.update(0.016); // 60 FPS
            
            // Broadcast vehicle updates
            if frame_count % 2 == 0 { // 30Hz for vehicles
                for entry in state.vehicles.vehicles.iter() {
                    let vehicle = entry.value();
                    
                    // Send to all players with position relative to their origin
                    for player_entry in state.players.iter() {
                        let player = player_entry.value();
                        let world_pos = vehicle.get_world_position();
                        let relative_pos = world_pos - player.world_origin;
                        
                        let update_msg = ServerMessage::VehicleUpdate {
                            vehicle_id: vehicle.id.clone(),
                            position: Position {
                                x: relative_pos.x as f32,
                                y: relative_pos.y as f32,
                                z: relative_pos.z as f32,
                            },
                            rotation: Rotation {
                                x: vehicle.rotation.i,
                                y: vehicle.rotation.j,
                                z: vehicle.rotation.k,
                                w: vehicle.rotation.w,
                            },
                            velocity: Velocity {
                                x: vehicle.velocity.x,
                                y: vehicle.velocity.y,
                                z: vehicle.velocity.z,
                            },
                            angular_velocity: Velocity {
                                x: vehicle.angular_velocity.x,
                                y: vehicle.angular_velocity.y,
                                z: vehicle.angular_velocity.z,
                            },
                            health: vehicle.health,
                            pilot_id: vehicle.pilot_id.map(|id| id.to_string()),
                        };
                        
                        player.send_message(&update_msg).await;
                    }
                }
            }
            
            // Broadcast projectile updates
            if frame_count % 2 == 0 { // 30Hz for projectiles
                for entry in state.projectiles.projectiles.iter() {
                    let proj = entry.value();
                    
                    let update_msg = ServerMessage::ProjectileUpdate {
                        projectile_id: proj.id.clone(),
                        position: Position {
                            x: proj.position.x,
                            y: proj.position.y,
                            z: proj.position.z,
                        },
                        velocity: Velocity {
                            x: proj.velocity.x,
                            y: proj.velocity.y,
                            z: proj.velocity.z,
                        },
                        rotation: Rotation {
                            x: proj.rotation.i,
                            y: proj.rotation.j,
                            z: proj.rotation.k,
                            w: proj.rotation.w,
                        },
                    };
                    
                    state.players.broadcast_to_all(&update_msg).await;
                }
            }
            
            // Log every 60 frames (1 second)
            frame_count += 1;
            if frame_count % 60 == 0 {
                let body_count = state.physics.world.rigid_body_set.len();
                let dynamic_count = state.physics.world.rigid_body_set.iter()
                    .filter(|(_, b)| b.is_dynamic())
                    .count();
                
                // Log a sample dynamic body position
                if let Some(entry) = state.dynamic_objects.iter().next() {
                    let id = entry.key();
                    let obj = entry.value();
                    if let Some(handle) = obj.body_handle {
                        if let Some(body) = state.physics.world.rigid_body_set.get(handle) {
                            let pos = body.translation();
                            let world_pos = obj.get_world_position();
                            debug!("Rock {} - physics: ({:.2}, {:.2}, {:.2}), world: ({:.2}, {:.2}, {:.2})", 
                                id, pos.x, pos.y, pos.z, world_pos.x, world_pos.y, world_pos.z);
                        }
                    }
                }
                
                debug!("Physics update: {} bodies ({} dynamic), gravity at {:?}", 
                    body_count, dynamic_count, state.physics.world.gravity);
            }
        }
    });

    let app = Router::new()
        .route("/ws", get(websocket_handler))
        .layer(CorsLayer::permissive())
        .with_state(state);

    // Get port from environment variable or use default
    let port = std::env::var("PORT")
        .unwrap_or_else(|_| "8080".to_string())
        .parse::<u16>()
        .expect("PORT must be a number");
    
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!("Server listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn websocket_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<RwLock<AppState>>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: Arc<RwLock<AppState>>) {
    let player_id = Uuid::new_v4();
    let (sender, mut receiver) = socket.split();

    // Spawn position: platform is at y=30 with height 3, so top is at y=31.5
    // Spawn player at y=80 to be ~48.5 units above platform top (much higher spawn)
    let spawn_position = nalgebra::Vector3::new(0.0, 80.0, 0.0);

    // Create a channel for the player
    let (tx, mut rx) = mpsc::unbounded_channel();
    
    // Spawn task to handle outgoing messages for this player
    let send_task = tokio::spawn(async move {
        let mut sender = sender;
        while let Some(msg) = rx.recv().await {
            if sender.send(msg).await.is_err() {
                break; // Connection closed
            }
        }
        let _ = sender.close().await;
    });

    // Send player their ID and spawn position
    let welcome_msg = ServerMessage::Welcome { 
        player_id: player_id.to_string(),
        spawn_position: Position {
            x: spawn_position.x,
            y: spawn_position.y,
            z: spawn_position.z,
        }
    };
    
    // Send welcome message through channel
    if tx.send(Message::Text(serde_json::to_string(&welcome_msg).unwrap())).is_err() {
        error!("Failed to send welcome message to {}", player_id);
        return;
    }

    // Add player to game with physics
    {
        let mut state_write = state.write().await;
        
        // Create physics body for player
        let body_handle = state_write.physics.create_player_body(spawn_position);
        let collider_handle = state_write.physics.create_player_collider(body_handle);
        
        // Add player with physics handles
        state_write.players.add_player(player_id, spawn_position, tx.clone());
        
        // Update player with physics handles
        if let Some(mut player) = state_write.players.get_player_mut(player_id) {
            player.body_handle = Some(body_handle);
            player.collider_handle = Some(collider_handle);
        }

        // Send level data to new player (only in multiplayer)
        let level_msg = ServerMessage::LevelData {
            objects: state_write.level.objects.clone(),
        };
        if tx.send(Message::Text(serde_json::to_string(&level_msg).unwrap())).is_err() {
            error!("Failed to send level data to {}", player_id);
        }
        
        // Send existing vehicles to new player
        for entry in state_write.vehicles.vehicles.iter() {
            let vehicle = entry.value();
            let world_pos = vehicle.get_world_position();
            
            // Check if this is an initial spawn that needs position from spawn manager
            let actual_position = if world_pos.x == 0.0 && world_pos.y == 0.0 && world_pos.z == 0.0 {
                // Find the spawn point for this vehicle
                state_write.spawn_manager.spawned_vehicles.iter()
                    .find(|(id, _)| **id == vehicle.id)
                    .and_then(|(_, spawned_item)| {
                        state_write.spawn_manager.vehicle_spawns.iter()
                            .find(|sp| sp.id == spawned_item.spawn_point_id)
                            .map(|sp| Position {
                                x: sp.position.x,
                                y: sp.position.y,
                                z: sp.position.z,
                            })
                    })
                    .unwrap_or(Position {
                        x: world_pos.x as f32,
                        y: world_pos.y as f32,
                        z: world_pos.z as f32,
                    })
            } else {
                Position {
                    x: world_pos.x as f32,
                    y: world_pos.y as f32,
                    z: world_pos.z as f32,
                }
            };
            
            let spawn_msg = ServerMessage::VehicleSpawned {
                vehicle_id: vehicle.id.clone(),
                vehicle_type: vehicle.vehicle_type.clone(),
                position: actual_position,
                rotation: Rotation {
                    x: vehicle.rotation.i,
                    y: vehicle.rotation.j,
                    z: vehicle.rotation.k,
                    w: vehicle.rotation.w,
                },
            };
            if tx.send(Message::Text(serde_json::to_string(&spawn_msg).unwrap())).is_err() {
                error!("Failed to send vehicle spawn to {}", player_id);
            }
        }
        
        // Send existing weapon spawns to new player
        for (weapon_id, spawned_item) in state_write.spawn_manager.spawned_weapons.iter() {
            if !spawned_item.picked_up {
                if let Some(spawn_point) = state_write.spawn_manager.weapon_spawns.iter()
                    .find(|sp| sp.id == spawned_item.spawn_point_id) {
                    let weapon_msg = ServerMessage::WeaponSpawn {
                        weapon_id: weapon_id.clone(),
                        weapon_type: spawn_point.weapon_type.clone(),
                        position: spawn_point.position.clone(),
                    };
                    if tx.send(Message::Text(serde_json::to_string(&weapon_msg).unwrap())).is_err() {
                        error!("Failed to send weapon spawn to {}", player_id);
                    }
                }
            }
        }
        
        // Send existing players to new player
        let players_list = state_write.players.get_all_players_except(player_id);
        let list_msg = ServerMessage::PlayersList { players: players_list };
        
        if tx.send(Message::Text(serde_json::to_string(&list_msg).unwrap())).is_err() {
            error!("Failed to send players list to {}", player_id);
        }

        // Send existing dynamic objects to new player
        if let Some(player) = state_write.players.get_player(player_id) {
            let objects = state_write.dynamic_objects.get_all_objects_relative_to(&player.world_origin);
            if !objects.is_empty() {
                // Filter out level dynamic platforms from the list since they're already in level data
                let filtered_objects: Vec<_> = objects.into_iter()
                    .filter(|obj| !obj.id.starts_with("level_dynamic_platform_"))
                    .collect();
                
                if !filtered_objects.is_empty() {
                    let objects_msg = ServerMessage::DynamicObjectsList { objects: filtered_objects };
                    if tx.send(Message::Text(serde_json::to_string(&objects_msg).unwrap())).is_err() {
                        error!("Failed to send dynamic objects list to {}", player_id);
                    }
                }
            }
        }

        // Spawn a rock for this player joining
        let rock_spawn_pos = nalgebra::Vector3::new(
            spawn_position.x as f64 + (-10.0 + rand::random::<f64>() * 20.0),
            spawn_position.y as f64 + 20.0, // Spawn 20 units above player spawn (at y=100)
            spawn_position.z as f64 + (-10.0 + rand::random::<f64>() * 20.0),
        );
        
        info!("Spawning rock at world position: ({:.2}, {:.2}, {:.2})", 
            rock_spawn_pos.x, rock_spawn_pos.y, rock_spawn_pos.z);
        
        // Create physics body for the rock at the actual world position
        let rock_physics_pos = Vector3::new(
            rock_spawn_pos.x as f32,
            rock_spawn_pos.y as f32,
            rock_spawn_pos.z as f32
        );
        
        // Create rotation with some randomness
        let rotation = UnitQuaternion::from_euler_angles(
            rand::random::<f32>() * std::f32::consts::PI * 2.0,
            rand::random::<f32>() * std::f32::consts::PI * 2.0,
            rand::random::<f32>() * std::f32::consts::PI * 2.0
        );
        
        // Create rock body with proper physics settings
        let rock_body = RigidBodyBuilder::dynamic()
            .translation(rock_physics_pos)
            .rotation(rotation.scaled_axis())
            .linear_damping(0.5) // Less damping for better physics
            .angular_damping(1.0)
            .ccd_enabled(true)
            .can_sleep(true) // Allow sleeping
            .build();

        let body_handle = state_write.physics.world.rigid_body_set.insert(rock_body);
        let scale = 0.8 + rand::random::<f32>() * 0.4;
        
        // Create collider with proper mass
        let rock_density = 0.5; // Heavier rocks for better physics
        let collider_handle = state_write.physics.create_ball_collider(body_handle, 2.0 * scale, rock_density);
        
        // Log the creation
        info!("Created rock physics body at {:?} with handle {:?} and scale {}", rock_physics_pos, body_handle, scale);
        
        // Store rock with its actual world position
        let rock_id = state_write.dynamic_objects.spawn_rock_with_physics(
            rock_spawn_pos, // Use the actual spawn position as world origin
            body_handle, 
            collider_handle,
            scale // Pass the scale to the spawn method
        );
        
        // Broadcast rock spawn to all players
        for entry in state_write.players.iter() {
            let receiver = entry.value();
            if let Some(spawn_msg) = state_write.dynamic_objects.get_spawn_message(&rock_id, &receiver.world_origin) {
                receiver.send_message(&spawn_msg).await;
            }
        }

        // Remove the dynamic platform spawn here - it's already in the level data
        // The duplicate platform was being created here

        // Broadcast new player to others
        let join_msg = ServerMessage::PlayerJoined {
            player_id: player_id.to_string(),
            position: Position { x: spawn_position.x, y: spawn_position.y, z: spawn_position.z },
        };
        state_write.players.broadcast_except(player_id, &join_msg).await;
    }

    info!("Player {} connected", player_id);

    // Handle incoming messages
    while let Some(msg) = receiver.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                match serde_json::from_str::<ClientMessage>(&text) {
                    Ok(client_msg) => {
                        if let Err(e) = handle_client_message(
                            Arc::clone(&state),
                            player_id,
                            client_msg,
                        ).await {
                            eprintln!("Error handling client message: {}", e);
                        }
                    }
                    Err(e) => {
                        eprintln!("Failed to parse client message: {}", e);
                    }
                }
            }
            Ok(Message::Close(_)) => {
                info!("Player {} sent close message", player_id);
                break;
            }
            Err(e) => {
                error!("WebSocket error for player {}: {}", player_id, e);
                break;
            }
            _ => {}
        }
    }

    // Clean up when player disconnects
    {
        let mut state_write = state.write().await;
        
        // Release all objects grabbed by this player
        state_write.dynamic_objects.force_release_all_by_player(player_id);
        
        // Extract physics handles before removing player
        let (body_handle, collider_handle) = if let Some(player) = state_write.players.get_player(player_id) {
            (player.body_handle, player.collider_handle)
        } else {
            (None, None)
        };
        
        // Now remove physics body if exists
        if let (Some(body_handle), Some(_collider_handle)) = (body_handle, collider_handle) {
            // Get mutable references to all physics components we need
            let physics = &mut state_write.physics;
            physics.world.rigid_body_set.remove(
                body_handle,
                &mut physics.world.island_manager,
                &mut physics.world.collider_set,
                &mut physics.world.impulse_joint_set,
                &mut physics.world.multibody_joint_set,
                true
            );
        }
        
        state_write.players.remove_player(player_id);
        
        // Remove any dynamic objects owned by this player (if applicable)
        // For now, we keep rocks in the world
        
        // Broadcast player left
        let leave_msg = ServerMessage::PlayerLeft {
            player_id: player_id.to_string(),
        };
        state_write.players.broadcast_to_all(&leave_msg).await;
    }

    // Cancel the sender task
    send_task.abort();

    info!("Player {} disconnected", player_id);
}

async fn handle_client_message(
    state: Arc<RwLock<AppState>>,
    player_id: Uuid,
    msg: ClientMessage,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    match msg {
        ClientMessage::PlayerUpdate { position, rotation, velocity, is_grounded, is_swimming: _ } => {
            // Clone values for the async block
            let pos_clone = position.clone();
            let rot_clone = rotation.clone();
            let vel_clone = velocity.clone();
            
            // Update player state and physics body
            let (player_is_swimming, player_is_grounded, _player_world_origin) = {
                let mut state_write = state.write().await;
                
                // First, extract all needed data from player
                let player_data = {
                    if let Some(mut player) = state_write.players.get_player_mut(player_id) {
                        // Update player state
                        player.position = nalgebra::Vector3::new(pos_clone.x, pos_clone.y, pos_clone.z);
                        player.rotation = nalgebra::UnitQuaternion::new_normalize(
                            nalgebra::Quaternion::new(rot_clone.w, rot_clone.x, rot_clone.y, rot_clone.z)
                        );
                        player.velocity = nalgebra::Vector3::new(vel_clone.x, vel_clone.y, vel_clone.z);
                        player.is_grounded = is_grounded;
                        
                        let body_handle = player.body_handle;
                        let world_pos = nalgebra::Vector3::new(
                            pos_clone.x + player.world_origin.x as f32,
                            pos_clone.y + player.world_origin.y as f32,
                            pos_clone.z + player.world_origin.z as f32,
                        );
                        let player_velocity = nalgebra::Vector3::new(vel_clone.x, vel_clone.y, vel_clone.z);
                        let world_origin = player.world_origin.clone();
                        
                        Some((body_handle, world_pos, player_velocity, world_origin))
                    } else {
                        None
                    }
                };
                
                // Check if we got player data
                let (body_handle, world_pos, player_velocity, world_origin) = match player_data {
                    Some(data) => data,
                    None => {
                        error!("Player {} not found for update", player_id);
                        return Ok(());
                    }
                };
                
                // Check swimming state based on physics world position
                let actual_swimming = state_write.physics.world.is_position_in_water(&world_pos);
                
                // Update player swimming state with physics check
                if let Some(mut player) = state_write.players.get_player_mut(player_id) {
                    player.is_swimming = actual_swimming;
                }
                
                // Now update physics body if we have a handle
                if let Some(body_handle) = body_handle {
                    if let Some(body) = state_write.physics.world.rigid_body_set.get_mut(body_handle) {
                        body.set_translation(world_pos, true);
                        body.set_linvel(player_velocity, true);
                        
                        let rotation = UnitQuaternion::new_normalize(nalgebra::Quaternion::new(
                            rot_clone.w, rot_clone.x, rot_clone.y, rot_clone.z
                        ));
                        body.set_rotation(rotation, true);
                    }
                }
                
                // Return the actual states based on physics
                (actual_swimming, is_grounded, world_origin)
            };
            
            // Broadcast player state to all other players with complete state
            let update_msg = ServerMessage::PlayerState {
                player_id: player_id.to_string(),
                position,
                rotation,
                velocity,
                is_grounded: player_is_grounded,
                is_swimming: player_is_swimming, // Use server-verified swimming state
            };
            
            let state_read = state.read().await;
            state_read.players.broadcast_except(player_id, &update_msg).await;
        }
        
        ClientMessage::PushObject { object_id, force, point } => {
            // First check if object exists
            let object_exists = {
                let state_read = state.read().await;
                state_read.dynamic_objects.objects.contains_key(&object_id)
            };
            
            if !object_exists {
                println!("Player {} tried to push non-existent object {}", player_id, object_id);
                return Ok(());
            }
            
            // Check if player already owns the object
            let is_owner = {
                let state_read = state.read().await;
                state_read.dynamic_objects.check_ownership(&object_id, player_id)
            };
            
            // Apply the force
            let mut state_write = state.write().await;
            
            if !is_owner {
                // Grant ownership for 5 seconds
                state_write.dynamic_objects.grant_ownership(&object_id, player_id, Duration::from_secs(5));
                
                // Send ownership message
                if let Some(player) = state_write.players.get_player(player_id) {
                    let ownership_msg = ServerMessage::ObjectOwnershipGranted {
                        object_id: object_id.clone(),
                        player_id: player_id.to_string(),
                        duration_ms: 5000,
                    };
                    player.send_message(&ownership_msg).await;
                }
            }
            
            // Extract body handle first to avoid borrow issues
            let body_handle = state_write.dynamic_objects.objects.get(&object_id)
                .and_then(|obj| obj.body_handle);
            
            // Now apply force with the extracted handle
            if let Some(body_handle) = body_handle {
                // Wake the body first
                state_write.physics.world.wake_body(body_handle);
                
                if let Some(body) = state_write.physics.world.rigid_body_set.get_mut(body_handle) {
                    // Scale force based on mass for consistent behavior
                    let mass = body.mass();
                    let force_scale = 50.0; // Adjust this for desired push strength
                    let scaled_force = Vector3::new(
                        force.x * force_scale * mass,
                        force.y * force_scale * mass,
                        force.z * force_scale * mass
                    );
                    
                    let point_vec = nalgebra::Point3::new(point.x, point.y, point.z);
                    
                    // Apply the force
                    body.add_force_at_point(scaled_force, point_vec, true);
                    
                    // Also apply a small upward impulse to help with lifting
                    if force.y > 0.1 {
                        let lift_impulse = Vector3::new(0.0, force.y * 10.0 * mass, 0.0);
                        body.apply_impulse(lift_impulse, true);
                    }
                    
                    println!("Applied force to object {}: {:?} (mass: {})", object_id, scaled_force, mass);
                }
            }
        }
        
        ClientMessage::EnterVehicle { vehicle_id } => {
            // Update player state
            let state_write = state.write().await;
            if let Some(mut player) = state_write.players.get_player_mut(player_id) {
                player.current_vehicle_id = Some(vehicle_id.clone());
                info!("Player {} entered vehicle {}", player_id, vehicle_id);
            }
            
            // Broadcast to other players
            let enter_msg = ServerMessage::PlayerEnteredVehicle {
                player_id: player_id.to_string(),
                vehicle_id: vehicle_id,
            };
            state_write.players.broadcast_except(player_id, &enter_msg).await;
        }
        
        ClientMessage::ExitVehicle { exit_position } => {
            // Get vehicle ID and calculate exit position
            let (vehicle_id, actual_exit_pos) = {
                let state_read = state.read().await;
                let data = if let Some(player) = state_read.players.get_player(player_id) {
                    if let Some(vid) = &player.current_vehicle_id {
                        let exit_pos = if let Some(pos) = exit_position {
                            nalgebra::Vector3::new(pos.x, pos.y, pos.z)
                        } else {
                            nalgebra::Vector3::new(0.0, 0.0, 0.0)
                        };
                        (Some(vid.clone()), exit_pos)
                    } else {
                        (None, nalgebra::Vector3::new(0.0, 0.0, 0.0))
                    }
                } else {
                    (None, nalgebra::Vector3::new(0.0, 0.0, 0.0))
                };
                data
            };
            
            if let Some(vehicle_id) = vehicle_id {
                // Update player state
                let mut state_write = state.write().await;
                
                // Extract body handle first
                let body_handle = if let Some(player) = state_write.players.get_player(player_id) {
                    player.body_handle
                } else {
                    None
                };
                
                // Update player
                if let Some(mut player) = state_write.players.get_player_mut(player_id) {
                    player.current_vehicle_id = None;
                    
                    info!("Player {} exited vehicle {} at position {:?}", player_id, vehicle_id, actual_exit_pos);
                }
                
                // Update player physics body position to exit position
                if let Some(body_handle) = body_handle {
                    if let Some(body) = state_write.physics.world.rigid_body_set.get_mut(body_handle) {
                        body.set_translation(actual_exit_pos, true);
                        body.set_linvel(Vector3::zeros(), true); // Stop player movement
                    }
                }
                
                // Broadcast to other players
                let exit_msg = ServerMessage::PlayerExitedVehicle {
                    player_id: player_id.to_string(),
                    vehicle_id: vehicle_id,
                    exit_position: Position {
                        x: actual_exit_pos.x,
                        y: actual_exit_pos.y,
                        z: actual_exit_pos.z,
                    },
                };
                state_write.players.broadcast_except(player_id, &exit_msg).await;
            }
        }
        
        ClientMessage::FireWeapon { weapon_type, origin, direction, hit_point: _, hit_player_id, hit_object_id: _ } => {
            let mut state_write = state.write().await;
            
            // Verify player is alive
            if let Some(player) = state_write.players.get_player(player_id) {
                if player.is_dead {
                    return Ok(());
                }
            }
            
            // Get weapon damage
            let damage = match weapon_type.as_str() {
                "pistol" => 25.0,
                "rifle" => 35.0,
                "shotgun" => 80.0,
                "sniper" => 120.0,
                "grenadeLauncher" => 150.0,
                "rocketLauncher" => 200.0,
                _ => 10.0,
            };
            
            // Handle hit on player
            if let Some(hit_player_id_str) = hit_player_id {
                if let Ok(hit_player_uuid) = Uuid::parse_str(&hit_player_id_str) {
                    // Don't allow self-damage from direct hits (explosions can still self-damage)
                    if hit_player_uuid != player_id {
                        let player_died = state_write.players.damage_player(hit_player_uuid, damage, "weapon", Some(player_id));
                        
                        // Get updated health
                        if let Some(hit_player) = state_write.players.get_player(hit_player_uuid) {
                            // Send damage notification
                            let damage_msg = ServerMessage::PlayerDamaged {
                                player_id: hit_player_id_str.clone(),
                                damage,
                                damage_type: Some(weapon_type.clone()),
                                attacker_id: Some(player_id.to_string()),
                                health: hit_player.health,
                                armor: hit_player.armor,
                            };
                            state_write.players.broadcast_to_all(&damage_msg).await;
                            
                            // Handle kill
                            if player_died {
                                let kill_msg = ServerMessage::PlayerKilled {
                                    player_id: hit_player_id_str,
                                    killer_id: Some(player_id.to_string()),
                                    weapon_type: Some(weapon_type.clone()),
                                };
                                state_write.players.broadcast_to_all(&kill_msg).await;
                            }
                        }
                    }
                }
            }
            
            // Broadcast weapon fire (for visual/audio effects)
            let fire_msg = ServerMessage::WeaponFire {
                player_id: player_id.to_string(),
                weapon_type,
                origin,
                direction,
                projectile_id: None, // For hitscan weapons
            };
            state_write.players.broadcast_except(player_id, &fire_msg).await;
        }
        
        ClientMessage::PickupItem { item_id } => {
            let mut state_write = state.write().await;
            
            // Check if player can pickup (alive, close enough, etc.)
            let player_is_dead = state_write.players.get_player(player_id)
                .map(|p| p.is_dead)
                .unwrap_or(true);
            
            if player_is_dead {
                return Ok(());
            }
            
            // Handle pickup through spawn manager
            if state_write.spawn_manager.pickup_item(&item_id, player_id) {
                // Apply item effects
                if item_id.contains("health") {
                    state_write.players.heal_player(player_id, 50.0);
                } else if item_id.contains("armor") {
                    state_write.players.add_armor(player_id, 50.0);
                }
                
                // Broadcast pickup
                let pickup_msg = ServerMessage::ItemPickedUp {
                    item_id,
                    player_id: player_id.to_string(),
                };
                state_write.players.broadcast_to_all(&pickup_msg).await;
                
                // Send updated health
                if let Some(player) = state_write.players.get_player(player_id) {
                    let health_msg = ServerMessage::PlayerHealth {
                        player_id: player_id.to_string(),
                        health: player.health,
                        armor: player.armor,
                    };
                    player.send_message(&health_msg).await;
                }
            }
        }
        
        ClientMessage::RequestRespawn => {
            let player_respawn_allowed = {
                let state_read = state.read().await;
                state_read.players.get_player(player_id)
                    .map(|p| p.is_dead && p.respawn_time.is_none())
                    .unwrap_or(false)
            };
            
            if player_respawn_allowed {
                let state_write = state.write().await;
                // Access the players field directly to avoid lifetime issues
                if let Some((_, mut player)) = state_write.players.players.remove(&player_id) {
                    player.respawn_time = Some(std::time::Instant::now());
                    state_write.players.players.insert(player_id, player);
                }
            }
        }

        ClientMessage::GrabObject { object_id, grab_point } => {
            let mut state_write = state.write().await;
            
            // Check if object exists and is grabbable
            let object_exists = state_write.dynamic_objects.objects.contains_key(&object_id);
            
            if !object_exists {
                // Send grab failed message
                if let Some(player) = state_write.players.get_player(player_id) {
                    let fail_msg = ServerMessage::GrabFailed {
                        object_id: object_id.clone(),
                        reason: "Object not found".to_string(),
                    };
                    player.send_message(&fail_msg).await;
                }
                return Ok(());
            }
            
            // Check if player is close enough (would need player position)
            let grab_offset = Vector3::new(grab_point.x, grab_point.y, grab_point.z);
            
            if state_write.dynamic_objects.grab_object(&object_id, player_id, grab_offset) {
                // Extract body handle first to avoid borrow issues
                let body_handle = state_write.dynamic_objects.objects.get(&object_id)
                    .and_then(|obj| obj.body_handle);
                
                // Convert physics body to kinematic
                if let Some(body_handle) = body_handle {
                    if let Some(body) = state_write.physics.world.rigid_body_set.get_mut(body_handle) {
                        body.set_body_type(rapier3d::dynamics::RigidBodyType::KinematicPositionBased, true);
                    }
                }
                
                // Grant temporary ownership
                state_write.dynamic_objects.grant_ownership(&object_id, player_id, Duration::from_secs(30));
                
                // Broadcast grab message
                let grab_msg = ServerMessage::ObjectGrabbed {
                    object_id: object_id.clone(),
                    player_id: player_id.to_string(),
                    grab_offset: grab_point,
                };
                state_write.players.broadcast_to_all(&grab_msg).await;
                
                println!("Player {} grabbed object {}", player_id, object_id);
            } else {
                // Send grab failed message
                if let Some(player) = state_write.players.get_player(player_id) {
                    let fail_msg = ServerMessage::GrabFailed {
                        object_id: object_id.clone(),
                        reason: "Object already grabbed or not grabbable".to_string(),
                    };
                    player.send_message(&fail_msg).await;
                }
            }
        }
        
        ClientMessage::MoveGrabbedObject { object_id, target_position } => {
            let mut state_write = state.write().await;
            
            let target_pos = Vector3::new(target_position.x, target_position.y, target_position.z);
            
            if state_write.dynamic_objects.move_grabbed_object(&object_id, player_id, target_pos) {
                // Extract body handle first to avoid borrow issues
                let body_handle = state_write.dynamic_objects.objects.get(&object_id)
                    .and_then(|obj| obj.body_handle);
                
                // Update physics body position
                if let Some(body_handle) = body_handle {
                    if let Some(body) = state_write.physics.world.rigid_body_set.get_mut(body_handle) {
                        body.set_next_kinematic_translation(target_pos);
                    }
                }
                
                // Broadcast object moved message
                let moved_msg = ServerMessage::ObjectMoved {
                    object_id: object_id.clone(),
                    position: Position {
                        x: target_pos.x,
                        y: target_pos.y,
                        z: target_pos.z,
                    },
                    rotation: Rotation { x: 0.0, y: 0.0, z: 0.0, w: 1.0 }, // Would need actual rotation
                };
                state_write.players.broadcast_except(player_id, &moved_msg).await;
            }
        }
        
        ClientMessage::ThrowObject { object_id, throw_force, release_point } => {
            let mut state_write = state.write().await;
            
            if state_write.dynamic_objects.release_object(&object_id, player_id) {
                // Extract body handle and object info first
                let (body_handle, throw_velocity) = {
                    let obj = state_write.dynamic_objects.objects.get(&object_id);
                    let handle = obj.and_then(|o| o.body_handle);
                    let velocity = Vector3::new(throw_force.x, throw_force.y, throw_force.z);
                    (handle, velocity)
                };
                
                // Convert back to dynamic physics body
                if let Some(body_handle) = body_handle {
                    if let Some(body) = state_write.physics.world.rigid_body_set.get_mut(body_handle) {
                        body.set_body_type(rapier3d::dynamics::RigidBodyType::Dynamic, true);
                        body.set_linvel(throw_velocity, true);
                        
                        // Add some angular velocity for realistic throwing
                        let angular_vel = Vector3::new(
                            (rand::random::<f32>() - 0.5) * 5.0,
                            (rand::random::<f32>() - 0.5) * 5.0,
                            (rand::random::<f32>() - 0.5) * 5.0,
                        );
                        body.set_angvel(angular_vel, true);
                    }
                }
                
                // Broadcast throw message
                let throw_msg = ServerMessage::ObjectThrown {
                    object_id: object_id.clone(),
                    player_id: player_id.to_string(),
                    position: release_point,
                    velocity: throw_force.clone(),
                    angular_velocity: Velocity { 
                        x: (rand::random::<f32>() - 0.5) * 10.0,
                        y: (rand::random::<f32>() - 0.5) * 10.0,
                        z: (rand::random::<f32>() - 0.5) * 10.0,
                    },
                };
                state_write.players.broadcast_to_all(&throw_msg).await;
                
                println!("Player {} threw object {} with force {:?}", player_id, object_id, throw_force);
            }
        }
        
        ClientMessage::ReleaseObject { object_id } => {
            let mut state_write = state.write().await;
            
            if state_write.dynamic_objects.release_object(&object_id, player_id) {
                // Extract body handle first
                let body_handle = state_write.dynamic_objects.objects.get(&object_id)
                    .and_then(|obj| obj.body_handle);
                
                // Convert back to dynamic physics body
                if let Some(body_handle) = body_handle {
                    if let Some(body) = state_write.physics.world.rigid_body_set.get_mut(body_handle) {
                        body.set_body_type(rapier3d::dynamics::RigidBodyType::Dynamic, true);
                    }
                }
                
                // Broadcast release message
                let release_msg = ServerMessage::ObjectReleased {
                    object_id: object_id.clone(),
                    player_id: player_id.to_string(),
                    position: Position { x: 0.0, y: 0.0, z: 0.0 }, // Would need actual position
                    velocity: None,
                };
                state_write.players.broadcast_to_all(&release_msg).await;
                
                println!("Player {} released object {}", player_id, object_id);
            }
        }
        
        // Handle other message types
        _ => {
            debug!("Unhandled message type: {:?}", msg);
        }
    }
    
    Ok(())
}
