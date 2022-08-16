import DatabaseHelper from "../../../../databaseHelper.mjs";
import Database from "../../../../../organisation/setup/database.mjs";

import Chicken from "../../../../chicken.mjs";


// import { ROLES } from "../../../../../organisation/config.mjs";
import COOP, {ITEMS, STATE } from "../../../../../organisation/coop.mjs";



export default class PointsHelper {
    
    static async getLeaderboard(pos = 0) {
        const query = {
            name: 'get-leaderboard',
            text: `
                SELECT quantity, owner_id, username
                FROM items 
                    INNER JOIN users 
                    ON items.owner_id = discord_id
                WHERE item_code = 'COOP_POINT'
                ORDER BY quantity DESC
                OFFSET $1
                LIMIT 15
            `.trim(),
            values: [pos]
        };

        const result = await Database.query(query);
        const rows = DatabaseHelper.many(result);

        return rows;
    }

    static async getAllPositive() {
        const query = {
            name: 'get-all-positive',
            text: `
                SELECT quantity, owner_id
                FROM users 
                
                WHERE quantity > 0 AND item_code = 'COOP_POINT'
            `.trim(),
        };
        const result = await Database.query(query);
        return result;   
    }

    static async getNegLeaderboard(pos = 0) {
        const query = {
            name: 'get-negative-leaderboard',
            text: `
                SELECT quantity, owner_id 
                FROM items
                WHERE item_code = "COOP_POINT"
                ORDER BY quantity ASC
                OFFSET $1
                LIMIT 15
            `.trim(),
            values: [pos]
        };

        const result = await Database.query(query);
        const rows = DatabaseHelper.many(result);

        return rows;
    }

    static async getHighest() {
        const query = {
            name: 'get-highest-points-user',
            text: `SELECT * FROM items
                WHERE item_code = 'COOP_POINT' 
                ORDER BY quantity DESC LIMIT 1`
        };
        return DatabaseHelper.single(await Database.query(query));
    }


    static async getPercChange(userID) {
        const oldPoints = (await COOP.USERS.getField(userID, 'historical_points')) || 0;
        const qty = await COOP.ITEMS.getUserItemQty(userID, 'COOP_POINT')
        const diff = qty - oldPoints;
        let percChange = (diff / oldPoints) * 100;

        // Prevent the weird unnecessary result that occurs without it.
        // Defies mathematical/js sense...? Maybe string/int type collision.
        if (isNaN(percChange)) percChange = 0;

        return {
            userID: userID,
            points: qty,
            lastWeekPoints: oldPoints,
            percChange
        };
    }

    static async updateMOTW() {
        try {
            // Check time since last election commentation message (prevent spam).
            const lastMOTWCheck = parseInt(await Chicken.getConfigVal('last_motwcheck_secs'));
            const hour = 3600;
            const week = hour * 24 * 7;

            // Check it isn't running too often.
            const fresh = COOP.TIME._secs() <= lastMOTWCheck + week;
            if (fresh) return false;
    
            // Load player points and historical points.
            const users = await COOP.USERS.load();
            const pointUpdateManifest = [];

            const percChanges = await Promise.all(users.map(async (user) => {
                const result = await this.getPercChange(user.discord_id);

                if (result.points !== result.lastWeekPoints)
                    pointUpdateManifest.push({ 
                        id: result.userID, 
                        points: result.points 
                    });
    
                return result;
            }));

            // Sort the points changes by highest (positive) perc change first.
            percChanges.sort((a, b) => {
                if (a.percChange === Infinity) return 1;
                if (a.percChange < 0) return 1;
                if (a.percChange >= b.percChange) return -1;
                if (a.percChange === b.percChange) return 0;
            });

            const membersOfWeek = COOP.ROLES._allWith('MEMBEROFWEEK');

            // Check if that winner has the role already.
            const highestChange = percChanges[0];

            // Remove other member of the week.
            let hadAlready = false;
            let prevWinner = null;
            await membersOfWeek.map(member => {
                if (member.id !== highestChange.userID) {
                    prevWinner = member;
                    return COOP.ROLES._remove(member.id, 'MEMBEROFWEEK');
                } else {
                    // Found already, won twice in a row. Bonus?
                    hadAlready = true;
                    return true
                }
            });

            // Build update text for check/status.
            let updateText = `**MOTW check ran!**\n`;

            // Declare they won again.
            if (hadAlready) {
                updateText = `**MOTW check ran and <@${highestChange.userID}> (${highestChange.percChange.toFixed(2)}%) wins again!**\n\n`;
            } else {
                // Give the winner the role.
                COOP.ROLES._add(highestChange.userID, 'MEMBEROFWEEK');
    
                // Took it from previous winner.
                if (prevWinner) {
                    updateText = `**MOTW check ran and <@${highestChange.userID}> (${highestChange.percChange.toFixed(2)}%) seizes the role from <@${prevWinner.id}>!**\n\n`;
                } else {
                    updateText = `**MOTW check ran and <@${highestChange.userID}> (${highestChange.percChange.toFixed(2)}%) seizes the role!**\n\n`;
                }
            }

            // Add reasoning.
            updateText += `<@${highestChange.userID}> (${highestChange.percChange.toFixed(2)}%) was selected by MOTW as the best/most promising member this week!\n\n`;

            // Give the winner the reward.
            if (hadAlready) {
                const cpDisplay = COOP.MESSAGES.emojiCodeText('COOP_POINT');
                await COOP.ITEMS.add(highestChange.userID, 'COOP_POINT', 30);
                updateText += `_Given 50${cpDisplay} for MOTW reward._`;
            }

            // Add the runners up.
            updateText += 'Runners up:\n' +
                [percChanges[1], percChanges[2], percChanges[3]]
                    .map(runnerUp =>
                        `- <@${runnerUp.userID}> (${runnerUp.percChange.toFixed(2)}%)`
                    ).join('\n');

            // TODO: Give them 1-2 weeks of sacrifice protection too
            // TODO: Show 3/4 runners up.
            // TODO: Give them some random eggs and items.

            // Inform the community.
            COOP.CHANNELS._codes(['FEED', 'TALK'], updateText, { allowedMentions: { users: [], roles: [] } });

            // Make sure all historical_points are updated.
            pointUpdateManifest.map(({ id, points }) => COOP.USERS.updateField(id, 'historical_points', points));

            // Ensure Cooper knows when the last time this was updated (sent).
            // Track member of week by historical_points DB COL and check every week.
            Chicken.setConfig('last_motwcheck_secs', COOP.TIME._secs());

            // Send DM :D
            COOP.USERS._dm(highestChange.userID, 'You were given MEMBER OF THE WEEK reward! Check talk channel for more info.');

        } catch(e) {
            console.log('Error updating MOTW');
            console.error(e);
        }
    }

    static async updateCurrentWinner() {
        const highestRecord = await this.getHighest();

        const mostPointsRole = COOP.ROLES._getByCode('MOSTPOINTS');
        
        const mostPointsMember = COOP.USERS._get(highestRecord.owner_id);
        const username = mostPointsMember.user.username;
        
        let alreadyHadRole = false;

        // Remove the role from previous winner and commiserate.
        let prevWinner = null;
        mostPointsRole.members.map(prevMostMember => {
            if (prevMostMember.user.id === highestRecord.owner_id) alreadyHadRole = true;
            else {
                prevWinner = prevMostMember.user;
                prevMostMember.roles.remove(mostPointsRole);
            }
        });

        // If the new winner didn't already have the role, award it and notify server.
        if (!alreadyHadRole) {
            let successText = `${username} is now the point leader.`;
            if (prevWinner) successText = ` ${username} overtakes ${prevWinner.username} for most points!`;

            const pointsAfter = await ITEMS.add(highestRecord.owner_id, 'COOP_POINT', 25, 'Highest points role winner');
            successText += ` Given MOST POINTS role and awarded 25 points (${pointsAfter})!`;

            COOP.CHANNELS._postToFeed(successText);
            mostPointsMember.roles.add(mostPointsRole);
        }
    }


    static async renderLeaderboard(leaderboardRows, position = 0) {
        const guild = COOP.SERVER._coop();
        const rowUsers = await Promise.all(leaderboardRows.map(async (row, index) => {
            let username = '?';
            try {
                const member = await guild.members.fetch(row.owner_id);
                username = member.user.username;

            } catch(e) {
                console.log('Error loading user via ID');
                console.error(e);
            }
            return {
                username,
                rank: index + position,
                points: row.quantity
            }
        }));

        
        let leaderboardMsgText = '```\n\n ~ POINTS LEADERBOARD ~ \n\n' + 
            rowUsers.map(user => `${user.rank + 1}. ${user.username} ${ITEMS.displayQty(user.points)}`).join('\n') +
            '```';

        return leaderboardMsgText
    }
}