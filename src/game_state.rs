use crate::dynamic_objects::DynamicObjectManager;
use crate::level::Level;
use crate::physics::PhysicsManager;
use crate::player::PlayerManager;
use crate::spawns::SpawnManager;
use crate::vehicles::VehicleManager;
use crate::projectiles::ProjectileManager;
use nalgebra::Vector3;

pub struct AppState {
    pub players: PlayerManager,
    pub physics: PhysicsManager,
    pub dynamic_objects: DynamicObjectManager,
    pub vehicles: VehicleManager,
    pub projectiles: ProjectileManager,
    pub level: Level,
    pub spawn_manager: SpawnManager,
}

impl AppState {
    pub fn update(&mut self, delta_time: f32) {
        // Step physics
        self.physics.step();
        
        // Update dynamic objects from physics
        let dynamic_updates: Vec<(String, Vector3<f32>, nalgebra::UnitQuaternion<f32>, Vector3<f32>)> = 
            self.dynamic_objects.iter()
                .filter_map(|entry| {
                    let obj = entry.value();
                    if let Some(body_handle) = obj.body_handle {
                        if let Some((pos, rot, vel)) = self.physics.get_body_state(body_handle) {
                            Some((entry.key().clone(), pos, rot, vel))
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                })
                .collect();
        
        for (id, pos, rot, vel) in dynamic_updates {
            self.dynamic_objects.update_from_physics_world_position(&id, pos, rot, vel);
        }
        
        // Update vehicles from physics
        let vehicle_updates: Vec<(String, Vector3<f32>, nalgebra::UnitQuaternion<f32>, Vector3<f32>, Vector3<f32>)> = 
            self.vehicles.vehicles.iter()
                .filter_map(|entry| {
                    let vehicle = entry.value();
                    if let Some(body_handle) = vehicle.body_handle {
                        if let Some(body) = self.physics.world.rigid_body_set.get(body_handle) {
                            let pos = body.translation();
                            let rot = body.rotation();
                            let vel = body.linvel();
                            let ang_vel = body.angvel();
                            
                            Some((
                                entry.key().clone(),
                                Vector3::new(pos.x, pos.y, pos.z),
                                *rot,
                                Vector3::new(vel.x, vel.y, vel.z),
                                Vector3::new(ang_vel.x, ang_vel.y, ang_vel.z),
                            ))
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                })
                .collect();
        
        for (id, pos, rot, vel, ang_vel) in vehicle_updates {
            self.vehicles.update_from_physics(&id, pos, rot, vel, ang_vel);
        }
        
        // Update projectiles from physics
        let projectile_updates: Vec<(String, Vector3<f32>, nalgebra::UnitQuaternion<f32>, Vector3<f32>)> = 
            self.projectiles.projectiles.iter()
                .filter_map(|entry| {
                    let proj = entry.value();
                    if let Some(body_handle) = proj.body_handle {
                        if let Some((pos, rot, vel)) = self.physics.get_body_state(body_handle) {
                            Some((entry.key().clone(), pos, rot, vel))
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                })
                .collect();
        
        for (id, pos, rot, vel) in projectile_updates {
            self.projectiles.update_from_physics(&id, pos, vel, rot);
        }
        
        // Update homing projectiles
        let homing_updates: Vec<(String, Option<Vector3<f32>>, f32)> = 
            self.projectiles.projectiles.iter()
                .filter_map(|entry| {
                    let proj = entry.value();
                    if proj.is_homing && proj.target_id.is_some() {
                        if let Some(target_id) = &proj.target_id {
                            // Find target position (could be vehicle or player)
                            let target_pos = if let Some(vehicle) = self.vehicles.vehicles.get(target_id) {
                                Some(vehicle.position)
                            } else if let Ok(player_uuid) = uuid::Uuid::parse_str(target_id) {
                                self.players.get_player(player_uuid).map(|p| p.position)
                            } else {
                                None
                            };
                            
                            Some((entry.key().clone(), target_pos, delta_time))
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                })
                .collect();
        
        for (id, target_pos, delta_time) in homing_updates {
            if let Some(target_pos) = target_pos {
                if let Some(mut proj) = self.projectiles.projectiles.get_mut(&id) {
                    proj.update_homing(target_pos, delta_time);
                    
                    // Update physics body velocity
                    if let Some(body_handle) = proj.body_handle {
                        if let Some(body) = self.physics.world.rigid_body_set.get_mut(body_handle) {
                            body.set_linvel(proj.velocity, true);
                            body.set_rotation(proj.rotation, true);
                        }
                    }
                }
            }
        }
    }
}
