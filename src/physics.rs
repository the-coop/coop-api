use nalgebra::{Vector3, UnitQuaternion};
use rapier3d::prelude::*;
use crate::messages::Vec3;

pub struct PhysicsWorld {
    pub rigid_body_set: RigidBodySet,
    pub collider_set: ColliderSet,
    pub integration_parameters: IntegrationParameters,
    pub physics_pipeline: PhysicsPipeline,
    pub island_manager: IslandManager,
    pub broad_phase: BroadPhase,
    pub narrow_phase: NarrowPhase,
    pub impulse_joint_set: ImpulseJointSet,
    pub multibody_joint_set: MultibodyJointSet,
    pub ccd_solver: CCDSolver,
    pub gravity: Vector3<f32>,
    pub moving_platforms: Vec<(RigidBodyHandle, f32, Option<serde_json::Value>)>, // body, initial_x, properties
    pub water_volumes: Vec<(ColliderHandle, Vector3<f32>, Vec3)>, // collider, position, scale
}

impl PhysicsWorld {
    pub fn new() -> Self {
        let gravity = vector![0.0, -250.0, 0.0]; // Default gravity center at planet position
        let integration_parameters = IntegrationParameters::default();
        let physics_pipeline = PhysicsPipeline::new();
        let island_manager = IslandManager::new();
        let broad_phase = BroadPhase::new();
        let narrow_phase = NarrowPhase::new();
        let impulse_joint_set = ImpulseJointSet::new();
        let multibody_joint_set = MultibodyJointSet::new();
        let ccd_solver = CCDSolver::new();
        let rigid_body_set = RigidBodySet::new();
        let collider_set = ColliderSet::new();

        Self {
            rigid_body_set,
            collider_set,
            integration_parameters,
            physics_pipeline,
            island_manager,
            broad_phase,
            narrow_phase,
            impulse_joint_set,
            multibody_joint_set,
            ccd_solver,
            gravity,
            moving_platforms: Vec::new(),
            water_volumes: Vec::new(),
        }
    }

    pub fn step(&mut self) {
        // Apply custom gravity to all dynamic bodies before stepping
        let gravity_center = self.gravity;
        let gravity_strength = 25.0;
        
        // First collect body handles and positions to check water
        let body_water_checks: Vec<(RigidBodyHandle, bool)> = self.rigid_body_set.iter()
            .filter_map(|(handle, body)| {
                if body.is_dynamic() {
                    let pos = body.translation();
                    let in_water = self.is_position_in_water(&pos);
                    Some((handle, in_water))
                } else {
                    None
                }
            })
            .collect();
        
        // Now apply forces based on water state
        for (handle, in_water) in body_water_checks {
            if let Some(body) = self.rigid_body_set.get_mut(handle) {
                let pos = body.translation();
                
                if in_water {
                    // Apply buoyancy instead of gravity
                    body.reset_forces(true);
                    
                    // Apply slight upward buoyancy force
                    let mass = body.mass();
                    let buoyancy_force = Vector3::new(0.0, 5.0 * mass, 0.0);
                    body.add_force(buoyancy_force, true);
                    
                    // Apply water drag
                    let velocity = body.linvel();
                    let drag_force = -velocity * 2.0; // Higher drag in water
                    body.add_force(drag_force, true);
                } else {
                    // Normal gravity
                    let to_center = gravity_center - pos;
                    let distance = to_center.magnitude();
                    
                    if distance > 0.1 {
                        let gravity_dir = to_center / distance;
                        body.reset_forces(true);
                        let mass = body.mass();
                        let gravity_force = gravity_dir * gravity_strength * mass;
                        body.add_force(gravity_force, true);
                        
                        let velocity = body.linvel();
                        let damping_force = -velocity * 0.02;
                        body.add_force(damping_force, true);
                    }
                }
            }
        }
        
        // Use no global gravity since we apply custom gravity
        let zero_gravity = vector![0.0, 0.0, 0.0];
        self.physics_pipeline.step(
            &zero_gravity,
            &self.integration_parameters,
            &mut self.island_manager,
            &mut self.broad_phase,
            &mut self.narrow_phase,
            &mut self.rigid_body_set,
            &mut self.collider_set,
            &mut self.impulse_joint_set,
            &mut self.multibody_joint_set,
            &mut self.ccd_solver,
            None,
            &(),
            &(),
        );
    }

    pub fn is_position_in_water(&self, pos: &Vector3<f32>) -> bool {
        for (_, volume_pos, scale) in &self.water_volumes {
            let half_extents = Vector3::new(scale.x / 2.0, scale.y / 2.0, scale.z / 2.0);
            let min = volume_pos - half_extents;
            let max = volume_pos + half_extents;
            
            if pos.x >= min.x && pos.x <= max.x &&
               pos.y >= min.y && pos.y <= max.y &&
               pos.z >= min.z && pos.z <= max.z {
                return true;
            }
        }
        false
    }

    pub fn create_ball_collider(
        &mut self,
        parent: RigidBodyHandle,
        radius: f32,
        density: f32,
    ) -> ColliderHandle {
        let collider = ColliderBuilder::ball(radius)
            .density(density * 0.5)  // Keep lighter weight
            .friction(1.2)           // Slightly higher friction
            .restitution(0.2)        // Lower restitution to reduce bouncing
            .active_collision_types(ActiveCollisionTypes::default() | ActiveCollisionTypes::KINEMATIC_FIXED)
            .solver_groups(InteractionGroups::all()) // Ensure collision with all groups
            .collision_groups(InteractionGroups::all()) // Ensure detection with all groups
            .build();
        self.collider_set.insert_with_parent(collider, parent, &mut self.rigid_body_set)
    }

    pub fn get_body_state(&self, handle: RigidBodyHandle) -> Option<(Vector3<f32>, UnitQuaternion<f32>, Vector3<f32>)> {
        self.rigid_body_set.get(handle).map(|body| {
            let pos = body.position();
            (
                pos.translation.vector.into(),
                pos.rotation,
                body.linvel().clone() // Clone to get owned Vector3
            )
        })
    }

    pub fn create_fixed_body(&mut self, translation: Vector3<f32>) -> RigidBodyHandle {
        let rigid_body = RigidBodyBuilder::fixed()
            .translation(translation)
            .build();

        self.rigid_body_set.insert(rigid_body)
    }

    pub fn create_fixed_body_with_rotation(&mut self, translation: Vector3<f32>, rotation: UnitQuaternion<f32>) -> RigidBodyHandle {
        let rigid_body = RigidBodyBuilder::fixed()
            .translation(translation)
            .rotation(rotation.scaled_axis())
            .build();

        self.rigid_body_set.insert(rigid_body)
    }

    pub fn create_kinematic_body(&mut self, translation: Vector3<f32>) -> RigidBodyHandle {
        let rigid_body = RigidBodyBuilder::kinematic_position_based()
            .translation(translation)
            .build();

        self.rigid_body_set.insert(rigid_body)
    }

    pub fn create_dynamic_body(
        &mut self,
        position: Vector3<f32>,
        rotation: UnitQuaternion<f32>,
    ) -> RigidBodyHandle {
        let rigid_body = RigidBodyBuilder::dynamic()
            .translation(position)
            .rotation(rotation.scaled_axis()) // Convert quaternion to axis-angle vector
            .linear_damping(0.8)  // Increased damping for more stability
            .angular_damping(3.0) // Higher angular damping to prevent wild spinning
            .ccd_enabled(true)    // Enable continuous collision detection
            .build();
        self.rigid_body_set.insert(rigid_body)
    }

    pub fn create_player_body(&mut self, position: Vector3<f32>) -> RigidBodyHandle {
        let rigid_body = RigidBodyBuilder::dynamic()
            .translation(position)
            .linear_damping(0.95)  // Match client damping
            .angular_damping(0.95)  // Match client damping
            .lock_rotations()       // Lock rotations to prevent physics from rotating the body
            .ccd_enabled(true)
            .build();
        self.rigid_body_set.insert(rigid_body)
    }

    pub fn create_player_collider(&mut self, parent: RigidBodyHandle) -> ColliderHandle {
        // Match client player dimensions
        let height = 1.8;
        let radius = 0.4;
        let half_height = height / 2.0 - radius;
        
        let collider = ColliderBuilder::capsule_y(half_height, radius)
            .friction(0.0)      // Match client
            .restitution(0.0)   // Match client
            .density(1.0)       // Match client
            .active_collision_types(ActiveCollisionTypes::default())
            .solver_groups(InteractionGroups::all())
            .collision_groups(InteractionGroups::all())
            .build();
        self.collider_set.insert_with_parent(collider, parent, &mut self.rigid_body_set)
    }

    pub fn update_moving_platforms(&mut self, time: f32) {
        for (handle, initial_x, properties) in &self.moving_platforms {
            if let Some(body) = self.rigid_body_set.get_mut(*handle) {
                let move_range = properties.as_ref()
                    .and_then(|p| p.get("move_range"))
                    .and_then(|v| v.as_f64())
                    .unwrap_or(20.0) as f32;
                
                let move_speed = properties.as_ref()
                    .and_then(|p| p.get("move_speed"))
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.2) as f32;
                
                let offset = (time * move_speed).sin() * move_range;
                let new_x = initial_x + offset;
                
                let mut pos = *body.position();
                pos.translation.x = new_x;
                body.set_next_kinematic_position(pos);
            }
        }
    }
}
