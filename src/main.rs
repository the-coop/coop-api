use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    extract::State,
    response::IntoResponse,
    routing::get,
    Router,
};
use futures::{sink::SinkExt, stream::StreamExt};
use std::{net::SocketAddr, sync::Arc, time::Duration};
use tokio::{self, sync::mpsc, sync::RwLock};
use tower_http::cors::CorsLayer;
use tracing::{error, info};
use uuid::Uuid;

mod messages;
mod physics;
mod player;

use messages::*;
use physics::PhysicsWorld;
use player::PlayerManager;

type SharedState = Arc<RwLock<AppState>>;

struct AppState {
    players: PlayerManager,
    physics: PhysicsWorld,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let state = Arc::new(RwLock::new(AppState {
        players: PlayerManager::new(),
        physics: PhysicsWorld::new(),
    }));

    // Spawn physics update loop
    let physics_state = state.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_millis(16)); // 60 FPS
        loop {
            interval.tick().await;
            let mut state = physics_state.write().await;
            // Just step physics - player physics updates will happen separately
            state.physics.step();
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

    // Determine spawn position (could be randomized or based on game state)
    let spawn_position = nalgebra::Vector3::new(0.0, 35.0, 0.0);

    // Create a channel for the player
    let (tx, mut rx) = mpsc::unbounded_channel();
    
    // Spawn task to handle outgoing messages for this player
    let mut send_task = tokio::spawn(async move {
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
        let state_read = state.read().await;
        state_read.players.add_player(player_id, spawn_position, tx.clone());

        // Send existing players to new player
        let players_list = state_read.players.get_all_players_except(player_id);
        let list_msg = ServerMessage::PlayersList { players: players_list };
        
        if tx.send(Message::Text(serde_json::to_string(&list_msg).unwrap())).is_err() {
            error!("Failed to send players list to {}", player_id);
        }

        // Broadcast new player to others
        let join_msg = ServerMessage::PlayerJoined {
            player_id: player_id.to_string(),
            position: Position { x: spawn_position.x, y: spawn_position.y, z: spawn_position.z },
        };
        state_read.players.broadcast_except(player_id, &join_msg).await;
    }

    info!("Player {} connected", player_id);

    // Handle incoming messages
    while let Some(msg) = receiver.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                if let Ok(client_msg) = serde_json::from_str::<ClientMessage>(&text) {
                    handle_client_message(player_id, client_msg, &state).await;
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
        let state_read = state.read().await;
        state_read.players.remove_player(player_id);
        
        // Broadcast player left
        let leave_msg = ServerMessage::PlayerLeft {
            player_id: player_id.to_string(),
        };
        state_read.players.broadcast_to_all(&leave_msg).await;
    }

    // Cancel the sender task
    send_task.abort();

    info!("Player {} disconnected", player_id);
}

async fn handle_client_message(
    player_id: Uuid,
    msg: ClientMessage,
    state: &SharedState,
) {
    match msg {
        ClientMessage::PlayerUpdate { position, rotation, velocity } => {
            let state_read = state.read().await;
            
            // Clone the values to avoid move errors
            let pos_clone = position.clone();
            let rot_clone = rotation.clone();
            let vel_clone = velocity.clone();
            
            // Update player state
            if let Some(mut player) = state_read.players.get_player_mut(player_id) {
                player.update_state(pos_clone, rot_clone, vel_clone);
            }

            // Broadcast to other players
            let update_msg = ServerMessage::PlayerState {
                player_id: player_id.to_string(),
                position,
                rotation,
                velocity,
            };
            state_read.players.broadcast_except(player_id, &update_msg).await;
        }
        ClientMessage::PlayerAction { action, .. } => {
            // Handle other player actions if needed
            info!("Player {} performed action: {}", player_id, action);
        }
    }
}
