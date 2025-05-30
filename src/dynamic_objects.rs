use crate::messages::{DynamicObjectInfo, Position, Rotation, ServerMessage};
use dashmap::DashMap;
use nalgebra::{UnitQuaternion, Vector3};
use rapier3d::prelude::*;
use std::sync::Arc;
use std::time::{Duration, Instant};
use uuid::Uuid;

pub struct DynamicObject {
    pub id: String,
    pub object_type: String,
    pub position: Vector3<f32>,      // Local position relative to its origin
    pub world_origin: Vector3<f64>,  // Object's floating origin in world space (double precision)
    pub rotation: UnitQuaternion<f32>,
    pub velocity: Vector3<f32>,
    pub scale: f32,
    pub body_handle: Option<RigidBodyHandle>, // Physics body handle
    pub collider_handle: Option<ColliderHandle>, // Physics collider handle
    pub owner_id: Option<Uuid>, // Current owner
    pub ownership_expires: Option<Instant>, // When ownership expires
    pub spawn_time: Instant, // When the object was spawned
}

impl DynamicObject {
    pub fn new(object_type: String, world_position: Vector3<f64>, scale: f32) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            object_type,
            position: Vector3::zeros(), // Start at local origin
            world_origin: world_position, // Set world origin to spawn position
            rotation: UnitQuaternion::identity(),
            velocity: Vector3::zeros(),
            scale,
            body_handle: None,
            collider_handle: None,
            owner_id: None,
            ownership_expires: None,
            spawn_time: Instant::now(), // Track when object was created
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

    pub fn is_owned_by(&self, player_id: Uuid) -> bool {
        if let (Some(owner), Some(expires)) = (self.owner_id, self.ownership_expires) {
            owner == player_id && expires > Instant::now()
        } else {
            false
        }
    }

    pub fn grant_ownership(&mut self, player_id: Uuid, duration: Duration) {
        self.owner_id = Some(player_id);
        self.ownership_expires = Some(Instant::now() + duration);
    }

    pub fn is_expired(&self, lifetime: Duration) -> bool {
        Instant::now().duration_since(self.spawn_time) > lifetime
    }
}

pub struct DynamicObjectManager {
    pub objects: Arc<DashMap<String, DynamicObject>>,
}

impl DynamicObjectManager {
    pub fn new() -> Self {
        Self {
            objects: Arc::new(DashMap::new()),
        }
    }

    pub fn spawn_rock_with_physics(
        &self, 
        world_position: Vector3<f64>, 
        body_handle: RigidBodyHandle,
        collider_handle: ColliderHandle,
        scale: f32  // Add scale parameter
    ) -> String {
        let mut rock = DynamicObject::new("rock".to_string(), Vector3::zeros(), scale);
        rock.world_origin = world_position; // Set the world origin
        rock.position = Vector3::zeros(); // Local position starts at origin
        rock.body_handle = Some(body_handle);
        rock.collider_handle = Some(collider_handle);
        rock.scale = scale; // Use the provided scale
        let id = rock.id.clone();
        self.objects.insert(id.clone(), rock);
        id
    }

    pub fn spawn_object(
        &mut self,
        object_id: &str,
        object_type: String,
        world_origin: nalgebra::Vector3<f64>,
        body_handle: Option<RigidBodyHandle>,
        collider_handle: Option<ColliderHandle>,
        scale: f32,
    ) -> String {
        let object = DynamicObject {
            id: object_id.to_string(),
            object_type,
            world_origin,
            position: nalgebra::Vector3::zeros(),
            rotation: nalgebra::UnitQuaternion::identity(),
            velocity: nalgebra::Vector3::zeros(),
            body_handle,
            collider_handle,
            owner_id: None,
            ownership_expires: None,
            spawn_time: Instant::now(), // Track when object was created
            scale,
        };
        
        self.objects.insert(object_id.to_string(), object);
        object_id.to_string()
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

    pub fn grant_ownership(&self, object_id: &str, player_id: Uuid, duration: Duration) -> bool {
        if let Some(mut obj) = self.objects.get_mut(object_id) {
            obj.grant_ownership(player_id, duration);
            true
        } else {
            false
        }
    }

    pub fn check_ownership(&self, object_id: &str, player_id: Uuid) -> bool {
        if let Some(obj) = self.objects.get(object_id) {
            obj.is_owned_by(player_id)
        } else {
            false
        }
    }

    pub fn update_ownership_expiry(&self) {
        let now = std::time::Instant::now();
        let mut expired_objects = Vec::new();
        
        // First pass: collect expired object IDs
        for entry in self.objects.iter() {
            if let (Some(_owner_id), Some(expires)) = (entry.value().owner_id, entry.value().ownership_expires) {
                if expires <= now {
                    expired_objects.push(entry.key().clone());
                }
            }
        }
        
        // Second pass: update the expired objects
        for object_id in expired_objects {
            if let Some(mut obj) = self.objects.get_mut(&object_id) {
                obj.owner_id = None;
                obj.ownership_expires = None;
                tracing::debug!("Ownership expired for object {}", object_id);
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
}
