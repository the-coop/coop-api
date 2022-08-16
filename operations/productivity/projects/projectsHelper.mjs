import { Permissions, MessageMentions } from "discord.js";
import { EMOJIS, CATEGORIES } from "../../../organisation/config.mjs";
import { CHANNELS, MESSAGES, TIME, USERS } from "../../../organisation/coop.mjs";
import Database from "../../../organisation/setup/database.mjs";
import DatabaseHelper from "../../databaseHelper.mjs";
   
// Show the user's projects on the website.
// Should add support for contributors so it can show up on their coop website profile.
export default class ProjectsHelper {

    static async passed(suggestion) {
        const ownerID = MessageMentions.USERS_PATTERN.exec(suggestion.content)[1] || null;
        const title = MESSAGES.getRegexMatch(/Title: __([^\r\n]*)__/gm, suggestion.content);
        const deadline = MESSAGES.getRegexMatch(/Deadline: ([^\r\n]*)/gm, suggestion.content);

        const member = await USERS._fetch(ownerID);
        
        // TODO: Create with slug.
        const channel = await this.create(title, member, deadline);

        // Is this necessary??
        const announcementMsg = await CHANNELS._postToChannelCode('FEED', `Project created! <#${channel.id}>`);
        MESSAGES.delayReact(announcementMsg, EMOJIS.GOLD_COIN);
    }

    static loadBySlug(slug) {
        return DatabaseHelper.singleQuery({
            name: "load-project-slug", 
            text: `SELECT * FROM projects
                    JOIN users 
                    ON projects.owner_id = discord_id
                WHERE slug = $1`,
            values: [slug]
        });
    }

    static async create(name, owner, deadline) {
        try {
            // Create the channel under projects.
            const channel = await CHANNELS._create(name, {
                type: 'GUILD_TEXT',
                parent: CATEGORIES['PROJECTS'].id,
                reason: 'Democratically approve and paid for with GOLD_COIN',
                position: 9999
            });

            // Lock to sync it to projects folder
            await channel.lockPermissions();
            await channel.permissionOverwrites.set([{
                    id: owner.id,
                    allow: [ Permissions.FLAGS.MANAGE_CHANNELS ]
                }],
                'Giving project creator management rights'
            );

            // Take human readable due time.
            const unixSecsDeadline = Math.round(TIME.parseHuman(deadline).getTime() / 1000);
            
            const slug = encodeURIComponent(name.replaceAll(' ', '-').toLowerCase());

            // Add the channel to the database.
            const query = {
                name: "create-project",
                text: `INSERT INTO projects(
                        title, description, slug, 
                        channel_id, owner_id,
                        created, deadline
                    )
                    VALUES($1, $2, $3, $4, $5, $6, $7)`,
                values: [
                    name, 'No description yet.', slug,
                    channel.id, owner.id,
                    TIME._secs(), unixSecsDeadline
                ]
            };
            
            await Database.query(query);

            return channel;

        } catch(e) {
            console.log('Error creating channel!');
            console.error(e);
            return null;
        }
    }

    static async all() {
        const query = {
            name: "get-all-projects-with-username",
            text: `SELECT * FROM projects
                INNER JOIN users 
                ON projects.owner_id = discord_id`
        };
        const result = await DatabaseHelper.manyQuery(query);
        return result;
    }

    static async setTitle(channelID, title) {
        const slug = encodeURIComponent(title.replaceAll(' ', '-').toLowerCase());
        return await DatabaseHelper.singleQuery({
            name: "set-project-title",
            text: 'UPDATE projects SET title = $2, slug = $3 WHERE channel_id = $1',
            values: [channelID, title, slug]
        });
    }

    static async setDescription(channelID, description) {
        return await DatabaseHelper.singleQuery({
            name: "set-project-description",
            text: 'UPDATE projects SET description = $2 WHERE channel_id = $1',
            values: [channelID, description]
        });
    }

    static async onChannelUpdate(chanUpdate) {
        // Ensure it's a project channel.
        if (chanUpdate.parentId !== CATEGORIES['PROJECTS'].id)
            return false;

        // Make sure to request the most up to date channel data.
        const freshChan = await chanUpdate.fetch();

        // Get the new title and description.
        if (freshChan.topic) {
            const topicParts = freshChan.topic.split('\n');
            const title = topicParts[0];
            const description = topicParts.slice(1).join('\n');
    
            // Store it in the database to make viewable from the website?
            await this.setTitle(chanUpdate.id, title);
            await this.setDescription(chanUpdate.id, description);
        }
    } 



}