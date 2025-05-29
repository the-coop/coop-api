use crate::messages::{PlayerInfo, Position, Rotation, ServerMessage, Velocity};
use axum::extract::ws::Message;
use dashmap::DashMap;
use nalgebra::Vector3;
use std::sync::Arc;
use tokio::sync::mpsc;
use uuid::Uuid;

pub struct Player {
    pub id: Uuid, // Add this field
    pub position: Vector3<f32>,  // Local position relative to origin (stays f32)
    pub rotation: nalgebra::UnitQuaternion<f32>,
    pub velocity: Vector3<f32>,
    pub sender: mpsc::UnboundedSender<Message>,
    pub world_origin: Vector3<f64>, // Player's floating origin in world space (now f64)
    pub is_grounded: bool, // Add this field
}

impl Player {
    pub fn new(id: Uuid, position: Vector3<f32>, sender: mpsc::UnboundedSender<Message>) -> Self {
        Self {
            id, // Add the id field here
            position,
            rotation: nalgebra::UnitQuaternion::identity(),
            velocity: Vector3::zeros(),
            sender,
            world_origin: Vector3::new(0.0, 0.0, 0.0),
            is_grounded: false,
        }
    }

    pub fn update_state(&mut self, pos: Position, rot: Rotation, vel: Velocity, is_grounded: bool) {
        // Position is relative to player's origin
        self.position = Vector3::new(pos.x, pos.y, pos.z);
        self.rotation = nalgebra::UnitQuaternion::new_normalize(nalgebra::Quaternion::new(
            rot.w, rot.x, rot.y, rot.z,
        ));
        self.velocity = Vector3::new(vel.x, vel.y, vel.z);
        self.is_grounded = is_grounded;
        
        // Update floating origin if player moves too far from it
        let distance_from_origin = self.position.magnitude();
        if distance_from_origin > 1000.0 { // Recenter when 1km from origin
            // Add current position to world origin with double precision
            self.world_origin.x += self.position.x as f64;
            self.world_origin.y += self.position.y as f64;
            self.world_origin.z += self.position.z as f64;
            self.position = Vector3::zeros();
        }
    }

    pub fn get_world_position(&self) -> Vector3<f64> {
        // Return world position in double precision
        Vector3::new(
            self.world_origin.x + self.position.x as f64,
            self.world_origin.y + self.position.y as f64,
            self.world_origin.z + self.position.z as f64,
        )
    }

    pub async fn send_message(&self, msg: &ServerMessage) {
        if let Ok(json) = serde_json::to_string(msg) {
            let _ = self.sender.send(Message::Text(json));
        }
    }
}

pub struct PlayerManager {
    players: Arc<DashMap<Uuid, Player>>,
}

impl PlayerManager {
    pub fn new() -> Self {
        Self {
            players: Arc::new(DashMap::new()),
        }
    }

    pub fn add_player(&self, id: Uuid, position: Vector3<f32>, sender: mpsc::UnboundedSender<Message>) {
        let player = Player::new(id, position, sender);
        self.players.insert(id, player);
    }

    pub fn remove_player(&self, id: Uuid) {
        if let Some((_, player)) = self.players.remove(&id) {
            // Close the sender channel to signal cleanup
            // The receiver task will naturally end when sender is dropped
            drop(player.sender);
        }
    }

    pub fn get_player_mut(&self, id: Uuid) -> Option<dashmap::mapref::one::RefMut<Uuid, Player>> {
        self.players.get_mut(&id)
    }

    pub fn get_player(&self, id: Uuid) -> Option<dashmap::mapref::one::Ref<Uuid, Player>> {
        self.players.get(&id)
    }

    pub fn iter(&self) -> dashmap::iter::Iter<Uuid, Player> {
        self.players.iter()
    }

    pub fn get_all_players_except(&self, exclude_id: Uuid) -> Vec<PlayerInfo> {
        self.players
            .iter()
            .filter(|entry| *entry.key() != exclude_id)
            .map(|entry| {
                let player = entry.value();
                let world_pos = player.get_world_position();
                PlayerInfo {
                    id: player.id.to_string(),
                    position: Position {
                        x: world_pos.x as f32,  // Convert back to f32 for client
                        y: world_pos.y as f32,
                        z: world_pos.z as f32,
                    },
                    rotation: Some(Rotation {
                        x: player.rotation.i,
                        y: player.rotation.j,
                        z: player.rotation.k,
                        w: player.rotation.w,
                    }),
                }
            })
            .collect()
    }

    pub async fn broadcast_except(&self, exclude_id: Uuid, msg: &ServerMessage) {
        for entry in self.players.iter() {
            if *entry.key() != exclude_id {
                let receiver = entry.value();
                
                // Convert message positions to be relative to receiver's origin
                let relative_msg = match msg {
                    ServerMessage::PlayerState { player_id, position, rotation, velocity, is_grounded } => {
                        // Calculate position relative to receiver's origin (in double precision)
                        let world_pos = Vector3::new(position.x as f64, position.y as f64, position.z as f64);
                        let relative_pos = world_pos - receiver.world_origin;
                        
                        ServerMessage::PlayerState {
                            player_id: player_id.clone(),
                            position: Position {
                                x: relative_pos.x as f32,  // Convert back to f32
                                y: relative_pos.y as f32,
                                z: relative_pos.z as f32,
                            },
                            rotation: rotation.clone(),
                            velocity: velocity.clone(),
                            is_grounded: *is_grounded, // Use the passed is_grounded value
                        }
                    },
                    ServerMessage::PlayerJoined { player_id, position } => {
                        // Calculate position relative to receiver's origin
                        let world_pos = Vector3::new(position.x as f64, position.y as f64, position.z as f64);
                        let relative_pos = world_pos - receiver.world_origin;
                        
                        ServerMessage::PlayerJoined {
                            player_id: player_id.clone(),
                            position: Position {
                                x: relative_pos.x as f32,
                                y: relative_pos.y as f32,
                                z: relative_pos.z as f32,
                            },
                        }
                    },
                    _ => msg.clone(),
                };
                
                receiver.send_message(&relative_msg).await;
            }
        }
    }

    pub async fn broadcast_to_all(&self, msg: &ServerMessage) {
        for entry in self.players.iter() {
            entry.value().send_message(msg).await;
        }
    }
}
