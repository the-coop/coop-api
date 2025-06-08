use std::collections::HashMap;
use nalgebra::{Vector3, Unit};
use uuid::Uuid;
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Projectile {
    pub id: String,
    pub owner_id: String,
    pub weapon_type: String,
    pub position: Vector3<f32>,
    pub velocity: Vector3<f32>,
    pub damage: f32,
    pub explosion_radius: Option<f32>,
    pub created_at: std::time::Instant,
    pub lifetime: f32, // seconds
}

impl Projectile {
    pub fn new(
        owner_id: String,
        weapon_type: String,
        origin: Vector3<f32>,
        direction: Vector3<f32>,
    ) -> Self {
        let projectile_id = format!("proj_{}", Uuid::new_v4());
        
        // Set projectile properties based on weapon type
        let (speed, damage, explosion_radius, lifetime) = match weapon_type.as_str() {
            "pistol" => (500.0, 25.0, None, 2.0),
            "rifle" => (800.0, 35.0, None, 2.0),
            "shotgun" => (400.0, 15.0, None, 1.0), // Per pellet
            "rocket_launcher" => (50.0, 100.0, Some(5.0), 10.0),
            "grenade_launcher" => (30.0, 80.0, Some(4.0), 5.0),
            "plasma_rifle" => (300.0, 40.0, Some(1.0), 3.0),
            _ => (500.0, 30.0, None, 2.0),
        };
        
        let velocity = direction.normalize() * speed;
        
        Self {
            id: projectile_id,
            owner_id,
            weapon_type,
            position: origin,
            velocity,
            damage,
            explosion_radius,
            created_at: std::time::Instant::now(),
            lifetime,
        }
    }
    
    pub fn update(&mut self, delta_time: f32, gravity: &Vector3<f32>) {
        // Update position
        self.position += self.velocity * delta_time;
        
        // Apply gravity for certain projectiles
        match self.weapon_type.as_str() {
            "grenade_launcher" | "rocket_launcher" => {
                self.velocity += gravity * delta_time;
            }
            _ => {} // Bullets travel straight
        }
    }
    
    pub fn is_expired(&self) -> bool {
        self.created_at.elapsed().as_secs_f32() > self.lifetime
    }
}

pub struct ProjectileManager {
    pub projectiles: HashMap<String, Projectile>,
}

impl ProjectileManager {
    pub fn new() -> Self {
        Self {
            projectiles: HashMap::new(),
        }
    }
    
    pub fn add_projectile(&mut self, projectile: Projectile) -> String {
        let id = projectile.id.clone();
        self.projectiles.insert(id.clone(), projectile);
        id
    }
    
    pub fn remove_projectile(&mut self, id: &str) -> Option<Projectile> {
        self.projectiles.remove(id)
    }
    
    pub fn update(&mut self, delta_time: f32, gravity: &Vector3<f32>) {
        let expired: Vec<String> = self.projectiles
            .iter()
            .filter(|(_, proj)| proj.is_expired())
            .map(|(id, _)| id.clone())
            .collect();
        
        // Remove expired projectiles
        for id in expired {
            self.projectiles.remove(&id);
        }
        
        // Update remaining projectiles
        for projectile in self.projectiles.values_mut() {
            projectile.update(delta_time, gravity);
        }
    }
    
    pub fn check_collisions(&self, players: &crate::player::PlayerManager, dynamic_objects: &crate::dynamic_objects::DynamicObjectManager) -> Vec<(String, String, String)> {
        let mut hits = Vec::new();
        
        for (proj_id, projectile) in &self.projectiles {
            // Check player collisions
            for entry in players.players.iter() {
                let player_id = entry.key();
                let player = entry.value();
                
                // Don't hit the shooter or dead players
                if player_id.to_string() == projectile.owner_id || player.is_dead {
                    continue;
                }
                
                // Simple sphere collision
                let distance = (player.position - projectile.position).magnitude();
                if distance < 1.0 { // Player collision radius
                    hits.push((proj_id.clone(), "player".to_string(), player_id.to_string()));
                }
            }
            
            // Check vehicle collisions
            for (obj_id, obj) in &dynamic_objects.objects {
                if obj.object_type == "vehicle" || obj.object_type == "plane" || 
                   obj.object_type == "helicopter" || obj.object_type == "spaceship" {
                    let distance = (obj.position - projectile.position).magnitude();
                    if distance < 3.0 { // Vehicle collision radius
                        hits.push((proj_id.clone(), "vehicle".to_string(), obj_id.clone()));
                    }
                }
            }
        }
        
        hits
    }
}
