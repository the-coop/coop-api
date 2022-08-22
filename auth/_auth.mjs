import axios from 'axios';
import passport from 'passport';
import jwt from 'jsonwebtoken';
import { Strategy } from 'passport-jwt';

import Users from 'coop-shared/services/users.mjs';



export default class Auth {

	static jwtFromRequest = req => {
		let token = null;
	
		// Detect, access, and parse token.
		if (req && req.headers.authorization) 
			token = req.headers.authorization.replace('Bearer ', '');
	
		return token;
	};

	static whoisMeViaDiscord = accessToken =>
		axios.get('https://discord.com/api/users/@me', {
			headers: { authorization: `Bearer ${accessToken}` }
	});

	static authorizeDiscord = (code) => 
		axios.post('https://discord.com/api/oauth2/token', 
			new URLSearchParams({
				client_id: process.env.DISCORD_APPID,
				client_secret: process.env.DISCORD_CLIENT_SECRET,
				code,
				grant_type: 'authorization_code',
				redirect_uri:
					process.env.NODE_ENV === 'production' ?
						`https://thecoop.group/auth/authorise`
						:
						`http://localhost:3000/auth/authorise`,
				scope: 'identify'
			}),
			{ 
				headers: {  'Content-Type': 'application/x-www-form-urlencoded' }
			}
		);

	static guard() {
		return passport.authenticate('jwt', { session: false });
	}

	static strategy() {
		const opts = {
			jwtFromRequest: this.jwtFromRequest,
			secretOrKey: process.env.DISCORD_TOKEN,
			...this.issuerOpts
		};
		return new Strategy(opts, async (jwt_payload, done) => {		
			try {
				// Check user actually exists.
				const user = await Users.get(jwt_payload.id);				
				if (!user) 
					throw new Error('Token does not represent a member of The Coop.');
				
				return done(null, user);

			} catch(e) {
				return done(e, false);
			}
		});
	}

	static issuerOpts = {
		issuer: 'api.thecoop.group',
		audience: 'thecoop.group'
	};

	static decode(token) {
		let data = null;
		
		// Detect, access, and parse token.
		if (token)  {
			const deheaderedToken = token.replace('Bearer ', '');
			data = jwt.verify(
				// JWT token to decode.
				deheaderedToken,
	
				// Encryption key.
				process.env.DISCORD_TOKEN, 
	
				// Issuance options, just to be cool lyk dat.
				this.issuerOpts
			);
		}
	
		return data;
	}

	static token(id, username) {
		return jwt.sign(
			// Payload
			{ id, username }, 

			// Encryption keky.
			process.env.DISCORD_TOKEN, 

			// Issuance options, just to be cool lyk dat.
			this.issuerOpts
		);
	}
	
}