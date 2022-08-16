import moment from 'moment';

import ElectionHelper from './members/hierarchy/election/electionHelper.mjs';
import CooperMorality from './minigames/small/cooperMorality.mjs';

import { STATE, CHANNELS, TIME, ITEMS } from "../organisation/coop.mjs";

import Database from '../organisation/setup/database.mjs';
// import VisualisationHelper from './minigames/medium/conquest/visualisationHelper.mjs';




export default class Chicken {

    static getDiscordID() {
        return STATE.CLIENT.user.id;
    }

    static async getConfig(key) {
        let value = null;

        try {
            const query = {
                name: "get-chicken-config",
                text: `SELECT * FROM chicken WHERE attribute = $1`,
                values: [key]
            };
            const result = await Database.query(query);
            if ((result.rows || []).length) {
                const resultData = result.rows[0] || null;
                if (resultData) value = resultData;
            }
        } catch(e) {
            console.error(e);
        }

        return value;
    }

    static async getConfigVal(key) {
        let val = null;

        const configEntry = await this.getConfig(key);
        if (configEntry) val = configEntry.value;

        return val;
    }

    static async setConfig(key, value) {
        const query = {
            name: "set-chicken-config",
            text: `INSERT INTO chicken(attribute, value)
                VALUES($1, $2) 
                ON CONFLICT (attribute)
                DO 
                UPDATE SET value = $2
                RETURNING value`,
            values: [key, value]
        };
        const result = await Database.query(query);
        return result;
    }

    static async _nextdayis() {
        const remainingMoment = await this._nextdayisMoment();
        const remainingReadable = moment.utc(remainingMoment).format("HH:mm:ss");
        return remainingReadable;
    }

    static async _nextdayisMoment() {
        const latestSecs = await this.getCurrentDaySecs();
        const presentSecs = Math.floor(+new Date() / 1000);
        const dayDuration = (3600 * 24);

        const latestMoment = moment.unix(latestSecs + dayDuration);
        const currentMoment = moment.unix(presentSecs);
        const remainingMoment = latestMoment.diff(currentMoment);

        return remainingMoment;
    }

    static async getCurrentDaySecs() {
        let secs = null;
        const currentDaySecs = await this.getConfigVal('current_day');
        if (currentDaySecs) secs = parseInt(currentDaySecs);
        return secs;
    }
    
    // TODO: Consider adding observable for checkIfNewDay (provide events)
    static async isNewDay() {
        const currentDaySecs = await this.getCurrentDaySecs();
        const nowSecs = TIME._secs();
        const dayDurSecs = (60 * 60) * 24
        const isNewDay = nowSecs >= currentDaySecs + dayDurSecs;

        return isNewDay;
    }

    static async getTransactionsPreviousDay() {
        const twentyFourHourSecs = 86400;
        const txs = await ITEMS.getTransactionsSince(twentyFourHourSecs);
        return txs;
    }

    static async checkIfNewDay() {
        try {
            // Comparison to internal state may show a way to detect day end too.
            const isNewDay = await this.isNewDay();
            if (!isNewDay) return false;

            // Try to attempt a giveaway based on random roll.
            if (STATE.CHANCE.bool({ likelihood: 5 })) 
                CooperMorality.giveaway();

            // Check the most important things at the beginning of a new day.
            ElectionHelper.checkProgress();
            
            // Update the current day record.
            await this.setConfig('current_day', '' + TIME._secs());

            // Send the conquest visuals!
            // await VisualisationHelper.record("https://www.thecoop.group/conquest/world");
            // CHANNELS._getCode('TALK').send(newDayText, new MessageAttachment('/tmp/video.webm'));
            
            const txs = await this.getTransactionsPreviousDay();
            console.log(txs);
            console.log('Previous is the txs for previous day.')
            
            console.log('Show above transactions in the right channel formatted');

            // CHANNELS._getCode('TALK').send('New day! What information should go here? (Implementing Poof\'s idea) :thinking: ');

            return true;
            
        } catch(e) {
            console.log('New day detection failed.')
            console.error(e);
        }
    }

}