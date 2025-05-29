use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Position {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Rotation {
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub w: f32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Velocity {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMessage {
    PlayerUpdate {
        position: Position,
        rotation: Rotation,
        velocity: Velocity,
        #[serde(default)]
        is_grounded: bool,
    },
    PlayerAction {
        action: String,
        #[serde(flatten)]
        data: serde_json::Value,
    },
    DynamicObjectUpdate {
        object_id: String,
        position: Position,
        rotation: Rotation,
        velocity: Velocity,
    },
    PushObject {
        object_id: String,
        force: Velocity, // Reuse Velocity for force vector
        point: Position, // Contact point relative to object
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMessage {
    Welcome {
        player_id: String,
        spawn_position: Position,
    },
    PlayerId {
        id: String,
    },
    PlayerJoined {
        player_id: String,
        position: Position,
    },
    PlayerLeft {
        player_id: String,
    },
    PlayerState {
        player_id: String,
        position: Position,
        rotation: Rotation,
        velocity: Velocity,
        #[serde(default)]
        is_grounded: bool,
    },
    PlayersList {
        players: Vec<PlayerInfo>,
    },
    OriginUpdate {
        origin: Position,
    },
    DynamicObjectSpawn {
        object_id: String,
        object_type: String,
        position: Position,
        rotation: Rotation,
        scale: f32,
    },
    DynamicObjectUpdate {
        object_id: String,
        position: Position,
        rotation: Rotation,
        velocity: Velocity,
    },
    DynamicObjectRemove {
        object_id: String,
    },
    DynamicObjectsList {
        objects: Vec<DynamicObjectInfo>,
    },
    LevelData {
        objects: Vec<LevelObject>,
    },
    ObjectOwnershipGranted {
        object_id: String,
        player_id: String,
        duration_ms: u32,
    },
    ObjectOwnershipRevoked {
        object_id: String,
    },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PlayerInfo {
    pub id: String,
    pub position: Position,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rotation: Option<Rotation>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DynamicObjectInfo {
    pub id: String,
    #[serde(rename = "type")]
    pub object_type: String,
    pub position: Position,
    pub rotation: Rotation,
    pub scale: f32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LevelObject {
    pub object_type: String,
    pub position: Position,
    pub rotation: Option<Rotation>,
    pub scale: Option<Vec3>,
    pub properties: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub terrain_data: Option<TerrainData>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TerrainData {
    pub vertices: Vec<f32>,  // Flattened vertex positions
    pub indices: Vec<u32>,   // Triangle indices
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Vec3 {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}
