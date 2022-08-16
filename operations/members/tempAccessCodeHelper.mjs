import { TIME, CHANCE } from "../../organisation/coop.mjs";
import Database from "../../organisation/setup/database.mjs";
import DatabaseHelper from "../databaseHelper.mjs";

// TODO: Make sure they are deleted with interval (do it from worker).
export default class TempAccessCodeHelper {

    static expiry = 60 * 5;

    // Delete all access codes for a certain user (heavy-handed/overkill for security/safety).
    static delete(discord_id) {
        return Database.query({
            text: `DELETE FROM temp_login_codes WHERE discord_id = $1`,
            values: [discord_id]
        });
    }

    static async flush() {
        const query = {
            text: `DELETE FROM temp_login_codes 
                WHERE id IN (SELECT id WHERE expires_at <= extract(epoch from now()))`
        };
        const result = await Database.query(query);
        return result;
    }

    static async getExpired() {
        const query = {
            name: "get-expired-codes",
            text: `SELECT * FROM temp_login_codes 
                WHERE expires_at <= extract(epoch from now())
                ORDER BY expires_at ASC
                LIMIT 40`
        };
        
        const result = await Database.query(query);
        const tempMessages = DatabaseHelper.many(result);
        return tempMessages;
    }

    static async validate(code) {
        // Check code is correct
        const result = await DatabaseHelper.singleQuery({
            text: `SELECT * FROM temp_login_codes WHERE code = $1`,
            values: [code]
        });

        // Check it has not expired - there's already a cron on this.
        // if (result) ...

        if (result) return result;

        // Validate: Return true/false.
        return false;
    }

    static async create(discord_id) {
        // I removed the special characters because sometimes the codes weren't matching,
        // this made me suspicious some dots from the token or other characters may not encodeURI/play nicely.
        const nonUrlBreakingPool = process.env.DISCORD_TOKEN.replace(/[^a-zA-Z0-9 ]/g, "");
        const code = CHANCE.string({ length: 50, pool: nonUrlBreakingPool });
        const expiry = TIME._secs() + this.expiry;

        try {
            await Database.query({
                text: `INSERT INTO temp_login_codes (discord_id, code, expires_at) 
                    VALUES ($1, $2, $3)`,
                values: [discord_id, code, expiry]
            });
            
        } catch(e) {
            console.log('Error creating temp login code.')
            console.error(e);
        }

        return code;
    }
}