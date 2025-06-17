use nalgebra::{Vector3, UnitQuaternion};
use rapier3d::prelude::*;

pub struct PhysicsWorld {
    pub gravity: Vector3<f32>,
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
    pub moving_platforms: Vec<(RigidBodyHandle, f32, Option<serde_json::Value>)>, // Store body handle, initial X, and properties
    pub water_volumes: Vec<(ColliderHandle, Vector3<f32>, crate::messages::Vec3)>, // Store water volume info
    pub dynamic_platforms: Vec<RigidBodyHandle>, // Track dynamic platforms
}

impl PhysicsWorld {
    pub fn new() -> Self {
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
            gravity: Vector3::new(0.0, -250.0, 0.0), // Match client gravity center
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
            moving_platforms: Vec::new(),
            water_volumes: Vec::new(),
            dynamic_platforms: Vec::new(),
        }
    }

    pub fn step(&mut self) {
        // Clear forces on all dynamic bodies
        for (_, rb) in self.rigid_body_set.iter_mut() {
            if rb.is_dynamic() {
                rb.reset_forces(true);
                rb.reset_torques(true);
            }
        }
        
        // Apply gravity to all dynamic bodies (including dynamic platforms)
        let gravity_center = self.gravity; // This is the planet center at y=-250
        let gravity_strength = 25.0; // Match client gravity strength
        
        // Log dynamic platform count for debugging
        let dynamic_platform_count = self.dynamic_platforms.len();
        if dynamic_platform_count > 0 {
            tracing::debug!("Applying gravity to {} dynamic platforms", dynamic_platform_count);
        }
        
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
                let pos = *body.translation(); // Clone the position
                
                if in_water {
                    // Apply buoyancy instead of gravity
                    body.reset_forces(true);
                    
                    // Apply upward buoyancy force (30% of gravity strength - matching client)
                    let to_center = gravity_center - pos;
                    let distance = to_center.magnitude();
                    
                    if distance > 0.1 {
                        let gravity_dir = to_center / distance;
                        let mass = body.mass();
                        let buoyancy_force = -gravity_dir * gravity_strength * 0.3 * mass; // Changed from 0.2 to 0.3
                        body.add_force(buoyancy_force, true);
                    }
                    
                    // Apply water drag (matching client drag coefficient)
                    let velocity = *body.linvel();
                    let drag_force = -velocity * 3.0; // Changed from 2.0 to 3.0 to match client
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
                        
                        let velocity = *body.linvel();
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
            .density(density * 0.5)
            .friction(1.2)
            .restitution(0.2)
            // Enable all collision types
            .active_collision_types(ActiveCollisionTypes::all())
            // Enable collision events for debugging
            .active_events(ActiveEvents::COLLISION_EVENTS | ActiveEvents::CONTACT_FORCE_EVENTS)
            // Set solver groups - dynamic objects should interact with everything
            .solver_groups(InteractionGroups::all())
            // Set collision groups - dynamic objects detect everything
            .collision_groups(InteractionGroups::all())
            .build();
        self.collider_set.insert_with_parent(collider, parent, &mut self.rigid_body_set)
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
            .rotation(rotation.scaled_axis())
            .linear_damping(0.5)  // Reduced damping for better physics response
            .angular_damping(1.0) // Reduced angular damping
            .ccd_enabled(true)
            .can_sleep(true) // Allow sleeping for performance
            .build();
        self.rigid_body_set.insert(rigid_body)
    }

    pub fn _create_dynamic_body(
        &mut self,
        position: Vector3<f32>,
        rotation: UnitQuaternion<f32>,
    ) -> RigidBodyHandle {
        let rigid_body = RigidBodyBuilder::dynamic()
            .translation(position)
            .rotation(rotation.scaled_axis())
            .linear_damping(0.5)
            .angular_damping(1.0)
            .ccd_enabled(true)
            .can_sleep(true)
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

    // Add method to wake up bodies when interacted with
    pub fn wake_body(&mut self, handle: RigidBodyHandle) {
        if let Some(body) = self.rigid_body_set.get_mut(handle) {
            body.wake_up(true);
        }
    }
}

pub struct PhysicsManager {
    pub world: PhysicsWorld,
}

impl PhysicsManager {
    pub fn new() -> Self {
        Self {
            world: PhysicsWorld::new(),
        }
    }

    pub fn get_body_state(&self, body_handle: RigidBodyHandle) -> Option<(Vector3<f32>, nalgebra::UnitQuaternion<f32>, Vector3<f32>)> {
        if let Some(body) = self.world.rigid_body_set.get(body_handle) {
            let pos = body.translation();
            let rot = body.rotation();
            let vel = body.linvel();
            
            Some((
                Vector3::new(pos.x, pos.y, pos.z),
                *rot,
                Vector3::new(vel.x, vel.y, vel.z)
            ))
        } else {
            None
        }
    }

    pub fn step(&mut self) {
        self.world.step();
    }

    // Delegate other methods to the inner world
    pub fn create_player_body(&mut self, position: Vector3<f32>) -> RigidBodyHandle {
        self.world.create_player_body(position)
    }

    pub fn create_player_collider(&mut self, parent: RigidBodyHandle) -> ColliderHandle {
        self.world.create_player_collider(parent)
    }

    pub fn create_ball_collider(&mut self, parent: RigidBodyHandle, radius: f32, density: f32) -> ColliderHandle {
        self.world.create_ball_collider(parent, radius, density)
    }
}
