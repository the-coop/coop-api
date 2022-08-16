import { MESSAGES, USERS } from "../../organisation/coop.mjs";


// Recursive confirmation prompt.
export const firstConfirmPrompt = async function(msgOrChannelRef, text, excludeID, confirmEmoji = '👍', fuseMs = 20000) {
    const proceedfeedbackReactFilter = ({ emoji }, user) => 
        !USERS.isCooper(user.id) && emoji.name == confirmEmoji && user.id !== excludeID;

    // Create confirmation with emoji prompt.
    const promptMsg = await MESSAGES.silentSelfDestruct(msgOrChannelRef, text, 0, fuseMs);
	MESSAGES.delayReact(promptMsg, confirmEmoji, 222);

	const promptReactions = await promptMsg.awaitReactions(
		proceedfeedbackReactFilter, { max: 1, time: 30000 }
	);
	const firstReaction = promptReactions.first();
	if (firstReaction) {
		// Return first non Cooper user who reacted/accepted.
		const firstUser = firstReaction.users.cache.reduce((acc, user) => {
			if (!USERS.isCooper(user.id)) return acc = user;
		}, null);
		return firstUser;
	} else return false;
}


// Recursive confirmation prompt.
export const authorConfirmationPrompt = async function(msgOrChannelRef, text, userID, confirmEmoji = '👍', fuseMs = 20000) {
    const proceedfeedbackReactFilter = ({ emoji }, user) => 
        user.id === userID && emoji.name == confirmEmoji;

    // Create confirmation with emoji prompt.
    const promptMsg = await MESSAGES.silentSelfDestruct(msgOrChannelRef, text, 0, fuseMs);
	MESSAGES.delayReact(promptMsg, confirmEmoji, 222);

	const promptReactions = await promptMsg.awaitReactions(
		proceedfeedbackReactFilter, 
		{ max: 1, time: fuseMs }
	);

	const firstReaction = promptReactions.first();
	if (firstReaction) {
		if (firstReaction.emoji.name === confirmEmoji) return true;
	}
     
	return false;
}
