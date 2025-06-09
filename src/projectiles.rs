use nalgebra::{Vector3, Point3};
use uuid::Uuid;
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone)]
pub struct Projectile {
    pub id: String,
    pub owner_id: Uuid,
    pub weapon_type: String,
    pub position: Point3<f32>,
    pub velocity: Vector3<f32>,
    pub damage: f32,
    #[allow(dead_code)]
    pub created_at: std::time::Instant,
    pub is_explosive: bool,
    pub explosion_radius: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SerializedProjectile {
    pub id: String,
    pub owner_id: String,
    pub weapon_type: String,
    pub position: crate::messages::Position,
    pub velocity: crate::messages::Velocity,
    pub damage: f32,
    pub is_explosive: bool,
    pub explosion_radius: Option<f32>,
}

impl From<&Projectile> for SerializedProjectile {
    fn from(p: &Projectile) -> Self {
        SerializedProjectile {
            id: p.id.clone(),
            owner_id: p.owner_id.to_string(),
            weapon_type: p.weapon_type.clone(),
            position: crate::messages::Position {
                x: p.position.x,
                y: p.position.y,
                z: p.position.z,
            },
            velocity: crate::messages::Velocity {
                x: p.velocity.x,
                y: p.velocity.y,
                z: p.velocity.z,
            },
            damage: p.damage,
            is_explosive: p.is_explosive,
            explosion_radius: p.explosion_radius,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Explosion {
    pub position: crate::messages::Position,
    pub radius: f32,
    pub damage: f32,
    pub explosion_type: String,
    pub owner_id: Option<String>,
}

#[allow(dead_code)]
pub struct ProjectileManager {
    // Implementation...
}

impl ProjectileManager {
    #[allow(dead_code)]
    pub fn new() -> Self {
        Self {
            // Add any fields needed here
        }
    }
}
