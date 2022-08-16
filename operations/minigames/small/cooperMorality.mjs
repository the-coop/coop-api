import COOP from "../../../organisation/coop.mjs";
import Chicken from "../../chicken.mjs";
import DropTable from "../medium/economy/items/droptable.mjs";

export default class CooperMorality {
    
    static async load() {
        return await Chicken.getConfigVal('morality');
    }

    static async calculate() {
        let morality = null;

        const points = await COOP.ITEMS.getUserItemQty(COOP.STATE.CLIENT.user.id, 'COOP_POINT');

        if (points < 0) morality = 'EVIL';
        if (points > 0) morality = 'GOOD';
        if (points === 0) morality = 'NEUTRAL';

        return morality;
    }

    static async evaluate() {
        const prevMorality = await this.load();
        const morality = await this.calculate();        
        
        // On morality change event.
        if (prevMorality !== morality) {
            await Chicken.setConfig('morality', morality);
            await COOP.CHANNELS._postToFeed(`I am feeling... ${morality.toLowerCase()}!`);
        }

        // Buffs for GOOD morality:
        if (morality === 'GOOD' && COOP.STATE.CHANCE.bool({ likelihood: .5 })) this.giveaway();

        // Negations for EVIL morality:
        if (morality === 'EVIL' && COOP.STATE.CHANCE.bool({ likelihood: .5 })) this.takeway();
        // ...
        // ...

        // Quirky things for neutral, produces rarer items.
        //that's hot
    }

    static async takeaway() {
        COOP.CHANNELS._postToFeed('I taketh as I giveth...');
    }

    static async giveaway() {
        const maxRewardAmount = 4;
        const maxRewardeesAmount = 6;

        // Calculate using chance/luck.
        const rewardeesAmount = COOP.STATE.CHANCE.natural({ min: 1, max: maxRewardeesAmount });

        const rewardeeReqs = [];
        for (let i = 0; i < rewardeesAmount; i++) rewardeeReqs.push(COOP.USERS.random());
        const rewardees = await Promise.all(rewardeeReqs);

        // Add results to
        const dropResults = rewardees.map(({ user }) => {
            const rewardAmount = COOP.STATE.CHANCE.natural({ min: 1, max: maxRewardAmount });

            const drops = DropTable.getRandomWithQtyMany(rewardAmount);

            return { user, drops };
        });


        // Add the item to each user.
        await Promise.all(dropResults.map(dropSet =>
            Promise.all(dropSet.drops.map(drop =>
                COOP.ITEMS.add(dropSet.user.id, drop.item, drop.qty, 'Cooper\'s giveaway')
            ))
        ));
        
        // Declare feedback.
        const giveawayText = `**Cooper's good mood makes him iconic!**\n\n` +
            dropResults.map(dropSet => 
                `<@${dropSet.user.id}>: ${dropSet.drops.map(drop => 
                    `${COOP.MESSAGES.emojiCodeText(drop.item)}x${drop.qty}`
                ).join(', ')
            }`).join('.\n\n');
        
        // Send and ping the users, since it's rare/infrequent and positive they won't mind.
        COOP.CHANNELS._send('FEED', giveawayText, {});

        return dropResults;
    }
}