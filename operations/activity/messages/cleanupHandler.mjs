import { KEY_MESSAGES, ROLES as ROLES_CONFIG } from "../../../organisation/config.mjs";
import { MESSAGES, REACTIONS, ROLES, USERS } from "../../../organisation/coop.mjs";
import VotingHelper from "../redemption/votingHelper.mjs";

export const cleanEmoji = '❎';

// Allow people to delete messages but not key messages, lmao.
export default class CleanupHandler {


    // TODO: Should consider where this breaks things... elections?
    static async onReaction(reaction, user) {
        if (reaction.emoji.name !== cleanEmoji) return false;
        if (USERS.isCooper(user.id)) return false;

        // Prevent non-members trying to delete content.
        const memberReqText = `<@${user.id}>, <@&${ROLES_CONFIG.MEMBER.id}> role is required for that action. ${cleanEmoji}`;
        const member = USERS._getMemberByID(user.id);
        if (!ROLES._has(member, 'MEMBER'))
            return MESSAGES.silentSelfDestruct(reaction.message, memberReqText);

        // Protect key messages and other from attempts to sabotage.
        const linkDel = MESSAGES.link(reaction.message);
        const matchFn = keyMsgKey => KEY_MESSAGES[keyMsgKey] === linkDel;
        const matches = Object.keys(KEY_MESSAGES).filter(matchFn);
        const protectKeyText = `${cleanEmoji} Cannot democratically delete a key message.`;
        if (matches.length > 0) {
            reaction.remove();
            return MESSAGES.silentSelfDestruct(reaction.message, protectKeyText);
        }

        // Count votes and delete, less votes required if leader votes, even less if commander votes.
        const countVotes = REACTIONS.countType(reaction.message, cleanEmoji);
        const numReq = VotingHelper.getNumRequired(.03);
        if (countVotes > numReq) {
            const cleanedText = `${cleanEmoji} message was democratically deleted.`;
            MESSAGES.silentSelfDestruct(reaction.message, cleanedText, 0, 4000);
            MESSAGES.delayDelete(reaction.message, 333);
        } else {
            const attemptCleanText = `<@${user.id}> suggests ${cleanEmoji}ing above message by <@${reaction.message.author.id}>, react with the same emoji (${cleanEmoji}) for removal.`;
            MESSAGES.silentSelfDestruct(reaction.message, attemptCleanText, 0, 4000);
        }
    }

}