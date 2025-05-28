use nalgebra::{Vector3, UnitQuaternion, Isometry3};
use rapier3d::prelude::*;

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
        }
    }

    pub fn step(&mut self) {
        // Apply custom gravity to all dynamic bodies before stepping
        let gravity_center = self.gravity;
        let gravity_strength = 25.0;
        
        for (_, body) in self.rigid_body_set.iter_mut() {
            if body.is_dynamic() {
                let pos = body.translation();
                let to_center = gravity_center - pos;
                let distance = to_center.magnitude();
                
                if distance > 0.1 {
                    let gravity_dir = to_center / distance;
                    // Apply gravity force without scaling by mass (let physics engine handle mass)
                    let gravity_force = gravity_dir * gravity_strength;
                    body.add_force(gravity_force, true);
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

    // The following methods are kept for future use when implementing
    // authoritative physics simulation
    
    /*
    pub fn create_player_body(
        &mut self,
        position: Vector3<f32>,
        _rotation: UnitQuaternion<f32>,
    ) -> (RigidBodyHandle, ColliderHandle) {
        // Create a capsule-shaped rigid body for the player
        let rigid_body = RigidBodyBuilder::dynamic()
            .translation(position)
            .linear_damping(0.1)
            .angular_damping(1.0)
            .lock_rotations()
            .build();

        let body_handle = self.rigid_body_set.insert(rigid_body);

        // Create capsule collider (height = 1.8, radius = 0.4)
        let collider = ColliderBuilder::capsule_y(0.5, 0.4)
            .friction(0.0)
            .restitution(0.0)
            .density(1.0)
            .build();

        let collider_handle = self.collider_set.insert_with_parent(
            collider,
            body_handle,
            &mut self.rigid_body_set,
        );

        (body_handle, collider_handle)
    }

    pub fn update_player_body(
        &mut self,
        handle: RigidBodyHandle,
        position: Vector3<f32>,
        rotation: UnitQuaternion<f32>,
        velocity: Vector3<f32>,
    ) {
        if let Some(body) = self.rigid_body_set.get_mut(handle) {
            body.set_position(Isometry3::from_parts(position.into(), rotation), true);
            body.set_linvel(velocity, true);
        }
    }

    pub fn remove_player_body(
        &mut self,
        body_handle: RigidBodyHandle,
        _collider_handle: ColliderHandle,
    ) {
        self.rigid_body_set.remove(
            body_handle,
            &mut self.island_manager,
            &mut self.collider_set,
            &mut self.impulse_joint_set,
            &mut self.multibody_joint_set,
            true,
        );
    }
    */

    #[allow(dead_code)]
    pub fn create_dynamic_body(
        &mut self,
        position: Vector3<f32>,
        rotation: UnitQuaternion<f32>,
    ) -> RigidBodyHandle {
        let rigid_body = RigidBodyBuilder::dynamic()
            .translation(position)
            .rotation(rotation.scaled_axis()) // Convert quaternion to angle-axis representation
            .linear_damping(0.4)
            .angular_damping(0.4)
            .build();

        self.rigid_body_set.insert(rigid_body)
    }

    pub fn create_ball_collider(
        &mut self,
        body_handle: RigidBodyHandle,
        radius: f32,
        density: f32,
    ) -> ColliderHandle {
        let collider = ColliderBuilder::ball(radius)
            .density(density)
            .friction(0.8)
            .restitution(0.4)
            .build();

        self.collider_set.insert_with_parent(
            collider,
            body_handle,
            &mut self.rigid_body_set,
        )
    }

    pub fn update_dynamic_body(
        &mut self,
        handle: RigidBodyHandle,
        position: Vector3<f32>,
        rotation: UnitQuaternion<f32>,
        velocity: Vector3<f32>,
    ) {
        if let Some(body) = self.rigid_body_set.get_mut(handle) {
            body.set_position(Isometry3::from_parts(position.into(), rotation), true);
            body.set_linvel(velocity, true);
        }
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

    #[allow(dead_code)]
    pub fn remove_dynamic_body(
        &mut self,
        body_handle: RigidBodyHandle,
        _collider_handle: ColliderHandle,
    ) {
        self.rigid_body_set.remove(
            body_handle,
            &mut self.island_manager,
            &mut self.collider_set,
            &mut self.impulse_joint_set,
            &mut self.multibody_joint_set,
            true,
        );
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
