import POINTS_HELPER from "../operations/minigames/medium/economy/points/pointsHelper.mjs";
import USABLE_HELPER from "../operations/minigames/medium/economy/items/usableItemHelper.mjs";
import ITEMS_HELPER from "../operations/minigames/medium/economy/items/itemsHelper.mjs";
import USERS_HELPER from "../operations/members/usersHelper.mjs";
import CHICKEN_HELPER from "../operations/chicken.mjs";
import REACTION_HELPER from "../operations/activity/messages/reactionHelper.mjs";
import MESSAGES_HELPER from "../operations/activity/messages/messagesHelper.mjs";
import ROLES_HELPER from "../operations/members/hierarchy/roles/rolesHelper.mjs";
import CHANNELS_HELPER from "../operations/channelHelper.mjs";
import SERVER_HELPER from "../operations/serverHelper.mjs";
import STATE_HELPER from "./state.mjs";
import CONFIG_HELPER from "./config.mjs";
import TIME_HELPER from "../operations/timeHelper.mjs";

export const POINTS = POINTS_HELPER;
export const USABLE = USABLE_HELPER;
export const ITEMS = ITEMS_HELPER;
export const USERS = USERS_HELPER;
export const CHICKEN = CHICKEN_HELPER;
export const MESSAGES = MESSAGES_HELPER;
export const REACTIONS = REACTION_HELPER;
export const ROLES = ROLES_HELPER;
export const CHANNELS = CHANNELS_HELPER;
export const SERVER = SERVER_HELPER;
export const STATE = STATE_HELPER;
export const CONFIG = CONFIG_HELPER;
export const TIME = TIME_HELPER;

export const CHANCE = STATE_HELPER.CHANCE;

// Name explicitly on multi-line for easier IDE experience.
const COOP = {
    POINTS, USABLE, ITEMS,
    USERS, CHICKEN,
    MESSAGES, REACTIONS, ROLES, CHANNELS, SERVER,
    STATE, CONFIG,
    TIME, CHANCE
};
export default COOP;