import { CHANNELS, MESSAGES, SERVER } from "../../organisation/coop.mjs";
import Database from "../../organisation/setup/database.mjs";
import DatabaseHelper from "../databaseHelper.mjs";

// TODO: If current version cannot be fixed - fall back to this.
export default class TemporaryMessages {
    remove() {}
    has() {}

    // TODO: If the same message attempt to be added twice and one is shorter, reduce its lifetime
    // Consider this a correction from Cooper/more recent data.
    static async add(msg, deleteSecs = 60 * 5, note = null) {
        if (msg.channel.type === 'DM') return false;

        let lifetimeSecs = !isNaN(parseInt(deleteSecs)) ? parseInt(deleteSecs) : 1;
        let expiry = Math.round((Date.now() / 1000) + lifetimeSecs);

        const messageLink = MESSAGES.link(msg);

        const query = {
            name: "add-temp-message",
            text: `INSERT INTO temp_messages(message_link, expiry_time, note) VALUES ($1, $2, $3)
                ON CONFLICT (message_link)
                DO 
                UPDATE SET expiry_time = LEAST(temp_messages.expiry_time, EXCLUDED.expiry_time)
                RETURNING expiry_time`,
            values: [messageLink, expiry, note]
        };

        const result = await Database.query(query);
        return result;
    }

    static async unregisterTempMsgByLink(link) {
        const query = {
            name: "delete-temp-message-link",
            text: `DELETE FROM temp_messages WHERE message_link = $1`,
            values: [link]
        };
        
        // TODO: Create a databaseDelete method that uses below code.

        // Confirm one successful row delete.
        const delRowCount = (await Database.query(query)).rowCount || 0;
        return !!delRowCount;
    }

    static async get() {
        const query = {
            name: "get-temp-messages",
            text: `SELECT * FROM temp_messages`
        };
        
        const result = await Database.query(query);
        const tempMessages = DatabaseHelper.many(result);
        return tempMessages;
    }

    static async getType(type) {
        const query = {
            name: "get-temp-messages-by-type",
            text: `SELECT * FROM temp_messages WHERE note = $1`,
            values: [type]
        };
        
        return DatabaseHelper.manyQuery(query);
    }

    // TODO: Add types and log that a resource wasn't gathered.
    static async getExpiredTempMessages() {
        const query = {
            name: "get-temp-messages-expired",
            text: `SELECT * FROM temp_messages 
                WHERE expiry_time <= extract(epoch from now())
                ORDER BY expiry_time ASC
                LIMIT 40`
        };
        
        const result = await Database.query(query);
        const tempMessages = DatabaseHelper.many(result);
        return tempMessages;
    }

    static async getTempMessageByLink(link) {
        const query = {
            name: "get-temp-message",
            text: `SELECT * FROM temp_messages WHERE message_link = $1`,
            values: [link]
        };
        
        const result = await Database.query(query);
        const tempMessage = DatabaseHelper.single(result);
        return tempMessage;
    }

    // Load and delete expired messages sorted by oldest first.
    static async flush() {
        // Load the temporary messages 
        const tempMessages = await this.getExpiredTempMessages();
        tempMessages.map((tempMsg, index) => {
            setTimeout(async () => {
                let confirmedRemoval = false;
                try {
                    const msgIDSet = MESSAGES.parselink(tempMsg.message_link);
    
                    const channel = CHANNELS._get(msgIDSet.channel);
                    const msg = await channel.messages.fetch(msgIDSet.message);

                    // Attempt to delete and confirm it.
                    await msg.delete();
                    confirmedRemoval = true;

                } catch(e) {
                    // This is what catches deleted from Discord confirmation.
                    // e.message also catches bonus errors from msg.delete attempt! :D
                    if (e.message === 'Unknown Message') confirmedRemoval = true;
                }
                if (confirmedRemoval) this.unregisterTempMsgByLink(tempMsg.message_link)

            }, 5000 * index);
        });
    }
}