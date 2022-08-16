import COOP, { USERS } from "../../../organisation/coop.mjs";
import { authorConfirmationPrompt } from '../../common/ui.mjs'

export default class AnnouncementOpts {

    
    static newsletterToggle() {
        // console.log('newsletterToggle', reaction.message.id, user.username);
        // return 1;

        // Prompt user to give email in Cooper DM to get the role

        // If turn off, delete email.
    }

    static announcementSubToggle(reaction, user) {
        COOP.ROLES.toggle(user.id, 'SUBSCRIBER');
    }

    static async privacyBomb(reaction, user) {
        // Remove the reaction to prevent others getting bad ideas.
        reaction.users.remove(user.id);

        // Inform the user of what is happening.
        await USERS._dm(user.id, 'You chose to delete all data, we obliged - please rejoin server if it was a mistake.');

        // Kick the user (best way to delete all data).
        (await USERS._fetch()).kick('Chose to delete all data.');
    }
    
}