import { CHANNELS, USERS } from "../../../../organisation/coop.mjs";
import Database from "../../../../organisation/setup/database.mjs";
import DatabaseHelper from "../../../databaseHelper.mjs";


export const SKILLS = {
    CRAFTING: {},
    MAGIC: {},   
    MINING: {},  
    WOODCUTTING: {},
    FISHING: {},
    HUNTING: {},
    COOKING: {}
};

export const DEFAULT_LEVEL = 1;

export default class SkillsHelper {

    static dbSkills = Object.keys(SKILLS).map(skill => skill.toLowerCase());

    static async getXP(skill, playerID) {
        let xp = 0;

        const query = {
            name: `get-user-${skill}-xp`,
            text: `SELECT ${skill.toLowerCase()} FROM "skills" WHERE player_id = $1`,
            values: [playerID]
        };

        const result = DatabaseHelper.single(await Database.query(query));

        if (result && typeof result[skill] !== 'undefined') 
            xp = result[skill] || 0;

        return xp;
    }

    // Calculate the xp from the level.
    static calcXP(level) {
        const conversion = level * level * level + 3 * level * level + 3 * level + 1;
        return Math.round(conversion);
    }

    // Calculate the level from the xp amount/int.
    static calcLvl(xp) {
        // This was recently changed, any xp difference may be due to this.
        // const xpLvlConversion = Math.pow(xp, 1 / 3) - 1;
        const xpLvlConversion = Math.pow(xp, 1 / 3) - 1;
        return Math.round(this.clampLvl(xpLvlConversion, 1, 99));
    }

    // Refactor to a mathematics part.
    // Or use lodash again, already in node_modules.`
    static clampLvl(num, min, max) {
        return Math.max(min, Math.min(num, max));
    }

    static async getLevel(skill, playerID) {
        let level = DEFAULT_LEVEL;

        // Player xp.
        const xp = await this.getXP(skill, playerID);

        // Calculate level.
        level = this.calcLvl(xp);

        return level;
    }

    static async getAllSkills(playerID) {
        const query = {
            name: `get-user-skills`,
            text: `SELECT * FROM "skills" WHERE player_id = $1`,
            values: [playerID]
        };

        const result = DatabaseHelper.single(await Database.query(query));
        return result;
    }

    static async getSkills(playerID) {
        const result = {};

        const skillData = await this.getAllSkills(playerID);

        Object.keys(SKILLS)
            .map(skill => skill.toLowerCase())
            .map(skill => {
                result[skill] = { level: 1, xp: 0 };

                // If xp data, calculate level and set xp for result.
                if (skillData && skillData[skill]) {
                    result[skill].xp = skillData[skill];
                    result[skill].level = this.calcLvl(result[skill].xp);
                }
        });

        return result;
    }

    static async addXP(userID, skill, xpNum) {
        const query = {
            name: `add-player-${skill}-xp`,
            text: `INSERT INTO skills(player_id, ${skill})
                VALUES($1, $2)
                ON CONFLICT (player_id) DO UPDATE SET ${skill} = EXCLUDED.${skill} + COALESCE(skills.${skill}, 0)
                RETURNING ${skill}`,
            values: [userID, xpNum]
        };
        const result = await DatabaseHelper.singleQuery(query);

        // Calculate and intercept level ups here.
        const prevXP = result[skill] - xpNum;
        const currXP = result[skill];

        const prevLevel = this.calcLvl(prevXP);
        const currLevel = this.calcLvl(currXP);

        // Count for level changes besides default level.
        if (prevLevel !== currLevel && currLevel > 1) {
            const { user } = USERS._get(userID);
            
            // Level 99 level up, big announce.
            if (prevLevel < 99 && currLevel === 99) {
                CHANNELS._codes(
                    ['TALK', 'ACTIONS', 'FEED', 'STREAM_NOMIC'], 
                    `${user.username} achieved level 99 in ${skill}!!`
                );
                
            } else {
                // Standard level up
                const levelUpText = `${user.username} reached level ${currLevel} ${skill}!`;
                CHANNELS._postToChannelCode('ACTIONS', levelUpText);
            }
        }


        return result;
    }


    static async getTotalXPLeaderboard(pos = 0) {
        const summingQueryFmt = this.dbSkills.map(skill => `COALESCE(${skill}, 0)`);

        return await DatabaseHelper.manyQuery({
            name: `get-total-xp-leaderboard`,
            text: `SELECT player_id, (${summingQueryFmt.join(' + ')}) AS total_xp
                FROM skills 
                ORDER BY total_xp DESC
                OFFSET $1
                LIMIT 15
            `.trim(),
            values: [pos]
        });
    }

    static async getSkillXPLeaderboard(skill, pos = 0) {
        return await DatabaseHelper.manyQuery({
            name: `get-${skill}-xp-leaderboard`,
            text: `
                SELECT player_id, ${skill}
                FROM skills 
                ORDER BY ${skill} DESC
                OFFSET $1
                LIMIT 15
            `.trim(),
            values: [pos]
        });
    }

}