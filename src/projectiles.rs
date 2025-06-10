use dashmap::DashMap;
use nalgebra::{Vector3, UnitQuaternion};
use rapier3d::prelude::{RigidBodyHandle, ColliderHandle};
use std::time::{Duration, Instant};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct Projectile {
    pub id: String,
    #[allow(dead_code)]
    pub projectile_type: String,
    #[allow(dead_code)]
    pub owner_id: Uuid,
    pub position: Vector3<f32>,
    pub velocity: Vector3<f32>,
    pub rotation: UnitQuaternion<f32>,
    #[allow(dead_code)]
    pub damage: f32,
    #[allow(dead_code)]
    pub explosion_radius: Option<f32>,
    pub body_handle: Option<RigidBodyHandle>,
    #[allow(dead_code)]
    pub collider_handle: Option<ColliderHandle>,
    pub created_at: Instant,
    pub lifetime: f32,
    #[allow(dead_code)]
    pub has_gravity: bool,
    pub is_homing: bool,
    pub target_id: Option<String>,
}

impl Projectile {
    #[allow(dead_code)]
    pub fn new(
        id: String,
        projectile_type: String,
        owner_id: Uuid,
        position: Vector3<f32>,
        velocity: Vector3<f32>,
        rotation: UnitQuaternion<f32>,
        damage: f32,
        explosion_radius: Option<f32>,
        lifetime: f32,
        has_gravity: bool,
    ) -> Self {
        Self {
            id,
            projectile_type,
            owner_id,
            position,
            velocity,
            rotation,
            damage,
            explosion_radius,
            body_handle: None,
            collider_handle: None,
            created_at: Instant::now(),
            lifetime,
            has_gravity,
            is_homing: false,
            target_id: None,
        }
    }
    
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
    
    #[allow(dead_code)]
    pub fn spawn_projectile(
        &mut self,
        projectile_type: String,
        owner_id: Uuid,
        position: Vector3<f32>,
        velocity: Vector3<f32>,
        rotation: UnitQuaternion<f32>,
        damage: f32,
        explosion_radius: Option<f32>,
        lifetime: f32,
        has_gravity: bool,
        body_handle: Option<RigidBodyHandle>,
        collider_handle: Option<ColliderHandle>,
    ) -> String {
        let id = format!("proj_{}", Uuid::new_v4());
        
        let mut projectile = Projectile::new(
            id.clone(),
            projectile_type.clone(),
            owner_id,
            position,
            velocity,
            rotation,
            damage,
            explosion_radius,
            lifetime,
            has_gravity,
        );
        
        projectile.body_handle = body_handle;
        projectile.collider_handle = collider_handle;
        
        // Homing missiles
        if projectile_type == "missile" || projectile_type == "homingMissile" {
            projectile.is_homing = true;
        }
        
        self.projectiles.insert(id.clone(), projectile);
        id
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
    
    #[allow(dead_code)]
    pub fn set_homing_target(&mut self, projectile_id: &str, target_id: String) {
        if let Some(mut proj) = self.projectiles.get_mut(projectile_id) {
            if proj.is_homing {
                proj.target_id = Some(target_id);
            }
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
    
    #[allow(dead_code)]
    pub fn handle_impact(&mut self, projectile_id: &str) -> Option<(Vector3<f32>, f32, Option<f32>)> {
        if let Some((_, proj)) = self.projectiles.remove(projectile_id) {
            Some((proj.position, proj.damage, proj.explosion_radius))
        } else {
            None
        }
    }
}
