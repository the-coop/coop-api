use dashmap::DashMap;
use nalgebra::{Vector3, UnitQuaternion};
use rapier3d::prelude::{RigidBodyHandle, ColliderHandle};
use std::time::{Duration, Instant};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct Projectile {
    pub id: String,
    // These fields may be serialized or used in other contexts
    pub position: Vector3<f32>,
    pub velocity: Vector3<f32>,
    pub rotation: UnitQuaternion<f32>,
    pub body_handle: Option<RigidBodyHandle>,
    pub created_at: Instant,
    pub lifetime: f32,
    pub is_homing: bool,
    pub target_id: Option<String>,
}

impl Projectile {
    pub fn is_expired(&self) -> bool {
        self.created_at.elapsed() > Duration::from_secs_f32(self.lifetime)
    }
    
    pub fn update_homing(&mut self, target_position: Vector3<f32>, delta_time: f32) {
        if !self.is_homing || self.target_id.is_none() {
            return;
        }
        
        // Calculate direction to target
        let to_target = target_position - self.position;
        let distance = to_target.magnitude();
        
        if distance > 0.1 {
            let target_dir = to_target / distance;
            let current_dir = self.velocity.normalize();
            
            // Interpolate towards target direction
            let turn_rate = 2.0; // radians per second
            let max_turn = turn_rate * delta_time;
            
            let dot = current_dir.dot(&target_dir).min(1.0).max(-1.0);
            let angle = dot.acos();
            
            if angle > 0.01 {
                let turn_amount = (max_turn / angle).min(1.0);
                let new_dir = current_dir.lerp(&target_dir, turn_amount).normalize();
                
                let speed = self.velocity.magnitude();
                self.velocity = new_dir * speed;
                
                // Update rotation to match velocity
                let forward = Vector3::new(0.0, 0.0, -1.0);
                self.rotation = UnitQuaternion::rotation_between(&forward, &new_dir)
                    .unwrap_or(UnitQuaternion::identity());
            }
        }
    }
}

pub struct ProjectileManager {
    pub projectiles: DashMap<String, Projectile>,
}

impl ProjectileManager {
    pub fn new() -> Self {
        Self {
            projectiles: DashMap::new(),
        }
    }
    
    pub fn update_from_physics(
        &mut self,
        projectile_id: &str,
        position: Vector3<f32>,
        velocity: Vector3<f32>,
        rotation: UnitQuaternion<f32>,
    ) {
        if let Some(mut proj) = self.projectiles.get_mut(projectile_id) {
            proj.position = position;
            proj.velocity = velocity;
            proj.rotation = rotation;
        }
    }
    
    pub fn remove_expired(&mut self) -> Vec<String> {
        let expired: Vec<String> = self.projectiles.iter()
            .filter(|entry| entry.value().is_expired())
            .map(|entry| entry.key().clone())
            .collect();
        
        for id in &expired {
            self.projectiles.remove(id);
        }
        
        expired
    }
}
