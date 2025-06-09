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
use rapier3d::prelude::{RigidBodyBuilder, ColliderBuilder};

mod dynamic_objects;
mod game_state;
mod level;
mod messages;
mod physics;
mod player;
mod projectiles;

use dynamic_objects::DynamicObjectManager;
use game_state::AppState;
use level::Level;
use messages::{ClientMessage, ServerMessage, Position, Rotation, Velocity};
use physics::PhysicsWorld;
use player::PlayerManager;
use projectiles::{Projectile, ProjectileManager};

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
            .build();
        
        let body_handle = physics.rigid_body_set.insert(rigid_body);
        
        // Create collider
        let half_extents = Vector3::new(platform_scale.x / 2.0, platform_scale.y / 2.0, platform_scale.z / 2.0);
        let volume = platform_scale.x * platform_scale.y * platform_scale.z;
        let mass = 5.0;
        
        let collider = ColliderBuilder::cuboid(half_extents.x, half_extents.y, half_extents.z)
            .density(mass / volume)
            .friction(0.8)
            .restitution(0.2)
            .build();
            
        let collider_handle = physics.collider_set.insert_with_parent(collider, body_handle, &mut physics.rigid_body_set);
        
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
        
        info!("Spawned dynamic platform above pool at {:?}", platform_pos);
    }

    let state = Arc::new(RwLock::new(AppState {
        players: PlayerManager::new(),
        physics,
        dynamic_objects,
        level,
        projectiles: Arc::new(ProjectileManager::new()),
    }));

    // Spawn physics update loop
    let physics_state = state.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_millis(16)); // 60 FPS
        let start_time = std::time::Instant::now();
        let mut frame_count = 0u64;
        let mut last_broadcast_time = std::time::Instant::now();
        let mut last_cleanup_time = std::time::Instant::now(); // Track cleanup time
        let mut last_platform_broadcast = std::time::Instant::now(); // Track platform broadcast time
        
        loop {
            interval.tick().await;
            let mut state = physics_state.write().await;
            
            // Check ownership expiry
            state.dynamic_objects.update_ownership_expiry();
            
            // Check for expired objects every 10 seconds
            let now = std::time::Instant::now();
            if now.duration_since(last_cleanup_time) >= Duration::from_secs(10) {
                last_cleanup_time = now;
                
                // Remove objects older than 3 minutes
                let expired = state.dynamic_objects.remove_expired_objects(Duration::from_secs(180));
                
                for (object_id, body_handle, collider_handle) in expired {
                    // Remove from physics world
                    if let (Some(body), Some(_collider)) = (body_handle, collider_handle) {
                        // Extract mutable references to all components first
                        let physics = &mut state.physics;
                        physics.rigid_body_set.remove(
                            body,
                            &mut physics.island_manager,
                            &mut physics.collider_set,
                            &mut physics.impulse_joint_set,
                            &mut physics.multibody_joint_set,
                            true,
                        );
                    }
                    
                    info!("Removed expired rock: {}", object_id);
                    
                    // Broadcast removal to all players
                    let remove_msg = ServerMessage::DynamicObjectRemove {
                        object_id: object_id.clone(),
                    };
                    
                    for player_entry in state.players.iter() {
                        player_entry.value().send_message(&remove_msg).await;
                    }
                }
            }
            
            // Update moving platforms
            let elapsed = start_time.elapsed().as_secs_f32();
            state.physics.update_moving_platforms(elapsed);
            
            // Broadcast moving platform positions every 50ms (20Hz)
            let now = std::time::Instant::now();
            if now.duration_since(last_platform_broadcast) >= Duration::from_millis(50) {
                last_platform_broadcast = now;
                
                // Get platform positions from physics
                for (i, (handle, _initial_x, _properties)) in state.physics.moving_platforms.iter().enumerate() {
                    if let Some(body) = state.physics.rigid_body_set.get(*handle) {
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
                let body_count = state.physics.rigid_body_set.len();
                let dynamic_count = state.physics.rigid_body_set.iter()
                    .filter(|(_, b)| b.is_dynamic())
                    .count();
                
                // Log a sample dynamic body position
                if let Some(entry) = state.dynamic_objects.iter().next() {
                    let id = entry.key();
                    let obj = entry.value();
                    if let Some(handle) = obj.body_handle {
                        if let Some(body) = state.physics.rigid_body_set.get(handle) {
                            let pos = body.translation();
                            let world_pos = obj.get_world_position();
                            debug!("Rock {} - physics: ({:.2}, {:.2}, {:.2}), world: ({:.2}, {:.2}, {:.2})", 
                                id, pos.x, pos.y, pos.z, world_pos.x, world_pos.y, world_pos.z);
                        }
                    }
                }
                
                debug!("Physics update: {} bodies ({} dynamic), gravity at {:?}", 
                    body_count, dynamic_count, state.physics.gravity);
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
                                if let Some((pos, rot, vel)) = state.physics.get_body_state(handle) {
                                    return Some((
                                        obj.id.clone(),
                                        Vector3::new(pos.x as f64, pos.y as f64, pos.z as f64), // Use physics position directly
                                        rot,
                                        vel
                                    ));
                                }
                            }
                            None
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
        
        let body_handle = state_write.physics.create_dynamic_body(rock_physics_pos, rotation);
        let scale = 0.8 + rand::random::<f32>() * 0.4;
        let collider_handle = state_write.physics.create_ball_collider(body_handle, 2.0 * scale, 0.3);
        
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
            physics.rigid_body_set.remove(
                body_handle,
                &mut physics.island_manager,
                &mut physics.collider_set,
                &mut physics.impulse_joint_set,
                &mut physics.multibody_joint_set,
                true,
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
        ClientMessage::PlayerUpdate { position, rotation, velocity, is_grounded, is_swimming } => {
            // Clone values for the async block
            let pos_clone = position.clone();
            let rot_clone = rotation.clone();
            let vel_clone = velocity.clone();
            
            // Update player state and physics body
            let player_is_swimming = {
                let mut state_write = state.write().await;
                
                // First, extract all needed data from player
                let player_data = {
                    if let Some(mut player) = state_write.players.get_player_mut(player_id) {
                        player.update_state(pos_clone, rot_clone, vel_clone, is_grounded);
                        player.is_swimming = is_swimming;
                        
                        // Check swimming state from physics
                        let physics_swimming = player.check_swimming(&state_write.physics);
                        
                        // Extract all needed data
                        let data = (
                            player.body_handle,
                            player.get_world_position(),
                            player.velocity.clone(),
                            physics_swimming || is_swimming // Trust client or physics
                        );
                        
                        Some(data)
                    } else {
                        None
                    }
                }; // The mutable borrow of player is dropped here
                
                // Check if we got player data
                let (body_handle, world_pos, player_velocity, final_swimming_state) = match player_data {
                    Some(data) => data,
                    None => return Ok(()), // Player not found
                };
                
                // Now update physics body if we have a handle
                if let Some(body_handle) = body_handle {
                    if let Some(body) = state_write.physics.rigid_body_set.get_mut(body_handle) {
                        // Set position
                        body.set_translation(Vector3::new(
                            world_pos.x as f32,
                            world_pos.y as f32,
                            world_pos.z as f32
                        ), true);
                        
                        // Set velocity for proper interpolation
                        body.set_linvel(player_velocity, true);
                    }
                }
                
                // Update swimming state in player using a separate access
                if let Some(mut player) = state_write.players.get_player_mut(player_id) {
                    player.is_swimming = final_swimming_state;
                }
                
                // Return the final swimming state
                final_swimming_state
            }; // state_write is dropped here
            
            // Broadcast player state to all other players with swimming state
            let update_msg = ServerMessage::PlayerState {
                player_id: player_id.to_string(),
                position,
                rotation,
                velocity,
                is_grounded,
                is_swimming: player_is_swimming, // Use the final swimming state
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
            
            if is_owner {
                // Player owns it, apply the push
                let mut state_write = state.write().await;
                
                if let Some(body_handle) = state_write.dynamic_objects.objects.get(&object_id)
                    .and_then(|obj| obj.body_handle) {
                    
                    if let Some(body) = state_write.physics.rigid_body_set.get_mut(body_handle) {
                        let force_vec = Vector3::new(force.x, force.y, force.z);
                        let point_vec = Vector3::new(point.x, point.y, point.z);
                        
                        // Check if this is likely a collision-based push (contact point is on surface)
                        let is_collision_push = point_vec.magnitude() > 1.0; // Contact points from collisions are on rock surface
                        
                        let scaled_point = if is_collision_push {
                            // For collision pushes, apply force more centrally
                            point_vec * 0.2
                        } else {
                            // For targeted pushes (F key), allow more offset
                            point_vec * 0.5
                        };
                        
                        let world_point = body.position().transform_point(&nalgebra::Point3::from(scaled_point));
                        
                        // Scale force based on push type
                        let force_multiplier = if is_collision_push {
                            1.5 // Gentler for collisions
                        } else {
                            2.0 // Stronger for targeted pushes
                        };
                        
                        body.apply_impulse_at_point(force_vec * force_multiplier, world_point, true);
                        
                        println!("Player {} pushed owned object {} with force {:?} (collision: {})", 
                            player_id, object_id, force_vec.magnitude(), is_collision_push);
                    }
                }
            } else {
                // Try to acquire ownership
                let mut state_write = state.write().await;
                
                // Check if object is owned by someone else
                let current_owner = state_write.dynamic_objects.objects.get(&object_id)
                    .and_then(|obj| obj.owner_id);
                
                let can_take_ownership = match current_owner {
                    None => true, // No owner
                    Some(owner) if owner == player_id => true, // Already owns it
                    Some(_) => {
                        // Check if ownership expired
                        state_write.dynamic_objects.objects.get(&object_id)
                            .and_then(|obj| obj.ownership_expires)
                            .map(|expires| expires <= std::time::Instant::now())
                            .unwrap_or(true)
                    }
                };
                
                if can_take_ownership {
                    // Grant ownership and apply push
                    if state_write.dynamic_objects.grant_ownership(&object_id, player_id, Duration::from_millis(3000)) {
                        println!("Player {} acquired ownership of object {}", player_id, object_id);
                        
                        // Apply the push immediately
                        if let Some(body_handle) = state_write.dynamic_objects.objects.get(&object_id)
                            .and_then(|obj| obj.body_handle) {
                            
                            if let Some(body) = state_write.physics.rigid_body_set.get_mut(body_handle) {
                                let force_vec = Vector3::new(force.x, force.y, force.z);
                                let point_vec = Vector3::new(point.x, point.y, point.z);
                                
                                let is_collision_push = point_vec.magnitude() > 1.0;
                                
                                let scaled_point = if is_collision_push {
                                    point_vec * 0.2
                                } else {
                                    point_vec * 0.5
                                };
                                
                                let world_point = body.position().transform_point(&nalgebra::Point3::from(scaled_point));
                                
                                let force_multiplier = if is_collision_push {
                                    1.5
                                } else {
                                    2.0
                                };
                                
                                body.apply_impulse_at_point(force_vec * force_multiplier, world_point, true);
                                
                                println!("Player {} pushed newly owned object {} with force {:?}", 
                                    player_id, object_id, force_vec.magnitude());
                            }
                        }
                        
                        // Notify player of ownership
                        let ownership_msg = ServerMessage::ObjectOwnershipGranted {
                            object_id: object_id.clone(),
                            player_id: player_id.to_string(),
                            duration_ms: 3000,
                        };
                        
                        if let Some(player) = state_write.players.get_player(player_id) {
                            player.send_message(&ownership_msg).await;
                        }
                    }
                } else {
                    println!("Player {} cannot push object {} - owned by another player", player_id, object_id);
                }
            }
        }
        ClientMessage::EnterVehicle { vehicle_id } => {
            // Update player state
            if let Some(mut player) = state.players.get_player_mut(player_id) {
                player.enter_vehicle(vehicle_id.clone());
                
                // Notify all players
                let msg = ServerMessage::PlayerEnteredVehicle {
                    player_id: player_id.to_string(),
                    vehicle_id: vehicle_id.clone(),
                };
                state.players.broadcast_to_all(&msg).await;
                
                // Update vehicle ownership
                if let Some(mut obj) = state.dynamic_objects.get_object_mut(&vehicle_id) {
                    obj.current_driver = Some(player_id.to_string());
                }
            }
        }
        
        ClientMessage::ExitVehicle { exit_position } => {
            // Get vehicle ID and calculate exit position
            let (vehicle_id, actual_exit_pos) = if let Some(player) = state.players.get_player(player_id) {
                if let Some(vid) = &player.current_vehicle_id {
                    let exit_pos = if let Some(pos) = exit_position {
                        Position { x: pos.x, y: pos.y, z: pos.z }
                    } else {
                        // Calculate exit position based on vehicle
                        if let Some(vehicle) = state.dynamic_objects.get_object(vid) {
                            Position {
                                x: vehicle.position.x + 3.0,
                                y: vehicle.position.y + 1.0,
                                z: vehicle.position.z,
