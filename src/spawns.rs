use std::time::{Duration, Instant};
use uuid::Uuid;
use crate::messages::{ServerMessage, Position, Rotation};
use crate::level::Level;
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct PlayerSpawnPoint {
    // Keep id for identification and rotation for serialization
    pub _id: String,
    pub position: Position,
    pub _rotation: Rotation,
}

#[derive(Debug, Clone)]
pub struct VehicleSpawnPoint {
    pub id: String,
    pub position: Position,
    pub rotation: Rotation,
    pub vehicle_type: String,
    pub _respawn_time: f32,  // Keep for configuration
    pub occupied: bool,
}

#[derive(Debug, Clone)]
pub struct WeaponSpawnPoint {
    pub id: String,
    pub weapon_type: String,
    pub position: Position,
    pub respawn_time: f32,
    pub occupied: bool,
}

#[derive(Debug, Clone)]
pub struct SpawnedItem {
    pub spawn_point_id: String,
    pub _item_id: String,  // Keep for identification
    pub picked_up: bool,
    pub last_pickup_time: Option<std::time::Instant>,
}

pub struct SpawnManager {
    pub spawn_points: Vec<PlayerSpawnPoint>,
    pub vehicle_spawns: Vec<VehicleSpawnPoint>,
    pub weapon_spawns: Vec<WeaponSpawnPoint>,
    pub spawned_vehicles: HashMap<String, SpawnedItem>,
    pub spawned_weapons: HashMap<String, SpawnedItem>,
}

impl SpawnManager {
    pub fn new() -> Self {
        Self {
            spawn_points: Vec::new(),
            vehicle_spawns: Vec::new(),
            weapon_spawns: Vec::new(),
            spawned_vehicles: HashMap::new(),
            spawned_weapons: HashMap::new(),
        }
    }

    pub fn initialize_from_level(&mut self, level: &Level) -> Vec<ServerMessage> {
        let mut spawn_messages = Vec::new();
        
        tracing::info!("Initializing spawn points from level with {} objects", level.objects.len());
        
        // Process all level objects to find spawn points
        for obj in &level.objects {
            match obj.object_type.as_str() {
                "player_spawn" => {
                    if let Some(id) = &obj.id {
                        // Create player spawn point - only has id, position, and rotation
                        let spawn_point = PlayerSpawnPoint {
                            _id: id.clone(),
                            position: obj.position.clone(),
                            _rotation: obj.rotation.clone().unwrap_or(Rotation { x: 0.0, y: 0.0, z: 0.0, w: 1.0 }),
                        };
                        
                        self.spawn_points.push(spawn_point);
                        tracing::debug!("Added player spawn point: {} at {:?}", id, obj.position);
                    }
                }
                "vehicle_spawn" => {
                    if let (Some(id), Some(props)) = (&obj.id, &obj.properties) {
                        if let Some(vehicle_type) = props.get("vehicle_type").and_then(|v| v.as_str()) {
                            let respawn_time = props.get("respawn_time")
                                .and_then(|v| v.as_u64())
                                .unwrap_or(120) as f32;
                            
                            tracing::info!("Creating vehicle spawn point: {} type={} at {:?}", id, vehicle_type, obj.position);
                            
                            // Create vehicle spawn point
                            let spawn_point = VehicleSpawnPoint {
                                id: id.clone(),
                                vehicle_type: vehicle_type.to_string(),
                                position: obj.position.clone(),
                                rotation: obj.rotation.clone().unwrap_or(Rotation { x: 0.0, y: 0.0, z: 0.0, w: 1.0 }),
                                _respawn_time: respawn_time,
                                occupied: false,
                            };
                            
                            self.vehicle_spawns.push(spawn_point);
                            
                            // Create initial spawn
                            let vehicle_id = format!("{}_{}", id, uuid::Uuid::new_v4());
                            self.spawned_vehicles.insert(vehicle_id.clone(), SpawnedItem {
                                spawn_point_id: id.clone(),
                                _item_id: vehicle_id.clone(),
                                picked_up: false,
                                last_pickup_time: None,
                            });
                            
                            // Create spawn message
                            spawn_messages.push(ServerMessage::VehicleSpawned {
                                vehicle_id: vehicle_id.clone(),
                                vehicle_type: vehicle_type.to_string(),
                                position: obj.position.clone(),
                                rotation: obj.rotation.clone().unwrap_or(Rotation { x: 0.0, y: 0.0, z: 0.0, w: 1.0 }),
                            });
                            
                            tracing::info!("Created initial vehicle spawn message for {} at {:?}", vehicle_id, obj.position);
                        }
                    }
                }
                "weapon_spawn" => {
                    if let (Some(id), Some(props)) = (&obj.id, &obj.properties) {
                        if let Some(weapon_type) = props.get("weapon_type").and_then(|v| v.as_str()) {
                            let respawn_time = props.get("respawn_time")
                                .and_then(|v| v.as_u64())
                                .unwrap_or(30) as f32;
                            
                            tracing::info!("Creating weapon spawn point: {} type={} at {:?}", id, weapon_type, obj.position);
                            
                            // Create weapon spawn point
                            let spawn_point = WeaponSpawnPoint {
                                id: id.clone(),
                                weapon_type: weapon_type.to_string(),
                                position: obj.position.clone(),
                                respawn_time,
                                occupied: false,
                            };
                            
                            self.weapon_spawns.push(spawn_point);
                            
                            // Create initial spawn
                            let weapon_id = format!("{}_{}", id, uuid::Uuid::new_v4());
                            self.spawned_weapons.insert(weapon_id.clone(), SpawnedItem {
                                spawn_point_id: id.clone(),
                                _item_id: weapon_id.clone(),
                                picked_up: false,
                                last_pickup_time: None,
                            });
                            
                            // Create spawn message
                            spawn_messages.push(ServerMessage::WeaponSpawn {
                                weapon_id: weapon_id.clone(),
                                weapon_type: weapon_type.to_string(),
                                position: obj.position.clone(),
                            });
                            
                            tracing::info!("Created initial weapon spawn message for {} at {:?}", weapon_id, obj.position);
                        }
                    }
                }
                _ => {}
            }
        }
        
        tracing::info!("Spawn manager initialized with {} vehicle spawns, {} weapon spawns, returning {} spawn messages", 
            self.vehicle_spawns.len(), self.weapon_spawns.len(), spawn_messages.len());
        
        spawn_messages
    }

    pub fn get_random_player_spawn(&self) -> Option<&PlayerSpawnPoint> {
        if self.spawn_points.is_empty() {
            None
        } else {
            let index = rand::random::<usize>() % self.spawn_points.len();
            self.spawn_points.get(index)
        }
    }

    pub fn pickup_item(&mut self, item_id: &str, _player_id: Uuid) -> bool {
        // Check weapons
        if let Some(item) = self.spawned_weapons.get_mut(item_id) {
            if !item.picked_up {
                item.picked_up = true;
                item.last_pickup_time = Some(Instant::now());
                
                // Mark spawn point as occupied
                if let Some(spawn) = self.weapon_spawns.iter_mut().find(|s| s.id == item.spawn_point_id) {
                    spawn.occupied = true;
                }
                
                return true;
            }
        }
        
        // Check vehicles
        if let Some(item) = self.spawned_vehicles.get_mut(item_id) {
            if !item.picked_up {
                item.picked_up = true;
                item.last_pickup_time = Some(Instant::now());
                
                // Mark spawn point as occupied
                if let Some(spawn) = self.vehicle_spawns.iter_mut().find(|s| s.id == item.spawn_point_id) {
                    spawn.occupied = true;
                }
                
                return true;
            }
        }
        
        false
    }

    pub fn update(&mut self, _delta: Duration) {
        // Update logic is handled in check_respawns
    }

    pub fn check_respawns(&mut self, _level: &Level) -> Vec<ServerMessage> {
        let mut messages = Vec::new();
        let now = Instant::now();
        
        // Check weapon respawns
        let weapon_respawns: Vec<String> = self.spawned_weapons.iter()
            .filter_map(|(id, item)| {
                if item.picked_up {
                    if let Some(pickup_time) = item.last_pickup_time {
                        if let Some(spawn) = self.weapon_spawns.iter().find(|s| s.id == item.spawn_point_id) {
                            let respawn_duration = Duration::from_secs_f32(spawn.respawn_time);
                            if now.duration_since(pickup_time) >= respawn_duration {
                                return Some(id.clone());
                            }
                        }
                    }
                }
                None
            })
            .collect();
        
        // Respawn weapons
        for weapon_id in weapon_respawns {
            if let Some(item) = self.spawned_weapons.get_mut(&weapon_id) {
                item.picked_up = false;
                item.last_pickup_time = None;
                
                // Get spawn info
                if let Some(spawn) = self.weapon_spawns.iter_mut().find(|s| s.id == item.spawn_point_id) {
                    spawn.occupied = false;
                    
                    messages.push(ServerMessage::WeaponSpawn {
                        weapon_id: weapon_id.clone(),
                        weapon_type: spawn.weapon_type.clone(),
                        position: spawn.position.clone(),
                    });
                }
            }
        }
        
        // Vehicle respawns would be similar but are handled by the vehicle manager
        
        messages
    }
}