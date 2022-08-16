import MessageNotifications from "./information/messageNotifications.mjs";

import introPostedHandler from "./welcome/introPosted.mjs";

// import MessageSpamHelper from "./messages/messageSpamHelper.mjs";
// import LinkPreviewFilter from "./messages/linkPreviewFilter.mjs";
import ConfessionHandler from "./messages/confessionHandler.mjs";
import MiscMessageHandlers from "./messages/miscMessageHandlers.mjs";

import SuggestionsHelper from "./suggestions/suggestionsHelper.mjs";
import SubscriptionHelper from "../marketing/newsletter/subscriptionHelper.mjs";
import CompetitionHelper from "../social/competitionHelper.mjs";


export default async function messageAddedHandler(msg) {  
    // Block Cooper from all he shouldn't be involved with.
    // Try to optimise channel specific ones/guard orders.

    try {
        // Encourage intro posts with a wave and coop emoji
        introPostedHandler(msg);
    
        // Check if suggestion needs handling.
        SuggestionsHelper.onMessage(msg);
    
        // Add to message notification tracking for keeping people updated on where things are said.
        MessageNotifications.add(msg);
    
        // Handle reports to leaders.
        ConfessionHandler.onMessage(msg);
        
        // Add newsletter subscription handler/email accepter.
        SubscriptionHelper.onMessage(msg);
    
        // Miscelleanous jokes and responses.
        MiscMessageHandlers.onMessage(msg);
    
        // Suppress previews from links but add toggle react.
        // LinkPreviewFilter.onMessage(msg);
    
        // Handle spammy messages from Commandojs and other sources.
        // MessageSpamHelper.onMessage(msg);
    
        // Handle competition related messages.
        CompetitionHelper.onMessage(msg);

    } catch(e) {
        console.log('Error handling added message.');
        console.error(e);
    }
}