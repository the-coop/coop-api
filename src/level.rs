use crate::messages::{LevelObject, Position, Rotation, Vec3, TerrainData};
use crate::physics::PhysicsWorld;
use nalgebra::{Vector3, UnitQuaternion};
use rapier3d::prelude::*;

pub struct Level {
    pub objects: Vec<LevelObject>,
}

impl Level {
    pub fn create_default_multiplayer_level() -> Self {
        let mut objects = Vec::new();
        
        // Generate terrain data for planet
        let planet_radius = 200.0;
        let terrain_height = 30.0;
        let subdivisions = 5;
        let (vertices, indices) = generate_icosahedron_terrain(planet_radius, terrain_height, subdivisions);
        
        // Convert vertices to flattened array
        let flattened_vertices: Vec<f32> = vertices.iter()
            .flat_map(|v| vec![v.x, v.y, v.z])
            .collect();
        
        // Flatten indices
        let flattened_indices: Vec<u32> = indices.iter()
            .flat_map(|tri| vec![tri[0], tri[1], tri[2]])
            .collect();
        
        // Planet at y = -250
        objects.push(LevelObject {
            object_type: "planet".to_string(),
            position: Position { x: 0.0, y: -250.0, z: 0.0 },
            rotation: None,
            scale: Some(Vec3 { x: planet_radius, y: planet_radius, z: planet_radius }),
            properties: None,
            terrain_data: Some(TerrainData {
                vertices: flattened_vertices,
                indices: flattened_indices,
            }),
        });
        
        // Main platform at y = 30 (height 3, so top is at y = 31.5)
        objects.push(LevelObject {
            object_type: "platform".to_string(),
            position: Position { x: 0.0, y: 30.0, z: 0.0 },
            rotation: None,
            scale: Some(Vec3 { x: 50.0, y: 3.0, z: 50.0 }),
            properties: None,
            terrain_data: None,
        });
        
        // Add wall
        objects.push(LevelObject {
            object_type: "wall".to_string(),
            position: Position { x: 10.0, y: 30.0 + 1.5 + 4.0, z: -15.0 },
            rotation: None,
            scale: Some(Vec3 { x: 20.0, y: 8.0, z: 1.0 }),
            properties: None,
            terrain_data: None,
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
            terrain_data: None,
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
            terrain_data: None,
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
                terrain_data: None,
            });
        }
        
        // Add water volume on the platform
        // Platform is at y=30 with height=3, so top is at y=31.5
        // Water should sit on top, so bottom at y=31.5
        objects.push(LevelObject {
            object_type: "water_volume".to_string(),
            position: Position { 
                x: 15.0, // Positive X side (right side when facing -Z)
                y: 31.5 + 5.0, // Platform top (31.5) + half of water height (5.0)
                z: 0.0 
            },
            rotation: None,
            scale: Some(Vec3 { x: 15.0, y: 10.0, z: 15.0 }), // 15x10x15 water pool
            properties: Some(serde_json::json!({
                "color": "#4488ff",
                "opacity": 0.5,
                "flow_speed": 0.0
            })),
            terrain_data: None,
        });
        
        // Add walls around water volume
        // Water center is at x=15, z=0, and extends ±7.5 in each direction
        
        // Back wall (positive Z side)
        objects.push(LevelObject {
            object_type: "wall".to_string(),
            position: Position { 
                x: 15.0, 
                y: 31.5 + 5.0, // Same center height as water
                z: 8.5 // Water edge (7.5) + wall half-thickness (0.5)
            },
            rotation: None,
            scale: Some(Vec3 { x: 17.0, y: 12.0, z: 1.0 }), // Wider and taller than water
            properties: None,
            terrain_data: None,
        });
        
        // Front wall (negative Z side)
        objects.push(LevelObject {
            object_type: "wall".to_string(),
            position: Position { 
                x: 15.0, 
                y: 31.5 + 5.0,
                z: -8.5 
            },
            rotation: None,
            scale: Some(Vec3 { x: 17.0, y: 12.0, z: 1.0 }),
            properties: None,
            terrain_data: None,
        });
        
        // Right wall (positive X side)
        objects.push(LevelObject {
            object_type: "wall".to_string(),
            position: Position { 
                x: 23.5, // Water edge (22.5) + wall half-thickness (0.5)
                y: 31.5 + 5.0,
                z: 0.0 
            },
            rotation: None,
            scale: Some(Vec3 { x: 1.0, y: 12.0, z: 17.0 }), // Swapped x and z for side wall
            properties: None,
            terrain_data: None,
        });
        
        // Left wall (negative X side) - partial wall with gap for entry
        // Upper part
        objects.push(LevelObject {
            object_type: "wall".to_string(),
            position: Position { 
                x: 6.5, // Water edge (7.5) - wall half-thickness (0.5)
                y: 31.5 + 5.0,
                z: 4.5 // Offset to create gap in middle
            },
            rotation: None,
            scale: Some(Vec3 { x: 1.0, y: 12.0, z: 8.0 }), // Partial wall
            properties: None,
            terrain_data: None,
        });
        
        // Lower part
        objects.push(LevelObject {
            object_type: "wall".to_string(),
            position: Position { 
                x: 6.5,
                y: 31.5 + 5.0,
                z: -4.5 
            },
            rotation: None,
            scale: Some(Vec3 { x: 1.0, y: 12.0, z: 8.0 }), // Partial wall
            properties: None,
            terrain_data: None,
        });
        
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
                "water_volume" => {
                    self.build_water_volume_physics(physics, &obj);
                }
                "dynamic_platform" => {
                    self.build_dynamic_platform_physics(physics, &obj);
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

    fn build_water_volume_physics(&self, physics: &mut PhysicsWorld, obj: &LevelObject) {
        let pos = Vector3::new(obj.position.x, obj.position.y, obj.position.z);
        let body = physics.create_fixed_body(pos);
        
        if let Some(scale) = &obj.scale {
            let half_extents = Vector3::new(scale.x / 2.0, scale.y / 2.0, scale.z / 2.0);
            // Create sensor collider for water detection
            let collider = ColliderBuilder::cuboid(half_extents.x, half_extents.y, half_extents.z)
                .sensor(true) // Make it a sensor so players can pass through
                .collision_groups(InteractionGroups::new(0x0002.into(), 0xFFFF.into())) // Water layer
                .build();
            let handle = physics.collider_set.insert_with_parent(collider, body, &mut physics.rigid_body_set);
            
            // Store water volume for physics queries
            physics.water_volumes.push((handle, pos, scale.clone()));  // Clone the scale
        }
    }

    fn build_dynamic_platform_physics(&self, _physics: &mut PhysicsWorld, _obj: &LevelObject) {
        // This method is no longer needed since we're not building dynamic platforms from level data
        tracing::warn!("build_dynamic_platform_physics called but dynamic platforms should be spawned separately");
    }
}

// Generate the same terrain mesh as the client
fn generate_icosahedron_terrain(radius: f32, terrain_height: f32, subdivisions: u32) -> (Vec<nalgebra::Point3<f32>>, Vec<[u32; 3]>) {
    // Generate icosahedron vertices matching the client
    let t = (1.0 + 5.0_f32.sqrt()) / 2.0;
    
    // Initial icosahedron vertices (normalized)
    let mut vertices = vec![
        Vector3::new(-1.0,  t,  0.0).normalize() * radius,
        Vector3::new( 1.0,  t,  0.0).normalize() * radius,
        Vector3::new(-1.0, -t,  0.0).normalize() * radius,
        Vector3::new( 1.0, -t,  0.0).normalize() * radius,
        Vector3::new( 0.0, -1.0,  t).normalize() * radius,
        Vector3::new( 0.0,  1.0,  t).normalize() * radius,
        Vector3::new( 0.0, -1.0, -t).normalize() * radius,
        Vector3::new( 0.0,  1.0, -t).normalize() * radius,
        Vector3::new( t,  0.0, -1.0).normalize() * radius,
        Vector3::new( t,  0.0,  1.0).normalize() * radius,
        Vector3::new(-t,  0.0, -1.0).normalize() * radius,
        Vector3::new(-t,  0.0,  1.0).normalize() * radius,
    ];
    
    // Initial icosahedron faces
    let mut faces = vec![
        [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
        [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
        [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
        [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
    ];
    
    // Subdivide the icosahedron
    for _ in 0..subdivisions {
        let mut new_faces = Vec::new();
        let mut edge_map = std::collections::HashMap::new();
        
        for face in &faces {
            // Get midpoint indices
            let m0 = get_or_create_midpoint(&mut vertices, &mut edge_map, face[0], face[1], radius);
            let m1 = get_or_create_midpoint(&mut vertices, &mut edge_map, face[1], face[2], radius);
            let m2 = get_or_create_midpoint(&mut vertices, &mut edge_map, face[2], face[0], radius);
            
            // Create 4 new faces
            new_faces.push([face[0], m0, m2]);
            new_faces.push([face[1], m1, m0]);
            new_faces.push([face[2], m2, m1]);
            new_faces.push([m0, m1, m2]);
        }
        
        faces = new_faces;
    }
    
    // Apply terrain displacement to match client
    let mut final_vertices = Vec::new();
    for vertex in &vertices {
        let dir = vertex.normalize();
        let theta = dir.x.atan2(dir.z);
        let phi = (dir.y / radius).acos();
        
        // Generate terrain height using the same algorithm as client
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
        
        let final_pos = dir * final_radius;
        final_vertices.push(nalgebra::Point3::new(final_pos.x, final_pos.y, final_pos.z));
    }
    
    // Convert faces to u32 indices
    let indices: Vec<[u32; 3]> = faces.into_iter()
        .map(|f| [f[0] as u32, f[1] as u32, f[2] as u32])
        .collect();
    
    (final_vertices, indices)
}

fn get_or_create_midpoint(
    vertices: &mut Vec<Vector3<f32>>,
    edge_map: &mut std::collections::HashMap<(u32, u32), u32>,
    i0: u32,
    i1: u32,
    radius: f32,
) -> u32 {
    let key = if i0 < i1 { (i0, i1) } else { (i1, i0) };
    
    if let Some(&idx) = edge_map.get(&key) {
        return idx;
    }
    
    let v0 = vertices[i0 as usize];
    let v1 = vertices[i1 as usize];
    let midpoint = ((v0 + v1) / 2.0).normalize() * radius;
    
    let idx = vertices.len() as u32;
    vertices.push(midpoint);
    edge_map.insert(key, idx);
    
    idx
}
