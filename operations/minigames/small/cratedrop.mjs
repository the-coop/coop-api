import _ from 'lodash';

import VotingHelper from '../../activity/redemption/votingHelper.mjs';
import DropTable from '../medium/economy/items/droptable.mjs';

import COOP, { STATE } from '../../../organisation/coop.mjs';
import { EMOJIS } from '../../../organisation/config.mjs';
import EconomyNotifications from '../../activity/information/economyNotifications.mjs';


const CRATE_DATA = {
    AVERAGE_CRATE: {
        emoji: EMOJIS.AVERAGE_CRATE,
        maxReward: 4,
        openingPoints: 2,
        percHitsReq: .015,
        rewards: DropTable.TIERS.AVERAGE
    },
    RARE_CRATE: {
        emoji: EMOJIS.RARE_CRATE,
        maxReward: 5,
        openingPoints: 5,
        percHitsReq: .02,
        rewards: DropTable.TIERS.RARE
    },
    LEGENDARY_CRATE: {
        emoji: EMOJIS.LEGENDARY_CRATE,
        maxReward: 3,
        openingPoints: 25,
        percHitsReq: .04,
        rewards: DropTable.TIERS.LEGENDARY
    },
};

// Rarity likelihood base number.
const likelihood = 40;

export default class CratedropMinigame {
    
    // Reaction interceptor to check if user is attempting to play Crate Drop
    static onReaction(reaction, user) {
        try {
            if (COOP.USERS.isCooper(user.id)) return false;
            if (!COOP.USERS.isCooperMsg(reaction.message)) return false;
            if (!this.calculateRarityFromMessage(reaction.message)) return false;
            if (this.isCrateOpen(reaction.message)) return false;
            if (reaction.emoji.name !== '🪓')  return false;

            // TODO: Add MemberOnlyGuard ffs! :D

            const emojiIdentifier = COOP.MESSAGES.getEmojiIdentifier(reaction.message);
            const crateEmojiNames = _.map(_.values(CRATE_DATA), "emoji");
            if (!crateEmojiNames.includes(emojiIdentifier)) return false;
        
            // Process the hit and potentially reward.
            this.axeHit(reaction, user);
        } catch(e) {
            console.error(e);
        }
    }

    // If enough reactions to open reward all 'reactors' with random selection of rewards.
    static async axeHit(reaction, user) {
        try {
            const msg = reaction.message;

            const rarity = this.calculateRarityFromMessage(msg);
            const reqHits = this.calculateHitsRequired(rarity);

            // Count the hits and remove Cooper's from the count.
            const hitCount = msg.reactions.cache.find(react => react.emoji.name === '🪓').count - 1 || 0;
                
            // Check if there are enough hits to open the crate.
            if (hitCount >= reqHits) await this.open(reaction, user);
            else {
                const hitsLeft = reqHits - hitCount;
                const openingUpdateMsg = await msg.channel.send(
                    `${user.username} tried opening the crate! ${hitsLeft}/${reqHits} more hits to break!`
                );

                // Remove message after it was visible by the contact.
                COOP.MESSAGES.delayDelete(openingUpdateMsg, 30000);
            }
        } catch(e) {
            console.error(e);
        }
    }

    // Number of hits required based on rarity.
    static calculateHitsRequired(crateType) {
        const crate = CRATE_DATA[crateType];

        return VotingHelper.getNumRequired(crate.percHitsReq);
    }

    static isCrateOpen(msg) {
        const rarity = this.calculateRarityFromMessage(msg);
        return (rarity && msg.content.indexOf('open') > -1);
    }

    static calculateRarityFromMessage(msg) {
        let crateRarity = null;

        if (msg.content.indexOf('average_crate') > -1) crateRarity = 'AVERAGE_CRATE';
        if (msg.content.indexOf('rare_crate') > -1) crateRarity = 'RARE_CRATE';
        if (msg.content.indexOf('legendary_crate') > -1) crateRarity = 'LEGENDARY_CRATE';

        return crateRarity;
    }

    static async open(reaction) {
        // Added fetch to message to ensure proper reaction counting.
        const msg = await reaction.message.fetch();

        // Resolve the fresh axe reactions.
        const axeEmojiReaction = await msg.reactions.resolve('🪓');

        const rarity = this.calculateRarityFromMessage(msg);

        // Edit the crate to visually show it opening.
        const openRarityEmoji = COOP.MESSAGES.emojifyID(EMOJIS[rarity + '_OPEN']);
        await msg.edit(openRarityEmoji);

        // A short time after, to avoid rate-limits... award items.
        setTimeout(async () => {
            const crate = CRATE_DATA[rarity];

            // Fetch the crate hitters and convert into array.
            const reactionUsers = await axeEmojiReaction.users.fetch();
            const hitters = Array.from(
                reactionUsers
                    .filter(user => !COOP.USERS.isCooper(user.id))
            ).map(userSet => userSet[1]);

            const hitterNames = hitters.map(user => user.username);
            
            // Add points to all hitters.
            await Promise.all(hitters.map(user => COOP.ITEMS.add(user.id, 'COOP_POINT', crate.openingPoints, `Opening ${rarity}`)));

            // Reward amount of users based on luck/chance.
            let anyRewardGiven = false;
            let rewardedUsersNum = STATE.CHANCE.natural({ min: 1, max: hitters.length });

            // Lower the rate of empty crates.
            if (STATE.CHANCE.bool({ likelihood: 5 })) rewardedUsersNum = 0;

            // Raise reward rate.
            if (STATE.CHANCE.bool({ likelihood: 40 })) rewardedUsersNum = hitters.length

            // Generate the message text from drop array data.
            let listLootString = '';
            if (rewardedUsersNum > 0) {
                // Pick the amount of rewarded users.   
                STATE.CHANCE.pickset(hitters, rewardedUsersNum).forEach(user => {
                    // Calculate a random amount of rewards to give to the user.
                    const rewardItemsNum = STATE.CHANCE.natural({ min: 0, max: crate.maxReward });
                    const rewardsKeys = STATE.CHANCE.pickset(crate.rewards, rewardItemsNum);

                    // Only add this string if the user gained a reward (exclude empty crates).
                    if (rewardItemsNum > 0) {
                        // Begin the loot string section for this user.
                        listLootString += `${user.username}'s loot: `;

                        // Grant rewards to users with a random quantity.
                        listLootString += rewardsKeys.map((rewardItem) => {
                            const rewardQty = STATE.CHANCE.natural({ min: 1, max: crate.maxReward });

                            // Indicate that at least one reward was given.
                            anyRewardGiven = true;

                            // Give the user the item via the database.
                            COOP.ITEMS.add(user.id, rewardItem, rewardQty, `${rarity} reward`);

                            // Get the item emoji.
                            const itemEmoji = COOP.MESSAGES.emojiCodeText(rewardItem);
                            return `${itemEmoji} ${rewardItem}x${rewardQty}`;
                        }).join(', ');

                        listLootString += '.\n';
                    }
                });
            }

            EconomyNotifications.add('CRATE_DROP', {
                playerID: '????',
                username: '???'
            });
            
            // Remove the reward message because it was placed in a random channel.
            // if (!anyRewardGiven) 
            //     return COOP.MESSAGES.selfDestruct(msg, 'No items were inside this crate! >:D', 0, 5000);

            // Post and delete the points reward message feedback.
            const hitterNamesStr = hitterNames.join(', ');
            const tenseStr = hitterNames.length > 1 ? 'were' : 'was';
            const usersRewardedText = `${hitterNamesStr} ${tenseStr} rewarded ${crate.openingPoints} points`;
            const rewardTypeText = `${!anyRewardGiven ? 'empty ' : ''}${rarity.replace('_', ' ').toLowerCase()}`;
            const pointsRewardString = `**${usersRewardedText} for opening the ${rewardTypeText}!**\n\n`;
            const crateLootText = pointsRewardString + listLootString;

            // Send the update.
            COOP.CHANNELS.propagate(msg, crateLootText, 'ACTIONS', false);

            // Remove the opened crate.
            // COOP.MESSAGES.delayDelete(msg, 10000);
        }, 666);
    }


    // TODO: Implement explosive/toxic crate from Robyn (steals your items)
    // Small chance of it exploding all explosive items you own.
    static selectRandomRarity() {
        let rarity = 'AVERAGE_CRATE';
        if (STATE.CHANCE.bool({ likelihood: likelihood / 2 })) rarity = 'RARE_CRATE';
        if (STATE.CHANCE.bool({ likelihood: likelihood / 6 })) rarity = 'LEGENDARY_CRATE';
        return rarity;
    }
    
    // TODO: Implement using bomb on crate.
    // static async explode(reaction, user) {
        // Check user actually has a bomb to use
        // Potentially require 2 bombs.
        // UsableItemHelper.use(user.id, 'BOMB', 2);
        // Edit message to explosion emoji, THEN open.
        // this.open(reaction, user);
    // }

    static async drop() {
        try {
            // Calculate crate rarity based on chance.
            const rarity = this.selectRandomRarity();
            
            // Drop the crate!
            const random = COOP.CHANNELS._randomSpammable();
            if (random) {
                // Drop the crate via emoji.
                const crateMsg = await random.send(COOP.MESSAGES.emojifyID(EMOJIS[rarity]));

                // Format rarity text and provide a record.
                const rarityWord = COOP.MESSAGES.titleCase(rarity.split('_')[0]);
                const crateDropText = `${COOP.ROLES._textRef('CRATEDROP_PING')}, ${rarityWord} crate drop in progress.`;
                const feedMsg = await COOP.CHANNELS._send('FEED', crateDropText, {});

                // Add user reaction feedback/aesthetic only.
                COOP.MESSAGES.delayReact(crateMsg, '🪓', 333);
                COOP.MESSAGES.delayReact(feedMsg, '🪓', 666);
            }

        } catch(e) {
            console.log('Error dropping crate');
            console.error(e);
        }
    }
    
    static async run() {
        // Stop crate drop being based on a fixed time, could do that with chopper minigame instead.
        this.drop();
    }

}