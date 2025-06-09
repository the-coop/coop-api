use crate::messages::{PlayerInfo, Position, Rotation, ServerMessage, Velocity};
use crate::physics::PhysicsWorld;
use axum::extract::ws::Message;
use dashmap::DashMap;
use nalgebra::{Vector3, UnitQuaternion};
use rapier3d::prelude::{RigidBodyHandle, ColliderHandle};
use std::sync::Arc;
use tokio::sync::mpsc;
use uuid::Uuid;

pub struct Player {
    pub id: Uuid,
    pub position: Vector3<f32>,
    pub rotation: UnitQuaternion<f32>,
    #[allow(dead_code)]
    pub velocity: Vector3<f32>,
    pub world_origin: Vector3<f64>,
    #[allow(dead_code)]
    pub is_grounded: bool,
    pub is_swimming: bool,
    pub body_handle: Option<RigidBodyHandle>,
    pub collider_handle: Option<ColliderHandle>,
    pub sender: mpsc::UnboundedSender<axum::extract::ws::Message>,
    #[allow(dead_code)]
    pub health: f32,
    #[allow(dead_code)]
    pub max_health: f32,
    #[allow(dead_code)]
    pub armor: f32,
    #[allow(dead_code)]
    pub current_weapon: Option<String>,
    #[allow(dead_code)]
    pub last_damage_time: std::time::Instant,
    #[allow(dead_code)]
    pub is_dead: bool,
    #[allow(dead_code)]
    pub respawn_time: Option<std::time::Instant>,
    pub current_vehicle_id: Option<String>,
    #[allow(dead_code)]
    pub relative_position: Option<Vector3<f32>>, // Position relative to vehicle
    #[allow(dead_code)]
    pub relative_rotation: Option<nalgebra::UnitQuaternion<f32>>, // Rotation relative to vehicle
    #[allow(dead_code)]
    pub aim_rotation: Option<nalgebra::UnitQuaternion<f32>>, // Where player is aiming
}

impl Player {
    pub fn new(id: Uuid, position: Vector3<f32>, sender: mpsc::UnboundedSender<Message>) -> Self {
        Self {
            id,
            position,
            rotation: nalgebra::UnitQuaternion::identity(),
            velocity: Vector3::zeros(),
            sender,
            world_origin: Vector3::new(0.0, 0.0, 0.0),
            is_grounded: false,
            body_handle: None,
            collider_handle: None,
            is_swimming: false,
            health: 100.0,
            max_health: 100.0,
            armor: 0.0,
            current_weapon: None,
            last_damage_time: std::time::Instant::now(),
            is_dead: false,
            respawn_time: None,
            current_vehicle_id: None,
            relative_position: None,
            relative_rotation: None,
            aim_rotation: None,
        }
    }

    #[allow(dead_code)]
    pub fn update_state(&mut self, pos: Position, rot: Rotation, vel: Velocity, grounded: bool) {
        // If in vehicle, position is relative to vehicle
        if self.current_vehicle_id.is_some() {
            self.relative_position = Some(Vector3::new(pos.x, pos.y, pos.z));
            self.relative_rotation = Some(nalgebra::UnitQuaternion::new_normalize(
                nalgebra::Quaternion::new(rot.w, rot.x, rot.y, rot.z)
            ));
            // Don't update world position - that's calculated from vehicle position
        } else {
            // Normal world position update
            self.position = Vector3::new(pos.x, pos.y, pos.z);
            self.rotation = nalgebra::UnitQuaternion::new_normalize(nalgebra::Quaternion::new(
                rot.w, rot.x, rot.y, rot.z,
            ));
            self.velocity = Vector3::new(vel.x, vel.y, vel.z);
            self.is_grounded = grounded;
            
            // Update floating origin if player moves too far from it
            let distance_from_origin = self.position.magnitude();
            if distance_from_origin > 1000.0 {
                // Add current position to world origin with double precision
                self.world_origin.x += self.position.x as f64;
                self.world_origin.y += self.position.y as f64;
                self.world_origin.z += self.position.z as f64;
                
                // Reset position to origin
                self.position = Vector3::zeros();
                
                // Notify client of origin update
                let origin_msg = ServerMessage::OriginUpdate {
                    origin: Position {
                        x: self.world_origin.x as f32,
                        y: self.world_origin.y as f32,
                        z: self.world_origin.z as f32,
                    }
                };
                
                // Send origin update asynchronously
                let sender = self.sender.clone();
                tokio::spawn(async move {
                    if let Ok(json) = serde_json::to_string(&origin_msg) {
                        let _ = sender.send(Message::Text(json));
                    }
                });
            }
        }
    }

    #[allow(dead_code)]
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
    
    #[allow(dead_code)]
    pub fn take_damage(&mut self, damage: f32, _damage_type: &str, _attacker_id: Option<Uuid>) {
        if self.is_dead {
            return;
        }
        
        // Apply armor reduction
        let actual_damage = if self.armor > 0.0 {
            let armor_absorbed = (damage * 0.5).min(self.armor);
            self.armor -= armor_absorbed;
            damage - armor_absorbed
        } else {
            damage
        };
        
        self.health = (self.health - actual_damage).max(0.0);
        self.last_damage_time = std::time::Instant::now();
        
        if self.health <= 0.0 {
            self.is_dead = true;
            self.respawn_time = Some(std::time::Instant::now() + std::time::Duration::from_secs(5));
        }
    }
    
    #[allow(dead_code)]
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
    
    #[allow(dead_code)]
    pub fn set_weapon(&mut self, weapon_type: String) {
        self.current_weapon = Some(weapon_type);
    }
    
    #[allow(dead_code)]
    pub fn heal(&mut self, amount: f32) {
        self.health = (self.health + amount).min(self.max_health);
    }
    
    #[allow(dead_code)]
    pub fn add_armor(&mut self, amount: f32) {
        self.armor = (self.armor + amount).min(100.0);
    }
    
    #[allow(dead_code)]
    pub fn enter_vehicle(&mut self, vehicle_id: String) {
        self.current_vehicle_id = Some(vehicle_id);
        self.relative_position = Some(Vector3::zeros());
        self.relative_rotation = Some(nalgebra::UnitQuaternion::identity());
        self.aim_rotation = Some(self.rotation); // Keep current aim
    }
    
    #[allow(dead_code)]
    pub fn exit_vehicle(&mut self, exit_position: Vector3<f32>) {
        self.current_vehicle_id = None;
        self.relative_position = None;
        self.relative_rotation = None;
        self.aim_rotation = None;
        self.position = exit_position;
        self.velocity = Vector3::zeros(); // Reset velocity on exit
    }
    
    #[allow(dead_code)]
    pub fn update_vehicle_state(&mut self, relative_pos: Position, relative_rot: Rotation, aim_rot: Rotation) {
        self.relative_position = Some(Vector3::new(relative_pos.x, relative_pos.y, relative_pos.z));
        
        let rel_rot = nalgebra::Quaternion::new(relative_rot.w, relative_rot.x, relative_rot.y, relative_rot.z);
        self.relative_rotation = Some(nalgebra::UnitQuaternion::new_normalize(rel_rot));
        
        let aim = nalgebra::Quaternion::new(aim_rot.w, aim_rot.x, aim_rot.y, aim_rot.z);
        self.aim_rotation = Some(nalgebra::UnitQuaternion::new_normalize(aim));
    }
    
    #[allow(dead_code)]
    pub fn get_world_position_from_vehicle(&self, vehicle_position: &Vector3<f32>) -> Vector3<f32> {
        if let Some(relative_pos) = &self.relative_position {
            // Get world position by adding vehicle position to relative offset
            Vector3::new(
                self.world_origin.x as f32 + vehicle_position.x + relative_pos.x,
                self.world_origin.y as f32 + vehicle_position.y + relative_pos.y,
                self.world_origin.z as f32 + vehicle_position.z + relative_pos.z,
            )
        } else {
            // No relative position set, return world origin
            Vector3::new(
                self.world_origin.x as f32,
                self.world_origin.y as f32,
                self.world_origin.z as f32,
            )
        }
    }
    
    #[allow(dead_code)]
    pub fn get_world_rotation_from_vehicle(&self, vehicle_rotation: &nalgebra::UnitQuaternion<f32>) -> nalgebra::UnitQuaternion<f32> {
        if let Some(relative_rot) = &self.relative_rotation {
            // Combine vehicle rotation with relative rotation
            vehicle_rotation * relative_rot
        } else {
            // No relative rotation set, return vehicle rotation
            *vehicle_rotation
        }
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
}
