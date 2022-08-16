import TempAccessCodeHelper from '../../../operations/members/tempAccessCodeHelper.mjs';
import TimeHelper from '../../../operations/timeHelper.mjs';
import { USERS } from '../../coop.mjs';
import Auth from './_auth.mjs';


export default async function AccessCooperDM(result, code) {
	// Check validation result =]
	const request = await TempAccessCodeHelper.validate(code);
	if (!request)
		throw new Error('Cooper DM login request not found.');
	
	// Check it hasn't expired.
	if (TimeHelper._secs() >= request.expires_at)
		throw new Error('Temporary login code expired.');

	const user = await USERS.loadSingle(request.discord_id);

	// Generate (sign) a JWT token for specified user. =] Beautiful.
	result.token = Auth.token(request.discord_id, user.username);
	result.success = true;
	result.user = { 
		id: request.discord_id,
		username: user.username
	};

	return result;
}