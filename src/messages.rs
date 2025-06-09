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
        #[serde(default)]
        is_swimming: bool,
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
    PickupWeapon {
        weapon_id: String,
    },
    DropWeapon {
        weapon_type: String,
        position: Position,
    },
    FireWeapon {
        weapon_type: String,
        origin: Position,
        direction: Position, // Using Position for direction vector
        weapon_id: Option<String>,
    },
    WeaponSwitch {
        weapon_type: String,
    },
    WeaponReload {
        weapon_type: String,
    },
    ProjectileHit {
        projectile_id: String,
        hit_type: String, // "player", "vehicle", "terrain"
        hit_id: Option<String>, // Player or vehicle ID if applicable
        position: Position,
    },
    LockOnUpdate {
        lock_data: LockOnData,
    },
    CountermeasureDeploy {
        vehicle_id: String,
        countermeasure_type: String, // "chaff" or "flares"
        position: Position,
        velocity: Velocity,
    },
    EnterVehicle {
        vehicle_id: String,
    },
    ExitVehicle {
        exit_position: Option<Position>,
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
        #[serde(default)]
        is_swimming: bool,
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
        duration_ms: u64,
    },
    ObjectOwnershipRevoked {
        object_id: String,
    },
    PlatformUpdate {
        platform_id: String,
        position: Position,
    },
    WeaponSpawn {
        weapon_id: String,
        weapon_type: String,
        position: Position,
    },
    WeaponPickup {
        player_id: String,
        weapon_id: String,
        weapon_type: String,
    },
    WeaponDrop {
        player_id: String,
        weapon_id: String,
        position: Position,
    },
    WeaponFire {
        player_id: String,
        weapon_type: String,
        origin: Position,
        direction: Position,
        projectile_id: String,
    },
    ProjectileUpdate {
        projectile_id: String,
        position: Position,
        velocity: Velocity,
    },
    ProjectileHit {
        projectile_id: String,
        position: Position,
        hit_type: String,
        explosion_type: Option<String>,
    },
    PlayerHealthUpdate {
        player_id: String,
        health: f32,
        max_health: f32,
        armor: f32,
    },
    PlayerDamaged {
        player_id: String,
        damage: f32,
        damage_type: String,
        attacker_id: Option<String>,
    },
    PlayerKilled {
        player_id: String,
        killer_id: Option<String>,
        death_type: String,
    },
    PlayerRespawned {
        player_id: String,
        position: Position,
        health: f32,
    },
    ExplosionCreated {
        position: Position,
        explosion_type: String,
        radius: f32,
        damage: f32,
    },
    LockOnUpdate {
        player_id: String,
        lock_data: LockOnData,
    },
    CountermeasureDeploy {
        player_id: String,
        vehicle_id: String,
        countermeasure_type: String,
        position: Position,
        velocity: Velocity,
    },
    PlayerEnteredVehicle {
        player_id: String,
        vehicle_id: String,
    },
    PlayerExitedVehicle {
        player_id: String,
        vehicle_id: String,
        exit_position: Position,
    },
    VehiclePlayerState {
        player_id: String,
        vehicle_id: String,
        relative_position: Position,
        relative_rotation: Rotation,
        aim_rotation: Rotation,
        is_grounded: bool,
    },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PlayerInfo {
    pub id: String,
    pub position: Position,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rotation: Option<Rotation>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub velocity: Option<Velocity>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_grounded: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_swimming: Option<bool>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LockOnData {
    pub has_target: bool,
    pub target_id: Option<String>,
    pub is_locked: bool,
    pub lock_progress: f32,
}
