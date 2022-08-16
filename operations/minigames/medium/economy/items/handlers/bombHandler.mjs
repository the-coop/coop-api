import BuffsHelper from "../../../conquest/buffsHelper.mjs";

import COOP, { ITEMS, USABLE } from "../../../../../../organisation/coop.mjs";

export default class BombHandler {

    static async onReaction(reaction, user) {
        const msg = reaction.message;
        const target = msg.author;
        
        // TODO: Pass the bomb needs to be implemented somehow from here.
        
        if (reaction.emoji.name === '💣') {
            try {
                const didUse = await USABLE.use(user.id, 'BOMB', 1);
                if (!didUse) {
                    COOP.MESSAGES.silentSelfDestruct(msg, `<@${user.id}> lacks a bomb to use on <@${target.id}>`);
                    return await reaction.users.remove(user.id);
                } else {
                    // Check and prevent bombing target with invincibility buff.
                    if (BuffsHelper.has('INVINCIBILITY', target.id)) {
                        // TODO: Add some kind of animation via message edit. :D
                        // TODO: Count invincibility blocks into stats.
                        const shieldEmoji = COOP.MESSAGES.emojiCodeText('SHIELD');
                        return COOP.MESSAGES.silentSelfDestruct(msg, 
                            `${shieldEmoji.repeat(2)} <@${target.id}> was protected from <@${user.id}>'s bomb by invincibility buff! `)
                    }

                    // Allow five seconds for people to stack bombs.
                    setTimeout(async () => {
                        // Let bombs stack and amplify the damage.
                        const damage = -4 * reaction.count;
    
                        // Apply the damage to the target's points.
                        const updatedPoints = await COOP.ITEMS.subtract(target.id, 'COOP_POINT', Math.abs(damage), 'Bomb effect x' + reaction.count);
    
                        // Add visuals animation
                        COOP.MESSAGES.delayReactionRemove(reaction, 333);
                        COOP.MESSAGES.delayReact(msg, '💥', 666);
                        
                        // Handle text feedback for stack effect.
                        let doubledInfo = '';
                        if (reaction.count > 1) doubledInfo = `(x${reaction.count})`;

                        const subjectsInvolved = `<@${user.id}> bombed <@${target.id}>`;
                        const changesOccurred = `${damage}${doubledInfo} points (${ITEMS.displayQty(updatedPoints)}).`;
                        const feedbackText = `${subjectsInvolved}: ${changesOccurred}`;

                        // TODO: After one of these hits... should remove all reactions etc.

                        // Propagate without pinging.   
                        COOP.CHANNELS.silentPropagate(msg, feedbackText, 'ATTACKS');
                    }, 5000);
                }
            } catch(e) {
                console.error(e);
            }
        }   
    }
   
}