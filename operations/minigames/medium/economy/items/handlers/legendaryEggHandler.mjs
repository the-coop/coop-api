import { EGG_DATA } from "../../../../small/egghunt.mjs";

import UsableItemHelper from "../usableItemHelper.mjs";

import { EMOJIS } from "../../../../../../organisation/config.mjs";
import COOP, { STATE, REACTIONS } from '../../../../../../organisation/coop.mjs';

export default class LegendaryEggHandler {

    static async onReaction(reaction, user) {
        if (reaction.emoji.name === 'legendary_egg') {
            try {
                const didUse = await UsableItemHelper.use(user.id, 'LEGENDARY_EGG', 1);
                if (!didUse) {
                    const failureText = `${user.username} tried to use a legendary egg, but has none l-`;
                    COOP.MESSAGES.selfDestruct(reaction.message, failureText, 0, 5000);
                    COOP.MESSAGES.delayReactionRemoveUser(reaction, user.id, 333);

                } else {
                    const backFired = STATE.CHANCE.bool({ likelihood: 25 });
                    const author = reaction.message.author;
                    const targetID = backFired ? user.id : author.id;

                    // Toxic bomb damage definition.
                    const damage = EGG_DATA['LEGENDARY_EGG'].points;

                    // Apply the damage to the target's points.
                    const updatedPoints = await COOP.ITEMS.add(targetID, 'COOP_POINT', damage, 'Legendary egg effect');

                    // Remove egg reaction based on popularity
                    const popularity = REACTIONS.countType(reaction.message, '💜');
                    if (popularity < 3 && !COOP.USERS.isCooper(user.id)) 
                        COOP.MESSAGES.delayReactionRemove(reaction, 333);
                    
                    // Add visuals animation
                    COOP.MESSAGES.delayReact(reaction.message, '💜', 666);

                    // Build the output message.
                    const damageInfoText = ` ${damage} points (${updatedPoints})`;
                    let actionInfoText = `${user.username} used a legendary egg on ${author.username}`;
                    if (backFired) actionInfoText = `**${user.username} tried to use a legendary egg on ${author.username}, but it backfired.**`;

                    const feedbackMsgText = `${actionInfoText}: ${damageInfoText}.`;
                    COOP.CHANNELS.codeShoutReact(reaction.message, feedbackMsgText, 'ACTIONS', '💜', false);

                    // Also notify feed channel due to the rarity of the egg.
                    COOP.CHANNELS.send('FEED', feedbackMsgText, 666);
                }
            } catch(e) {
                console.error(e);
            }
        }

        // On 3 legendary hearts, allow average egg suggestion.
        if (reaction.emoji.name === '💜' && reaction.count === 3) { 
            // Add legendary_egg emoji reaction.
            COOP.MESSAGES.delayReact(reaction.message, EMOJIS.LEGENDARY_EGG, 333);

            // TODO: Add animation due to rarity.
            COOP.MESSAGES.delayReact(reaction.message, '✨', 666);
        }
    }
   
}