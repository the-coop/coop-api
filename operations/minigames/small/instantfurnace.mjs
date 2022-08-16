import { STATE, USABLE, MESSAGES, CHANNELS, USERS, ITEMS } from "../../../organisation/coop.mjs";
import { EMOJIS } from "../../../organisation/config.mjs";
import TemporaryMessages from "../../maintenance/temporaryMessages.mjs";

export const BAR_DATA = {
    GOLD_BAR: {
        FAIL_RATE: 90
    }, 
    SILVER_BAR: {
        FAIL_RATE: 75
    }, 
    STEEL_BAR: {
        FAIL_RATE: 50
    },
    IRON_BAR: {
        FAIL_RATE: 33
    }
};

export default class InstantFurnaceMinigame {

    // Burn metal ore into metal
    static async onReaction(reaction, user) {
        // Reject all N/A
        if (!USERS.isCooper(reaction.message.author.id)) return false;
        if (USERS.isCooper(user.id)) return false;
        if (reaction.message.content.trim() !== '🌋') return false;
        if (reaction.emoji.name !== 'metal_ore') return false;
        
        try {
            // Uses a random amount of their metal ore.
            const oreLimitMin = 25;

            // Check the quantity for the user.
            const hasQty = await ITEMS.hasQty(user.id, 'METAL_ORE', oreLimitMin);
            if (!hasQty) return MESSAGES.selfDestruct(reaction.message, `${user.username} lacks ${oreLimitMin}xMETAL_ORE.`, 0, 5000);

            // Guard the action from those not sincerely using the item.
            const didUse = await USABLE.use(user.id, 'METAL_ORE', oreLimitMin);
            if (!didUse) return MESSAGES.selfDestruct(reaction.message, `${user.username}, something went wrong smelting your ore. ;(`, 5000);

            // Add smelting multiplier effect.
            const multiplier = reaction.count - 1;
            
            // Calculate smelting rewards.
            const rewards = {};
            const barTypes = Object.keys(BAR_DATA);
            for (let i = 0; i < oreLimitMin; i++) {
                // Roll out of 100 and select rarity.
                const rollNum = STATE.CHANCE.natural({ min: 0, max: 100 });
                const barType = STATE.CHANCE.pickone(barTypes);

                // Apply failure rate.
                if (rollNum < BAR_DATA[barType].FAIL_RATE) continue;
                if (typeof rewards[barType] === 'undefined') rewards[barType] = 0;
                rewards[barType] = rewards[barType] + (1 * multiplier);
            }

            // Add rewards to user.
            await Object.keys(rewards).map(rewardItem => {
                const qty = rewards[rewardItem];
                return ITEMS.add(user.id, rewardItem, qty)
            });

            const sumTotal = Object.keys(rewards).reduce((acc, val) => {
                return acc + rewards[val];
            }, 0);

            const smeltString = `${user.username} smelted the following ${sumTotal} bars within the instant furnace: \n` +
                Object.keys(rewards).map(rewardKey => {
                    return `${MESSAGES.emojiCodeText(rewardKey)}x${rewards[rewardKey]}`
                }).join(', ');

            // Create record in channel and in actions.
            CHANNELS._codes(['TALK', 'ACTIONS'], smeltString);

        } catch(e) {
            console.log('Failure reacting to instant furnace');
            console.error(e);
        }
    }

    // An instant furnace appears.
    static async spawn() {
        try {
            const msg = await CHANNELS._postToChannelCode('TALK', '🌋');
            
            // TODO: Animate flame out like egg collect.
            MESSAGES.delayDelete(msg, 60000);
            TemporaryMessages.add(msg, 60);

            // Add reaction for action suggestion/tip.
            MESSAGES.delayReact(msg, EMOJIS.METAL_ORE, 333);

            // Burn the users within close distance of it.
            if (STATE.CHANCE.bool({ likelihood: 10 })) {
                const siblingMsgs = await msg.channel.messages.fetch({ limit: 6 });
                const usersIDsAround = siblingMsgs.map(msg => msg.author.id)
                    .filter(userID => !USERS.isCooper(userID))
                    .reduce((unique, item) => unique.includes(item) ? unique : [...unique, item], []);

                // Add fire emoji to the messages for visual feedback
                siblingMsgs.map(m => m).map((msg, index) => {
                    MESSAGES.delayReact(msg, '🔥', 666 * index);
                });
    
                const coopEmoji = MESSAGES.emojiCodeText('COOP');
                const burnText = usersIDsAround.map(userID => `<@${userID}>`).join(', ') +
                    ` ${usersIDsAround.length > 1 ? 'were all' : 'was'} burned by the the instant furnace! -10x${coopEmoji}`;

                usersIDsAround.map(userID => ITEMS.subtract(userID, 'COOP_POINT', 10, 'Volcano burn'));

                CHANNELS.silentPropagate(msg, burnText, 'ACTIONS', 333, 10000);
            }

        } catch(e) {
            console.log('Error running instance furnace.');
            console.error(e);
        }
    }

    static async run() {
        // Run based on roll.
        try {
            await this.spawn();

        } catch(e) {
            console.log('Error running instance furnace.');
            console.error(e);
        }
    }


}