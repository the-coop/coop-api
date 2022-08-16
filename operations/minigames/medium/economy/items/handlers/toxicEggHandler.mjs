import BuffsHelper from "../../../conquest/buffsHelper.mjs";
import UsableItemHelper from "../usableItemHelper.mjs";

import COOP, { ITEMS, STATE } from "../../../../../../organisation/coop.mjs";
import { EMOJIS } from "../../../../../../organisation/config.mjs";


// TODO: All eggs should extend base egg handler, same for food items / food item handlers.
export default class ToxicEggHandler {

    static async onReaction(reaction, user) {
        const msg = reaction.message;

        if (reaction.emoji.name === 'toxic_egg') {
            try {
                const didUse = await UsableItemHelper.use(user.id, 'TOXIC_EGG', 1);
                if (!didUse) {
                    const unableText = `${user.username} tried to use a toxic egg, but has none.`;
                    COOP.MESSAGES.selfDestruct(msg, unableText, 0, 5000);
                    return await reaction.users.remove(user.id);
                } else {
                    const backFired = STATE.CHANCE.bool({ likelihood: 25 });
                    const author = msg.author;
                    const targetID = backFired ? user.id : author.id;

                    // Base action text.
                    let actionInfoText = `${user.username} used a toxic egg on ${author.username}`;
                    
                    // Check if target has invincibility buff.
                    if (BuffsHelper.has('INVINCIBILITY', targetID)) {

                        // TODO: Count invincibility blocks into stats.
                        const shieldEmoji = COOP.MESSAGES.emojiCodeText('SHIELD');
                        return COOP.MESSAGES.selfDestruct(msg, `${shieldEmoji.repeat(2)} ${author.username} was protected from ${user.username}'s toxic egg by invincibility buff!`)
                    }

                    
                    // Toxic bomb damage definition.
                    const damage = -3


                    // Apply the damage to the target's points.
                    const updatedPoints = await COOP.ITEMS.subtract(targetID, 'COOP_POINT', Math.abs(damage), 'Toxic egg effect');

                    const popularity = COOP.REACTIONS.countType(msg, '☢️');
                    if (popularity <= 3) COOP.MESSAGES.delayReactionRemove(reaction, 333);


                    // Add visuals animation
                    COOP.MESSAGES.delayReact(msg, '☢️', 666);

                    
                    const damageInfoText = ` ${damage} points (${ITEMS.displayQty(updatedPoints)})`;
                    
                    if (backFired) actionInfoText = `${user.username} tried to use a toxic egg on ${author.username}, but it backfired`;

                    const feedbackMsgText = `${actionInfoText}: ${damageInfoText}.`;

                    const feedbackMsg = await COOP.CHANNELS.propagate(msg, feedbackMsgText, 'ATTACKS', true);
                    COOP.MESSAGES.delayReact(feedbackMsg, '☢️', 1333);
                }
            } catch(e) {
                console.error(e);
            }
        }

        // On 3 average hearts, allow average egg suggestion.
        if (reaction.emoji.name === '☢️' && reaction.count === 3)
            // Add legendary_egg emoji reaction.
            COOP.MESSAGES.delayReact(reaction.message, EMOJIS.TOXIC_EGG, 333);
        
    }
   
}