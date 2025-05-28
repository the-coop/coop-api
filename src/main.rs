use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::Response,
    routing::get,
    Router,
};
use futures::{sink::SinkExt, stream::StreamExt};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock, Mutex};
use tower_http::cors::CorsLayer;
use uuid::Uuid;

mod game_state;
mod messages;
mod physics;
mod player;

use game_state::GameState;
use messages::{ClientMessage, ServerMessage, InternalMessage};
use player::PlayerConnection;

type SharedState = Arc<RwLock<AppState>>;

struct AppState {
    players: PlayerManager,
    physics: PhysicsWorld,
    dynamic_objects: DynamicObjectManager,
    level: Level,
}

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

    let state = Arc::new(RwLock::new(AppState {
        players: PlayerManager::new(),
        physics,
        dynamic_objects: DynamicObjectManager::new(),
        level,
    }));

    // Spawn physics update loop
    let physics_state = state.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_millis(16)); // 60 FPS
        let start_time = std::time::Instant::now();
        let mut frame_count = 0u64;
        let mut last_broadcast_time = std::time::Instant::now();
        
        loop {
            interval.tick().await;
            let mut state = physics_state.write().await;
            
            // Check ownership expiry
            state.dynamic_objects.update_ownership_expiry();
            
            // Update moving platforms
            let elapsed = start_time.elapsed().as_secs_f32();
            state.physics.update_moving_platforms(elapsed);
            
            // Step physics
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
                            tracing::debug!("Rock {} - physics: ({:.2}, {:.2}, {:.2}), world: ({:.2}, {:.2}, {:.2})", 
                                id, pos.x, pos.y, pos.z, world_pos.x, world_pos.y, world_pos.z);
                        }
                    }
                }
                
                tracing::debug!("Physics update: {} bodies ({} dynamic), gravity at {:?}", 
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
                // Physics position is in world space, not local space
                // Update the object's world origin to match physics position
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
                            Some((
                                obj.id.clone(),
                                obj.get_world_position(),
                                obj.rotation,
                                obj.velocity
                            ))
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

    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    info!("Server listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn websocket_handler(
    ws: WebSocketUpgrade,
    State(state): State<SharedState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: SharedState) {
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
        sender.close().await
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

    // Add player to game
    {
        let mut state_write = state.write().await;
        state_write.players.add_player(player_id, spawn_position, tx.clone());

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
                let objects_msg = ServerMessage::DynamicObjectsList { objects };
                if tx.send(Message::Text(serde_json::to_string(&objects_msg).unwrap())).is_err() {
                    error!("Failed to send dynamic objects list to {}", player_id);
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
                            server_tx.clone()
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
        let state_write = state.write().await;
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
    game_state: Arc<GameState>,
    player_id: Uuid,
    msg: ClientMessage,
    server_tx: mpsc::UnboundedSender<InternalMessage>,
) -> Result<(), Box<dyn std::error::Error>> {
    match msg {
        ClientMessage::PlayerUpdate { position, rotation, velocity, is_grounded } => {
            // Clone values for the async block
            let pos_clone = position.clone();
            let rot_clone = rotation.clone();
            let vel_clone = velocity.clone();
            
            // Update player state
            {
                let state_write = game_state.state.write().await;
                if let Some(mut player) = state_write.players.get_player_mut(player_id) {
                    player.update_state(pos_clone, rot_clone, vel_clone, is_grounded);
                }
            }
            
            // Broadcast player state to all other players
            let update_msg = ServerMessage::PlayerState {
                player_id: player_id.to_string(),
                position,
                rotation,
                velocity,
                is_grounded,
            };
            
            server_tx.send(InternalMessage::Broadcast(update_msg))?;
        }
        ClientMessage::PushObject { object_id, force, point } => {
            // Check if player can push the object
            let can_push = {
                let state_read = game_state.state.read().await;
                state_read.dynamic_objects.check_ownership(&object_id, &player_id)
            };
            
            if can_push {
                // Apply the push in physics
                {
                    let mut state_write = game_state.state.write().await;
                    if let Some(object) = state_write.dynamic_objects.get_object_mut(&object_id) {
                        object.push(force, point);
                    }
                }
                
                // The next physics update will broadcast the new state
                println!("Player {} pushed object {}", player_id, object_id);
            } else {
                // Try to request ownership
                {
                    let state_read = game_state.state.read().await;
                    if state_read.dynamic_objects.has_object(&object_id) {
                        drop(state_read);
                        
                        let mut state_write = game_state.state.write().await;
                        if state_write.dynamic_objects.request_ownership(&object_id, &player_id) {
                            println!("Player {} acquired ownership of object {}", player_id, object_id);
                            
                            // Notify player of ownership
                            let ownership_msg = ServerMessage::ObjectOwnershipGranted {
                                object_id: object_id.clone(),
                                player_id: player_id.to_string(),
                                duration_ms: 5000,
                            };
                            server_tx.send(InternalMessage::SendToPlayer(player_id, ownership_msg))?;
                        }
                    }
                }
            }
        }
    }
    
    Ok(())
}
