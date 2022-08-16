import { RAW_EMOJIS } from '../../../../../organisation/config.mjs';

export default class EmojiHelper {

    static rawEmojiToCode(rawEmoji) {
        let itemCode = null;
        
        Object.keys(RAW_EMOJIS).map(rawKey => {
            if (RAW_EMOJIS[rawKey] === rawEmoji) itemCode = rawKey;
        });

        return itemCode;
    }



}