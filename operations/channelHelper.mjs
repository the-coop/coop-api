import { Permissions } from 'discord.js';

import COOP, { STATE, SERVER } from '../organisation/coop.mjs';
import { CHANNELS as CHANNELS_CONFIG } from '../organisation/config.mjs';

import MessageNotifications from './activity/information/messageNotifications.mjs';

export const silentOpts = { allowedMentions: { users: [], roles: [] }};

export default class ChannelHelper {

    static config = CHANNELS_CONFIG;

    static SPAMMABLE = Object.keys(CHANNELS_CONFIG)
        .filter(chanKey => CHANNELS_CONFIG[chanKey].spammable);

    static textRef(code) { return `<#${CHANNELS_CONFIG[code].id}>`; }

    // TODO: Need to reuse this a lot! Ping/link without pinging! <3 <3 
    static _send(code, text, opts = silentOpts) {
        const coop = SERVER._coop();
        const chan = this.getByCode(coop, code.toUpperCase());
        return chan.send(Object.assign({ content: text, ...opts }));
    }

    static async silentPropagate(msgRef, text, recordChan, selfDestruct = true) {
        // If channel isn't identical to record channel, post there too.
        if (!this.checkIsByCode(msgRef.channel.id, recordChan) && selfDestruct)
            COOP.MESSAGES.silentSelfDestruct(msgRef, text, 0, 15000);

        // Post to the record channel and return the outcome.
        return this._send(recordChan, text);
    }

    static getByID(guild, id) {
        return guild.channels.cache.get(id);
    }

    static fetch(id) {
        return SERVER._coop().channels.fetch(id);
    }

    static _get(id) {
        return this.getByID(SERVER._coop(), id);
    }

    static _getCode(code = '') {
        return this.getByCode(SERVER._coop(), code.toUpperCase());
    }

    static getByCode(guild, code) {
        return this.getByID(guild, CHANNELS_CONFIG[code].id);
    }

    static filter(guild, filter) {
        return guild.channels.cache.filter(filter);
    }

    static filterByCodes(guild, codes) {
        const ids = codes.map(code => CHANNELS_CONFIG[code].id);
        const filter = channel => ids.includes(channel.id);
        return this.filter(guild, filter);
    }

    static _postToFeed(message, delay = 333) {
        const prodServer = SERVER._coop();
        const feedChannel = this.getByCode(prodServer, 'FEED');
        return new Promise((resolve) => {
            setTimeout(async () => {
                const msg = await feedChannel.send(message);
                resolve(msg);
            }, delay);
        });
    }

    static codeSay(channelCode, messageText, delay = 333) {
        return this._postToChannelCode(channelCode, messageText, delay);
    }

    static codeSayReact(channelCode, messageText, emoji, delay = 333) {
        return this.codeSay(channelCode, messageText, emoji, delay)
            .then(msg => {
                if (msg) COOP.MESSAGES.delayReact(msg, emoji, delay * 1.5);
            });
    }

    static codeShout(msgRef, text, recordChan) {
        if (!this.checkIsByCode(msgRef.channel.id, recordChan))
            COOP.MESSAGES.silentSelfDestruct(msgRef, text, 0, 10000);

        return this._send(recordChan, text);
    }

    static _tempSend(code, content, delayMs = 666, fuseMs = 30000) { 
        const channel = this._getCode(code);
        return COOP.MESSAGES.silentSelfDestruct(channel, content, delayMs, fuseMs);
    }

    static codeShoutReact(msgRef, text, recordChan, emoji, selfDestruct = true) {
        const isRecordChannel = this.checkIsByCode(msgRef.channel.id, recordChan);
        if (selfDestruct && !isRecordChannel) {
            COOP.MESSAGES.silentSelfDestruct(msgRef, text, 0, 10000)
                .then(msg => COOP.MESSAGES.delayReact(msg, emoji));
            return this._send(recordChan, text);
        }
        else 
            return this.propagate(msgRef, text, recordChan, false);
    }

    // This function may be a good example/starting point for a lib 
    // for handling request timeouts and reject enforcement...?
    static _postToChannelCode(name, message, delay = 333) {
        const prodServer = SERVER._coop();
        const feedChannel = this.getByCode(prodServer, name);

        return new Promise((resolve, reject) => {
            let request = null;
            setTimeout(() => {
                if (feedChannel && typeof feedChannel.send === 'function') {
                    request = feedChannel.send(message);
                    
                    resolve(request);
                } else {
                    console.log(name + 'channel send failure');
                }
            }, delay);

            // Timeout.
            setTimeout(() => {
                // Is reject still triggered even if resolve has been?
                if (!request) reject('Timeout');
            }, delay * 2);
        });
    }

    static _codes(codes, message, opts) {
        const guild = SERVER._coop();
        return this
            .filterByCodes(guild, codes)
            .map(channel => channel.send(message, opts));
    }

    static _randomText() {
        const server = SERVER._coop();
        return this.fetchRandomTextChannel(server);
    }

    static _randomOnlyActive() {
        let selection = null;

        // Try to select a random active text channel.
        const actives = MessageNotifications.getActiveChannels();

        // TODO: This may need more work if null
        const firstActive = actives.entries().next().value || null;
        if (firstActive) selection = firstActive[0];

        return selection;
    }

    static _hide(id, reason = 'Hiding channel') {
       // Hide the channel.
       const channel = this._get(id);

       // Remove the current permissions.
       channel.permissionOverwrites.cache.map(p => 
           channel.permissionOverwrites.delete(p.id)
       );

       // Access the everyone role.
       const everyoneRole = COOP.SERVER._coop().roles.everyone;

       // Set everyone to VIEW_CHANNEL false.
       channel.permissionOverwrites.set(
           [{
              id: everyoneRole.id,
              deny: [Permissions.FLAGS.VIEW_CHANNEL]
           }], 
           reason
       );
    }

    static _show(id) {
        // Access the channel
        const channel = this._get(id);

        // Show the channel by syncing permissions to category's.
        if (channel.parentId)
            return channel.lockPermissions();
        else 
            channel.permissionOverwrites.create(
                channel.guild.roles.everyone, 
                { VIEW_CHANNEL: true, READ_MESSAGE_HISTORY: true }
            );
     }

     static _showTo(id, roles) {
        const channel = this._get(id);
        return channel.permissionOverwrites.set(
            roles.map(r => ({
                id: r.id,
                allow: [
                    Permissions.FLAGS.VIEW_CHANNEL,
                    Permissions.FLAGS.READ_MESSAGE_HISTORY
                ]
            }))
        );
     }

    // Implement as part of community velocity reform.
    static _randomSomewhatActive() {
        // Only run this half the time, so we don't only drop in active channels.
        // TODO: Implement this
        if (STATE.CHANCE.bool({ likelihood: 50 })) {
            // Try to select a random active text channel.
            const actives = MessageNotifications.getActiveChannels();

            // If there are any active channels return first of them! :D
            if (actives.size > 0) 
                return actives.entries().next().value;
        }

        // Default to basic random channel.
        return this._randomText();
    }

    static _randomSpammable() {
        const randomSpammableCode = STATE.CHANCE.pickone(this.SPAMMABLE);
        return this._getCode(randomSpammableCode);
    }

    static isChannelIDSpammable(chanID) {
        return this.SPAMMABLE.includes(this.idToCode(chanID));
    }

    static idToCode(id) {
        let code = null;
        Object.keys(CHANNELS_CONFIG).map(channelKey => {
            const channel = CHANNELS_CONFIG[channelKey];
            if (channel.id === id) code = channelKey;
        });
        return code;
    }

    static async propagate(msgRef, text, recordChan, selfDestruct = true) {
        // If channel isn't identical to record channel, post there too.
        if (!this.checkIsByCode(msgRef.channel.id, recordChan) && selfDestruct)
            COOP.MESSAGES.selfDestruct(msgRef, text, 0, 15000);

        // Post to the record channel and return the outcome.
        return this._send(recordChan, text);
    }

    static async _delete(id) {
        const guild = SERVER._coop();
        const channel = guild.channels.cache.get(id);
        return channel.delete();
    }

    static _create(name, options) {
        return SERVER._coop().channels.create(name, options);
    }

    static _all = () => SERVER._coop().channels.cache || [];

    static sendByCodes(guild, codes, message, opts = {}) {
        return this
            .filterByCodes(guild, codes)
            .map(channel => channel.send(message, opts));
    }

    static fetchRandomTextChannel(guild) {       
        let result = null;

        // List of channels to not post to, maybe should reuse somewhere.
        const filteredChannels = ['INTRO', 'LEADERS', 'STREAM_NOMIC'];

        // Prevent egg and crate drops in unverified channels.
        const filteredKeys = Object.keys(CHANNELS_CONFIG)
            .filter(key => !filteredChannels.includes(key));

        const channelKey = STATE.CHANCE.pickone(filteredKeys);
        const channelID = CHANNELS_CONFIG[channelKey].id;
        const channel = guild.channels.cache.get(channelID);
        
        // Filter invalid/deleted channels out, but notify of existence.
        if (channel) result = channel;
        else {
            // Added to debug.
            console.log('Could not find channel', channel, channelID, channelKey);
        }

        return result;
    }

    static checkIsByCode(id, code) {
        const channel = CHANNELS_CONFIG[code];

        let result = false;
        if (channel && channel.id === id) result = true;
        return result;
    }

 

}