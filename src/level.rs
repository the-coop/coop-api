use crate::messages::{LevelObject, Position, Rotation, Vec3};
use crate::physics::PhysicsWorld;
use nalgebra::{Vector3, UnitQuaternion};
use rapier3d::prelude::*;

pub struct Level {
    pub objects: Vec<LevelObject>,
}

impl Level {
    #[allow(dead_code)]
    pub fn new() -> Self {
        Self {
            objects: Vec::new(),
        }
    }

    pub fn create_default_multiplayer_level() -> Self {
        let mut objects = Vec::new();
        
        // Planet at y = -250
        objects.push(LevelObject {
            object_type: "planet".to_string(),
            position: Position { x: 0.0, y: -250.0, z: 0.0 },
            rotation: None,
            scale: Some(Vec3 { x: 200.0, y: 200.0, z: 200.0 }),
            properties: None,
        });
        
        // Main platform at y = 30 (height 3, so top is at y = 31.5)
        objects.push(LevelObject {
            object_type: "platform".to_string(),
            position: Position { x: 0.0, y: 30.0, z: 0.0 },
            rotation: None,
            scale: Some(Vec3 { x: 50.0, y: 3.0, z: 50.0 }),
            properties: None,
        });
        
        // Add wall
        objects.push(LevelObject {
            object_type: "wall".to_string(),
            position: Position { x: 10.0, y: 30.0 + 1.5 + 4.0, z: -15.0 },
            rotation: None,
            scale: Some(Vec3 { x: 20.0, y: 8.0, z: 1.0 }),
            properties: None,
        });
        
        // Add ramp
        let ramp_angle = std::f32::consts::PI / 6.0;
        objects.push(LevelObject {
            object_type: "ramp".to_string(),
            position: Position { x: -15.0, y: 30.0 + 1.5 + 2.5, z: 10.0 },
            rotation: Some(Rotation {
                x: ramp_angle.sin() / 2.0,
                y: 0.0,
                z: 0.0,
                w: ramp_angle.cos() / 2.0,
            }),
            scale: Some(Vec3 { x: 10.0, y: 1.0, z: 15.0 }),
            properties: None,
        });
        
        // Moving platform positioned at top of ramp
        let ramp_top_offset = ramp_angle.sin() * 15.0 / 2.0;
        let ramp_top_height = 30.0 + 3.0/2.0 + 5.0/2.0 + ramp_top_offset;
        let ramp_top_z = 10.0 + ramp_angle.cos() * 15.0 / 2.0;
        
        objects.push(LevelObject {
            object_type: "moving_platform".to_string(),
            position: Position {
                x: -15.0,
                y: ramp_top_height + 0.5,
                z: ramp_top_z + 4.0 + 1.0,
            },
            rotation: None,
            scale: Some(Vec3 { x: 8.0, y: 1.0, z: 8.0 }),
            properties: Some(serde_json::json!({
                "move_range": 20.0,
                "move_speed": 0.2
            })),
        });
        
        // Add some initial rocks on the planet
        for i in 0..20 {
            let theta = (i as f32) * std::f32::consts::PI * 2.0 / 20.0;
            let phi = std::f32::consts::PI / 3.0; // 60 degrees from pole
            
            let x = phi.sin() * theta.cos();
            let y = phi.cos();
            let z = phi.sin() * theta.sin();
            
            let radius = 205.0;
            let rock_pos = Vector3::new(x * radius, y * radius, z * radius);
            let rock_pos = rock_pos + Vector3::new(0.0, -250.0, 0.0);
            
            objects.push(LevelObject {
                object_type: "static_rock".to_string(),
                position: Position {
                    x: rock_pos.x,
                    y: rock_pos.y,
                    z: rock_pos.z,
                },
                rotation: None,
                scale: Some(Vec3 {
                    x: 0.5 + rand::random::<f32>() * 1.5,
                    y: 0.5 + rand::random::<f32>() * 1.5,
                    z: 0.5 + rand::random::<f32>() * 1.5,
                }),
                properties: None,
            });
        }
        
        Self { objects }
    }

    pub fn build_physics(&self, physics: &mut PhysicsWorld) {
        for obj in &self.objects {
            match obj.object_type.as_str() {
                "planet" => {
                    self.build_planet_physics(physics, &obj);
                }
                "platform" | "wall" => {
                    self.build_box_physics(physics, &obj);
                }
                "ramp" => {
                    self.build_ramp_physics(physics, &obj);
                }
                "moving_platform" => {
                    self.build_moving_platform_physics(physics, &obj);
                }
                "static_rock" => {
                    self.build_static_rock_physics(physics, &obj);
                }
                _ => {
                    tracing::warn!("Unknown object type in level: {}", obj.object_type);
                }
            }
        }
        
        // Set gravity center based on planet position
        if let Some(planet) = self.objects.iter().find(|o| o.object_type == "planet") {
            physics.gravity = Vector3::new(0.0, planet.position.y, 0.0);
            tracing::info!("Set gravity center to planet at y={}", planet.position.y);
        }
    }

    fn build_planet_physics(&self, physics: &mut PhysicsWorld, obj: &LevelObject) {
        let pos = Vector3::new(obj.position.x, obj.position.y, obj.position.z);
        let body = physics.create_fixed_body(pos);
        
        // Create a sphere collider as approximation
        if let Some(scale) = &obj.scale {
            let radius = scale.x; // Assuming uniform scale for planet
            let collider = ColliderBuilder::ball(radius)
                .friction(0.8)
                .restitution(0.1)
                .build();
            physics.collider_set.insert_with_parent(collider, body, &mut physics.rigid_body_set);
        }
    }

    fn build_box_physics(&self, physics: &mut PhysicsWorld, obj: &LevelObject) {
        let pos = Vector3::new(obj.position.x, obj.position.y, obj.position.z);
        let body = physics.create_fixed_body(pos);
        
        if let Some(scale) = &obj.scale {
            let half_extents = Vector3::new(scale.x / 2.0, scale.y / 2.0, scale.z / 2.0);
            let collider = ColliderBuilder::cuboid(half_extents.x, half_extents.y, half_extents.z)
                .friction(0.8)
                .restitution(0.2)
                .build();
            physics.collider_set.insert_with_parent(collider, body, &mut physics.rigid_body_set);
        }
    }

    fn build_ramp_physics(&self, physics: &mut PhysicsWorld, obj: &LevelObject) {
        let pos = Vector3::new(obj.position.x, obj.position.y, obj.position.z);
        
        let rotation = if let Some(rot) = &obj.rotation {
            UnitQuaternion::new_normalize(nalgebra::Quaternion::new(rot.w, rot.x, rot.y, rot.z))
        } else {
            UnitQuaternion::identity()
        };
        
        let body = physics.create_fixed_body_with_rotation(pos, rotation);
        
        if let Some(scale) = &obj.scale {
            let half_extents = Vector3::new(scale.x / 2.0, scale.y / 2.0, scale.z / 2.0);
            let collider = ColliderBuilder::cuboid(half_extents.x, half_extents.y, half_extents.z)
                .friction(0.7)
                .restitution(0.1)
                .build();
            physics.collider_set.insert_with_parent(collider, body, &mut physics.rigid_body_set);
        }
    }

    fn build_moving_platform_physics(&self, physics: &mut PhysicsWorld, obj: &LevelObject) {
        let pos = Vector3::new(obj.position.x, obj.position.y, obj.position.z);
        let body = physics.create_kinematic_body(pos);
        
        if let Some(scale) = &obj.scale {
            let half_extents = Vector3::new(scale.x / 2.0, scale.y / 2.0, scale.z / 2.0);
            let collider = ColliderBuilder::cuboid(half_extents.x, half_extents.y, half_extents.z)
                .friction(12.0)
                .restitution(0.01)
                .build();
            physics.collider_set.insert_with_parent(collider, body, &mut physics.rigid_body_set);
        }
        
        // Store the body handle and properties for animation
        physics.moving_platforms.push((body, obj.position.x, obj.properties.clone()));
        
        tracing::info!("Created moving platform at x={} with body handle {:?}", obj.position.x, body);
    }

    fn build_static_rock_physics(&self, physics: &mut PhysicsWorld, obj: &LevelObject) {
        let pos = Vector3::new(obj.position.x, obj.position.y, obj.position.z);
        let body = physics.create_fixed_body(pos);
        
        if let Some(scale) = &obj.scale {
            // Use average scale for sphere radius
            let radius = (scale.x + scale.y + scale.z) / 3.0;
            let collider = ColliderBuilder::ball(radius * 2.0) // Diameter to radius
                .friction(0.8)
                .restitution(0.4)
                .build();
            physics.collider_set.insert_with_parent(collider, body, &mut physics.rigid_body_set);
        }
    }
}
