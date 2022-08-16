import { MESSAGES, CHANNELS, STATE } from "../../../organisation/coop.mjs";

// EGGS FOUND

// WOOD CUT

// ORE MINED
// DIAMONDS MINED

// CRATE REWARDS
// CRATE HIT
// CRATE OPEN`

// ITEMS USED (Intercept items helper)
    // Diamonds and broken pickaxes
    // Update total data
    // Diamonds and broken pickaxes

export default class EconomyNotifications {

    static add(eventType, eventData = {}) {
        if (eventType === 'WOODCUTTING') this.updateWoodcutting(eventData);
        if (eventType === 'MINING') this.updateMining(eventData);
        if (eventType === 'EGG_HUNT') this.updateEgghunt(eventData);
        if (eventType === 'CRATE_DROP') this.updateCrateDrop(eventData);
    }

    static post() {
        const eventStatusesKeys = Object.keys(STATE.EVENTS_HISTORY);
        if (eventStatusesKeys.length > 0) {
            let notificationString = '**Latest economy actions:**\n\n';
            
            if (STATE.EVENTS_HISTORY['WOODCUTTING']) {
                const woodcutting = STATE.EVENTS_HISTORY['WOODCUTTING'];
                
                notificationString += `**Latest Woodcutting Totals:**\n` +
                    // TODO: Count hits too. `Hits: ${mining.totals.hits}\n` +
                    `Logs Cut: ${woodcutting.totals.cut}\n` +
                    `Broken Axes: ${woodcutting.totals.brokenAxes}\n` +
                    `Points Change: ${woodcutting.totals.points}\n` +

                    // Map woodcutting users string into visual feedback.
                    Object.keys(woodcutting.users)
                        .map(wcUserID => {
                            const wcUser = woodcutting.users[wcUserID];
                            return `${wcUser.username} ${wcUser.points}x${MESSAGES.emojiCodeText('COOP')} ${wcUser.cut}x:wood:`;
                        })
                        .join(', ') +

                    `\n\n`;
            }

            if (STATE.EVENTS_HISTORY['MINING']) {
                const mining = STATE.EVENTS_HISTORY['MINING'];

                const metalOreEmoji = MESSAGES.emojiCodeText('METAL_ORE');

                notificationString += `**Latest Mining Totals:**\n` +
                    `Hits: ${mining.totals.hits}\n` +
                    `Mined: ${mining.totals.mined}\n` +
                    `Diamonds: ${mining.totals.diamonds}\n` +
                    `Broken Pickaxes: ${mining.totals.brokenPickaxes}\n` +
                    `Points Change: ${mining.totals.points}\n\n` +

                    // Map mining users string into visual feedback.
                    Object.keys(mining.users)
                        .map(mnUserID => {
                            const mnUser = mining.users[mnUserID];
                            // TODO: Add metal ore and diamonds here (emojis display):
                            return `${mnUser.username} ${mnUser.points}x${MESSAGES.emojiCodeText('COOP')} ${mnUser.mined}x${metalOreEmoji}`;
                        })
                        .join(', ') +

                    `\n\n`;
            }

            if (STATE.EVENTS_HISTORY['EGG_HUNT']) {
                const egghunt = STATE.EVENTS_HISTORY['EGG_HUNT'];

                notificationString += '**Latest Egg Hunt Totals:**\n';

                console.log(egghunt);

                // Map the eggs with the correct emoji.
                ['AVERAGE_EGG', 'RARE_EGG', 'LEGENDARY_EGG', 'TOXIC_EGG'].map(eggCode => {
                    if (egghunt[eggCode])
                        // TODO: Add the egg emoji.
                        notificationString += `${eggCode}x${egghunt[eggCode]} \n`;
                });

                // Add the number of broken eggs.
                if (egghunt.broken)
                    notificationString += `${egghunt.broken} eggs were broken \n`;

                // AVERAGE_EGG: 0,
                // RARE_EGG: 0,
                // LEGENDARY_EGG: 0,
                // TOXIC_EGG: 0,

                // collected: 0,
                // broken: 0,
                // points: 0,

                // Broken eggs
                // Collected eggs total
                // Collect eggs by type
                // Points collected
                // Bombed eggs
                // Fried eggs

                // TODO 1: Ensure the data is structured correctly/added correctly.

                // TODO 2: Format and display the egg hunt data.
            }

            // TODO: Add cratedrop stats
            if (STATE.EVENTS_HISTORY['CRATE_DROP']) {
                notificationString += '\nHad crate drop stats';
                console.log(STATE.EVENTS_HISTORY['CRATE_DROP']);
            }

            CHANNELS._postToChannelCode('TALK', notificationString);

            this.clear('WOODCUTTING');
            this.clear('MINING');
            this.clear('EGG_HUNT');
            this.clear('CRATE_DROP');
        }
    }
    
    static clear(type) {
        if (typeof STATE.EVENTS_HISTORY[type] !== 'undefined');
            delete STATE.EVENTS_HISTORY[type];
    }


    static updateMining(miningEvent) {
        const userID = miningEvent.playerID;

        if (typeof STATE.EVENTS_HISTORY['MINING'] === 'undefined') {
            STATE.EVENTS_HISTORY['MINING'] = {
                users: {

                },
                totals: {
                    mined: 0,
                    diamonds: 0,
                    brokenPickaxes: 0,
                    points: 0,
                    hits: 0
                }
            }
        }

        // Add or update user specific stats
        if (typeof STATE.EVENTS_HISTORY['MINING'].users[userID] === 'undefined') {
            STATE.EVENTS_HISTORY['MINING'].users[userID] = {
                points: miningEvent.pointGain,
                username: miningEvent.username,
                mined: miningEvent.recOre || 0,
                brokenPickaxes: miningEvent.brokenPickaxes || 0,
                diamondsFound: miningEvent.diamondsFound || 0,
            }

        } else {
            // otherwise update
            if (typeof miningEvent.pointGain !== 'undefined')
                STATE.EVENTS_HISTORY['MINING'].users[userID].points += miningEvent.pointGain;

            if (typeof miningEvent.brokenPickaxes !== 'undefined')
                STATE.EVENTS_HISTORY['MINING'].users[userID].brokenPickaxes += miningEvent.brokenPickaxes;

            if (typeof miningEvent.diamondsFound !== 'undefined')
                STATE.EVENTS_HISTORY['MINING'].users[userID].diamonds += miningEvent.diamondsFound;

            if (typeof miningEvent.recOre !== 'undefined')
                STATE.EVENTS_HISTORY['MINING'].users[userID].mined += miningEvent.recOre;

        }


        if (typeof miningEvent.pointGain !== 'undefined')
            STATE.EVENTS_HISTORY['MINING'].totals.points += miningEvent.pointGain;

        if (typeof miningEvent.brokenPickaxes !== 'undefined')
            STATE.EVENTS_HISTORY['MINING'].totals.brokenPickaxes += miningEvent.brokenPickaxes;

        if (typeof miningEvent.diamondsFound !== 'undefined')
            STATE.EVENTS_HISTORY['MINING'].totals.diamonds += miningEvent.diamondsFound;

        if (typeof miningEvent.recOre !== 'undefined')
            STATE.EVENTS_HISTORY['MINING'].totals.mined += miningEvent.recOre;

        // Updated every hit, so track hits.
        STATE.EVENTS_HISTORY['MINING'].totals.hits++;
    }

    static updateWoodcutting(woodcuttingEvent) {
        const userID = woodcuttingEvent.playerID;

        if (typeof STATE.EVENTS_HISTORY['WOODCUTTING'] === 'undefined') {
            STATE.EVENTS_HISTORY['WOODCUTTING'] = {
                users: {

                },
                totals: {
                    cut: woodcuttingEvent.recWood || 0,
                    brokenAxes: woodcuttingEvent.brokenAxes || 0,
                    points: woodcuttingEvent.pointGain || 0,
                    hits: 0
                }
            }
        }

        // Add or update user specific stats
        if (typeof STATE.EVENTS_HISTORY['WOODCUTTING'].users[userID] === 'undefined') {
            STATE.EVENTS_HISTORY['WOODCUTTING'].users[userID] = {
                points: woodcuttingEvent.pointGain,
                username: woodcuttingEvent.username,
                cut: woodcuttingEvent.recWood || 0,
                brokenAxes: woodcuttingEvent.brokenAxes || 0,
            }

        } else {
            if (typeof woodcuttingEvent.pointGain !== 'undefined')
                STATE.EVENTS_HISTORY['WOODCUTTING'].users[userID].points += woodcuttingEvent.pointGain;

            if (typeof woodcuttingEvent.cut !== 'undefined')
                STATE.EVENTS_HISTORY['WOODCUTTING'].users[userID].cut += woodcuttingEvent.recWood;

            if (typeof woodcuttingEvent.brokenAxes !== 'undefined')
                STATE.EVENTS_HISTORY['WOODCUTTING'].users[userID].brokenAxes += woodcuttingEvent.recWood;
        }

        // Update total data

        if (typeof woodcuttingEvent.pointGain !== 'undefined')
            STATE.EVENTS_HISTORY['WOODCUTTING'].totals.points += woodcuttingEvent.pointGain;

        if (typeof woodcuttingEvent.cut !== 'undefined')
            STATE.EVENTS_HISTORY['WOODCUTTING'].users[userID].cut += woodcuttingEvent.recWood;

        if (typeof woodcuttingEvent.brokenAxes !== 'undefined')
            STATE.EVENTS_HISTORY['WOODCUTTING'].totals.brokenAxes += woodcuttingEvent.brokenAxes;

            
        // TODO: This shouldn't be updated if adding a broken axe event.

        // Updated every hit, so track hits.
        STATE.EVENTS_HISTORY['WOODCUTTING'].totals.hits++;
    }

    static updateCrateDrop(crateDropEvent) {
        console.log(crateDropEvent);

        if (typeof STATE.EVENTS_HISTORY['CRATE_DROP'] === 'undefined') {
            STATE.EVENTS_HISTORY['CRATE_DROP'] = {
                users: {

                },
                totals: {
                    average: crateDropEvent.rarity || 0,
                    rare: crateDropEvent.rarity || 0,
                    legendary: crateDropEvent.rarity || 0,
                    points: 0,
                    empty: 0
                }
            }
        }
    }

    static updateEgghunt(egghuntEvent) {
        // const userID = egghuntEvent.playerID;

        console.log(egghuntEvent);

        // STATE.EVENTS_HISTORY['EGG_HUNT'][egg]

        if (typeof STATE.EVENTS_HISTORY['EGG_HUNT'] === 'undefined') {
            STATE.EVENTS_HISTORY['EGG_HUNT'] = {
                // totals: {}
                AVERAGE_EGG: 0,
                RARE_EGG: 0,
                LEGENDARY_EGG: 0,
                TOXIC_EGG: 0,

                collected: 0,
                broken: 0,
                points: 0,

                // These aren't implemented yet:
                // fried: 0,
                // bombed: 0
            }
        }

        // Count the collected egg.
        if (egghuntEvent.type === 'COLLECT') {
            STATE.EVENTS_HISTORY['EGG_HUNT'][egghuntEvent.eggType]++;
            STATE.EVENTS_HISTORY['EGG_HUNT'].points += egghuntEvent.pointGain;
        }

        // Count the broken egg.
        if (egghuntEvent.type === 'BROKEN')
            STATE.EVENTS_HISTORY['EGG_HUNT'].broken++;
        
        // EconomyNotifications.add('EGG_HUNT', {
        //     playerID: user.id,
        //     username: user.username,
        //     type: 'COLLECT',
        //     eggType: rarity,
        //     pointGain: reward
        // });


    }
}