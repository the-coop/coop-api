// import { usedOwnedUsableGuard } from '../../itemCmdGuards';
import { MESSAGES, USERS } from '../../../../../../organisation/coop.mjs';

export default class GoldCoinHandler {
    
    static async effect(msgRef, user, target = null) {
        const subject = target ? target : user;
        

        const coinEmoji = MESSAGES.emojiCodeText('GOLD_COIN');
        MESSAGES.selfDestruct(msgRef, `${user.username} tries to use ${coinEmoji} on ${subject.username}.`);

        // Calculate reward.
        // const rewardBase = await COOP.ITEMS.perBeak('COOP_POINT');
        // const reward = parseInt(rewardBase * .25);

        // Add the points to the user.
        // await COOP.ITEMS.add(subject.id, 'COOP_POINT', reward);

        // COOP.CHANNELS.silentPropagate(msgRef, feedbackText, 'ACTIONS');
    }


    static async use(msgRef, user) {       
        // Apply multi-guard for usable item, owned, and consumed for this action.
        // const used = await usedOwnedUsableGuard(user, 'EASTER_EGG', 1, msgRef);
        // if (!used) return false;

        this.effect(msgRef, user);
    }
   

    static async onReaction({ emoji, message }, user) {
        // Prevent Cooper from using easter eggs?
        if (emoji.name !== 'gold_coin') return false;
        if (USERS.isCooper(user.id)) return false;

        // const used = await usedOwnedUsableGuard(user, 'EASTER_EGG', 1, message);
        // if (!used) return false;

        this.effect(message, user, message.author);
    }

}