import _ from 'lodash';

import { RAW_EMOJIS, EMOJIS } from '../../../organisation/config.mjs';
import COOP, { STATE, CHANNELS, ITEMS, MESSAGES, USERS, ROLES, REACTIONS } from '../../../organisation/coop.mjs';

import EconomyNotifications from '../../activity/information/economyNotifications.mjs';
import DropTable from '../medium/economy/items/droptable.mjs';
import ItemsHelper from '../medium/economy/items/itemsHelper.mjs';
import UsableItemHelper from '../medium/economy/items/usableItemHelper.mjs';
import SkillsHelper from '../medium/skills/skillsHelper.mjs';

import { isRegisteredUserGuard } from '../medium/economy/itemCmdGuards.mjs';


export const EGG_DATA = {
    TOXIC_EGG: {
        points: -10,
        emoji: EMOJIS.TOXIC_EGG
    },
    AVERAGE_EGG: {
        points: 3,
        emoji: EMOJIS.AVERAGE_EGG
    },
    RARE_EGG: {
        points: 10,
        emoji: EMOJIS.RARE_EGG
    },
    LEGENDARY_EGG: {
        points: 100,
        emoji: EMOJIS.LEGENDARY_EGG
    },
};


export default class EggHuntMinigame {
    
    static reactValid(reaction) {
        return this.isEgghuntDrop(reaction.message.content);
    }

    static isEgghuntDrop(messageStr) {
        const eggEmojiNames = _.map(_.values(EGG_DATA), "emoji");
        const emojiIdentifier = MESSAGES.purifyEmojiIDStr(messageStr);
        return eggEmojiNames.includes(emojiIdentifier);
    }

    static async onReaction(reaction, user) {
        try {
            // Prevent Cooper from collecting his own eggs.
            if (USERS.isCooper(user.id)) return false;

            const isCooperMessage = USERS.isCooperMsg(reaction.message);
            const isEgghuntDrop = this.isEgghuntDrop(reaction.message.content);
            const rarity = this.calculateRarityFromMessage(reaction.message);
            const isEggCollectible = isCooperMessage && isEgghuntDrop && rarity;

            const isBombEmoji = reaction.emoji.name === RAW_EMOJIS.BOMB;
            const isBasketEmoji = reaction.emoji.name === RAW_EMOJIS.BASKET;
            const isHammerEmoji = reaction.emoji.name === RAW_EMOJIS.HAMMER;

            // TODO: This isn't secure enough, need to check it's a coop emoji
            // SOLUTION: reaction.emoji.guild.id === COOP.id
            const isPanEmoji = reaction.emoji.name === 'frying_pan';

            // Check user is in the database:
            if (!await isRegisteredUserGuard(reaction.message, user)) 
                return false;

            if (isEggCollectible && isPanEmoji) this.fry(reaction, user);
            if (isEggCollectible && isBombEmoji) this.explode(reaction, user);
            if (isEggCollectible && isHammerEmoji) this.break(reaction.message, user, rarity, true);

            // Prevent collection of dropped egg effects (cyclical).
            const wasDropped = UsableItemHelper.isDroppedItemMsg(reaction.message);

            // Disallow egghunt effects on dropped eggs.
            const egghuntDroppedEgg = isEggCollectible && isBasketEmoji && !wasDropped;

            // If collectible, collect emoji and wasn't dropped, allow collection.
            if (egghuntDroppedEgg) this.collect(reaction, user);

        } catch(e) {
            console.error(e);
        }
    }

    static calculateRarityFromMessage(msg) {
        let eggRarity = null;

        if (msg.content.indexOf('average_egg') > -1) eggRarity = 'AVERAGE_EGG';
        if (msg.content.indexOf('rare_egg') > -1) eggRarity = 'RARE_EGG';
        if (msg.content.indexOf('legendary_egg') > -1) eggRarity = 'LEGENDARY_EGG';
        if (msg.content.indexOf('toxic_egg') > -1) eggRarity = 'TOXIC_EGG';

        return eggRarity;
    }

    static async processBombDrop(msgRef, rarity, user) {
        // Ignore toxic eggs for now.
        if (rarity === 'TOXIC_EGG') return false;

        const tierLevel = rarity.replace('_EGG', '');
        const reward = DropTable.getRandomTieredWithQty(tierLevel);

        const actionTypeText = MESSAGES.randomChars(7);
        const subjectText = `the ${tierLevel.toLowerCase()} egg`;
        const actionText = `${user.username} ${actionTypeText}'d items from bombing ${subjectText}...`;
        const emojiText = MESSAGES.emojiText(EMOJIS[rarity]);
        const emojiItemText = MESSAGES.emojiText(EMOJIS[reward.item]);
        const eventText = `${actionText} ${emojiText}\n${emojiItemText} ${reward.item}x${reward.qty}`;
        
        CHANNELS.silentPropagate(msgRef, eventText, 'ACTIONS', 10000);
        
        await ITEMS.add(user.id, reward.item, reward.qty, `EGGHUNT_BOMB_REWARD - ${actionTypeText}'d ${rarity} (bomb)`);
    }

    // TODO: Add a small chance of bomb exploding on you.
    static async explode(reaction, user) {

        // Check if user has a bomb to use
        try {
            // TODO: Allow all other explosives to do this too.
            const bombQuantity = await ITEMS.getUserItemQty(user.id, 'BOMB');

            const rarity = this.calculateRarityFromMessage(reaction.message);
            const reward = EGG_DATA[rarity].points;
            const emoji = EGG_DATA[rarity].emoji;

            // Remove reaction by user without a bomb and prevent usage.
            if (bombQuantity <= 0) return await reaction.users.remove(user.id);

            // Remove bomb from user.
            await ITEMS.subtract(user.id, 'BOMB', 1, `Bombed an ${rarity}`);

            // User has enough eggs, blow egg up.
            const blownupEggMsg = await reaction.message.edit('💥... egg destroyed');
            // MESSAGES.delayDelete(blownupEggMsg, 3333);

            // Share points with nearest 5 message authors.
            const channelMessages = reaction.message.channel.messages;
            const surroundingMsgs = await channelMessages.fetch({ around: reaction.message.id, limit: 40 });
            const aroundUsers = surroundingMsgs.reduce((acc, msg) => {
                const notCooper = !USERS.isCooperMsg(msg);
                const notIncluded = typeof acc[msg.author.id] === 'undefined';
                if (notIncluded && notCooper) acc[msg.author.id] = msg.author;
                return acc;
            }, {});

            // Store points and egg collection data in database.
            const awardedUserIDs = Object.keys(aroundUsers);
            Promise.all(awardedUserIDs.map(userID => COOP.ITEMS.add(userID, 'COOP_POINT', reward, `EGGHUNT_BOMB_SPLASH_REWARD - Bombed ${rarity} splash effect`)));

            // Add/update random item to user if it was a legendary egg
            this.processBombDrop(reaction.message, rarity, user);

            // Create feedback text from list of users.
            const usersRewardedText = awardedUserIDs.map(userID => aroundUsers[userID].username).join(', ');
            const emojiText = MESSAGES.emojiText(emoji);
            const feedbackMsg = `${usersRewardedText} gained ${reward} points by being splashed by exploding egg ${emojiText}`.trim();
            
            // Add server notification in feed.
            CHANNELS.propagate(reaction.message, feedbackMsg, 'ACTIONS')

        } catch(e) {
            console.error(e);
        }
    }

    static async fry(reaction, user) {
        try {
            // Attempt to use the laxative item
            const didUsePan = await UsableItemHelper.use(user.id, 'FRYING_PAN', 1);
    
            // Respond to usage result.
            if (didUsePan) {
                const rarity = this.calculateRarityFromMessage(reaction.message);
                const { points, emoji } = EGG_DATA[rarity];
    
                // Invert rewards, good egg cooked is wasting, bad egg cooked is rewarding.
                const actionReward = -points;   
    
                // Process the points change.
                const updatedPoints = await COOP.ITEMS.add(user.id, 'COOP_POINT', actionReward, `EGGHUNT_REWARD_FRIED - Fried toxic egg`);
    
                // TODO: Maybe include in output message??
                await SkillsHelper.addXP(user.id, 'cooking', 3);

                // Generate feedback test based on the changes.
                const feedbackText = `${user.username} fried <${emoji}>! ` +
                    `Resulting in ${actionReward} point(s) change (now ${ITEMS.displayQty(updatedPoints)}) and 5 cooking XP!`;
                
                // Modify fried egg.
                await reaction.message.edit(reaction.message.content + '\n' + feedbackText); 

            } else {
                const unableMsg = await reaction.message.channel.send('Unable to use FRYING_PAN, you own none. :/');
                setTimeout(() => reaction.users.remove(user.id), 666);
                MESSAGES.delayReact(unableMsg, EMOJIS.FRYING_PAN, 1333);
                MESSAGES.delayDelete(unableMsg, 10000);
            }
        } catch(e) {
            console.log('Frying egg failed...');
            console.error(e);
        }
    }

    static handleChristmasRelease(reaction, user) {
        const currentDate = new Date();
        const shouldRelease = (
            currentDate.getMonth() === 11 && 
            currentDate.getDate() >= 15 && 
            currentDate.getDate() < 26
        );

        // Limit Christmas egg releases.
        if (!shouldRelease) return null;
        if (STATE.CHANCE.bool({ likelihood: 95 })) return null;

        // Inform the user of the CHRISTMAS_EGG reward.
        const christmasEggEmoji = MESSAGES.emojiCodeText('CHRISTMAS_EGG');
        const christmasReleaseText = `You randomly found a CHRISTMAS_EGG ${christmasEggEmoji}!`;
        MESSAGES.selfDestruct(reaction.message, christmasReleaseText, 0, 666);

        // Add the item to the user's ownership.
        COOP.ITEMS.add(user.id, 'CHRISTMAS_EGG', reward, `EGGHUNT_REWARD_CHRISTMAS - Christmas egg release.`);
    }

    static async collect(reaction, user) {
        try {
            // Ignore later reactions than the first one.
            if (reaction.count > 2) return null;

            const rarity = this.calculateRarityFromMessage(reaction.message);
            const reward = EGG_DATA[rarity].points;
            const rewardPolarity = reward > 0 ? '+' : '';
            const emoji = EGG_DATA[rarity].emoji;

            // Check the channel type or location of the action.
            let location = null;
            if (reaction.message.channel.type === 'DM') location = 'direct message'
            else location = `"${reaction.message.channel.name}" channel`;

            // Setup the text for feedback messages.
            const actionText = `Egg Hunt! ${user.username}`;
            let acknowledgementMsgText =`${actionText} ${rewardPolarity}${reward} points!`.trim();
            let activityFeedMsgText = `${user.username} collected an egg in ${location}! <${emoji}>`.trim();

            // TODO: If Cooper is evil you break more pickaxes, axes, frying pans and eggs.
            if (STATE.CHANCE.bool({ likelihood: 83 })) {
                // Store points and egg collection data in database.
                const updatedPoints = await COOP.ITEMS.add(user.id, 'COOP_POINT', reward, `EGGHUNT_COLLECTED_${rarity.toUpperCase()}_REWARD_POINTS Collected ${rarity}`);
                const updated = ItemsHelper.displayQty(updatedPoints);

                acknowledgementMsgText += ` (${updated})`;
                
                // Add/update egg item to user
                await ITEMS.add(user.id, rarity, 1, `EGGHUNT_COLLECTED_${rarity.toUpperCase()}`);

                // Update economy statistics.
                EconomyNotifications.add('EGG_HUNT', {
                    // playerID: user.id,
                    // username: user.username,
                    type: 'COLLECT',
                    eggType: rarity,
                    pointGain: reward
                });

                // Animate the egg collection.
                const basketEmojiText = MESSAGES.emojiText(RAW_EMOJIS.BASKET);
                MESSAGES.delayEdit(
                    reaction.message, 
                    `${MESSAGES.emojiText(EGG_DATA[rarity].emoji)}${basketEmojiText}💨 ${acknowledgementMsgText}`, 
                    0
                );

                // Remove the emojis
                REACTIONS.removeAll(reaction.message);

                // Conditionally handle Christmas release of eggs.
                this.handleChristmasRelease(reaction, user);
            } else {
                this.break(reaction.message, user, rarity);
                activityFeedMsgText = `${user.username} broke an egg in ${location}! :( <${emoji}>`.trim();
            }

            // Sometimes tell the-barn that an egg was collected and where.
            if (STATE.CHANCE.bool({ likelihood: .5 })) 
                CHANNELS._send('TALK', activityFeedMsgText);

        } catch(e) {
            console.error(e);
        }
    }

    static async break(msg, user, rarity, intentional = false) {
        try {
            const emoji = MESSAGES.emojiText(EGG_DATA[rarity].emoji);
            const actionText = `${emoji}🔨 ${user.username}`;
            EconomyNotifications.add('EGG_HUNT', {
                type: 'BROKEN',
                eggType: rarity
            });
            let acknowledgementMsgText = `${actionText} ${intentional ? 'intentionally' : 'clumsily'} broke the egg...`.trim();
            if (intentional) {
                const reward = -Math.ceil(EGG_DATA[rarity].points / 2);
                const rewardPolarity = reward > 0 ? '' : '-';
                acknowledgementMsgText += ` ${rewardPolarity}${reward} points!`;

                // Add/subtract the reward.
                await ITEMS.add(user.id, 'COOP_POINT', reward, `EGGHUNT_BROKEN_REWARD_${rarity.toUpperCase()}`);
            }
            
            MESSAGES.delayEdit(msg, acknowledgementMsgText, 0);

            // Remove the emojis
            REACTIONS.removeAll(msg);

        } catch(e) {
            console.log('Break failed');
            console.error(e);
        }
    }

    static async drop(rarity, dropText = null) {
        const dropChannel = CHANNELS._randomSpammable();
        
        if (dropChannel) {
            const randomDelayBaseMs = 30000;
            setTimeout(async () => {
                try {
                    const eggMsg = await dropChannel.send(MESSAGES.emojiText(EGG_DATA[rarity].emoji));

                    // Add collection action emoji.
                    MESSAGES.delayReact(eggMsg, RAW_EMOJIS.BASKET, STATE.CHANCE.integer({ min: 111, max: 222 }));
                    MESSAGES.delayReact(eggMsg, RAW_EMOJIS.HAMMER, STATE.CHANCE.integer({ min: 111, max: 222 }));

                    // If an annotation for the egg drop was provided, use it.
                    const fivePercentRoll = STATE.CHANCE.bool({ likelihood: 7.5 });
                    if (dropText && fivePercentRoll) 
                        CHANNELS._send('TALK', dropText);

                } catch(e) {
                    console.error(e);
                }
            }, STATE.CHANCE.natural({ min: randomDelayBaseMs, max: randomDelayBaseMs * 4 }));
        }
    }

    static async dmDrop(rarity) {
        try {
            const randomMember = await USERS.random();
            if (randomMember) {
                // Send via DM.
                const eggMsg = await randomMember.send(MESSAGES.emojiText(EGG_DATA[rarity].emoji));
                MESSAGES.delayReact(eggMsg, RAW_EMOJIS.BASKET, 333);
    
                // Remove toxic egg after 5 minutes so people aren't forced to take it.
                // if (rarity === 'TOXIC_EGG') MESSAGES.delayDelete(eggMsg, 300000);
    
                // Provide feedback.
                let dropText = `${randomMember.user.username} was sent an egg via DM! ${MESSAGES.emojiText(EGG_DATA[rarity].emoji)}`;
                if (rarity === 'LEGENDARY_EGG') dropText = 'OooOoOoOoooo... ' + dropText;
                CHANNELS._postToChannelCode('TALK', dropText);
            }
        } catch(e) {
            console.error(e);
        }
    }

    static run() {        
        if (STATE.CHANCE.bool({ likelihood: 40 }))
            this.drop('AVERAGE_EGG', 'Whoops! I dropped an egg, but where...?');

        if (STATE.CHANCE.bool({ likelihood: 25 }))
            this.drop('TOXIC_EGG', 'I dropped an egg, but where...? Tsk.');

        if (STATE.CHANCE.bool({ likelihood: 5 }))
            this.drop('RARE_EGG', 'Funknes! Rare egg on the loose!');

        if (STATE.CHANCE.bool({ likelihood: .3 })) {
            CHANNELS._postToChannelCode('TALK', ROLES._textRef('BONUS_EGGS_PING') + ', a legendary egg was dropped! Find and grab it before others can!');
            this.drop('LEGENDARY_EGG');
        }

        // Small chance of rolling for a direct message egg.
        if (STATE.CHANCE.bool({ likelihood: 10 })) {
            if (STATE.CHANCE.bool({ likelihood: 3.85 })) this.dmDrop('AVERAGE_EGG');
            if (STATE.CHANCE.bool({ likelihood: 2.45 })) this.dmDrop('RARE_EGG');
            if (STATE.CHANCE.bool({ likelihood: 0.025 })) this.dmDrop('LEGENDARY_EGG');
        }

        // Small chance of bonus eggs being released.     
        if (STATE.CHANCE.bool({ likelihood: 4.5 })) {        
            const bonusEggRolePing = ROLES._textRef('BONUS_EGGS_PING');
            let bonusEggStatus = ' bonus eggs rolling!';

            // Calculate a number of bonus eggs.
            let bonusEggsNum = STATE.CHANCE.natural({ min: 5, max: 25 });

            // Even rare chance of mass release.
            if (STATE.CHANCE.bool({ likelihood: 1.5 })) {
                bonusEggsNum = STATE.CHANCE.natural({ min: 10, max: 45 });
                bonusEggStatus = ' bonus eggs hurtling!';
            }
            
            // Even rare(er) chance of mass(er) release.
            if (STATE.CHANCE.bool({ likelihood: .075 })) {
                bonusEggsNum = STATE.CHANCE.natural({ min: 20, max: 70 });
                bonusEggStatus = ' bonus eggs bonusing!';
            }

            // Append search text
            bonusEggStatus += ' Search the channels for the eggs!'

            // Announce bonus eggs socially.
            CHANNELS._send('TALK', bonusEggRolePing + bonusEggStatus, 0, {});

            // Drop the bonus average eggs.
            for (let i = 0; i < bonusEggsNum; i++) {
                setTimeout(() => this.drop('AVERAGE_EGG', null), i * 3333);
            }

            // Add in a mixture of toxic eggs.
            const toxicEggsMixupNum = STATE.CHANCE.natural({ min: 1, max: Math.floor(bonusEggsNum / 2.5) });
            for (let i = 0; i < toxicEggsMixupNum; i++) {
                setTimeout(() => this.drop('TOXIC_EGG', null), i * 3333);
            }
        }
    }

    static async antiTroll(msg) {
        // Check if message is egg hunt drop but not Cooper.
        const isUserMessage = !USERS.isCooperMsg(msg);
        const isEgghuntDrop = this.isEgghuntDrop(msg.content);
        const eggRarity = this.calculateRarityFromMessage(msg);
        const isTrollEgg = isUserMessage && isEgghuntDrop && eggRarity;

        const roll = STATE.CHANCE.bool({ likelihood: 15 });
        if (isTrollEgg && roll) {
            // Check if the user has an egg.
            const hasQty = await ITEMS.hasQty(msg.author.id, eggRarity, 1);
            if (!hasQty) return false;

            // Try to take the egg from the user.
            const didUse = await UsableItemHelper.use(msg.author.id, eggRarity, 1);
            if (!didUse) return false;

            await ITEMS.add(STATE.CLIENT.user.id, eggRarity, 1, 'EGGHUNT_ANTITROLL_TAKEN - Stolen trolling egg, karma');
            
            MESSAGES.selfDestruct(msg, 'Thanks for the egg! ;)', 0, 333);
            
            CHANNELS.propagate(msg, 'Cooper collected (stole) an egg.', 'ACTIONS', true);

            MESSAGES.delayReact(msg, RAW_EMOJIS.BASKET, 333);

            MESSAGES.delayDelete(msg, 222);
        }

        
    }
}
