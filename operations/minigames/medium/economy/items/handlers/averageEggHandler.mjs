
import ReactionHelper from "../../../../../activity/messages/reactionHelper.mjs";
import { EGG_DATA } from "../../../../small/egghunt.mjs";
import { usedOwnedUsableGuard } from "../../itemCmdGuards.mjs";

import { EMOJIS } from "../../../../../../organisation/config.mjs";
import COOP, { ITEMS, STATE, USERS } from "../../../../../../organisation/coop.mjs";

export default class AverageEggHandler {

    // TODO: Refactor for all eggs.
    static shouldTriggerSuggest(reaction) {
        return reaction.emoji.name === '💚' && reaction.count === 3;
    }

    // TODO: Eggs need some way of dealing with user's using on self...
    static async onReaction(reaction, user) {
        if (reaction.emoji.name === 'average_egg') {
            try {
                // TODO: Allow Cooper to add the suggestion whether he has any or not.
                const used = await usedOwnedUsableGuard(user, 'AVERAGE_EGG', 1, reaction.message, USERS.isCooper(user.id));
                if (!used) return false;

                // Chance of backfiring.
                const backFired = STATE.CHANCE.bool({ likelihood: 33 });
                const author = reaction.message.author;
                const isSelf = user.id === author.id;
                const targetID = backFired ? user.id : author.id;

                // Toxic bomb damage definition.
                const damage = EGG_DATA['AVERAGE_EGG'].points;

                // Initialise dynamic damage info text.
                let damageInfoText = '';

                // Only apply damage when egg hasn't broken on self.
                if (!(backFired && isSelf)) {
                    // Apply the damage to the target's points.
                    const updatedPoints = await COOP.ITEMS.add(targetID, 'COOP_POINT', damage, 'Average egg effect');

                    // Update feedback string, did cause damage.
                    damageInfoText = `: ${damage} points (${ITEMS.displayQty(updatedPoints)})`;

                    // Remove the egg based on popularity.
                    const popularity = ReactionHelper.countType(reaction.message, '💚');
                    if (popularity < 3 && !COOP.USERS.isCooper(user.id)) 
                        COOP.MESSAGES.delayReactionRemove(reaction, 333);

                    // Add Cooper's popularity suggestion.
                    COOP.MESSAGES.delayReact(reaction.message, '💚', 666);
                }

                // Detect self and format text accordingly.
                let target = author.username;
                if (isSelf) target = 'their self';

                // Create the action/feedback text.
                let actionInfoText = `${user.username} used an average egg on ${target}`;
                if (backFired) actionInfoText = `${user.username} tried to use an average egg on ${target}, but it backfired`;
                if (backFired && isSelf) actionInfoText = `${user.username} tried to use an average egg on ${target}, but it broke.`;

                // Post it.
                const feedbackMsgText = `${actionInfoText}${damageInfoText}.`;

                // Check if channel is spammable, if so don't self-destruct the notification.
                if (COOP.CHANNELS.isChannelIDSpammable(reaction.message.channel.id)) {
                    reaction.message.channel.send(feedbackMsgText);
                } else
                    COOP.MESSAGES.selfDestruct(reaction.message, feedbackMsgText, 333, 30000);

                // Send the record message separately.
                COOP.CHANNELS._send('ACTIONS', feedbackMsgText, {});
                
            } catch(e) {
                console.error(e);
            }
        }

        // On 3 average hearts, allow average egg suggestion.
        if (this.shouldTriggerSuggest(reaction))
            COOP.MESSAGES.delayReact(reaction.message, EMOJIS.AVERAGE_EGG, 333);
    }
   
}