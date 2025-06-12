use crate::messages::{PlayerInfo, Position, Rotation, ServerMessage, Velocity};
use crate::physics::PhysicsWorld;
use axum::extract::ws::Message;
use dashmap::DashMap;
use nalgebra::{Vector3, UnitQuaternion};
use rapier3d::prelude::{RigidBodyHandle, ColliderHandle};
use std::sync::Arc;
use tokio::sync::mpsc;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct Player {
    pub id: Uuid,
    pub position: Vector3<f32>,
    pub rotation: UnitQuaternion<f32>,
    pub velocity: Vector3<f32>,
    pub is_grounded: bool,
    pub is_swimming: bool,
    pub world_origin: Vector3<f64>,
    pub sender: mpsc::UnboundedSender<Message>,
    pub body_handle: Option<RigidBodyHandle>,
    pub collider_handle: Option<ColliderHandle>,
    pub current_vehicle_id: Option<String>,
    pub relative_position: Option<Vector3<f32>>,
    pub relative_rotation: Option<UnitQuaternion<f32>>,
    pub aim_rotation: Option<UnitQuaternion<f32>>,
    pub health: f32,
    pub armor: f32,
    pub max_health: f32,
    pub max_armor: f32,
    pub is_dead: bool,
    pub last_damage_time: std::time::Instant,
    pub respawn_time: Option<std::time::Instant>,
    pub current_weapon: Option<String>,
}

impl Player {
    pub fn check_swimming(&mut self, physics: &PhysicsWorld) -> bool {
        if let Some(body_handle) = self.body_handle {
            if let Some(body) = physics.rigid_body_set.get(body_handle) {
                let pos = body.translation();
                self.is_swimming = physics.is_position_in_water(&pos);
            }
        }
        self.is_swimming
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
    
    pub fn respawn(&mut self, spawn_position: Vector3<f32>) {
        self.health = self.max_health;
        self.armor = 0.0;
        self.is_dead = false;
        self.respawn_time = None;
        self.position = spawn_position;
        self.velocity = Vector3::zeros();
        self.current_vehicle_id = None;
        self.relative_position = None;
        self.relative_rotation = None;
    }
    
    pub fn heal(&mut self, amount: f32) {
        self.health = (self.health + amount).min(self.max_health);
    }
    
    pub fn add_armor(&mut self, amount: f32) {
        self.armor = (self.armor + amount).min(100.0);
    }
}

pub struct PlayerManager {
    pub players: Arc<DashMap<Uuid, Player>>,
}

impl PlayerManager {
    pub fn new() -> Self {
        Self {
            players: Arc::new(DashMap::new()),
        }
    }

    pub fn add_player(&mut self, id: Uuid, position: Vector3<f32>, sender: mpsc::UnboundedSender<Message>) {
        let player = Player {
            id,
            position,
            rotation: UnitQuaternion::identity(),
            velocity: Vector3::zeros(),
            is_grounded: false,
            is_swimming: false,
            world_origin: Vector3::new(0.0, 0.0, 0.0),
            sender,
            body_handle: None,
            collider_handle: None,
            current_vehicle_id: None,
            relative_position: None,
            relative_rotation: None,
            aim_rotation: None,
            health: 100.0,
            armor: 0.0,
            max_health: 100.0,
            max_armor: 100.0,
            is_dead: false,
            last_damage_time: std::time::Instant::now(),
            respawn_time: None,
            current_weapon: None,
        };
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
                // Send position relative to the requesting player's origin
                let relative_pos = if let Some(requester) = self.players.get(&exclude_id) {
                    // Calculate position relative to requester's origin
                    let world_pos = player.get_world_position();
                    let requester_origin = requester.world_origin;
                    Vector3::new(
                        (world_pos.x - requester_origin.x) as f32,
                        (world_pos.y - requester_origin.y) as f32,
                        (world_pos.z - requester_origin.z) as f32,
                    )
                } else {
                    player.position
                };
                
                PlayerInfo {
                    id: player.id.to_string(),
                    position: Position {
                        x: relative_pos.x,
                        y: relative_pos.y,
                        z: relative_pos.z,
                    },
                    rotation: Some(Rotation {
                        x: player.rotation.i,
                        y: player.rotation.j,
                        z: player.rotation.k,
                        w: player.rotation.w,
                    }),
                    velocity: Some(Velocity {
                        x: player.velocity.x,
                        y: player.velocity.y,
                        z: player.velocity.z,
                    }),
                    is_grounded: Some(player.is_grounded),
                    is_swimming: Some(player.is_swimming),
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
                    ServerMessage::PlayerState { player_id, position, rotation, velocity, is_grounded, is_swimming } => {
                        // Get sender's actual world position
                        let sender_world_pos = if let Some(sender) = self.players.get(&exclude_id) {
                            // Check if sender is in vehicle
                            if let Some(_vehicle_id) = &sender.current_vehicle_id {
                                // Need to get vehicle position to calculate world position
                                // This would need access to dynamic objects, so we'll use stored position for now
                                sender.get_world_position()
                            } else {
                                sender.get_world_position()
                            }
                        } else {
                            Vector3::new(position.x as f64, position.y as f64, position.z as f64)
                        };
                        
                        // Calculate position relative to receiver's origin (in double precision)
                        let relative_pos = sender_world_pos - receiver.world_origin;
                        
                        ServerMessage::PlayerState {
                            player_id: player_id.clone(),
                            position: Position {
                                x: relative_pos.x as f32,
                                y: relative_pos.y as f32,
                                z: relative_pos.z as f32,
                            },
                            rotation: rotation.clone(),
                            velocity: velocity.clone(),
                            is_grounded: *is_grounded,
                            is_swimming: *is_swimming,
                        }
                    },
                    
                    ServerMessage::VehiclePlayerState { player_id: _, vehicle_id: _, relative_position: _, relative_rotation: _, aim_rotation: _, is_grounded: _ } => {
                        // For players in vehicles, pass through as-is since position is relative to vehicle
                        msg.clone()
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

    pub fn respawn_player(&mut self, id: Uuid, spawn_position: Vector3<f32>) {
        if let Some(mut player) = self.players.get_mut(&id) {
            player.respawn(spawn_position);
        }
    }

    pub fn damage_player(&mut self, id: Uuid, damage: f32, damage_type: &str, attacker_id: Option<Uuid>) -> bool {
        if let Some(mut player) = self.players.get_mut(&id) {
            // Apply armor reduction
            let actual_damage = if player.armor > 0.0 {
                let armor_absorbed = (damage * 0.5).min(player.armor);
                player.armor -= armor_absorbed;
                damage - armor_absorbed
            } else {
                damage
            };
            
            player.health = (player.health - actual_damage).max(0.0);
            player.last_damage_time = std::time::Instant::now();
            
            if player.health <= 0.0 {
                player.is_dead = true;
                player.respawn_time = Some(std::time::Instant::now() + std::time::Duration::from_secs(5));
            }
            
            return player.is_dead;
        }
        false
    }

    pub fn heal_player(&mut self, id: Uuid, amount: f32) {
        if let Some(mut player) = self.players.get_mut(&id) {
            player.heal(amount);
        }
    }

    pub fn add_armor(&mut self, id: Uuid, amount: f32) {
        if let Some(mut player) = self.players.get_mut(&id) {
            player.add_armor(amount);
        }
    }
}
