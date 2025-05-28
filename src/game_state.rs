use crate::dynamic_objects::DynamicObjectManager;
use crate::level::Level;
use crate::physics::PhysicsWorld;
use crate::player::PlayerManager;

// This appears to be used only for AppState, not GameState
#[allow(dead_code)]
pub struct GameState {
    pub players: PlayerManager,
    pub physics: PhysicsWorld,
}

pub struct AppState {
    pub players: PlayerManager,
    pub physics: PhysicsWorld,
    pub dynamic_objects: DynamicObjectManager,
    pub level: Level,
}

#[allow(dead_code)]
impl GameState {
    pub fn new(players: PlayerManager, physics: PhysicsWorld) -> Self {
        Self { players, physics }
    }
}
