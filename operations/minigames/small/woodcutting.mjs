import EconomyNotifications from "../../activity/information/economyNotifications.mjs";

import SkillsHelper from "../medium/skills/skillsHelper.mjs";

import { STATE, REACTIONS, USABLE, ITEMS, MESSAGES, USERS, CHANNELS, ROLES } from "../../../organisation/coop.mjs";
import { EMOJIS } from "../../../organisation/config.mjs";
import Statistics from "../../activity/information/statistics.mjs";
import TemporaryMessages from "../../maintenance/temporaryMessages.mjs";

export default class WoodcuttingMinigame {

    // Reaction interceptor to check if user is attempting to interact.
    static async onReaction(reaction, user) {
        // High chance of preventing any Woodcutting at all to deal with rate limiting.
        if (STATE.CHANCE.bool({ likelihood: 50 })) return false;

        const isOnlyEmojis = MESSAGES.isOnlyEmojisOrIDs(reaction.message.content);
        const isAxeReact = reaction.emoji.name === '🪓';
        const isCooperMsg = USERS.isCooperMsg(reaction.message);
        const isUserReact = !USERS.isCooper(user.id);
        
        // Woodcutting minigame guards.
        if (!isUserReact) return false;
        if (!isCooperMsg) return false;
        if (!isAxeReact) return false;
        if (!isOnlyEmojis) return false;

        const msgContent = reaction.message.content;

        const firstEmojiString = (msgContent[0] || '') + (msgContent[1] || '');
        const firstEmojiUni = MESSAGES.emojiToUni(firstEmojiString);
        const rockEmojiUni = MESSAGES.emojiToUni(EMOJIS.WOOD);
        const isWoodMsg = firstEmojiUni === rockEmojiUni;

        if (!isWoodMsg) return false;

        this.chip(reaction, user);
    }

    static async chip(reaction, user) {
        const msg = reaction.message;

        // Do this in mining also!
        // Check for an existing update message to append to!

        // Calculate magnitude from message: more rocks, greater reward.
        const textMagnitude = MESSAGES.countAllEmojiCodes(msg.content);
        const rewardRemaining = STATE.CHANCE.natural({ min: 1, max: textMagnitude * 4 });

        // Check if has a axe
        const userAxesNum = await ITEMS.getUserItemQty(user.id, 'AXE');
        const noText = `${user.username} tried to cut wood, but doesn't have an axe.`;
        if (userAxesNum <= 0) 
            return MESSAGES.silentSelfDestruct(msg, noText, 0, 3333);

        // Check for existing update message.
        let updateMsg = null;
        (await msg.channel.messages.fetch({ limit: 10 }))
            .map(m => {
                if (m.content.includes('**WOODCUTTING IN PROGRESS**'))
                    updateMsg = m;
            });

        // Calculate number of extracted wood with applied collab buff/modifier.
        const numCutters = REACTIONS.countType(msg, '🪓') - 1;
        const extractedWoodNum = Math.max(0, Math.ceil(rewardRemaining / 1.25) * numCutters);

        // Clamp lower and upper boundary for chance of pickaxe breaking
        const axeBreakPerc = Math.min(75, Math.max(25, extractedWoodNum));

        const didBreak = STATE.CHANCE.bool({ likelihood: axeBreakPerc });
        if (didBreak) {
            const axeUpdate = await USABLE.use(user.id, 'AXE', 1);
            if (axeUpdate) {
                const brokenDamage = -2;
                const pointsDamageResult = await ITEMS.subtract(user.id, 'COOP_POINT', Math.abs(brokenDamage), 'Broken axe damage');
                const ptsDmgText = ITEMS.displayQty(pointsDamageResult);

                // Update economy statistics.
                EconomyNotifications.add('WOODCUTTING', {
                    playerID: user.id,
                    username: user.username,
                    brokenAxes: 1,
                    pointGain: brokenDamage
                });

                // Add the experience.
                SkillsHelper.addXP(user.id, 'woodcutting', 2);
                
                const actionText = `${user.username} broke an axe trying to cut wood, ${userAxesNum - 1} remaining!`;
                const damageText = `${brokenDamage} points (${ptsDmgText}) but gained 2xp in woodcutting for trying.`;

                if (!updateMsg)
                    MESSAGES.silentSelfDestruct(msg, `${actionText} ${damageText}`, 0, 10000);
                else 
                    updateMsg.edit(updateMsg.content + '\n' + `${actionText} ${damageText}`);

                // Remove axe reaction
                MESSAGES.delayReactionRemoveUser(reaction, user.id, 111);
            }
        } else {
            // See if updating the item returns the item and quantity.
            const addedWood = await ITEMS.add(user.id, 'WOOD', extractedWoodNum, 'Woodcutting');
            const addPoints = await ITEMS.add(user.id, 'COOP_POINT', 1, 'Woodcutting');

            // Rare events from woodcutting.
            if (STATE.CHANCE.bool({ likelihood: 3.33 })) {
                const addDiamond = await ITEMS.add(user.id, 'AVERAGE_EGG', 1, 'Woodcutting uncommon event');
                CHANNELS.propagate(msg, `${user.username} catches an average egg as it falls from a tree! (${addDiamond})`, 'ACTIONS');
            }
            
            if (STATE.CHANCE.bool({ likelihood: 0.25 })) {
                const branchQty = STATE.CHANCE.natural({ min: 5, max: 25 });
                await ITEMS.add(user.id, 'RARE_EGG', branchQty, 'Woodcutting rare event');
                CHANNELS.propagate(msg, `${user.username} triggered a chain branch reaction, ${branchQty} rare eggs found!`, 'ACTIONS');
            }

            if (STATE.CHANCE.bool({ likelihood: 0.0525 })) {
                const legendaryNestQty = STATE.CHANCE.natural({ min: 2, max: 4 });
                await ITEMS.add(user.id, 'LEGENDARY_EGG', legendaryNestQty, 'Woodcutting, very rare event');
                CHANNELS.propagate(msg, `${user.username} hit a lucky branch, ${legendaryNestQty} legendary egg(s) found!`, 'TALK');
            }

            // Reduce the number of rocks in the message.
            if (textMagnitude > 1) await msg.edit(EMOJIS.WOOD.repeat(textMagnitude - 1));
            else await msg.delete();
            
            // Provide feedback.
            const actionText = `${user.username} successfully chopped wood.`;
            const ptsText = ITEMS.displayQty(addPoints);
            const rewardText = `+1xp, +1 point (${ptsText}), +${extractedWoodNum} wood (${addedWood})!`;
            

            if (!updateMsg)
                CHANNELS.propagate(msg, `${actionText} ${rewardText}`, 'ACTIONS');
            else 
                updateMsg.edit(updateMsg.content + '\n' + `${actionText} ${rewardText}`);

            
            EconomyNotifications.add('WOODCUTTING', {
                pointGain: 1,
                recWood: extractedWoodNum,
                playerID: user.id,
                username: user.username
            });

            // Add the experience.
            SkillsHelper.addXP(user.id, 'woodcutting', 1);
        }
    }

    static async run() {
        const base = Math.max(1, Statistics.calcCommunityVelocity());

        let magnitude = STATE.CHANCE.natural({ min: base, max: base * 5 });

        if (STATE.CHANCE.bool({ likelihood: 5 }))
            magnitude = STATE.CHANCE.natural({ min: base * 5, max: base * 20 });

        if (STATE.CHANCE.bool({ likelihood: 1 }))
            magnitude = STATE.CHANCE.natural({ min: base * 7, max: base * 35 });

        const eventChannel = CHANNELS._randomSpammable();
        const woodMsg = await eventChannel.send(EMOJIS.WOOD.repeat(magnitude));
            
        // Post a message for collecting events against.
        const updatesMsg = await eventChannel.send('**WOODCUTTING IN PROGRESS**');

        // TODO: Count as ungathered wood in activity messages.
        TemporaryMessages.add(woodMsg, 30 * 60);

        MESSAGES.delayReact(woodMsg, '🪓', 666);

        const branchText = magnitude > 1 ? `${magnitude} branches` : `a branch`;
        const woodcuttingEventText = `${'Ooo'.repeat(Math.floor(magnitude))} ${ROLES._textRef('TREE_FELL_PING')}, a tree with ${branchText} to fell!`;
        CHANNELS._send('FEED', woodcuttingEventText, {});
    }
}
