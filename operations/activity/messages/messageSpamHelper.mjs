import { USERS, MESSAGES } from "../../../organisation/coop.mjs";

export default class MessageSpamHelper {

    static async onMessage(msg) {
        // Only apply to Cooper's messages.
        if (!USERS.isCooperMsg(msg)) return false;

        // Kill Commandojs annoying messages.
        if (msg.content.includes(', Cancelled command.'))
            // If this was run, try to look for the one above it... too -.-
            return MESSAGES.delayDelete(msg, 5000);

        if (msg.content.includes('Respond with cancel to cancel the command.'))
            return MESSAGES.delayDelete(msg, 5000);

        if (msg.content.includes('can only be used by the bot owner.'))
            return MESSAGES.delayDelete(msg, 5000);

        if (msg.content.includes('The command will automatically be cancelled in 30 seconds.'))
            return MESSAGES.delayDelete(msg, 30000);

        if (msg.content === 'cancel')
            return MESSAGES.delayDelete(msg, 30000);


            
    }

}
