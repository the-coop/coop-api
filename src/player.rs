use crate::messages::{PlayerInfo, Position, Rotation, ServerMessage, Velocity};
use axum::extract::ws::Message;
use dashmap::DashMap;
use nalgebra::Vector3;
use std::sync::Arc;
use tokio::sync::mpsc;
use uuid::Uuid;

pub struct Player {
    pub id: Uuid,
    pub position: Vector3<f32>,
    pub rotation: nalgebra::UnitQuaternion<f32>,
    pub velocity: Vector3<f32>,
    pub sender: mpsc::UnboundedSender<Message>,
    pub world_origin: Vector3<f32>, // Player's floating origin in world space
}

impl Player {
    pub fn new(id: Uuid, position: Vector3<f32>, sender: mpsc::UnboundedSender<Message>) -> Self {
        Self {
            id,
            position,
            rotation: nalgebra::UnitQuaternion::identity(),
            velocity: Vector3::zeros(),
            sender,
            world_origin: position, // Initialize origin at spawn position
        }
    }

    pub fn update_state(&mut self, pos: Position, rot: Rotation, vel: Velocity) {
        // Position is relative to player's origin
        self.position = Vector3::new(pos.x, pos.y, pos.z);
        self.rotation = nalgebra::UnitQuaternion::new_normalize(nalgebra::Quaternion::new(
            rot.w, rot.x, rot.y, rot.z,
        ));
        self.velocity = Vector3::new(vel.x, vel.y, vel.z);
        
        // Update floating origin if player moves too far from it
        let distance_from_origin = self.position.magnitude();
        if distance_from_origin > 1000.0 { // Recenter when 1km from origin
            self.world_origin += self.position;
            self.position = Vector3::zeros();
        }
    }

    pub fn get_world_position(&self) -> Vector3<f32> {
        self.world_origin + self.position
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
                        x: world_pos.x,
                        y: world_pos.y,
                        z: world_pos.z,
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
        // Get the sender's world position for relative calculations
        let _sender_world_pos = self.players.get(&exclude_id)
            .map(|p| p.get_world_position())
            .unwrap_or_else(Vector3::zeros);

        for entry in self.players.iter() {
            if *entry.key() != exclude_id {
                let receiver = entry.value();
                
                // Convert message positions to be relative to receiver's origin
                let relative_msg = match msg {
                    ServerMessage::PlayerState { player_id, position, rotation, velocity } => {
                        // Calculate position relative to receiver's origin
                        let world_pos = Vector3::new(position.x, position.y, position.z);
                        let relative_pos = world_pos - receiver.world_origin;
                        
                        ServerMessage::PlayerState {
                            player_id: player_id.clone(),
                            position: Position {
                                x: relative_pos.x,
                                y: relative_pos.y,
                                z: relative_pos.z,
                            },
                            rotation: rotation.clone(),
                            velocity: velocity.clone(),
                        }
                    },
                    ServerMessage::PlayerJoined { player_id, position } => {
                        // Calculate position relative to receiver's origin
                        let world_pos = Vector3::new(position.x, position.y, position.z);
                        let relative_pos = world_pos - receiver.world_origin;
                        
                        ServerMessage::PlayerJoined {
                            player_id: player_id.clone(),
                            position: Position {
                                x: relative_pos.x,
                                y: relative_pos.y,
                                z: relative_pos.z,
                            },
                        }
                    },
                    _ => msg.clone(),
                };
                
                receiver.send_message(&relative_msg).await;
            }
        }
    }

    pub async fn send_origin_update(&self, player_id: Uuid) {
        if let Some(player) = self.players.get(&player_id) {
            let origin_msg = ServerMessage::OriginUpdate {
                origin: Position {
                    x: player.world_origin.x,
                    y: player.world_origin.y,
                    z: player.world_origin.z,
                },
            };
            player.send_message(&origin_msg).await;
        }
    }

    pub async fn broadcast_to_all(&self, msg: &ServerMessage) {
        for entry in self.players.iter() {
            entry.value().send_message(msg).await;
        }
    }
}
