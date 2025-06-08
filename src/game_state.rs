use crate::dynamic_objects::DynamicObjectManager;
use crate::level::Level;
use crate::physics::PhysicsWorld;
use crate::player::PlayerManager;

pub struct AppState {
    pub players: PlayerManager,
    pub physics: PhysicsWorld,
    pub dynamic_objects: DynamicObjectManager,
    pub level: Level,
}

impl AppState {
    pub fn update_physics(&mut self, delta_time: f32) {
        // Update vehicles with drivers
        for (id, obj) in self.dynamic_objects.objects.iter_mut() {
            if obj.current_driver.is_some() && obj.needs_physics_update {
                if let Some(body_handle) = obj.body_handle {
                    if let Some(body) = self.physics.rigid_body_set.get_mut(body_handle) {
                        // Apply vehicle controls
                        if let Some(controls) = &obj.controls {
                            self.apply_vehicle_physics(body, &obj.object_type, controls, delta_time);
                        }
                    }
                }
                obj.needs_physics_update = false;
            }
        }
        
        // Step physics
        self.physics.step(delta_time);
        
        // Update dynamic object positions from physics
        for (id, obj) in self.dynamic_objects.objects.iter_mut() {
            if let Some(body_handle) = obj.body_handle {
                if let Some(body) = self.physics.rigid_body_set.get(body_handle) {
                    let pos = body.translation();
                    let rot = body.rotation();
                    
                    obj.position = nalgebra::Vector3::new(pos.x, pos.y, pos.z);
                    obj.rotation = nalgebra::UnitQuaternion::new_normalize(*rot);
                    obj.velocity = *body.linvel();
                }
            }
        }
        
        // Update player positions if they're in vehicles
        for entry in self.players.players.iter() {
            let player = entry.value();
            if let Some(vehicle_id) = &player.current_vehicle_id {
                if let Some(vehicle) = self.dynamic_objects.get_object(vehicle_id) {
                    // Player world position is vehicle position + relative position
                    if let Some(rel_pos) = &player.relative_position {
                        let world_rel_pos = vehicle.rotation * rel_pos;
                        // This is just for tracking - actual position update happens client-side
                    }
                }
            }
        }
    }
    
    fn apply_vehicle_physics(&self, body: &mut RigidBody, vehicle_type: &str, controls: &VehicleControls, delta_time: f32) {
        match vehicle_type {
            "plane" => self.apply_plane_physics(body, controls, delta_time),
            "helicopter" => self.apply_helicopter_physics(body, controls, delta_time),
            "spaceship" => self.apply_spaceship_physics(body, controls, delta_time),
            "vehicle" => self.apply_car_physics(body, controls, delta_time),
            _ => {}
        }
    }
    
    fn apply_spaceship_physics(&self, body: &mut RigidBody, controls: &VehicleControls, delta_time: f32) {
        let mass = body.mass();
        let thrust_force = 100.0 * mass;
        let torque_force = 50.0 * mass;
        
        // Get spaceship orientation
        let rotation = body.rotation();
        let forward = rotation * Vector3::new(0.0, 0.0, 1.0);
        let right = rotation * Vector3::new(1.0, 0.0, 0.0);
        let up = rotation * Vector3::new(0.0, 1.0, 0.0);
        
        // Apply thrust
        if controls.forward {
            body.apply_impulse(forward * thrust_force * delta_time, true);
        }
        if controls.backward {
            body.apply_impulse(-forward * thrust_force * 0.5 * delta_time, true);
        }
        
        // Apply rotation
        if controls.left {
            body.apply_torque_impulse(up * torque_force * delta_time, true);
        }
        if controls.right {
            body.apply_torque_impulse(-up * torque_force * delta_time, true);
        }
        
        // Apply damping
        let linvel = *body.linvel();
        let angvel = *body.angvel();
        body.apply_impulse(-linvel * 0.5 * delta_time, true);
        body.apply_torque_impulse(-angvel * 2.0 * delta_time, true);
    }
    
    fn apply_plane_physics(&self, body: &mut RigidBody, controls: &VehicleControls, delta_time: f32) {
        // Simplified plane physics
        let mass = body.mass();
        let thrust = if controls.forward { 50.0 * mass } else { 0.0 };
        
        let rotation = body.rotation();
        let forward = rotation * Vector3::new(0.0, 0.0, 1.0);
        
        body.apply_impulse(forward * thrust * delta_time, true);
        
        // Banking turns
        if controls.left {
            body.apply_torque_impulse(Vector3::new(0.0, 20.0 * mass, 0.0) * delta_time, true);
        }
        if controls.right {
            body.apply_torque_impulse(Vector3::new(0.0, -20.0 * mass, 0.0) * delta_time, true);
        }
    }
    
    fn apply_helicopter_physics(&self, body: &mut RigidBody, controls: &VehicleControls, delta_time: f32) {
        // Simplified helicopter physics
        let mass = body.mass();
        
        // Collective (up/down)
        if controls.forward {
            body.apply_impulse(Vector3::new(0.0, 30.0 * mass, 0.0) * delta_time, true);
        }
        
        // Yaw
        if controls.left {
            body.apply_torque_impulse(Vector3::new(0.0, 15.0 * mass, 0.0) * delta_time, true);
        }
        if controls.right {
            body.apply_torque_impulse(Vector3::new(0.0, -15.0 * mass, 0.0) * delta_time, true);
        }
    }
    
    fn apply_car_physics(&self, body: &mut RigidBody, controls: &VehicleControls, delta_time: f32) {
        // Simplified car physics
        let mass = body.mass();
        
        let rotation = body.rotation();
        let forward = rotation * Vector3::new(0.0, 0.0, 1.0);
        let right = rotation * Vector3::new(1.0, 0.0, 0.0);
        
        // Acceleration
        if controls.forward {
            body.apply_impulse(forward * 30.0 * mass * delta_time, true);
        }
        if controls.backward {
            body.apply_impulse(-forward * 20.0 * mass * delta_time, true);
        }
        
        // Steering (only when moving)
        let speed = body.linvel().magnitude();
        if speed > 0.5 {
            if controls.left {
                body.apply_torque_impulse(Vector3::new(0.0, 10.0 * mass, 0.0) * delta_time, true);
            }
            if controls.right {
                body.apply_torque_impulse(Vector3::new(0.0, -10.0 * mass, 0.0) * delta_time, true);
            }
        }
        
        // Brake
        if controls.brake {
            let vel = *body.linvel();
            body.apply_impulse(-vel * 0.1, true);
        }
    }
}
