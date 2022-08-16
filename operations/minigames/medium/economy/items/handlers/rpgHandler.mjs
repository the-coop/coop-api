// import BuffsHelper, { BUFF_TYPES } from '../../../conquest/buffsHelper';
import { usedOwnedUsableGuard } from '../../itemCmdGuards.mjs';

import COOP, { ITEMS, MESSAGES } from '../../../../../../organisation/coop.mjs';




// What does the rpg do: Start typing squidling.
export default class RPGHandler {

    // Intercept item usages via emoji reactions.
    static async onReaction({ emoji, message }, user) {
        // Confirm reaction is rpg before processing.  
        const reactEmojiFlake = `:${emoji.name}:${emoji.id}`;
        if (reactEmojiFlake !== COOP.ITEMS.codeToFlake('RPG')) return false;

        // Prevent Cooper from having an effect.
        if (COOP.USERS.isCooper(user.id)) return false;

        // TODO: Add emoji here, Can add another emoji reaction suitable param(?) to pass , ':rpg:'
        // Attempt to use the RPG item
        const used = await usedOwnedUsableGuard(user, 'RPG', 1, message);
        if (!used) return false;

        // Run the RPG effect.
        this.effect(message.author, message, user);
    }


    // Allow people to use the items without having to react to a message.
    // static async use(msg) {
        // TODO: Need to enable a target for this.

        // // Attempt to use the rpg item
        // const used = await usedOwnedUsableGuard(msg.author, 'RPG', 1, msg);
        // if (!used) return false;

        // // Run effect which also provides feedback.
        // this.effect(msg.author.id);
    // }


    static async effect(target, msg, attacker) {
        // Calculate reward.
        const pointAvg = await COOP.ITEMS.perBeak('COOP_POINT');
        const reward = parseInt(pointAvg * .25);

        // Subtract the points from the user.
        await COOP.ITEMS.subtract(target.id, 'COOP_POINT', reward, 'RPG damage');


        // TODO: Check if the user is using a shield.

        // Add feedback.
        const coopEmoji = COOP.MESSAGES.emojiCodeText('COOP_POINT');    
        const rpgEmojiText = COOP.MESSAGES.emojiCodeText('RPG');

        const targetName = target.id === attacker.id ? 'their self' : `<@${target.id}>`;
        const damage = `${reward}x${coopEmoji} (25% of the average CP per beak (${ITEMS.displayQty(pointAvg)}))`;
        
        const successText = MESSAGES.noWhiteSpace`**${rpgEmojiText.repeat(2)} <@${attacker.id}> used an ${rpgEmojiText} RPG on ${targetName}**, 
            blasting them for ${damage}, weakening their shield and potentially starting a chain reaction! =o`;

        COOP.CHANNELS.silentPropagate(msg, successText, 'ATTACKS', true);
    }
   
}