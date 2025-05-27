use nalgebra::Vector3;
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
}

impl PhysicsWorld {
    pub fn new() -> Self {
        let gravity = vector![0.0, -9.81, 0.0];
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
        }
    }

    pub fn step(&mut self) {
        self.physics_pipeline.step(
            &self.gravity,
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
}
