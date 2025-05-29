use crate::dynamic_objects::DynamicObjectManager;
use crate::level::Level;
use crate::physics::PhysicsWorld;
use crate::player::PlayerManager;

pub struct AppState {
    pub players: PlayerManager,
    pub physics: PhysicsWorld,
    pub dynamic_objects: DynamicObjectManager,
    pub level: Level,
}
