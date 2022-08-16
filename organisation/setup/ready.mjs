import TemporaryMessages from "../../operations/maintenance/temporaryMessages.mjs";
import AboutHelper from "../../operations/marketing/about/aboutHelper.mjs";
import ElectionHelper from "../../operations/members/hierarchy/election/electionHelper.mjs";
import SacrificeHelper from "../../operations/members/redemption/sacrificeHelper.mjs";
import StockHelper from "../../operations/stock/stockHelper.mjs";

import { SERVER, STATE, USERS, MESSAGES, CHANNELS } from "../coop.mjs";

export default async () => { 
    try {
        console.log(`Logged in as ${STATE.CLIENT.user.username}`); 
        
        // Prepare cache (avoid partials)!
        let reqNum = 0;
        SERVER._coop().channels.cache.each(channel => {
            if (channel.type === 'GUILD_TEXT') {
                setTimeout(() => channel.messages.fetch({ limit: 10 }), 666 * reqNum);
                reqNum++;
            }
        });

        // Check if election is on before preloading/caching campaign messages.
        await ElectionHelper.preloadIfNecessary();

        // Preload all about/options preferences options.
        await AboutHelper.preloadMesssages();

        // Preload 15 intros, should be sufficient for a while.
        await CHANNELS._getCode('INTRO').messages.fetch({ limit: 15 });

        // Preload sacrifice messages
        await SacrificeHelper.preload();

        // TODO
        // Preload egghunt items, crates, dropped items, woodcutting, mining.

        // May be more efficient for now to preload all temporary messages.
        const tempMsgs = await TemporaryMessages.get();
        MESSAGES.preloadMsgLinks(tempMsgs.map(m => m.message_link))

        // Cache the members.
        USERS._all();

    } catch(e) {
        console.error(e);
    }

}
