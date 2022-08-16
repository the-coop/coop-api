import _ from 'lodash';
import { CHANNELS, TIME, USERS } from "../../organisation/coop.mjs";
import EventsHelper from "../eventsHelper.mjs";

export const SPOTLIGHT_DUR = 3600 * 24 * 4;

export default class SpotlightHelper {

    static async track() {
        try {
            const spotlightEvent = await EventsHelper.read('spotlight');
            const now = TIME._secs();
            const lastOccurred = parseInt(spotlightEvent.last_occurred);
            const isDue = now - lastOccurred > (SPOTLIGHT_DUR * 2);
            const hasExpired = now - lastOccurred > SPOTLIGHT_DUR;

            // Defining a voting period allows channel to stay open for a while after concluding.
            const isVotingPeriod = lastOccurred + 3600 * 24 <= now;

            console.log('Tracking spotlight event...');
            console.log(now);
            console.log(spotlightEvent);
            console.log(lastOccurred);
            console.log(isVotingPeriod);

            // Start the event if necessary.
            if (!spotlightEvent.active && isDue)
                await this.start();

            // Process an ongoing event within
            else if (spotlightEvent.active && isVotingPeriod)
                await this.run();

            // End the event if necessary.
            else if (spotlightEvent.active && hasExpired)
                await this.end();

            else {
                console.log('Spotlight was tracked x hours until end/start [wip]...');
            }

        } catch(e) {
            console.log('Error tracking spotlight event');
            console.error(e);
        }
    }

    static async start() {
        try {
            // Show channel when ready
            CHANNELS._show(CHANNELS.config.SPOTLIGHT.id);

            // TODO: Add announcement ping
            CHANNELS._send('SPOTLIGHT', 'STARTING SPOTLIGHT!');

            // Set event active and last occurrence to now.
            EventsHelper.update('spotlight', TIME._secs());
            EventsHelper.setActive('spotlight', true);

            // Select a member
            const user = await USERS._random();

            // Post spotlight member message.
            console.log('Starting spotlight event.');
            CHANNELS._send('SPOTLIGHT', 'Starting spotlight for ' + user.username);

        } catch(e) {
            console.log('Error starting spotlight event');
            console.error(e);
        }
    }

    static async end() {
        try {
            // Set event to inactive.
            EventsHelper.setActive('spotlight', false);

            // Delete messages.
            const channel = CHANNELS._getCode('SPOTLIGHT');
            const msgs = await channel.messages.fetch({ limit: 100 });
            await channel.bulkDelete(msgs);

            // Hide channel when not appropriate
            CHANNELS._hide(CHANNELS.config.SPOTLIGHT.id);
            
            console.log('Ending spotlight event.');

        } catch(e) {
            console.log('Error ending spotlight event');
            console.error(e);
        }
    }

    static async run() {
        try {
            console.log('Running active spotlight event within voting period.');

        } catch(e) {
            console.log('Error runing spotlight event');
            console.error(e);
        }
    }

}