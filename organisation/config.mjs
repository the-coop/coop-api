import EMOJIS_CONFIG from "coopshared/config/emojis.mjs";
import RAW_EMOJIS_CONFIG from 'coopshared/config/rawemojis.mjs';
import KEY_MESSAGES_CONFIG from 'coopshared/config/keymessages.mjs';
import CHANNELS_CONFIG from 'coopshared/config/channels.mjs';
import CATEGORIES_CONFIG from 'coopshared/config/categories.mjs';
import ROLES_CONFIG from 'coopshared/config/roles.mjs';
import BOTS_CONFIG from 'coopshared/config/bots.mjs';
import ITEMS_CONFIG from 'coopshared/config/items.mjs';

export const EMOJIS = EMOJIS_CONFIG;
export const RAW_EMOJIS = RAW_EMOJIS_CONFIG;
export const KEY_MESSAGES = KEY_MESSAGES_CONFIG;
export const CHANNELS = CHANNELS_CONFIG;
export const CATEGORIES = CATEGORIES_CONFIG;
export const ROLES = ROLES_CONFIG;
export const BOTS = BOTS_CONFIG;
export const ITEMS = ITEMS_CONFIG;

// Name explicitly on multi-line for easier IDE experience.
const CONFIG = {
    EMOJIS,
    RAW_EMOJIS,
    KEY_MESSAGES,
    CHANNELS,
    CATEGORIES,
    ROLES,
    BOTS,
    ITEMS
};
export default CONFIG;