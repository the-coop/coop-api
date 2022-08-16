import { USERS, TIME, MESSAGES } from '../../../organisation/coop.mjs';
import { EMOJIS } from '../../../organisation/config.mjs';

import Database from '../../../organisation/setup/database.mjs';
import DatabaseHelper from '../../../operations/databaseHelper.mjs';

export default class SubscriptionHelper {
   
    // Send newsletter
    // Send message in talk and feed with link
    // Update website/latest article version
    static release() {}

    // Get members email list but also potential non-members subscribers.
    static getCompleteList() {
    }

    // Check if email address is within message, if so... add it for them.  
    static async onMessage(msg) {
        // Only allow in DMs.
        if (msg.channel.type !== 'DM') return null;

        // Ignore Cooper for this.
        if (USERS.isCooperMsg(msg)) return null;

        const email = this.getEmailFromMessage(msg);
        if (email) {
            const detectText = '**Email Address Detected:**\n';
            const actionText = `You seem to be trying to add or update your Coop email address. \n\n`;
            const termsText = `**You may unsubscribe** at any time using the **!unsubscribe command**, ` +
                `your email will not be visible to anyone and is used solely for our newsletter/relay. \n\n` +
                `_If you would like your email to be public, for example a business email - we will make this possible soon!_`;
            const confirmText = `\n\nPlease confirm ${email} is your email in the next 60 secs using the emoji reactions!`;

            const confirmEmailText = detectText + actionText + termsText + confirmText;
            const confirmMsg = await msg.channel.send(confirmEmailText);

            // Avoid rate limiting/hammering network.
            MESSAGES.delayReact(confirmMsg, EMOJIS.POLL_FOR, 333);
            MESSAGES.delayReact(confirmMsg, EMOJIS.POLL_AGAINST, 666);

            setTimeout(async () => {
                try {
                    // Await approval for addition.
                    const collected = await confirmMsg.awaitReactions((reaction, user) => (
                            !USERS.isCooper(user.id) &&
                            [EMOJIS.POLL_FOR, EMOJIS.POLL_AGAINST].includes(reaction.emoji.name)
                        ), 
                        { max: 1, time: 60000, errors: ['time'] }
                    );

                    const reaction = collected.first();
                    const confirmed = reaction.emoji.name === EMOJIS.POLL_FOR;

                    if (!confirmed) return confirmMsg.reply('Submission declined.');

                    // Add their email to database.
                    const subscription = await this.subscribe(msg.author.id, email);

                    // Handle new subscription.
                    if (subscription.success && subscription.newLead) 
                        confirmMsg.reply('Thank you for subscribing via email.');
                    
                    // Handle existing subscription modification.
                    else if (subscription.success && !subscription.newLead) 
                        confirmMsg.channel.send('Your email address was updated.');
                    
                } catch(e) {
                    confirmMsg.reply('Confirmation fail. Try again by stating your email.');
                    console.log('Subscription creation fail.');
                    console.error(e);
                }
            }, 1333);
        }
    }

    static async create(email, owner = null, level = 1) {
        let result = false;
        const creation = await Database.query({
            name: 'create-subscription',
            text: `INSERT INTO propaganda_subscriptions
                (email, level, owner_id, subscribed_at) 
                VALUES($1, $2, $3, $4)`,
            values: [email, level, owner, TIME._secs()]
        });
        if (typeof creation.rowCount !== 'undefined') {
            if (creation.rowCount === 1) result = true;
        }
        return result;
    }

    static getEmailFromMessage(msg) {
        let email = null;

        const emailMatches = msg.content.match(/\S+@\S+\.\S+/);
        if (emailMatches) email = emailMatches[0];

        return email;
    }

    static async getByEmail(email) {
        return DatabaseHelper.singleQuery({
            name: 'get-subscription-by-email',
            text: `SELECT * FROM propaganda_subscriptions WHERE email = $1`,
            values: [email]
        });
    }

    static async subscribe(userID, email) {
        const subscription = {
            newLead: false,
            success: false
        };

        try {
            // Check current value in that column of database.
            const currentSubscription = await this.getByEmail(email);

            // If email was already known, modify the record (anon -> tied to known user)
            if (currentSubscription && !currentSubscription.owner_id) {
                const didUpgrade = await this.upgradeAnonSubscription(currentSubscription.id, userID);
                if (didUpgrade) subscription.success = true;
            }

            // If email was not already known, create a new subscription.
            if (!currentSubscription) {
                subscription.newLead = true;

                const didSubscribe = await this.create(email, userID, 1);
                if (didSubscribe) subscription.success = true;
            }

        } catch(e) {
            console.error(e);
        }
        return subscription;
    }

    // If email was already known, modify the record (anon -> tied to known user)
    static async upgradeAnonSubscription(subscriptionID, userID) {
        let result = false;
        const query = {
            name: "upgrade-anon-subscription",
            text: 'UPDATE propaganda_subscriptions SET owner_id = $2 WHERE id = $1',
            values: [subscriptionID, userID]
        };
        const response = await Database.query(query);
        if (typeof response.rowCount !== 'undefined') {
            if (response.rowCount === 1) result = true;
        }
        return result;
    }

    // Set user's email to "UNSUBSCRIBED", remember to filter out later. >.>
    static unsubscribeByOwner(userID) {
        return Database.query({
            name: 'unsubscribe-by-owner',
            text: `DELETE FROM propaganda_subscriptions WHERE owner_id = $1`,
            values: [userID]
        });
    }

    static async unsubscribeByEmail(email) {
        let result = false;
        const query = {
            name: 'unsubscribe-by-email',
            text: `DELETE FROM propaganda_subscriptions WHERE email = $1`,
            values: [email]
        };
        const response = await Database.query(query);
        if (typeof response.rowCount !== 'undefined') {
            if (response.rowCount === 1) result = true;
        }
        return result;
    }
}