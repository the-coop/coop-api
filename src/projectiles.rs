use std::collections::HashMap;
use nalgebra::{Vector3, Point3};
use uuid::Uuid;
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Projectile {
    pub id: String,
    pub owner_id: Uuid,
    pub weapon_type: String,
    pub position: Point3<f32>,
    pub velocity: Vector3<f32>,
    pub damage: f32,
    pub created_at: std::time::Instant,
    pub is_explosive: bool,
    pub explosion_radius: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Explosion {
    pub position: Point3<f32>,
    pub radius: f32,
    pub damage: f32,
    pub explosion_type: String,
    pub owner_id: Option<Uuid>,
}

pub struct ProjectileSystem {
    projectiles: HashMap<String, Projectile>,
    next_projectile_id: u64,
}

impl ProjectileSystem {
    pub fn new() -> Self {
        Self {
            projectiles: HashMap::new(),
            next_projectile_id: 0,
        }
    }
    
    pub fn spawn_projectile(
        &mut self,
        owner_id: Uuid,
        weapon_type: String,
        origin: Point3<f32>,
        direction: Vector3<f32>,
        speed: f32,
        damage: f32,
        is_explosive: bool,
        explosion_radius: Option<f32>,
    ) -> String {
        let projectile_id = format!("proj_{}", self.next_projectile_id);
        self.next_projectile_id += 1;
        
        let projectile = Projectile {
            id: projectile_id.clone(),
            owner_id,
            weapon_type,
            position: origin,
            velocity: direction.normalize() * speed,
            damage,
            created_at: std::time::Instant::now(),
            is_explosive,
            explosion_radius,
        };
        
        self.projectiles.insert(projectile_id.clone(), projectile);
        projectile_id
    }
    
    pub fn update(&mut self, delta_time: f32) -> Vec<String> {
        let mut expired = Vec::new();
        
        for (id, projectile) in self.projectiles.iter_mut() {
            // Update position
            projectile.position += projectile.velocity * delta_time;
            
            // Apply gravity to non-rocket projectiles
            if projectile.weapon_type != "rocketLauncher" {
                projectile.velocity.y -= 9.81 * delta_time;
            }
            
            // Check lifetime (5 seconds max)
            if projectile.created_at.elapsed().as_secs() > 5 {
                expired.push(id.clone());
            }
        }
        
        // Remove expired projectiles
        for id in &expired {
            self.projectiles.remove(id);
        }
        
        expired
    }
    
    pub fn remove_projectile(&mut self, projectile_id: &str) -> Option<Projectile> {
        self.projectiles.remove(projectile_id)
    }
    
    pub fn get_projectile(&self, projectile_id: &str) -> Option<&Projectile> {
        self.projectiles.get(projectile_id)
    }
    
    pub fn create_explosion(
        &self,
        position: Point3<f32>,
        radius: f32,
        damage: f32,
        explosion_type: String,
        owner_id: Option<Uuid>,
    ) -> Explosion {
        Explosion {
            position,
            radius,
            damage,
            explosion_type,
            owner_id,
        }
    }
}
