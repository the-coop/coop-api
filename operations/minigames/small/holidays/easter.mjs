import COOP from "../../../../organisation/coop.mjs";

export default class EasterMinigame {

    // Burn metal ore into metal
    static async onReaction(reaction, user) {
        if (user.id !== 1) return false;
        console.log(reaction);
    }

    // TODO: Consider getting a server time from somewhere to standardise all time?
    // TODO: Detect easter with last_easter detected column, that way can launch a message. :D
    static isEaster() {
        const dateNow = new Date();
        const year = dateNow.getFullYear();
        const century = Math.floor(year / 100);

        const goldenNum = year % 19;

        const nextCentury = year % 100;
        const quadrennial = Math.floor(century / 4); 
        const quadrennialYear = century % 4;

        // Relabel if feeling brave enough to annotate Gauss's Easter algorithm.
        const f = Math.floor((century + 8) / 25);
        const g = Math.floor((century - f + 1) / 3); 
        const startMonthOffset = (19 * goldenNum + century - quadrennial - g + 15) % 30;
        
        const i = Math.floor(nextCentury / 4);
        const k = nextCentury % 4;
        const l = (32 + 2 * quadrennialYear + 2 * i - startMonthOffset - k) % 7;
        const m = Math.floor((goldenNum + 11 * startMonthOffset + 22 * l) / 451);
        const n0 = (startMonthOffset + l + 7 * m + 114)
        
        // Check if easter.
        const easterMonth = Math.floor(n0 / 31) - 1;
        const easterDay = n0 % 31 + 1;
        const easterDate = new Date(year, easterMonth, easterDay);
        return (dateNow.getMonth() === easterDate.getMonth() 
            && dateNow.getDate() === easterDate.getDate());
    }

    static async run() {
        // Only spawn on easter
        if (this.isEaster()) 
            COOP.ITEMS.drop(COOP.CHANNELS._getCode('TALK'), 'EASTER_EGG', 30);
    }


}