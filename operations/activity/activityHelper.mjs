import { SERVER } from "../../organisation/coop.mjs";
import Database from "../../organisation/setup/database.mjs";

export default class ActivityHelper {

    static async track() {
        // Track activity
        const coop = await SERVER._coop().fetch();
        const active = coop.approximatePresenceCount;

        // Get the hour to assign it to.
        const date = new Date;
        const hour = date.getHours();

        return this.update(hour, active);
    }

    // Update the hourly average.
    static update(hour, activeNum) {
        return Database.query({
            name: 'update-hour-activity',
            text: 'UPDATE activity_hours SET active_num = $2 WHERE hour = $1',
            values: [hour, activeNum]
        }); 
    }

    static async peak() {
        // Calculate and return peak
    }

    static async prepeakOrCycleBegin() {
        // Calculate the cycle repeat beginning/start point for the day.
    }

    static categorisePresentTransactions(txs) {
        const activityModel = { 
            items: {
                dropped: {},
                traded: {},
                gifted: {}
            },
            conflict: {
                bombed: {},
                rpg: {},
                toxic_egg: {}
            },
            egghunt: {
                collectors: [],
                collected: {
                    TOXIC_EGG: 0,
                    AVERAGE_EGG: 0,
                    RARE_EGG: 0,
                    LEGENDARY_EGG: 0
                },
                broken: {
                    TOXIC_EGG: 0,
                    AVERAGE_EGG: 0,
                    RARE_EGG: 0,
                    LEGENDARY_EGG: 0
                },
                bombed: {
                    TOXIC_EGG: 0,
                    AVERAGE_EGG: 0,
                    RARE_EGG: 0,
                    LEGENDARY_EGG: 0
                },
            },
            woodcutting: {
                chopped: 0,
                broken_axe: 0
            },
            mining: {
                mined: 0,
                broken_pick_axe: 0
            },
            instant_furnace: {
                smelted: {

                },
                burned: {

                }
            },
            cratedrop: {
                opened: {
                    AVERAGE_CRATE: 0,
                    RARE_CRATE: 0,
                    LEGENDARY_CRATE: 0
                }
            }
        };

        txs.map(t => {
            const activityKey = t.note.split(' ')[0];
            if (activityKey === 'EGGHUNT_COLLECTED_AVERAGE_EGG')
                activityModel.egghunt.collected.AVERAGE_EGG++;
        });

        return activityModel;
    }

}