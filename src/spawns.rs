use crate::level::Level;
use crate::messages::{ServerMessage, Position};
use nalgebra::Vector3;
use std::collections::HashMap;
use std::time::{Duration, Instant};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct SpawnPoint {
    pub id: String,
    pub spawn_type: String, // "player", "weapon", "vehicle", "item"
    pub position: Vector3<f32>,
    pub rotation: Option<nalgebra::UnitQuaternion<f32>>,
    pub respawn_time: Duration,
    pub last_spawn: Option<Instant>,
    pub properties: Option<serde_json::Value>,
}

#[derive(Debug, Clone)]
pub struct ItemSpawn {
    pub spawn_point_id: String,
    pub item_type: String,
    pub position: Vector3<f32>,
    pub is_available: bool,
    pub respawn_time: Duration,
    pub pickup_time: Option<Instant>,
}

pub struct SpawnManager {
    pub spawn_points: Vec<SpawnPoint>,
    pub item_spawns: HashMap<String, ItemSpawn>,
    pub spawned_vehicles: HashMap<String, (String, Instant)>, // vehicle_id -> (spawn_point_id, spawn_time)
}

impl SpawnManager {
    pub fn new() -> Self {
        Self {
            spawn_points: Vec::new(),
            item_spawns: HashMap::new(),
            spawned_vehicles: HashMap::new(),
        }
    }

    pub fn add_spawn_points_from_level(&mut self, level: &Level) {
        for obj in &level.objects {
            match obj.object_type.as_str() {
                "player_spawn" => {
                    if let Some(id) = &obj.id {
                        self.spawn_points.push(SpawnPoint {
                            id: id.clone(),
                            spawn_type: "player".to_string(),
                            position: Vector3::new(obj.position.x, obj.position.y, obj.position.z),
                            rotation: obj.rotation.as_ref().map(|r| {
                                nalgebra::UnitQuaternion::new_normalize(
                                    nalgebra::Quaternion::new(r.w, r.x, r.y, r.z)
                                )
                            }),
                            respawn_time: Duration::from_secs(0), // Instant respawn for players
                            last_spawn: None,
                            properties: obj.properties.clone(),
                        });
                    }
                }
                "weapon_spawn" => {
                    if let Some(id) = &obj.id {
                        let respawn_time = obj.properties.as_ref()
                            .and_then(|p| p.get("respawn_time"))
                            .and_then(|v| v.as_u64())
                            .unwrap_or(30);
                        
                        self.spawn_points.push(SpawnPoint {
                            id: id.clone(),
                            spawn_type: "weapon".to_string(),
                            position: Vector3::new(obj.position.x, obj.position.y, obj.position.z),
                            rotation: obj.rotation.as_ref().map(|r| {
                                nalgebra::UnitQuaternion::new_normalize(
                                    nalgebra::Quaternion::new(r.w, r.x, r.y, r.z)
                                )
                            }),
                            respawn_time: Duration::from_secs(respawn_time),
                            last_spawn: None,
                            properties: obj.properties.clone(),
                        });
                        
                        // Create initial item spawn
                        if let Some(weapon_type) = obj.properties.as_ref()
                            .and_then(|p| p.get("weapon_type"))
                            .and_then(|v| v.as_str()) {
                            
                            self.item_spawns.insert(id.clone(), ItemSpawn {
                                spawn_point_id: id.clone(),
                                item_type: weapon_type.to_string(),
                                position: Vector3::new(obj.position.x, obj.position.y, obj.position.z),
                                is_available: true,
                                respawn_time: Duration::from_secs(respawn_time),
                                pickup_time: None,
                            });
                        }
                    }
                }
                "vehicle_spawn" => {
                    if let Some(id) = &obj.id {
                        let respawn_time = obj.properties.as_ref()
                            .and_then(|p| p.get("respawn_time"))
                            .and_then(|v| v.as_u64())
                            .unwrap_or(120);
                        
                        self.spawn_points.push(SpawnPoint {
                            id: id.clone(),
                            spawn_type: "vehicle".to_string(),
                            position: Vector3::new(obj.position.x, obj.position.y, obj.position.z),
                            rotation: obj.rotation.as_ref().map(|r| {
                                nalgebra::UnitQuaternion::new_normalize(
                                    nalgebra::Quaternion::new(r.w, r.x, r.y, r.z)
                                )
                            }),
                            respawn_time: Duration::from_secs(respawn_time),
                            last_spawn: Some(Instant::now()), // Mark as spawned initially
                            properties: obj.properties.clone(),
                        });
                    }
                }
                _ => {}
            }
        }
    }
    
    pub fn update(&mut self, _delta: Duration) {
        // Update is now handled by check_respawns
    }
    
    pub fn check_respawns(&mut self, level: &Level) -> Vec<ServerMessage> {
        let mut messages = Vec::new();
        let now = Instant::now();
        
        // Check item spawns
        for (item_id, spawn) in &mut self.item_spawns {
            if !spawn.is_available {
                if let Some(pickup_time) = spawn.pickup_time {
                    if now.duration_since(pickup_time) >= spawn.respawn_time {
                        spawn.is_available = true;
                        spawn.pickup_time = None;
                        
                        // Find the spawn point data from level
                        if let Some(spawn_obj) = level.objects.iter()
                            .find(|o| o.id.as_ref() == Some(item_id)) {
                            
                            if let Some(weapon_type) = spawn_obj.properties.as_ref()
                                .and_then(|p| p.get("weapon_type"))
                                .and_then(|v| v.as_str()) {
                                
                                messages.push(ServerMessage::WeaponSpawn {
                                    weapon_id: item_id.clone(),
                                    weapon_type: weapon_type.to_string(),
                                    position: Position {
                                        x: spawn.position.x,
                                        y: spawn.position.y,
                                        z: spawn.position.z,
                                    },
                                });
                            }
                        }
                    }
                }
            }
        }
        
        // Vehicle spawns are handled separately in check_respawns
        
        messages
    }
    
    pub fn pickup_item(&mut self, item_id: &str, _player_id: Uuid) -> bool {
        if let Some(item) = self.item_spawns.get_mut(item_id) {
            if item.is_available {
                item.is_available = false;
                item.pickup_time = Some(Instant::now());
                return true;
            }
        }
        false
    }

    pub fn get_random_player_spawn(&self) -> Option<&SpawnPoint> {
        let player_spawns: Vec<&SpawnPoint> = self.spawn_points.iter()
            .filter(|s| s.spawn_type == "player")
            .collect();
        
        if !player_spawns.is_empty() {
            let idx = rand::random::<usize>() % player_spawns.len();
            Some(player_spawns[idx])
        } else {
            None
        }
    }
}
