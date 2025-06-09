use nalgebra::{Vector3, UnitQuaternion};
use rapier3d::prelude::{RigidBodyHandle, ColliderHandle};
use std::time::{Duration, Instant};
use uuid::Uuid;
use dashmap::DashMap;
use crate::messages::{Position, Rotation, DynamicObjectInfo, ServerMessage};

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct VehicleControls {
    pub forward: bool,
    pub backward: bool,
    pub left: bool,
    pub right: bool,
    pub brake: bool,
}

#[derive(Debug, Clone)]
pub struct DynamicObject {
    pub id: String,
    pub object_type: String,
    pub position: Vector3<f64>,
    pub rotation: UnitQuaternion<f32>,
    pub velocity: Vector3<f32>,
    pub scale: f32,
    pub body_handle: Option<RigidBodyHandle>,
    pub collider_handle: Option<ColliderHandle>,
    pub ownership_expires: Option<std::time::Instant>,
    pub world_origin: Vector3<f64>,
    pub owner_id: Option<Uuid>,
    pub spawn_time: std::time::Instant,
    pub owner_info: Option<OwnershipInfo>,
    #[allow(dead_code)]
    pub current_driver: Option<String>, // Player ID of current driver
    #[allow(dead_code)]
    pub controls: Option<VehicleControls>, // Current control inputs
    #[allow(dead_code)]
    pub needs_physics_update: bool, // Flag for physics system
}

impl DynamicObject {
    pub fn new(
        id: String,
        object_type: String,
        position: Vector3<f64>,
        body_handle: Option<RigidBodyHandle>,
        collider_handle: Option<ColliderHandle>,
        scale: f32,
    ) -> Self {
        Self {
            id,
            object_type,
            position,
            rotation: UnitQuaternion::identity(),
            velocity: Vector3::zeros(),
            scale,
            body_handle,
            collider_handle,
            ownership_expires: None,
            world_origin: Vector3::zeros(),
            owner_id: None,
            spawn_time: Instant::now(),
            owner_info: None,
            current_driver: None,
            controls: None,
            needs_physics_update: false,
        }
    }

    pub fn get_world_position(&self) -> Vector3<f64> {
        // Return world position in double precision
        Vector3::new(
            self.world_origin.x + self.position.x as f64,
            self.world_origin.y + self.position.y as f64,
            self.world_origin.z + self.position.z as f64,
        )
    }

    pub fn get_position_relative_to(&self, player_origin: &Vector3<f64>) -> Position {
        let world_pos = self.get_world_position();
        let relative = world_pos - player_origin;
        Position {
            x: relative.x as f32,
            y: relative.y as f32,
            z: relative.z as f32,
        }
    }

    pub fn to_info(&self, relative_to: &Vector3<f64>) -> DynamicObjectInfo {
        DynamicObjectInfo {
            id: self.id.clone(),
            object_type: self.object_type.clone(),
            position: self.get_position_relative_to(relative_to),
            rotation: Rotation {
                x: self.rotation.i,
                y: self.rotation.j,
                z: self.rotation.k,
                w: self.rotation.w,
            },
            scale: self.scale,
        }
    }

    #[allow(dead_code)]
    pub fn is_owned_by(&self, player_id: Uuid) -> bool {
        if let (Some(owner), Some(expires)) = (self.owner_id, self.ownership_expires) {
            owner == player_id && expires > std::time::Instant::now()
        } else {
            false
        }
    }

    #[allow(dead_code)]
    pub fn grant_ownership(&mut self, player_id: Uuid, duration: Duration) {
        self.owner_id = Some(player_id);
        self.ownership_expires = Some(std::time::Instant::now() + duration);
    }

    pub fn is_expired(&self, lifetime: Duration) -> bool {
        Instant::now().duration_since(self.spawn_time) > lifetime
    }
}

pub struct DynamicObjectManager {
    pub objects: DashMap<String, DynamicObject>,
    next_id: u64,
}

impl DynamicObjectManager {
    pub fn new() -> Self {
        Self {
            objects: DashMap::new(),
            next_id: 0,
        }
    }

    pub fn spawn_rock_with_physics(
        &mut self,
        world_position: Vector3<f64>,
        body_handle: RigidBodyHandle,
        collider_handle: ColliderHandle,
        scale: f32,
    ) -> String {
        let rock_id = format!("rock_{}", self.next_id);
        self.next_id += 1;

        let mut rock = DynamicObject::new(
            rock_id.clone(),
            "rock".to_string(),
            Vector3::new(0.0, 0.0, 0.0), // Local position (0,0,0)
            Some(body_handle),
            Some(collider_handle),
            scale,
        );

        rock.world_origin = world_position;

        self.objects.insert(rock_id.clone(), rock);
        rock_id
    }

    pub fn spawn_object(
        &mut self,
        id: &str,
        object_type: String,
        world_origin: Vector3<f64>,
        body_handle: Option<RigidBodyHandle>,
        collider_handle: Option<ColliderHandle>,
        scale: f32,
    ) -> String {
        let object = DynamicObject {
            id: id.to_string(),
            object_type,
            position: Vector3::zeros(),
            rotation: UnitQuaternion::identity(),
            velocity: Vector3::zeros(),
            scale,
            body_handle,
            collider_handle,
            ownership_expires: None,
            world_origin,
            owner_id: None,
            spawn_time: Instant::now(),
            owner_info: None,
            current_driver: None,
            controls: None,
            needs_physics_update: false,
        };

        self.objects.insert(id.to_string(), object);
        id.to_string()
    }

    pub fn update_from_physics_world_position(
        &self,
        id: &str,
        world_position: Vector3<f32>,
        rotation: UnitQuaternion<f32>,
        velocity: Vector3<f32>
    ) -> bool {
        if let Some(mut object) = self.objects.get_mut(id) {
            // Directly set world origin to physics position
            object.world_origin = Vector3::new(
                world_position.x as f64,
                world_position.y as f64,
                world_position.z as f64
            );
            object.position = Vector3::zeros(); // Keep local position at zero
            object.rotation = rotation;
            object.velocity = velocity;
            true
        } else {
            false
        }
    }

    pub fn get_all_objects_relative_to(&self, origin: &Vector3<f64>) -> Vec<DynamicObjectInfo> {
        self.objects
            .iter()
            .map(|entry| entry.value().to_info(origin))
            .collect()
    }

    pub fn get_spawn_message(&self, id: &str, relative_to: &Vector3<f64>) -> Option<ServerMessage> {
        self.objects.get(id).map(|obj| {
            ServerMessage::DynamicObjectSpawn {
                object_id: obj.id.clone(),
                object_type: obj.object_type.clone(),
                position: obj.get_position_relative_to(relative_to),
                rotation: Rotation {
                    x: obj.rotation.i,
                    y: obj.rotation.j,
                    z: obj.rotation.k,
                    w: obj.rotation.w,
                },
                scale: obj.scale,
            }
        })
    }

    pub fn iter(&self) -> dashmap::iter::Iter<String, DynamicObject> {
        self.objects.iter()
    }

    pub fn check_ownership(&self, object_id: &str, player_id: Uuid) -> bool {
        if let Some(obj) = self.objects.get(object_id) {
            if let Some(owner_info) = &obj.owner_info {
                owner_info.player_id == player_id && owner_info.expiry_time > Instant::now()
            } else {
                false
            }
        } else {
            false
        }
    }

    pub fn grant_ownership(&mut self, object_id: &str, player_id: Uuid, duration: Duration) {
        if let Some(mut obj) = self.objects.get_mut(object_id) {
            obj.owner_info = Some(OwnershipInfo {
                player_id,
                expiry_time: Instant::now() + duration,
            });
        }
    }

    pub fn update_ownership_expiry(&mut self) {
        let now = Instant::now();
        
        for entry in self.objects.iter() {
            if let (Some(_owner), Some(expires)) = (entry.value().owner_id, entry.value().ownership_expires) {
                if expires <= now {
                    // Ownership expired - need to get mutable access in a separate pass
                    // Store keys to update
                    continue;
                }
            }
        }
        
        // Collect keys that need updates
        let mut keys_to_update = Vec::new();
        for entry in self.objects.iter() {
            if let (Some(_owner), Some(expires)) = (entry.value().owner_id, entry.value().ownership_expires) {
                if expires <= now {
                    keys_to_update.push(entry.key().clone());
                }
            }
        }
        
        // Update in separate pass
        for key in keys_to_update {
            if let Some(mut obj) = self.objects.get_mut(&key) {
                obj.owner_id = None;
                obj.ownership_expires = None;
            }
        }
    }

    pub fn remove_expired_objects(&self, lifetime: Duration) -> Vec<(String, Option<RigidBodyHandle>, Option<ColliderHandle>)> {
        let mut expired_objects = Vec::new();
        
        // First pass: collect expired object IDs
        for entry in self.objects.iter() {
            if entry.value().is_expired(lifetime) {
                expired_objects.push(entry.key().clone());
            }
        }
        
        // Second pass: remove the expired objects
        let mut removed = Vec::new();
        for object_id in expired_objects {
            if let Some((_, obj)) = self.objects.remove(&object_id) {
                removed.push((object_id, obj.body_handle, obj.collider_handle));
            }
        }
        
        removed
    }

    #[allow(dead_code)]
    pub fn get_object(&self, id: &str) -> Option<dashmap::mapref::one::Ref<String, DynamicObject>> {
        self.objects.get(id)
    }
}

#[derive(Debug, Clone)]
pub struct OwnershipInfo {
    pub player_id: Uuid,
    pub expiry_time: std::time::Instant,
}
