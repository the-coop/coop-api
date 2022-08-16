import { Chance } from "chance";

const STATE = {
    // The DiscordJS/Commando client.
    CLIENT: null,

    // Voice connection
    VOICE_CONNECTION: null,

    // Internal memory/ephemeral.
        // Message ephemeral state for tracking message updates/notifications
        MESSAGE_HISTORY: {},

        // Tracking events history related to economy/minigames.
        EVENTS_HISTORY: {},

    // State properties used for limiting/rate-limiting feedback messages.
        // Last redemption update time 
        LAST_ENTRY_VOTE_TIME: null,
        LAST_ACHIEVEMENT_NOTIFICATION: null,

        // Tracking last drop times etc for adjusting to community velocity
        VELOCITY: {
            CHESTPOP: 0, INSTANT_FURNACE: 0,
            MINING: 0, WOODCUTTING: 0,
            EGGHUNT: 0, CRATEDROP: 0
        },

        // Server economy/game buffs:
        BUFFS: {},

    // Chance/random instance
    CHANCE: new Chance,
};
export default STATE;