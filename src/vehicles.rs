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
    pub armor: f32,  // Keep for game logic
    pub pilot_id: Option<Uuid>,
    pub passengers: Vec<Uuid>,  // Keep for game logic
    pub is_destroyed: bool,
    pub respawn_time: Option<Instant>,
    pub body_handle: Option<RigidBodyHandle>,
    pub collider_handle: Option<ColliderHandle>,
    pub last_update: Instant,
}

impl Vehicle {
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
            world_position,
            rotation,
            velocity: Vector3::zeros(),
            angular_velocity: Vector3::zeros(),
            health: 100.0,
            max_health: 100.0,
            armor: 0.0,
            pilot_id,
            passengers: Vec::new(),
            is_destroyed: false,
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
