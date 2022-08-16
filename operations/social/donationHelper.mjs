import { CHANNELS, ROLES, SERVER } from "../../organisation/coop.mjs";
import Database from "../../organisation/setup/database.mjs";
import DatabaseHelper from "../databaseHelper.mjs";

export default class DonationHelper {

    static async flush() {
        // TODO: Clear all the supporters who donated/boosted > 2 months ago
    }

    static async process() {
        // TODO: Give anyone who is server boosting the supporter role.

        const unacknowledgedDonations = await DatabaseHelper.manyQuery({
            name: 'load-unacknowledged-donations',
            text: `SELECT * FROM donations WHERE acknowledged = false`
        });

        const coop = SERVER._coop();
        unacknowledgedDonations.map(async d => {
            const idParts = d.discord_full_username.split('#');
            const matches = await coop.members.fetch({ query: idParts[0], limit: 1 });
            if (matches) {
                const member = matches.first();

                // Give supporter role
                await ROLES.add(member, 'SUPPORTER');
                
                // Announce.
                await CHANNELS._send(
                    'FEED', 
                    `<@${member.user.id}> donated ${d.symbol}${d.amount}, given ${ROLES._textRef('SUPPORTER')} role like all donators (any size).`,
                    { allowedMentions: { users: [member.user.id], roles: [] }}
                );

                // Set the acknowledgement to true in database so not rewarded duplicate times.
                await Database.query({
                    text: 'UPDATE donations SET acknowledged = true WHERE id = $1',
                    values: [d.id]
                });
            }
        });
    }
}