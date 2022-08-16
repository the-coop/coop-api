import BuffsHelper, { BUFF_TYPES } from '../../../conquest/buffsHelper.mjs';

import { usedOwnedUsableGuard } from '../../itemCmdGuards.mjs';

import COOP, { MESSAGES } from '../../../../../../organisation/coop.mjs';
import { CHANNELS, RAW_EMOJIS } from '../../../../../../organisation/config.mjs';

// Give shield user protected state for a set amount of time.

// Purpose of the file and class?


// Give shield a total value and damage it over time like health?
// Reserve feature to health for now, create this as a buff instead of "total shield".

// What does the shield do: Start typing squidling.
export default class ShieldHandler {

    // TODO: Shield reaction does not work for adding onto another person.

    // Intercept item usages via emoji reactions.
    static async onReaction(reaction, user) {
        // Confirm reaction is shield before processing.  
        if (RAW_EMOJIS.SHIELD !== reaction.emoji.name) 
            return false;

        // TODO: Check if message is sacrifice msg via sacrificeHelper instead
        // Has to be disabled until then to prevent wasted items on community core functionality.
        return false;
        // Do not conflict with sacrifice.
        // if (reaction.message.channel.id === CHANNELS.TALK.id) 

        // Prevent Cooper from having an effect.
        if (COOP.USERS.isCooper(user.id)) 
            return false;

        // Reference for shorter code lines.
        const msg = reaction.message;

        // TODO: Add emoji here, Can add another emoji reaction suitable param(?) to pass , ':shield:'
        // Attempt to use the shield item
        const used = await usedOwnedUsableGuard(user, 'SHIELD', 1, msg);
        if (!used) return false;

        // Reference the shielding target.
        const target = reaction.message.author;
        
        // Apply the shield buff to the target.
        const protectionExpiry = this.runEffect(target.id);
        
        // Format and send the feedback text for shield effect.
        const targetName = target.id === user.id ? 'their self' : target.username;

        const successText = COOP.MESSAGES.noWhiteSpace`${user.username} used a ${MESSAGES.emojiCodeText('SHIELD')} SHIELD
            on ${targetName}, adding 30 mins to their total protection (${protectionExpiry} mins).`;
            
        // Indicate shield effect success from reaction usage.
        COOP.MESSAGES.selfDestruct(reaction.message, successText, 0, 15000);
    }


    // Allow people to use the items without having to react to a message.
    // TODO: Will need to pass target?
    static async use(msg, user) {
        // Attempt to use the shield item
        const used = await usedOwnedUsableGuard(user, 'SHIELD', 1, msg);
        if (!used) return false;

        // Respond to usage result.
        const protectionExpiry = this.runEffect(user.id);

        // Provide feedback.
        const successText = `${MESSAGES.emojiCodeText('SHIELD').repeat(2)} ${user.username} used a SHIELD, extending their protection to ${protectionExpiry} mins.`;
        return COOP.MESSAGES.selfDestruct(msg, successText, 0, 10000);
    }


    static runEffect(targetID) {
        let currentProtectionMins = BUFF_TYPES.INVINCIBILITY.duration / 60;

        // Check if topping up or adding initial protection.
        if (BuffsHelper.has('INVINCIBILITY', targetID)) {
            // If they already have invincibility, top it up?
            const updatedExpiry = BuffsHelper.topup('INVINCIBILITY', targetID, BUFF_TYPES.INVINCIBILITY.duration);
            const updatedProtectionSecs = updatedExpiry - COOP.TIME._secs();

            // Update the feedback displayy value.
            currentProtectionMins = updatedProtectionSecs;

        } else {
            // Protect them by saving the buff data in state.
            BuffsHelper.add('INVINCIBILITY', targetID, currentProtectionMins);
        }

        // Return updated/calculated protection time.
        return currentProtectionMins;
    }

}