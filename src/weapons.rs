use std::collections::HashMap;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct WeaponPickup {
    pub id: String,
    pub weapon_type: String,
    pub position: nalgebra::Vector3<f32>,
    pub picked_up_by: Option<Uuid>,
    pub pickup_time: Option<std::time::Instant>,
}

pub struct WeaponManager {
    pub weapon_pickups: HashMap<String, WeaponPickup>,
}

impl WeaponManager {
    pub fn new() -> Self {
        Self {
            weapon_pickups: HashMap::new(),
        }
    }

    pub fn spawn_weapon(&mut self, id: String, weapon_type: String, position: nalgebra::Vector3<f32>) {
        let pickup = WeaponPickup {
            id: id.clone(),
            weapon_type,
            position,
            picked_up_by: None,
            pickup_time: None,
        };
        self.weapon_pickups.insert(id, pickup);
    }

    pub fn pickup_weapon(&mut self, weapon_id: &str, player_id: Uuid) -> Option<String> {
        if let Some(pickup) = self.weapon_pickups.get_mut(weapon_id) {
            if pickup.picked_up_by.is_none() {
                pickup.picked_up_by = Some(player_id);
                pickup.pickup_time = Some(std::time::Instant::now());
                return Some(pickup.weapon_type.clone());
            }
        }
        None
    }
}
