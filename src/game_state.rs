use crate::dynamic_objects::DynamicObjectManager;
use crate::level::Level;
use crate::physics::PhysicsManager;
use crate::player::PlayerManager;
use nalgebra::Vector3;

pub struct AppState {
    pub players: PlayerManager,
    pub physics: PhysicsManager,
    pub dynamic_objects: DynamicObjectManager,
    pub level: Level,
}

impl AppState {
    #[allow(dead_code)]
    pub fn update(&mut self, delta_time: f32) {
        // Update vehicles
        for entry in self.dynamic_objects.iter() {
            let obj = entry.value();
            if obj.needs_physics_update && obj.current_driver.is_some() {
                if let (Some(body_handle), Some(controls)) = (obj.body_handle, &obj.controls) {
                    // Apply vehicle controls to physics body
                    if let Some(body) = self.physics.world.rigid_body_set.get_mut(body_handle) {
                        let mass = body.mass();
                        let rotation = body.rotation();
                        let forward = rotation * Vector3::new(0.0, 0.0, -1.0);
                        let _right = rotation * Vector3::new(1.0, 0.0, 0.0);
                        
                        // Apply forces based on controls
                        if controls.forward {
                            body.apply_impulse(forward * 50.0 * mass * delta_time, true);
                        }
                        if controls.backward {
                            body.apply_impulse(-forward * 30.0 * mass * delta_time, true);
                        }
                        
                        // Apply torque for turning
                        if controls.left {
                            body.apply_torque_impulse(Vector3::new(0.0, 10.0 * mass, 0.0) * delta_time, true);
                        }
                        if controls.right {
                            body.apply_torque_impulse(Vector3::new(0.0, -10.0 * mass, 0.0) * delta_time, true);
                        }
                        
                        // Apply brake
                        if controls.brake {
                            let vel = body.linvel();
                            body.apply_impulse(-vel * 0.5 * mass * delta_time, true);
                        }
                    }
                }
            }
        }
        
        // Step physics
        self.physics.step();
        
        // Update dynamic objects from physics
        for entry in self.dynamic_objects.iter() {
            let obj = entry.value();
            if let Some(body_handle) = obj.body_handle {
                if let Some((pos, rot, vel)) = self.physics.get_body_state(body_handle) {
                    let _ = obj; // Release the immutable reference
                    // Update the object's position from physics
                    self.dynamic_objects.update_from_physics_world_position(
                        &entry.key().clone(),
                        pos,
                        rot,
                        vel
                    );
                }
            }
        }
        
        // Update players in vehicles
        for entry in self.players.iter() {
            let player = entry.value();
            if let Some(vehicle_id) = &player.current_vehicle_id {
                if let Some(vehicle) = self.dynamic_objects.objects.get(vehicle_id) {
                    // Update player's world position based on vehicle
                    let vehicle_pos = vehicle.get_world_position();
                    let vehicle_rot = vehicle.rotation;
                    
                    // Calculate player's world position from vehicle
                    if let (Some(rel_pos), Some(rel_rot)) = (&player.relative_position, &player.relative_rotation) {
                        let world_pos = vehicle_rot * rel_pos + Vector3::new(
                            vehicle_pos.x as f32,
                            vehicle_pos.y as f32,
                            vehicle_pos.z as f32,
                        );
                        
                        // Update physics body if player has one
                        if let Some(body_handle) = player.body_handle {
                            if let Some(body) = self.physics.world.rigid_body_set.get_mut(body_handle) {
                                body.set_translation(world_pos, true);
                                body.set_rotation(vehicle_rot * rel_rot, true);
                            }
                        }
                    }
                }
            }
        }
    }
}
