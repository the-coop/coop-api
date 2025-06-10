use crate::messages::{DynamicObjectInfo, ServerMessage, Position, Rotation};
use dashmap::DashMap;
use nalgebra::{Vector3, UnitQuaternion};
use rapier3d::prelude::{RigidBodyHandle, ColliderHandle};
use std::time::{Duration, Instant};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct DynamicObject {
    pub id: String,
    pub object_type: String,
    pub world_origin: Vector3<f64>,
    pub position: Vector3<f32>,
    pub rotation: UnitQuaternion<f32>,
    pub velocity: Vector3<f32>,
    pub scale: f32,
    pub body_handle: Option<RigidBodyHandle>,
    #[allow(dead_code)]
    pub collider_handle: Option<ColliderHandle>,
    pub owner: Option<(Uuid, Instant)>,
    pub last_update: Instant,
    #[allow(dead_code)]
    pub created_at: Instant,

    pub grabbed_by: Option<(Uuid, std::time::Instant)>, // Player ID and grab time
    pub grab_offset: Option<Vector3<f32>>, // Offset from object center where grabbed
    pub is_kinematic_ghost: bool, // Whether object is in kinematic grab mode
    pub original_body_type: Option<String>, // Store original body type for restoration
}

impl DynamicObject {
    #[allow(dead_code)]
    pub fn new(id: String, object_type: String, world_origin: Vector3<f64>, scale: f32) -> Self {
        Self {
            id,
            object_type,
            world_origin,
            position: Vector3::zeros(),
            rotation: UnitQuaternion::identity(),
            velocity: Vector3::zeros(),
            scale,
            body_handle: None,
            collider_handle: None,
            owner: None,
            last_update: Instant::now(),
            created_at: Instant::now(),

            grabbed_by: None,
            grab_offset: None,
            is_kinematic_ghost: false,
            original_body_type: None,
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
        match &self.owner {
            Some((id, _)) => *id == player_id,
            None => false,
        }
    }

    #[allow(dead_code)]
    pub fn grant_ownership(&mut self, player_id: Uuid, duration: Duration) {
        self.owner = Some((player_id, Instant::now() + duration));
    }

    #[allow(dead_code)]
    pub fn is_expired(&self, lifetime: Duration) -> bool {
        self.created_at.elapsed() > lifetime
    }

    pub fn grab(&mut self, player_id: Uuid, grab_offset: Vector3<f32>) -> bool {
        if self.grabbed_by.is_some() {
            return false; // Already grabbed
        }
        
        self.grabbed_by = Some((player_id, std::time::Instant::now()));
        self.grab_offset = Some(grab_offset);
        self.is_kinematic_ghost = true;
        // Don't change physics body type here - that's handled by physics manager
        
        true
    }
    
    pub fn release(&mut self) {
        self.grabbed_by = None;
        self.grab_offset = None;
        self.is_kinematic_ghost = false;
        self.original_body_type = None;
    }
    
    pub fn is_grabbed(&self) -> bool {
        self.grabbed_by.is_some()
    }
    
    pub fn is_grabbed_by(&self, player_id: Uuid) -> bool {
        match &self.grabbed_by {
            Some((id, _)) => *id == player_id,
            None => false,
        }
    }
    
    pub fn get_grab_duration(&self) -> Option<std::time::Duration> {
        self.grabbed_by.as_ref().map(|(_, time)| time.elapsed())
    }
}

pub struct DynamicObjectManager {
    pub objects: DashMap<String, DynamicObject>,
}

impl DynamicObjectManager {
    pub fn new() -> Self {
        Self {
            objects: DashMap::new(),
        }
    }

    pub fn spawn_object(
        &mut self, 
        id: &str,
        object_type: String,
        world_position: Vector3<f64>,
        body_handle: Option<RigidBodyHandle>,
        collider_handle: Option<ColliderHandle>,
        scale: f32
    ) {
        let object = DynamicObject {
            id: id.to_string(),
            object_type,
            world_origin: world_position,
            position: Vector3::zeros(),
            rotation: UnitQuaternion::identity(),
            velocity: Vector3::zeros(),
            scale,
            body_handle,
            collider_handle,
            owner: None,
            last_update: Instant::now(),
            created_at: Instant::now(),

            grabbed_by: None,
            grab_offset: None,
            is_kinematic_ghost: false,
            original_body_type: None,
        };
        
        self.objects.insert(id.to_string(), object);
    }

    pub fn spawn_rock_with_physics(
        &mut self, 
        world_position: Vector3<f64>,
        body_handle: RigidBodyHandle,
        collider_handle: ColliderHandle,
        scale: f32
    ) -> String {
        let id = format!("rock_{}", uuid::Uuid::new_v4());
        
        let object = DynamicObject {
            id: id.clone(),
            object_type: "rock".to_string(),
            world_origin: world_position,
            position: Vector3::zeros(),
            rotation: UnitQuaternion::identity(),
            velocity: Vector3::zeros(),
            scale,
            body_handle: Some(body_handle),
            collider_handle: Some(collider_handle),
            owner: None,
            last_update: Instant::now(),
            created_at: Instant::now(),

            grabbed_by: None,
            grab_offset: None,
            is_kinematic_ghost: false,
            original_body_type: None,
        };
        
        self.objects.insert(id.clone(), object);
        id
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
            if let Some((owner_id, expiry)) = obj.owner {
                return owner_id == player_id && Instant::now() < expiry;
            }
        }
        false
    }
    
    pub fn revoke_ownership(&self, object_id: &str) {
        if let Some(mut obj) = self.objects.get_mut(object_id) {
            obj.owner = None;
            obj.grabbed_by = None;
            obj.grab_offset = None;
        }
    }

    pub fn grant_ownership(&mut self, object_id: &str, player_id: Uuid, duration: Duration) {
        if let Some(mut obj) = self.objects.get_mut(object_id) {
            obj.owner = Some((player_id, Instant::now() + duration));
        }
    }

    #[allow(dead_code)]
    pub fn update_ownership(&mut self) {
        let now = Instant::now();
        
        // Check for expired ownership
        let expired_objects: Vec<String> = self.objects.iter()
            .filter_map(|entry| {
                let obj = entry.value();
                if let Some((_, expiry)) = obj.owner {
                    if now >= expiry {
                        return Some(obj.id.clone());
                    }
                }
                None
            })
            .collect();
        
        // Revoke expired ownership
        for object_id in expired_objects {
            self.revoke_ownership(&object_id);
        }
    }
    
    pub fn remove_expired_objects(&self, lifetime: Duration) -> Vec<(String, Option<RigidBodyHandle>)> {
        let now = Instant::now();
        let mut expired = Vec::new();
        
        // Find expired objects
        for entry in self.objects.iter() {
            let obj = entry.value();
            if now.duration_since(obj.created_at) > lifetime {
                expired.push((obj.id.clone(), obj.body_handle));
            }
        }
        
        // Remove expired objects
        for (id, _) in &expired {
            self.objects.remove(id);
        }
        
        expired
    }

    #[allow(dead_code)]
    pub fn get_object(&self, id: &str) -> Option<dashmap::mapref::one::Ref<String, DynamicObject>> {
        self.objects.get(id)
    }
    
    pub fn grab_object(&mut self, object_id: &str, player_id: Uuid, grab_offset: Vector3<f32>) -> bool {
        if let Some(mut obj) = self.objects.get_mut(object_id) {
            obj.grab(player_id, grab_offset)
        } else {
            false
        }
    }
    
    pub fn release_object(&mut self, object_id: &str, player_id: Uuid) -> bool {
        if let Some(mut obj) = self.objects.get_mut(object_id) {
            if obj.is_grabbed_by(player_id) {
                obj.release();
                true
            } else {
                false
            }
        } else {
            false
        }
    }
    
    pub fn move_grabbed_object(&mut self, object_id: &str, player_id: Uuid, target_position: Vector3<f32>) -> bool {
        if let Some(mut obj) = self.objects.get_mut(object_id) {
            if obj.is_grabbed_by(player_id) {
                // Calculate the object position based on grab offset
                if let Some(grab_offset) = obj.grab_offset {
                    obj.position = target_position - grab_offset;
                    obj.last_update = std::time::Instant::now();
                    return true;
                }
            }
        }
        false
    }
    
    pub fn get_grabbed_objects_by_player(&self, player_id: Uuid) -> Vec<String> {
        self.objects.iter()
            .filter_map(|entry| {
                let obj = entry.value();
                if obj.is_grabbed_by(player_id) {
                    Some(entry.key().clone())
                } else {
                    None
                }
            })
            .collect()
    }
    
    pub fn force_release_all_by_player(&mut self, player_id: Uuid) {
        let objects_to_release: Vec<String> = self.objects.iter()
            .filter_map(|entry| {
                let obj = entry.value();
                if let Some((owner_id, _)) = obj.owner {
                    if owner_id == player_id {
                        return Some(obj.id.clone());
                    }
                }
                None
            })
            .collect();
        
        for object_id in objects_to_release {
            self.release_object(&object_id, player_id);
        }
    }
}
