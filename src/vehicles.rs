use dashmap::DashMap;
use nalgebra::{Vector3, UnitQuaternion};
use rapier3d::prelude::{RigidBodyHandle, ColliderHandle};
use std::time::Instant;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct Vehicle {
    pub id: String,
    pub vehicle_type: String,
    pub position: Vector3<f32>,
    pub world_position: Vector3<f64>,
    pub rotation: UnitQuaternion<f32>,
    pub velocity: Vector3<f32>,
    pub angular_velocity: Vector3<f32>,
    pub health: f32,
    pub max_health: f32,
    #[allow(dead_code)]
    pub armor: f32, // Add armor field
    pub pilot_id: Option<Uuid>,
    pub passengers: Vec<Uuid>,
    pub is_destroyed: bool,
    pub respawn_time: Option<Instant>,
    pub body_handle: Option<RigidBodyHandle>,
    pub collider_handle: Option<ColliderHandle>,
    pub last_update: Instant,
}

impl Vehicle {
    #[allow(dead_code)]
    pub fn new(id: String, vehicle_type: String, world_position: Vector3<f64>) -> Self {
        let max_health = match vehicle_type.as_str() {
            "spaceship" => 500.0,
            "helicopter" => 300.0,
            "plane" => 400.0,
            "car" => 200.0,
            _ => 100.0,
        };
        
        Self {
            id,
            vehicle_type,
            world_position,
            position: Vector3::zeros(),
            rotation: UnitQuaternion::identity(),
            velocity: Vector3::zeros(),
            angular_velocity: Vector3::zeros(),
            health: max_health,
            max_health,
            armor: 0.0, // Initialize armor
            pilot_id: None,
            passengers: Vec::new(),
            is_destroyed: false,
            respawn_time: None,
            body_handle: None,
            collider_handle: None,
            last_update: Instant::now(),
        }
    }
    
    #[allow(dead_code)]
    pub fn take_damage(&mut self, damage: f32) -> bool {
        if self.is_destroyed {
            return false;
        }
        
        self.health = (self.health - damage).max(0.0);
        
        if self.health <= 0.0 {
            self.is_destroyed = true;
            self.respawn_time = Some(Instant::now() + std::time::Duration::from_secs(
                match self.vehicle_type.as_str() {
                    "spaceship" => 180,
                    "helicopter" => 150,
                    "plane" => 150,
                    "car" => 90,
                    _ => 120,
                }
            ));
            
            // Eject all occupants
            self.pilot_id = None;
            self.passengers.clear();
            
            return true; // Vehicle destroyed
        }
        
        false
    }
    
    pub fn respawn(&mut self) {
        self.health = self.max_health;
        self.is_destroyed = false;
        self.respawn_time = None;
        self.velocity = Vector3::zeros();
        self.angular_velocity = Vector3::zeros();
        // Reset position will be handled by physics
    }
    
    pub fn get_world_position(&self) -> Vector3<f64> {
        Vector3::new(
            self.world_position.x + self.position.x as f64,
            self.world_position.y + self.position.y as f64,
            self.world_position.z + self.position.z as f64,
        )
    }
}

pub struct VehicleManager {
    pub vehicles: DashMap<String, Vehicle>,
}

impl VehicleManager {
    pub fn new() -> Self {
        Self {
            vehicles: DashMap::new(),
        }
    }
    
    #[allow(dead_code)]
    pub fn spawn_vehicle(
        &mut self,
        vehicle_type: String,
        world_position: Vector3<f64>,
        rotation: Option<UnitQuaternion<f32>>,
        pilot_id: Option<Uuid>,
    ) -> String {
        let vehicle_id = format!("vehicle_{}", Uuid::new_v4());
        self.spawn_vehicle_with_id(vehicle_id.clone(), vehicle_type, world_position, rotation, pilot_id);
        vehicle_id
    }
    
    pub fn spawn_vehicle_with_id(
        &mut self,
        vehicle_id: String,
        vehicle_type: String,
        world_position: Vector3<f64>,
        rotation: Option<UnitQuaternion<f32>>,
        pilot_id: Option<Uuid>,
    ) -> String {
        let rotation = rotation.unwrap_or_else(UnitQuaternion::identity);
        
        let vehicle = Vehicle {
            id: vehicle_id.clone(),
            vehicle_type,
            position: Vector3::new(
                world_position.x as f32,
                world_position.y as f32,
                world_position.z as f32
            ),
            world_position, // Add the missing field
            rotation,
            velocity: Vector3::zeros(),
            angular_velocity: Vector3::zeros(),
            health: 100.0,
            max_health: 100.0,
            armor: 0.0,
            pilot_id,
            passengers: Vec::new(),
            is_destroyed: false, // Use correct field name
            respawn_time: None,
            body_handle: None,
            collider_handle: None,
            last_update: Instant::now(),
        };
        
        self.vehicles.insert(vehicle_id.clone(), vehicle);
        vehicle_id
    }
    
    pub fn update_from_physics(
        &mut self,
        vehicle_id: &str,
        position: Vector3<f32>,
        rotation: UnitQuaternion<f32>,
        velocity: Vector3<f32>,
        angular_velocity: Vector3<f32>,
    ) {
        if let Some(mut vehicle) = self.vehicles.get_mut(vehicle_id) {
            vehicle.position = position;
            vehicle.rotation = rotation;
            vehicle.velocity = velocity;
            vehicle.angular_velocity = angular_velocity;
            vehicle.last_update = Instant::now();
        }
    }
    
    #[allow(dead_code)]
    pub fn enter_vehicle(&mut self, vehicle_id: &str, player_id: Uuid, as_pilot: bool) -> bool {
        if let Some(mut vehicle) = self.vehicles.get_mut(vehicle_id) {
            if vehicle.is_destroyed {
                return false;
            }
            
            if as_pilot && vehicle.pilot_id.is_none() {
                vehicle.pilot_id = Some(player_id);
                return true;
            } else if !as_pilot && vehicle.passengers.len() < self.get_max_passengers(&vehicle.vehicle_type) {
                vehicle.passengers.push(player_id);
                return true;
            }
        }
        false
    }
    
    #[allow(dead_code)]
    pub fn exit_vehicle(&mut self, vehicle_id: &str, player_id: Uuid) -> Option<Vector3<f32>> {
        if let Some(mut vehicle) = self.vehicles.get_mut(vehicle_id) {
            if vehicle.pilot_id == Some(player_id) {
                vehicle.pilot_id = None;
                // Calculate safe exit position
                let exit_offset = match vehicle.vehicle_type.as_str() {
                    "spaceship" => Vector3::new(5.0, 0.0, 0.0),
                    "helicopter" => Vector3::new(3.0, -2.0, 0.0),
                    "plane" => Vector3::new(3.0, 0.0, 0.0),
                    "car" => Vector3::new(2.0, 1.0, 0.0),
                    _ => Vector3::new(2.0, 0.0, 0.0),
                };
                
                let rotated_offset = vehicle.rotation * exit_offset;
                return Some(vehicle.position + rotated_offset);
            } else {
                vehicle.passengers.retain(|&id| id != player_id);
                // Exit from passenger side
                let exit_offset = Vector3::new(-2.0, 0.0, 0.0);
                let rotated_offset = vehicle.rotation * exit_offset;
                return Some(vehicle.position + rotated_offset);
            }
        }
        None
    }
    
    #[allow(dead_code)]
    fn get_max_passengers(&self, vehicle_type: &str) -> usize {
        match vehicle_type {
            "spaceship" => 4,
            "helicopter" => 3,
            "plane" => 1,
            "car" => 3,
            _ => 0,
        }
    }
    
    pub fn check_respawns(&mut self) -> Vec<(String, String, Vector3<f64>)> {
        let now = Instant::now();
        let mut respawns = Vec::new();
        
        for entry in self.vehicles.iter() {
            let vehicle = entry.value();
            if vehicle.is_destroyed {
                if let Some(respawn_time) = vehicle.respawn_time {
                    if now >= respawn_time {
                        respawns.push((
                            vehicle.id.clone(),
                            vehicle.vehicle_type.clone(),
                            vehicle.world_position,
                        ));
                    }
                }
            }
        }
        
        // Apply respawns
        for (id, _, _) in &respawns {
            if let Some(mut vehicle) = self.vehicles.get_mut(id) {
                vehicle.respawn();
            }
        }
        
        respawns
    }
}
