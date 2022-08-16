import EggHuntMinigame from "../../../../small/egghunt.mjs";

import { usedOwnedUsableGuard } from "../../itemCmdGuards.mjs";
import COOP, { STATE } from "../../../../../../organisation/coop.mjs";


export default class LaxativeHandler {

    static async use(interaction, user) {
        // Guard against usage, ensure they pay the price.
        const used = await usedOwnedUsableGuard(user, 'LAXATIVE', 1, interaction.channel);
        if (!used) 
            return await interaction.reply({ content: 'Failed to use LAXATIVE', ephemeral: true });

        // Attempt to run egg drop. :D
        const succeeded = STATE.CHANCE.bool({ likelihood: 40 });
        if (succeeded) EggHuntMinigame.run();

        // Add feedback.
        const feedbackText = `${user.username} used laxative and ${succeeded ? 'successfully' : 'potentially'} triggered egg drops!`;

        // Create record
        COOP.CHANNELS._send('ACTIONS', feedbackText);

        // Reply to interaction
        return await interaction.reply({ content: feedbackText, ephemeral: true });
    }
   
}