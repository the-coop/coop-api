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
}

impl Player {
    pub fn new(id: Uuid, position: Vector3<f32>, sender: mpsc::UnboundedSender<Message>) -> Self {
        Self {
            id,
            position,
            rotation: nalgebra::UnitQuaternion::identity(),
            velocity: Vector3::zeros(),
            sender,
        }
    }

    pub fn update_state(&mut self, pos: Position, rot: Rotation, vel: Velocity) {
        self.position = Vector3::new(pos.x, pos.y, pos.z);
        self.rotation = nalgebra::UnitQuaternion::new_normalize(nalgebra::Quaternion::new(
            rot.w, rot.x, rot.y, rot.z,
        ));
        self.velocity = Vector3::new(vel.x, vel.y, vel.z);
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
                PlayerInfo {
                    id: player.id.to_string(),
                    position: Position {
                        x: player.position.x,
                        y: player.position.y,
                        z: player.position.z,
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
                entry.value().send_message(msg).await;
            }
        }
    }

    pub async fn broadcast_to_all(&self, msg: &ServerMessage) {
        for entry in self.players.iter() {
            entry.value().send_message(msg).await;
        }
    }
}
