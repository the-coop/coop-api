import { Permissions, MessageMentions } from "discord.js";

import { CATEGORIES } from "../../../organisation/config.mjs";
import { CHANNELS, MESSAGES, TIME, USERS } from "../../../organisation/coop.mjs";
import Database from "../../../organisation/setup/database.mjs";
import DatabaseHelper from "../../databaseHelper.mjs";

export default class BlogHelper {

    static async passed(suggestion) {
        const ownerID = MessageMentions.USERS_PATTERN.exec(suggestion.content)[1] || null;
        const title = MESSAGES.getRegexMatch(/Title: __([^\r\n]*)__/gm, suggestion.content);
        const deadline = MESSAGES.getRegexMatch(/Deadline: ([^\r\n]*)/gm, suggestion.content);

        const member = await USERS._fetch(ownerID);
        
        const channel = await this.channelDraft(title, member, deadline);

        // Is this necessary??
        const announcementMsg = await CHANNELS._postToChannelCode('FEED', `Blog draft post created! <#${channel.id}>`);
    }

    static async publish(title, slug, content, authorID) {
        try {
            // Access the autohr username.
            const author = await USERS.loadSingle(authorID);

            // Add the channel to the database.
            const query = {
                name: "publish-post",
                text: `INSERT INTO blog_posts(
                        title, slug,
                        content,
                        author_id,
                        author_username,
                        date
                    )
                    VALUES($1, $2, $3, $4, $5, $6)`,
                values: [
                    title, slug,
                    content, authorID, author.username,
                    TIME._secs()
                ]
            };


            return await Database.query(query);
        } catch(e) {
            console.log('Error publishing channel draft to a blog post.');
            console.error(e);
        }
    }

    static async loadDraft(draftID) {
        const draft = await DatabaseHelper.singleQuery({
            name: "load-draft",
            text: `SELECT * FROM post_drafts WHERE id = $1`,
            values: [draftID]
        });
        return draft;
    }

    static async loadDraftByChannelID(chanID) {
        const draft = await DatabaseHelper.singleQuery({
            name: "load-draft",
            text: `SELECT * FROM post_drafts WHERE channel_id = $1`,
            values: [chanID]
        });
        return draft;
    }

    static async loadDrafts() {
        const draft = await DatabaseHelper.manyQuery({
            name: "load-drafts", text: `SELECT * FROM post_drafts`
        });
        return draft;
    }

    static loadHeadlines() {
        return DatabaseHelper.manyQuery({
            name: "load-headlines", text: `SELECT title, slug, id, author_id, author_username, date FROM blog_posts`
        });
    }

    static loadAllForBuild() {
        return DatabaseHelper.manyQuery({
            name: "load-posts-build-intent", text: `SELECT * FROM blog_posts`
        });
    }

    static loadPostByID(id) {
        return DatabaseHelper.singleQuery({
            name: "load-post-id", 
            text: `SELECT * FROM blog_posts WHERE id = $1`,
            values: [id]
        });
    }

    static loadPostBySlug(slug) {
        return DatabaseHelper.singleQuery({
            name: "load-post-slug", 
            text: `SELECT * FROM blog_posts WHERE slug = $1`,
            values: [slug]
        });
    }

    static async deleteDraft(draftID) {
        return Database.query({
            name: 'delete-draft',
            text: 'DELETE FROM post_drafts WHERE id = $1',
            values: [draftID]
        })
    }

    static async buildDraft(draftChannel) {
        const messages = await draftChannel.messages.fetch({});
        const content = messages.map(msg => {
            if (USERS.isCooperMsg(msg)) return null;

            let subContent = msg.content;
            msg.attachments.map(attachment => 
                subContent += `\n\n ![${attachment.name}](${attachment.url})`
            );
            return subContent;
        }).join('\n\n');
        return content;
    }

    static async fulfilDraft(draft) {
        try {
            // Save a channel to database as a piece of blog content.
            const chan = CHANNELS._get(draft.channel_id);
            const content = await this.buildDraft(chan);

            const slug = encodeURIComponent(draft.title.replaceAll(' ', '-').toLowerCase());

            // Save to blog posts database (public on website).
            this.publish(draft.title, slug, content, draft.owner_id);

            // Delete the channel.
            chan.delete();

            // Delete draft.
            this.deleteDraft(draft.id);

            // Inform the owner the draft has been published.
            USERS._dm(draft.owner_id, `Draft "${draft.title}" was just published!\n\n` + 
                'It will be live here when processed: https://www.thecoop.group/blog/' + slug);

        } catch(e) {
            console.log('Error turning blog post channel into a blog post.');
            console.error(e);
        }
    }
    
    static async channelDraft(name, owner, deadline) {
        try {
            // Create the channel under projects.
            const channel = await CHANNELS._create('post_' + name, {
                type: 'GUILD_TEXT',
                parent: CATEGORIES['PROPAGANDA'].id,
                // Set the owner and their permissons.
                permissionOverwrites: [
                    {
                        id: owner.id,
                        allow: [
                            Permissions.FLAGS.MANAGE_CHANNELS
                        ]
                    }
                ],
                reason: 'Democratically approve and paid for with GOLD_COIN',
                position: 9999
            });

            // Take human readable due time.
            const unixSecsDeadline = Math.round(TIME.parseHuman(deadline).getTime() / 1000);

            // Add the channel to the database.
            const query = {
                name: "create-post-draft",
                text: `INSERT INTO post_drafts(
                        title, description, 
                        channel_id, owner_id,
                        created, deadline
                    )
                    VALUES($1, $2, $3, $4, $5, $6)`,
                values: [
                    name, 'No description yet.',
                    channel.id, owner.id,
                    TIME._secs(), unixSecsDeadline
                ]
            };

            const result = await Database.query(query);

            return channel;

        } catch(e) {
            console.log('Error creating draft blog post channel!');
            console.error(e);
            return null;
        }
    }

    static async onChannelUpdate(chanUpdate) {
        // Ensure it's a project channel.
        if (chanUpdate.parentId !== CATEGORIES['PROPAGANDA'].id)
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

    static async setTitle(channelID, title) {
        const slug = encodeURIComponent(title.replaceAll(' ', '-').toLowerCase());
        return await DatabaseHelper.singleQuery({
            name: "set-post-title",
            text: 'UPDATE posts SET title = $2, slug = $3 WHERE channel_id = $1',
            values: [channelID, title, slug]
        });
    }

    static async setDescription(channelID, description) {
        return await DatabaseHelper.singleQuery({
            name: "set-post-description",
            text: 'UPDATE posts SET description = $2 WHERE channel_id = $1',
            values: [channelID, description]
        });
    }
}