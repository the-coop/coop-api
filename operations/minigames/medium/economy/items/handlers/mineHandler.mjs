import { MESSAGES, USERS, ITEMS } from "../../../../../../organisation/coop.mjs";

export default class MineHandler {

    static async use(msg, user) {
        this.effect(msg, user);
    }

    static async onReaction(reaction, user) {
        // Check reaction emoji is MINE
        const reactEmojiFlake = `:${reaction.emoji.name}:${reaction.emoji.id}`;
        if (reactEmojiFlake !== ITEMS.codeToFlake('MINE')) return false;

        if (USERS.isCooper(user.id)) return false;

        this.effect(reaction.message, user);
    }

    static async effect(msgRef, user) {
        const mineText = MESSAGES.emojiCodeText('MINE');
        MESSAGES.selfDestruct(msgRef, mineText, 3333, 60000);

        MESSAGES.selfDestruct(msgRef, `${user.username} used a MINE ${mineText}.`, 0, 6666);
    }
   
}