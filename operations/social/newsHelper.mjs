import axios from 'axios';

import { STATE, CHANNELS } from "../../organisation/coop.mjs";

export default class NewsHelper {

    static async query(query) {
        const url = 'https://newsapi.org/v2/everything?q=' + query + '&apiKey=' + process.env.NEWSAPI_KEY;
        const res = await axios.get(url);
        const result = res.data.articles;
        return result;
    }


    static async mailboy() {
        let query;
        let channelCode;

        if (STATE.CHANCE.bool({ likelihood: 21 })) {
            query = 'creativity';
            channelCode = 'ART_CHAT';

        } else if (STATE.CHANCE.bool({ likelihood: 22 })) {
            query = 'economics';
            channelCode = 'BUSINESS_CHAT';

        } else if (STATE.CHANCE.bool({ likelihood: 23 })) {
            query = 'technology';
            channelCode = 'CODING_CHAT';

        } else {
            query = 'philosophy';
            channelCode = 'TALK';
        }

        const results = await this.query(query);
        const newsContent = results.slice(0, 5).map(item => '**' + item.title + '**' + '\n' + item.url).join('\n\n');

        CHANNELS._postToChannelCode(channelCode, newsContent);
    }

}