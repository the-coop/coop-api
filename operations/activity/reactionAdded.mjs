import EggHuntMinigame from "../minigames/small/egghunt.mjs";
import CratedropMinigame from "../minigames/small/cratedrop.mjs";

import MiningMinigame from "../minigames/small/mining.mjs";
import WoodcuttingMinigame from "../minigames/small/woodcutting.mjs";
import InstantFurnaceMinigame from "../minigames/small/instantfurnace.mjs";
import EasterMinigame from "../minigames/small/holidays/easter.mjs";


import RedemptionHelper from "../members/redemption/redemptionHelper.mjs";
import SacrificeHelper from "../members/redemption/sacrificeHelper.mjs";
import AboutHelper from "../marketing/about/aboutHelper.mjs";
import ElectionHelper from "../members/hierarchy/election/electionHelper.mjs";

import CleanupHandler from "./messages/cleanupHandler.mjs";
import LinkPreviewFilter from "./messages/linkPreviewFilter.mjs";

import COOP, { USABLE, STATE } from "../../organisation/coop.mjs";
import SuggestionsHelper from "./suggestions/suggestionsHelper.mjs";
import CompetitionHelper from "../social/competitionHelper.mjs";
import TradingHelper from "../minigames/medium/economy/items/tradingHelper.mjs";



export default async function reactAddedHandler(reaction, user) {
    const isUser = !COOP.USERS.isCooper(user.id);

    try {      
        // Approve/promote/sacrifice reaction (vote) handlers.
        SuggestionsHelper.onReaction(reaction, user);
        SacrificeHelper.onReaction(reaction, user);
        RedemptionHelper.onReaction(reaction, user);
        ElectionHelper.onReaction(reaction, user);

        // User settings via about channel
        AboutHelper.onReaction(reaction, user);

        // Competition reactions/abilities.
        CompetitionHelper.onReaction(reaction, user);

        // Check for usable items being exercised.
        USABLE.onReaction(reaction, user);

        // Reaction based minigame react processors.
        EggHuntMinigame.onReaction(reaction, user);
        CratedropMinigame.onReaction(reaction, user);
        MiningMinigame.onReaction(reaction, user);
        WoodcuttingMinigame.onReaction(reaction, user);
        InstantFurnaceMinigame.onReaction(reaction, user);
        EasterMinigame.onReaction(reaction, user);
        TradingHelper.onReaction(reaction, user);

        // Allow elected people to cleanup Cooper messages.
        CleanupHandler.onReaction(reaction, user);

        // Prevent and toggle link previews.
        LinkPreviewFilter.onReaction(reaction, user);

        // Random point spawn.
        if (reaction.emoji.name === 'coop' && isUser) {
            if (STATE.CHANCE.bool({ likelihood: 1 })) {
                setTimeout(() => COOP.ITEMS.drop(reaction.message, 'COOP_POINT'), 2222);
            }
        }

    } catch(e) {
        console.error(e);
    }
}