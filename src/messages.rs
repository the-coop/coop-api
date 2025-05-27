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

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMessage {
    PlayerUpdate {
        position: Position,
        rotation: Rotation,
        velocity: Velocity,
    },
    PlayerAction {
        action: String,
        #[serde(flatten)]
        data: serde_json::Value,
    },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
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
    },
    PlayersList {
        players: Vec<PlayerInfo>,
    },
    OriginUpdate {
        origin: Position,
    },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PlayerInfo {
    pub id: String,
    pub position: Position,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rotation: Option<Rotation>,
}
