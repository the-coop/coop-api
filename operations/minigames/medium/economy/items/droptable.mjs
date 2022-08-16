import { BOTS } from "../../../../../organisation/config.mjs";
import { USERS } from "../../../../../organisation/coop.mjs";

import STATE from "../../../../../organisation/state.mjs";
import ReactionHelper from "../../../../activity/messages/reactionHelper.mjs";

export default class DropTable {

    static TIERS = {
        // TOXIC: []
        AVERAGE: [
            'BOMB',
            'LAXATIVE',
            'TOXIC_EGG',
            'PICK_AXE',
            'FRYING_PAN',
            'EMPTY_GIFTBOX',
            'WOOD',
            'AXE',
            'IRON_BAR'
        ],
        RARE: [
            'ROPE',
            'SHIELD',
            'MINE',
            'DEFUSE_KIT',
            'FLARE',
            'STEEL_BAR'
        ],
        LEGENDARY: [
            'RPG',
            'GOLD_BAR',
            'GOLD_COIN',
            'SILVER_BAR',
            'DIAMOND'
        ]
    }

    static TIER_QTYS = {
        AVERAGE: { min: 2, max: 10 },
        RARE: { min: 2, max: 5 },
        LEGENDARY: { min: 1, max: 2 }
    }

    static getRandomTierQty(level) {
        return STATE.CHANCE.natural(this.TIER_QTYS[level]);
    }

    static getRandom() {
        // TODO: OVERPOWERED - Reduce legendary/rare access, etc.
        const tier = STATE.CHANCE.pickone(Object.keys(this.TIERS));
        const item = this.getRandomTiered(tier);
        return item;
    }

    static getRandomQty() {
        const tier = STATE.CHANCE.pickone(Object.keys(this.TIER_QTYS));
        const tierQty = this.getRandomTierQty(tier);
        return tierQty;
    }

    static getRandomWithQty() {
        return {
            item: this.getRandom(),
            qty: this.getRandomQty()
        }
    }

    static getRandomWithQtyMany(scoops) {
        const drops = [];
        const givenItemCodes = [];

        // Calculate the giveaway drops.
        for (let i = 0; i < scoops; i++) {
            const calcDrop = this.getRandomWithQty();

            // Prevent duplication of drop item codes.
            if (givenItemCodes.includes(calcDrop.item)) {
                const existingIndex = drops.findIndex(d => d.item === calcDrop.item);
                drops[existingIndex].qty += calcDrop.qty;
                
            } else {
                givenItemCodes.push(calcDrop.item)
                drops.push(calcDrop);
            }
        }

        // Sort drops by highest qty first.
        drops.sort((a, b) => (a.qty < b.qty) ? 1 : -1);

        return drops;
    }

    static getRandomTieredWithQty(level) {
        return {
            item: this.getRandomTiered(level),
            qty: this.getRandomTierQty(level)
        }
    }

    static getRandomTiered(level) {
        return STATE.CHANCE.pickone(this.TIERS[level]);
    }

    // This is effectively complete, but need to figure out when it will be used.
    // TODO: Add this reaction listener to reaction events intercept.
    static async onReaction(reaction, user) {
        // Check reaction is collection emoji
        if (reaction.emoji.name !== '🧺') return;

        // Ignore Cooper's collection reaction.
        if (USERS.isCooper(user.id)) return;

        // Ensure message is by Cooper
        // if (!USERS.isCooperMsg(reaction.message)) 
            // return;

        // Ensure it has money bag reaction by Cooper (indicates drop table)
        const isDropTableMsg = await ReactionHelper.userReactedWith(reaction.message, BOTS.COOPER.id, '💰');
        console.log(isDropTableMsg);
        if (!isDropTableMsg) return;

        // Ensure no other collect reaction emojis

        // Parse the drop table contents.
        const regex = new RegExp(/\w+x\d+/, 'mg');
        const matches = reaction.message.content.match(regex);

        // Drop table wealth transfer collection.
        const transfer = matches.map(i => {
            const parsedItemParts = i.split('x');
            return {
                item_code: parsedItemParts[0],
                quantity: parsedItemParts[1]
            }
        });

        

        // Add drop table contents to collecting user.

        // COOP.ITEMS.add(user.id, rewardItem, rewardQty, `${rarity} reward`);

        // Provide collection feedback.

        console.log('Drop table reaction');
    }











    // TODO: Refactor this from crate open. :D BAD TEXT MESSAGE.
    static randomRewardGroupTiered() {
        // STATE.CHANCE.pickset(hitters, rewardedUsersNum).forEach((user, rewardeeIndex) => {
        //     // Calculate a random amount of rewards to give to the user.
        //     const rewardItemsNum = STATE.CHANCE.natural({ min: 0, max: crate.maxReward });
        //     const rewardsKeys = STATE.CHANCE.pickset(crate.rewards, rewardItemsNum);

        //     if (rewardItemsNum > 0) {
        //         // Grant rewards to users with a random quantity.
        //         rewardsKeys.forEach(async (reward, rewardIndex) => {
        //             const rewardItemQuantity = STATE.CHANCE.natural({ min: 1, max: crate.maxReward });
        //             const rateLimitBypassDelay = (rewardeeIndex * 666) + (333 * rewardIndex);

        //             anyRewardGiven = true;
        //             await COOP.ITEMS.add(user.id, reward, rewardItemQuantity);


        //             setTimeout(async () => {
        //                 const rewardMessageText = `${user.username} took ${reward}x${rewardItemQuantity} from the crate!`;
        //                 COOP.CHANNELS.propagate(msg, rewardMessageText, 'ACTIONS');
        //             }, rateLimitBypassDelay);
        //         });
        //     }
        // });
    }





}
