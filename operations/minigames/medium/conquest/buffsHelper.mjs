import COOP, { STATE } from "../../../../organisation/coop.mjs";

// Help with adding and removing buffs.


export const BUFF_TYPES = {
    INVINCIBILITY: {
        duration: 1800
    }
};

export default class BuffsHelper {

    // Make buffs expire.
    static cleanupExpired() {
        // TODO: This is necessary.
        let cleanedHistory = [];

        const buffTypeKeys = Object.keys(STATE.BUFFS);
        buffTypeKeys.map(buffKey => {
            const buffTypeData = STATE.BUFFS[buffKey];
            const userTypeBuffsKeys = Object.keys(STATE.BUFFS[buffKey]);
            userTypeBuffsKeys.map(userBuffTypeKey => {
                const buffSecsRemaining = buffTypeData[userBuffTypeKey]

                // Check for buff expiration, if expired delete.
                if (COOP.TIME._secs() >= buffSecsRemaining)
                    delete STATE.BUFFS[buffKey][userBuffTypeKey];

                // Add to cleaned history for record/feedback message.
                cleanedHistory.push({
                    user: userBuffTypeKey,
                    type: buffKey
                });
            });
        });

        // TODO: Post a message in actions stating expired buffs and for whom.
        // TODO:
        // console.log(cleanedHistory);
    }

    static isValidBuffCode(str) {
        return typeof BUFF_TYPES[str] !== 'undefined';
    }

    // Add a temporary (memory-based) game buff to a user.
    static add(buffCode, userID) {
        console.log(`Adding ${buffCode} to ${userID}`);

        // TODO: Consider posting in actions from here to save all functions needing to do so, spam?

        // If no buff of this type is currently being tracked, establish it.
        if (typeof STATE.BUFFS[buffCode] === 'undefined')
            STATE.BUFFS[buffCode] = {};

        const buffDuration = BUFF_TYPES[buffCode].duration;

        // TODO: Create a command for checking buff time remaining and use shields to top up. :D
        // RISKY BECAUSE MEMORY ONLY. (FOR NOW?)

        // Add the temporary buff to Nodejs memory with an expiration UNIX.
        STATE.BUFFS[buffCode][userID] = COOP.TIME._secs() + buffDuration;
    }

    // Tops up a user's buff with seconds.
    static topup(buffCode, userID, secs) {
        if (
            typeof STATE.BUFFS[buffCode] !== 'undefined' && 
            typeof STATE.BUFFS[buffCode][userID] !== 'undefined'
        ) {
            // TODO: Make sure it doesn't pass a limit for a buff.
            // const buffDuration = BUFF_TYPES[buffCode].maxDuration;
    
            // Add the temporary buff to Nodejs memory with an expiration UNIX.
            STATE.BUFFS[buffCode][userID] += secs;

            // Return the new remaining time.
            return STATE.BUFFS[buffCode][userID];
        }

        // Memory operation failed somehow... indicate problem.
        return false;
    }

    // Checks if a user has a temporary (memory-based) game buff.
    static has(buffCode, userID) {
        const buffsOfType = STATE.BUFFS[buffCode] || {};
        return typeof buffsOfType[userID] !== 'undefined';
    }


}
