import EconomyNotifications from "../../activity/information/economyNotifications.mjs";

import SkillsHelper from "../medium/skills/skillsHelper.mjs";

import UsableItemHelper from "../medium/economy/items/usableItemHelper.mjs";

import { STATE, REACTIONS, ITEMS, MESSAGES, USERS, CHANNELS, ROLES } from "../../../organisation/coop.mjs";
import { EMOJIS } from "../../../organisation/config.mjs";
import Statistics from "../../activity/information/statistics.mjs";
import TemporaryMessages from "../../maintenance/temporaryMessages.mjs";

export default class MiningMinigame {
    
    // Reaction interceptor to check if user is attempting to interact.
    static async onReaction(reaction, user) {
        // High chance of preventing any mining at all to deal with rate limiting.
        if (STATE.CHANCE.bool({ likelihood: 50 })) return false;

        const isOnlyEmojis = MESSAGES.isOnlyEmojis(reaction.message.content);
        const isPickaxeReact = reaction.emoji.name === '⛏️';
        const isCooperMsg = USERS.isCooperMsg(reaction.message);
        const isUserReact = !USERS.isCooper(user.id);
        
        // Mining minigame guards.
        if (!isUserReact) return false;
        if (!isCooperMsg) return false;
        if (!isPickaxeReact) return false;
        if (!isOnlyEmojis) return false;

        const msgContent = reaction.message.content;

        const firstEmojiString = (msgContent[0] || '') + (msgContent[1] || '');
        const firstEmojiUni = MESSAGES.emojiToUni(firstEmojiString);
        const rockEmojiUni = MESSAGES.emojiToUni(EMOJIS.ROCK);
        const isRocksMsg = firstEmojiUni === rockEmojiUni;

        if (isRocksMsg) this.chip(reaction, user);
    }

    // TODO: Bomb skips a few places at random
    static async chip(reaction, user) {
        const msg = reaction.message;

        // Calculate magnitude from message: more rocks, greater reward.
        const textMagnitude = Math.floor(msg.content.length / 2);
        const rewardRemaining = STATE.CHANCE.natural({ min: 1, max: textMagnitude * 2 });

        // Check if has a pickaxe
        const userPickaxesNum = await ITEMS.getUserItemQty(user.id, 'PICK_AXE');
        const noPickText = `<@${user.id}> tried to mine the rocks, but doesn't have a pickaxe.`;

        // Remove reaction and warn.
        // DELETE REACTION
        if (userPickaxesNum <= 0) 
            return MESSAGES.silentSelfDestruct(msg, noPickText, 0, 5000);

        // Count the number of people mining to apply a multipler/bonus.
        const numCutters = REACTIONS.countType(msg, '⛏️') - 1;
        
        // Adjust extracted ore by buffs and adjust to clamp above > 0.
        const extractedOreNum = Math.max(0, Math.ceil(rewardRemaining / 1.5) * numCutters);

        // Clamp lower and upper boundary for chance of pickaxe breaking
        const pickaxeBreakPerc = Math.min(75, Math.max(25, extractedOreNum));

        // Attempt to access the mining message.
        let updateMsg = null;
        (await msg.channel.messages.fetch({ limit: 10 }))
            .map(m => {
                if (m.content.includes('**MINING IN PROGRESS**'))
                    updateMsg = m;
            });
            
        // Test the pickaxe for breaking.
        const didBreak = STATE.CHANCE.bool({ likelihood: pickaxeBreakPerc });
        if (didBreak) {
            const pickaxeUpdate = await UsableItemHelper.use(user.id, 'PICK_AXE', 1);
            if (pickaxeUpdate) {
                const brokenPickDamage = -2;
                const pointsDamageResult = await ITEMS.subtract(user.id, 'COOP_POINT', Math.abs(brokenPickDamage), 'Broken pickaxe damage');
                const ptsDmgText = ITEMS.displayQty(pointsDamageResult);
                
                // Update mining economy statistics.
                EconomyNotifications.add('MINING', {
                    playerID: user.id,
                    username: user.username,
                    brokenPickaxes: 1,
                    pointGain: brokenPickDamage
                });    

                // Add the experience.
                SkillsHelper.addXP(user.id, 'mining', 2);

                const actionText = `${user.username} broke a pickaxe trying to mine, ${userPickaxesNum - 1} remaining!`;
                const damageText = `${brokenPickDamage} points (${ptsDmgText}) but gained mining 2xp for trying!.`;

                if (!updateMsg)
                    MESSAGES.silentSelfDestruct(msg, `${actionText} ${damageText}`, 0, 10000);
                else 
                    updateMsg.edit(updateMsg.content + '\n' + `${actionText} ${damageText}`);

                // Remove pickaxe reaction.
                MESSAGES.delayReactionRemoveUser(reaction, user.id, 111);
            }
        } else {
            // See if updating the item returns the item and quantity.
            const addMetalOre = await ITEMS.add(user.id, 'METAL_ORE', extractedOreNum, 'Mining');
            const addPoints = await ITEMS.add(user.id, 'COOP_POINT', 1, 'Mining');
            let diamondsFound = 0;

            if (STATE.CHANCE.bool({ likelihood: 3.33 })) {
                diamondsFound = 1;
                const addDiamond = await ITEMS.add(user.id, 'DIAMOND', diamondsFound, 'Mining rare event');
                CHANNELS.propagate(msg, `${user.username} found a diamond whilst mining! (${addDiamond})`, 'ACTIONS');
            }
            
            if (STATE.CHANCE.bool({ likelihood: 0.25 })) {
                diamondsFound = STATE.CHANCE.natural({ min: 5, max: 25 });
                await ITEMS.add(user.id, 'DIAMOND', diamondsFound, 'Mining very rare event');
                CHANNELS.propagate(msg, `${user.username} hit a major diamond vein, ${diamondsFound}xDIAMOND found!`, 'FEED');
            }

            // Add the experience.
            SkillsHelper.addXP(user.id, 'mining', 1);

            EconomyNotifications.add('MINING', {
                pointGain: 1,
                recOre: extractedOreNum,
                playerID: user.id,
                username: user.username,
                diamondsFound
            });

            // Reduce the number of rocks in the message.
            if (textMagnitude > 1) await msg.edit(EMOJIS.ROCK.repeat(textMagnitude - 1));
            else await msg.delete();
            
            // Provide feedback.
            const metalOreEmoji = MESSAGES.emojiCodeText('METAL_ORE');
            const actionText = `${user.username} successfully mined a rock.`;
            const ptsText = ITEMS.displayQty(addPoints);
            const rewardText = `+1 point (${ptsText}), +${extractedOreNum} ${metalOreEmoji} (${addMetalOre})!`;

            // No need for this any more due to the totals.
            if (!updateMsg)
                MESSAGES.silentSelfDestruct(msg, `${actionText} ${rewardText}`, 0, 10000);
            else 
                updateMsg.edit(updateMsg.content + '\n' + `${actionText} ${rewardText}`);
        }
    }

    static async run() {
        const base = Math.max(1, Statistics.calcCommunityVelocity());

        let magnitude = STATE.CHANCE.natural({ min: base, max: base * 3 });

        // TODO: Adjust points and diamond rewards if more rocks
        // Add rare chances of a lot of rocks
        if (STATE.CHANCE.bool({ likelihood: 5 }))
            magnitude = STATE.CHANCE.natural({ min: base * 5, max: base * 20 });

        if (STATE.CHANCE.bool({ likelihood: 1 }))
            magnitude = STATE.CHANCE.natural({ min: base * 7, max: base * 35 });

        
        const eventChannel = CHANNELS._randomSpammable();
        const rockMsg = await eventChannel.send(EMOJIS.ROCK.repeat(magnitude));

        // Post a message for collecting events against.
        await eventChannel.send('**MINING IN PROGRESS**');

        // Ensure message is stored in database for clear up.
        // TODO: Count as ungathered rock in activity messages.
        TemporaryMessages.add(rockMsg, 30 * 60);

        // Add the prompt for mining the rock.
        MESSAGES.delayReact(rockMsg, '⛏️');

        CHANNELS._send('FEED', `${ROLES._textRef('ROCK_SLIDE_PING')} - Rockslide! Magnitude ${magnitude}!`, {});
    }
}
