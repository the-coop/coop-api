import UsableItemHelper from "../usableItemHelper.mjs";

import COOP from "../../../../../../organisation/coop.mjs";

export default class DiamondHandler {

    static async onReaction(reaction, user) {       
        if (reaction.emoji.name === 'diamond') {
            try {
                const didUse = await UsableItemHelper.use(user.id, 'DIAMOND', 1);
                if (!didUse) {
                    // Warn that the user is missing the item
                    COOP.MESSAGES.selfDestruct(reaction.message, `${user.username} lacks 1xDIAMOND...`, 0, 5000);
                    return await reaction.users.remove(user.id);
                } else {
                    const messageAuthor = reaction.message.author;

                    // Allow five seconds for people to stack bombs.
                    setTimeout(async () => {
                        const reward = 10 * reaction.count;
                        const updatedPoints = await COOP.ITEMS.add(messageAuthor.id, 'COOP_POINT', reward, 'Diamond effect');
    
                        // Add visuals animation
                        COOP.MESSAGES.delayReactionRemove(reaction, 333);
                        COOP.MESSAGES.delayReact(reaction.message, '✨', 666);
                        
                        // Add feedback and action record.
                        let doubledInfo = '';
                        if (reaction.count > 1) doubledInfo = `(x${reaction.count})`;
                        const subjectsInvolved = `${user.username} used a diamond on ${messageAuthor.username}'s message.`;
                        const changesOccurred = `+${reward}${doubledInfo} points (${updatedPoints}).`;
                        COOP.CHANNELS.propagate(reaction.message, `${subjectsInvolved}: ${changesOccurred}`, 'ACTIONS');

                        // Send a link to the user DM.
                        const msgLink = COOP.MESSAGES.link(reaction.message);
                        const reminderText = `**You used a diamond on this message:** \n\n` + msgLink;
                        COOP.USERS._dm(user.id, reminderText)
                    }, 5000);
                }
            } catch(e) {
                console.error(e);
            }
        }   
    }
   
}