import axios from 'axios';

import COOP, { CHANNELS, TIME, STATE } from '../organisation/coop.mjs';

import Chicken from './chicken.mjs';

export default class ServerHelper {

    static _coop() { return this.getByID(STATE.CLIENT, process.env.GUILD_ID); }

    static getByID(client, id) { return client.guilds.cache.get(id); }

    static getByCode(client, code) { 
        return this.getByID(client, SERVERS[code].id); 
    }

    static _count(numBots = 1) { return this._coop().memberCount - numBots || 0; }

    static checkMissingChannels() {
        Object.keys(CHANNELS.config).map(ck => {
            const channel = CHANNELS.config[ck];

            // console.log('Checking channel still exists ' + ck);
            // console.log(channel.id);

            const realChannel = CHANNELS._get(channel.id)
            if (!realChannel) console.log('No channel ' + ck);
            // else console.log(realChannel.id);

            // CHANNELS._all()
        });
    }

    static async webRebuildHandler() {
        // Check last build time.
        const lastElecMsgSecs = parseInt(await Chicken.getConfigVal('last_website_build'));
        const nowSecs = TIME._secs();

        // Check if it has expired (week in seconds).
        const expiration = lastElecMsgSecs + 3600 * 24 * 7;
        if (nowSecs > expiration) {
            console.log('Web build required.');

            // Update build time.
            Chicken.setConfig('last_website_build', TIME._secs());
            
            // Trigger Netlify rebuild of static site.
            axios.post('https://api.netlify.com/build_hooks/61295f9514147c115d2db4e9?trigger_branch=master&trigger_title=built-by-cooper');

            // Post website is rebuilding to the activity logs channel.
            CHANNELS._send('ACTIONS', 'Website rebuild was triggered.');
        } else {
            // Post time until rebuild triggered in activity logs channel.
            const until = expiration - nowSecs;
            CHANNELS._send('ACTIONS', `Website rebuild is due in roughly ${Math.round(until / 3600)} hours.`);
        }

    }

}