import { usedOwnedUsableGuard } from '../../itemCmdGuards.mjs';
import COOP, { USERS } from '../../../../../../organisation/coop.mjs';

export default class EasterEggHandler {
    
    static async effect(msgRef, user, target = null) {
        const subject = target ? target : user;
        
        // Calculate reward.
        const rewardBase = await COOP.ITEMS.perBeak('COOP_POINT');
        const reward = parseInt(rewardBase * .25);

        // Add the points to the user.
        await COOP.ITEMS.add(subject.id, 'COOP_POINT', reward, 'Easter egg effect');

        // Add feedback.
        const coopEmoji = COOP.MESSAGES.emojiCodeText('COOP_POINT');
        const eggEmoji = COOP.MESSAGES.emojiCodeText('EASTER_EGG');
        const optTarget = target ? ` on <@${target.id}>` : '';
        const feedbackText = `**${eggEmoji.repeat(2)} ${user.username} used their easter egg${optTarget}!**\n\n` +
            `They gained ${reward}x${coopEmoji} (25% of the average CP per beak (${rewardBase}))!`;

        COOP.CHANNELS.silentPropagate(msgRef, feedbackText, 'ACTIONS');
    }


    static async use(msgRef, user) {       
        // Apply multi-guard for usable item, owned, and consumed for this action.
        const used = await usedOwnedUsableGuard(user, 'EASTER_EGG', 1, msgRef);
        if (!used) return false;

        this.effect(msgRef, user);
    }
   

    static async onReaction({ emoji, message }, user) {
        // Prevent Cooper from using easter eggs?
        if (USERS.isCooper(user.id)) return false;
        if (emoji.name !== 'easter_egg') return false;

        const used = await usedOwnedUsableGuard(user, 'EASTER_EGG', 1, message);
        if (!used) return false;

        this.effect(message, user, message.author);
    }

}