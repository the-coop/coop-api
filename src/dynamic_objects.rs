use crate::messages::{DynamicObjectInfo, Position, Rotation, ServerMessage, Velocity};
use dashmap::DashMap;
use nalgebra::{UnitQuaternion, Vector3};
use std::sync::Arc;
use uuid::Uuid;

pub struct DynamicObject {
    pub id: String,
    pub object_type: String,
    pub position: Vector3<f64>,  // World position in double precision
    pub rotation: UnitQuaternion<f32>,
    pub velocity: Vector3<f32>,
    pub scale: f32,
    pub owner_id: Option<Uuid>, // Player who has authority over this object
}

impl DynamicObject {
    pub fn new(object_type: String, position: Vector3<f64>, scale: f32) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            object_type,
            position,
            rotation: UnitQuaternion::identity(),
            velocity: Vector3::zeros(),
            scale,
            owner_id: None,
        }
    }

    pub fn update_state(&mut self, pos: Position, rot: Rotation, vel: Velocity) {
        self.position = Vector3::new(pos.x as f64, pos.y as f64, pos.z as f64);
        self.rotation = UnitQuaternion::new_normalize(nalgebra::Quaternion::new(
            rot.w, rot.x, rot.y, rot.z,
        ));
        self.velocity = Vector3::new(vel.x, vel.y, vel.z);
    }

    pub fn get_position_relative_to(&self, origin: &Vector3<f64>) -> Position {
        let relative = self.position - origin;
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
}

pub struct DynamicObjectManager {
    objects: Arc<DashMap<String, DynamicObject>>,
}

impl DynamicObjectManager {
    pub fn new() -> Self {
        Self {
            objects: Arc::new(DashMap::new()),
        }
    }

    pub fn spawn_rock(&self, world_position: Vector3<f64>) -> String {
        let scale = 0.8 + rand::random::<f32>() * 0.4; // 0.8 to 1.2
        let rock = DynamicObject::new("rock".to_string(), world_position, scale);
        let id = rock.id.clone();
        self.objects.insert(id.clone(), rock);
        id
    }

    pub fn update_object(&self, id: &str, pos: Position, rot: Rotation, vel: Velocity) {
        if let Some(mut object) = self.objects.get_mut(id) {
            object.update_state(pos, rot, vel);
        }
    }

    pub fn remove_object(&self, id: &str) -> Option<DynamicObject> {
        self.objects.remove(id).map(|(_, obj)| obj)
    }

    pub fn get_object(&self, id: &str) -> Option<dashmap::mapref::one::Ref<String, DynamicObject>> {
        self.objects.get(id)
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
}
