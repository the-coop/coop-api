import { EMOJIS } from '../../../organisation/config.mjs';
import { ROLES, USERS } from '../../../organisation/coop.mjs';


export const defaultAwaitSingleOpts = {
    max: 1, time: 60000, errors: ['time']
};

export const defaultAwaitManyOpts = {
    max: 1000, time: 60000, errors: ['time']
};

export default class ReactionHelper {

    // Check if the user with specified ID reacted to a message with a certain emoji.
    static didUserReactWith(msg, userID, emoji) {
        let didReactWith = false;

        // Check reactions for user with that reaction.
        msg.reactions.cache.map(react => {
            if (react.emoji.name === emoji && react.users.cache.has(userID)) 
                didReactWith = true;
        });

        return didReactWith;
    }

    // Check if the user with specified ID reacted to a message with a certain emoji.
    static async userReactedWith(msg, userID, emoji) {
        let didReactWith = false;

        // Check reactions for user with that reaction.
        await Promise.all(msg.reactions.cache.map(async r => {
            if (r.emoji.name !== emoji) return;

            // Load the reaction users.
            const rUsers = await r.users.fetch();
            if (rUsers.has(userID)) didReactWith = true;
        }));

        return didReactWith;
    }

    // Count the types of emoji on message by emoji name.
    static countType(message, type) {
        let count = 0;
        message.reactions.cache.map(reaction => {
            if (reaction.emoji.name === type) count = reaction.count;
        });
        return count;
    }

    static countTypeCollection(col, type) {
        return col.reduce((acc, react) => {
            if (react.emoji.name === type) return acc += react.count;
            return acc;
        }, 0);
    }

    static countTypeCode(message, codeType) {
        return this.countType(message, EMOJIS[codeType]);
    }

    static removeUserSpecificEmoji(msg, userID, emoji) {
        return new Promise((resolve) => {
            msg.reactions.cache.map(async r => {
                if (r.emoji.name === emoji)
                    resolve(await r.users.remove(userID));      
            });
        });
    }

    static remove(msg, emoji) {
        return new Promise((resolve) => {
            msg.reactions.cache.map(async r => {
                if (r.emoji.name === emoji)
                    resolve(await r.remove());      
            });
        });
    }

    static removeAll(msg) {
        return msg.reactions.removeAll();
    }

    // handleConsentSingleVoteMsg - In other words... a self-confirmation prompt?

    static handleConsentManyVoteMsg(msgRef, filterFn, opts = defaultAwaitManyOpts) {
        return msgRef.awaitReactions(filterFn, opts);
    }


    static _usersEmojisAwait(msgRef, emojis = [], modifier = null) {
        // Construct the await reactions filter.
        return this.handleConsentManyVoteMsg(msgRef, ({ emoji }, user) => {
            // Make sure user has MEMBER role.
            const isMember = ROLES._idHasCode(user.id, 'MEMBER');

            // Only allow the two voting emojis for this calculation.
            const isValidEmoji = emojis.includes(emoji.name);

            // Disallow Cooper
            const isCooper = USERS.isCooper(user.id);

            // Test conditions for this proposed reaction/interaction.
            const valid = isValidEmoji && !isCooper && isMember;

            // Apply any modifier(s)
            if (valid && modifier) modifier(msgRef, user, emoji);

            // Return the calculated/guarded result.
            return valid;
        });
    }

}