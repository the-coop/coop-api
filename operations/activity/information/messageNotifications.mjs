import Statistics from './statistics.mjs';
import COOP, { CHANNELS, STATE } from '../../../organisation/coop.mjs';

export default class MessageNotifications {

    // TODO: Return active servers in order of activity.
    static getActiveChannels() {
        const actives = STATE.MESSAGE_HISTORY;
        const channelIDs = Object.keys(actives);

        // Sort by most active, check this for dropping in LEAST active lol.
        channelIDs.sort((a, b) => actives[a].count - actives[b].count);

        // Could always return count and use that as a multipler? :)
        return channelIDs.map(id => COOP.CHANNELS._get(id));
    }

    // Get current activity of channel.
    static getFreshMsgCount(channelCode) {
        const channel = COOP.CHANNELS.config()[channelCode].id;
        const fresh = STATE.MESSAGE_HISTORY[channel];
        const count = fresh.count || 0;
        return count;
    }

    static getFreshMsgTotalCount() {
        const channelActivity = STATE.MESSAGE_HISTORY;
        const count = Object.keys(channelActivity).reduce((acc, curr) => acc += channelActivity[curr].count, 0);
        return count;
    }

    static add(msg) {
        const channelID = msg.channel.id;
        const authorID = msg.author.id;

        // Filter out Cooper's messages.
        if (COOP.USERS.isCooperMsg(msg)) return false;

        // Filter out direct message and testing.
        // if (channelID === CHANNELS.COOPERTESTS.id) return false;

        // Filter out DM messages.
        if (msg.channel.type === 'DM') return false;

        // If not already tracking, create the key on the object.
        if (typeof STATE.MESSAGE_HISTORY[channelID] === 'undefined') {
            STATE.MESSAGE_HISTORY[channelID] = {
                count: 0,
                authors: {}
            };
        }

        // If not already tracking messages for that author on that object, initialise.
        if (typeof STATE.MESSAGE_HISTORY[channelID].authors[authorID] === 'undefined') {
            STATE.MESSAGE_HISTORY[channelID].authors[authorID] = {
                count: 0,
                username: msg.author.username
            };
        }

        // Add count on channel and author to list.
        STATE.MESSAGE_HISTORY[channelID].count++;
        STATE.MESSAGE_HISTORY[channelID].authors[authorID].count++;
    }

    // TODO: These messages should be added to a global statistics store... quite significant stats.
    static process() {
        // Offload message data to processing/long-term statistics before deletion.
        Statistics.offloadMessageStats(STATE.MESSAGE_HISTORY);

        // Post to community.
        this.post();
    }

    static post() {
        try {
            const notificationChannelIDs = Object.keys(STATE.MESSAGE_HISTORY);
            if (notificationChannelIDs.length > 0) {
                // Count total messages beforehand to add to string as header.
                const totalCount = notificationChannelIDs.reduce((acc, val) => {
                    acc += STATE.MESSAGE_HISTORY[val].count;
                    return acc;
                }, 0);
                
                // TODO: Order by most messages.
                let notificationString = `**${totalCount} latest messages!**\n\n`;
                
                notificationChannelIDs.map(channelID => {
                    // Access the notification data for this specific channel.
                    const notificationData = STATE.MESSAGE_HISTORY[channelID];
    
                    const authorsArr = Object.keys(notificationData.authors)
                        .map(authorKey => notificationData.authors[authorKey]);
    
                    authorsArr.sort((a, b) => a.count > b.count ? -1 : 1);
    
                    // Add formatted string for posting as notification.
                    const label = notificationData.count > 1 ? 'messages' : 'message';
                    notificationString += `<#${channelID}> ${notificationData.count} ${label}! \n` +
                        `From: ${authorsArr.map(authorData => 
                            `${authorData.username} (${authorData.count})`)
                            .join(', ')}`;
    
                    // Add some line spacing.
                    notificationString += '\n\n';
    
    
                    // Update the last message time and total messages count of these users.
                    Object.keys(notificationData.authors).map(async (authorKey) => {
                        const count = notificationData.authors[authorKey].count;
    
                        // Update last message secs to current time.
                        COOP.USERS.updateField(authorKey, 'last_msg_secs', COOP.TIME._secs());
    
                        // TODO: Improve with more efficient postgres method COOP.USERS.add() like Items.
    
                        // Update total_msgs field for the user.
                        const newTotal = (await COOP.USERS.getField(authorKey, 'total_msgs')) + count;
                        COOP.USERS.updateField(authorKey, 'total_msgs', newTotal);
                    });
    
                    // All outstanding state accounted for, cleanup.
                    this.clear(channelID);
                });
    
                // Spam leaders with it - their problem.
                CHANNELS._send('ACTIONS', notificationString);
            }
        } catch(e) {
            console.log('Error posting latest messages.');
            console.error(e);
        }
    }
    

    static clear(channelID) {
        delete STATE.MESSAGE_HISTORY[channelID];
    }
}