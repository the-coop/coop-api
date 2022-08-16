import COOP from "../../../../organisation/coop.mjs";

export default class ReservesHelper {

    static async displayBalance() {
        const messageText = await this.balanceText();
        await COOP.CHANNELS._postToChannelCode('ACTIONS', messageText);
    }

    static async balanceText() {
        return 'currently offline';
    }

    static balance() {
        return 'currently offline';
    }

    static async address() {
        return 'currently offline';
    }

}