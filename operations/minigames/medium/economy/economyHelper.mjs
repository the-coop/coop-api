import { USABLE, USERS, MESSAGES, SERVER, CHANNELS, STATE, ITEMS } from "../../../../organisation/coop.mjs";


export default class EconomyHelper {

    static async circulation() {
        const items = USABLE.getUsableItems();
        const itemCode = STATE.CHANCE.pickone(items);

		const total = await ITEMS.count(itemCode);
		const totalFmt = ITEMS.displayQty(total);

		const beaks = USERS.count(SERVER._coop(), false);
		const emoji = MESSAGES.emojiCodeText(itemCode);

		const avg = (total / beaks).toFixed(2);
		
		const statMessage = `**Economic circulation:**\n` +
			`${totalFmt}x${emoji} | _${avg} per beak_ | (${itemCode})`;

        await CHANNELS._postToChannelCode('TALK', statMessage);
    }

}