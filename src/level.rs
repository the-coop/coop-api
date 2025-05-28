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
                x: -(ramp_angle / 2.0).sin(), // Negative for correct rotation
                y: 0.0,
                z: 0.0,
                w: (ramp_angle / 2.0).cos(),
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
        
        // Create the same terrain as the client for accurate collision
        if let Some(scale) = &obj.scale {
            let planet_radius = scale.x;
            let terrain_height = 30.0;
            
            // Generate icosahedron vertices
            let subdivisions = 5;
            let (vertices, indices) = generate_icosahedron_terrain(planet_radius, terrain_height, subdivisions);
            
            // Create trimesh collider for accurate terrain collision
            let collider = ColliderBuilder::trimesh(vertices, indices)
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
            let collider = ColliderBuilder::ball(radius) // This should be just radius, not diameter
                .friction(0.8)
                .restitution(0.4)
                .build();
            physics.collider_set.insert_with_parent(collider, body, &mut physics.rigid_body_set);
        }
    }
}

// Generate the same terrain mesh as the client
fn generate_icosahedron_terrain(radius: f32, terrain_height: f32, _subdivisions: u32) -> (Vec<nalgebra::Point3<f32>>, Vec<[u32; 3]>) {
    use std::f32::consts::PI;
    
    // This is a simplified version - in production you'd want to match the client's exact algorithm
    // For now, we'll create a sphere with some noise
    let mut vertices = Vec::new();
    let mut indices = Vec::new();
    
    // Create a sphere with terrain displacement
    let resolution = 32; // Lower resolution for server performance
    
    for lat in 0..=resolution {
        let theta = lat as f32 * PI / resolution as f32;
        let sin_theta = theta.sin();
        let cos_theta = theta.cos();
        
        for lon in 0..=resolution {
            let phi = lon as f32 * 2.0 * PI / resolution as f32;
            let sin_phi = phi.sin();
            let cos_phi = phi.cos();
            
            let x = sin_theta * cos_phi;
            let y = cos_theta;
            let z = sin_theta * sin_phi;
            
            // Generate terrain height (simplified version of client algorithm)
            let mut height = 0.0;
            height += (theta * 1.5).sin() * (phi * 2.0).cos() * 0.3;
            height += (theta * 1.2).cos() * (phi * 1.8).sin() * 0.25;
            
            let mountain_noise = (theta * 4.0).sin() * (phi * 3.0).cos();
            if mountain_noise > 0.3 {
                height += mountain_noise * 0.5;
            }
            
            height += (theta * 8.0).sin() * (phi * 6.0).cos() * 0.15;
            height += (theta * 10.0).cos() * (phi * 8.0).sin() * 0.1;
            height += (theta * 20.0).sin() * (phi * 15.0).cos() * 0.05;
            
            if height.abs() < 0.1 {
                height *= 0.3;
            }
            
            height = (height + 1.0) * 0.5;
            let final_radius = radius + (height * terrain_height) - terrain_height * 0.3;
            
            vertices.push(nalgebra::Point3::new(
                x * final_radius,
                y * final_radius,
                z * final_radius,
            ));
        }
    }
    
    // Generate indices for triangle mesh
    for lat in 0..resolution {
        for lon in 0..resolution {
            let current = lat * (resolution + 1) + lon;
            let next = current + 1;
            let below = (lat + 1) * (resolution + 1) + lon;
            let below_next = below + 1;
            
            // First triangle
            indices.push([current, below, next]);
            // Second triangle
            indices.push([next, below, below_next]);
        }
    }
    
    (vertices, indices)
}
