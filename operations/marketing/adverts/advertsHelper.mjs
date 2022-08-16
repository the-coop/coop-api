import { USERS, TIME, MESSAGES, CHANNELS } from '../../../organisation/coop.mjs';
import { EMOJIS } from '../../../organisation/config.mjs';

import Database from '../../../organisation/setup/database.mjs';
import DatabaseHelper from '../../databaseHelper.mjs';
import { MessageMentions } from 'discord.js';

export default class AdvertsHelper {

    static async passed(suggestion) {        
        try {
            // Extract the owner so we can tie it to them on the website.
            const ownerID = MessageMentions.USERS_PATTERN.exec(suggestion.content)[1] || null;
            
            // Extract both links.
            const [targetURL, imageURL] = suggestion.content.match(/\bhttps?:\/\/\S+/gi);

            // Create in the database.
            await this.create(ownerID, targetURL, imageURL);

            // Post to promotions channel
            const advertText = `**Advert created by <@${ownerID}>:**\n\n` +
                `Link: <${targetURL}>\n` +
                `Image: ${imageURL}`;

            // const announcementMsg = await CHANNELS._postToChannelCode('ADVERTS', advertText);
        } catch(e) {
            console.log('Advert creation failed.');
            console.error(e);
        }
    }

    static async getAll() {
        const query = {
            name: "all-adverts",
            text: `SELECT * FROM adverts`
        };
        
        return DatabaseHelper.manyQuery(query);
    }

    static async latest() {
        const query = {
            name: "latest-advert",
            text: `SELECT * FROM adverts ORDER BY id DESC LIMIT 1`
        };
        
        return DatabaseHelper.singleQuery(query);
    }

    static async create(ownerID, targetURL, imageURL) {
        try {
            const query = {
                name: "create-advert",
                text: `INSERT INTO adverts(owner_id, target_url, image_url) VALUES($1, $2, $3)`,
                values: [ownerID, targetURL, imageURL]
            };
            
            await Database.query(query);
        } catch(e) {
            console.log('Error creating advert');
            console.error(e);
        }
    }

}