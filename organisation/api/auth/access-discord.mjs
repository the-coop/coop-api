import { USERS } from '../../coop.mjs';
import Auth from './_auth.mjs';

export default async function AccessDiscord(result, code) {
	// The access token will be needed once to prove the owner's identity.
	const tokenResponse = await Auth.authorizeDiscord(code);
	const authData = tokenResponse.data;
	const discordAPIaccessToken = authData.access_token || null;
	if (!discordAPIaccessToken) 
		throw new Error('Discord did not return access token.');

	// Check if user valid and check for identity match...?
	const whoisDiscordResponse = await Auth.whoisMeViaDiscord(discordAPIaccessToken);
	const user = whoisDiscordResponse.data || null;
	if (!user) 
		throw new Error('Discord did not return user data.');

	// Check the user is in the coop
	const userDiscordID = user.id;
	const coopMember = !!(await USERS.loadSingle(userDiscordID));
	if (!coopMember)
		throw new Error('Discord user is not a member of The Coop.');
		
	// Generate (sign) a JWT token for specified user. =] Beautiful.
	result.token = Auth.token(userDiscordID, user.username);
	result.success = true;
	result.user = { 
		id: user.id,
		username: user.username
	};

	// Return for passing back to user.
	return result;
}