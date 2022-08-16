import { EMOJIS, RAW_EMOJIS } from "../../../organisation/config.mjs";
import { SERVER, CHANNELS, USERS, MESSAGES } from "../../../organisation/coop.mjs";

import AdvertsHelper from "../../marketing/adverts/advertsHelper.mjs";
import BlogHelper from "../../marketing/blog/blogHelper.mjs";
import ProjectsHelper from "../../productivity/projects/projectsHelper.mjs";

import VotingHelper from "../redemption/votingHelper.mjs";


// TODO: Make sure when adding to roadmap, talk, and feed that the votes are displayed to indicate mandate!
export default class SuggestionsHelper {

    static onMessage(msg) {
        // Activate it with Cooper's reactions.
        if (CHANNELS.checkIsByCode(msg.channel.id, 'SUGGESTIONS') && !msg.author.bot)
            this.activateSuggestion(msg);
    }

    // Make sure not to apply to the initial suggestions message lol...
    static onReaction(reaction, user) {
        const msg = reaction.message;    
        if (CHANNELS.checkIsByCode(msg.channel.id, 'SUGGESTIONS') && !user.bot)
            SuggestionsHelper.checkSingle(msg);   
    }

    static async check() {
        // Get last 25 suggestions to check through.
        const suggestionsParts = Array.from(await CHANNELS._getCode('SUGGESTIONS').messages.fetch({ limit: 50 }));
        let processedOne = false;

        // Process latest ONE suggestion.
        suggestionsParts.map((suggestionPart, index) => {
            const suggestion = suggestionPart[1] || null;

            // Prevent invalid suggestions being processed (again?).
            if (!processedOne && suggestion && this.checkSingle(suggestion, index))
                processedOne = true;
        });
    }

    static checkSingle(suggestion, index = 1) {
        // Suggestion may have already been processed and deleted.
        if (!suggestion) return false;

        // Calculate if completed based on time/duration.
        const considerDuration = ((60 * 60) * 72) * 1000;
        let isCompleted = considerDuration + suggestion.createdTimestamp <= Date.now();

        // Calculate the decision of this suggestion based on reaction votes.
        const votes = this.parseVotes(suggestion);

        // Override completion delay if very popular (over 4% voted overwhelmingly and 2x for versus against votes).
        const popularThreshold = VotingHelper.getNumRequired(0.04);
        if (votes.for > popularThreshold + (votes.against * 2))
            isCompleted = true;

        // If this suggestion is completed, attempt to process it.
        if (!isCompleted) return false;

        // Handle the will of the people.
        if (votes.rejected) this.reject(suggestion, votes, index);
        if (votes.passing) this.pass(suggestion, votes, index);
        if (votes.tied) this.tied(suggestion, votes, index);

        // Invalidate votes do not count as a vote processed.
        if (votes.invalid) this.invalidate(suggestion, index);

        // Prevent processing more, one action per iteration is enough.
        if (votes.tied || votes.passing || votes.rejected) 
            return true;

        // Default to assuming failure.
        return false;
    }

    // Post a link in feed and talk to try to break the deadlock.
    static tied(suggestion, votes, index) {
        setTimeout(() => {
            try {
                const link = MESSAGES.link(suggestion);
                const tiedText = `Tied suggestion detected, please break the deadlock: \n\n ${link} \n\n` +
                    `${EMOJIS.POLL_FOR.repeat(votes.for)}${EMOJIS.POLL_AGAINST.repeat(votes.against)}`;
    
                ['TALK', 'FEED'].forEach((channelKey, channelIndex) => {
                    setTimeout(
                        () => CHANNELS._postToChannelCode(channelKey, tiedText), 
                        channelIndex * 666
                    );
                });
            } catch(e) {
                console.log('Tied suggestion handling error');
                console.error(e);
            }
        }, index * 5000);
    }

    static invalidate(suggestion, index) {
        setTimeout(async () => {
            try {
                // If not a cooper message, we know who to notify.
                if (!USERS.isCooperMsg(suggestion)) {
                    const warningText = `Suggestion removed, please use !poll [text] to make suggestions. \n` +
                        `Your suggestion was: ${suggestion.content}`;
                    await USERS.directMSG(SERVER._coop(), suggestion.author.id, warningText);
                }

                // Delete the message with a delay to avoid rate limiting.
                MESSAGES.delayDelete(suggestion, 3333 * index);

            } catch(e) {
                console.log('Error during invalidation of suggestion');
                console.error(e);
            } 
        }, 5555 * index);
    }

    static parseVotes(msg) {
        const votes = {
            for: 0,
            against: 0,
            passing: false,
            rejected: false,
            tied: false,
            invalid: false,
            roadmap: false,
            project: false,
            post_draft: false,
            advert: false
        };

        if (USERS.isCooperMsg(msg)) {
            msg.reactions.cache.map(reaction => {
                if (reaction.emoji.name === EMOJIS.POLL_FOR) votes.for = reaction.count;
                if (reaction.emoji.name === EMOJIS.POLL_AGAINST) votes.against = reaction.count;
                if (reaction.emoji.name === EMOJIS.ROADMAP) votes.roadmap = true;
                if (reaction.emoji.name === EMOJIS.ADVERT) votes.advert = true;
                if (reaction.emoji.name === RAW_EMOJIS.PROJECT) votes.project = true;
                if (reaction.emoji.name === RAW_EMOJIS.POST) votes.post_draft = true;
            });
        } else votes.invalid = true;

        if (!votes.invalid) {
            if (votes.for > votes.against) votes.passing = true;
            if (votes.for < votes.against) votes.rejected = true;
            if (votes.for === votes.against) votes.tied = true;

            // TODO: If not enough people voted in the time limit, default to failure.
            
        }

        return votes;
    }

    static async pass(suggestion, votes, index) {
        setTimeout(() => {
            try {
                // Check if the suggestion is a project creation proposal.
                if (votes.project) 
                    ProjectsHelper.passed(suggestion)

                // Check if the suggestion is a blog post draft creation proposal.
                else if (votes.post_draft) 
                    BlogHelper.passed(suggestion)

                // Check if the suggestion is a blog post draft creation proposal.
                else if (votes.advert) 
                    AdvertsHelper.passed(suggestion)
                    
                else {
                    const passedText = `Suggestion passed, proposal: ${suggestion.content}\n` +
                        `${EMOJIS.POLL_FOR.repeat(votes.for)}${EMOJIS.POLL_AGAINST.repeat(votes.against)}`;
                
                    // Inform the server of passed suggestion.
                    CHANNELS._send('ROADMAP', passedText);
                }

                // Delete the message with a delay to avoid rate limiting.
                MESSAGES.delayDelete(suggestion, 3333 * index);

            } catch(e) {
                console.log('Reject suggestion handling error');
                console.error(e);
            }
        }, index * 5000);
    }

    static async activateSuggestion(suggestionMsg) {
        MESSAGES.delayReact(suggestionMsg, EMOJIS.POLL_FOR, 333);
        MESSAGES.delayReact(suggestionMsg, EMOJIS.POLL_AGAINST, 666);
    }

    static async reject(suggestion, votes, index) {
        setTimeout(() => {
            try {
                
                const rejectedText = `Suggestion rejected, proposal: ${suggestion.content}\n` +
                    `${EMOJIS.POLL_FOR.repeat(votes.for)}${EMOJIS.POLL_AGAINST.repeat(votes.against)}`;
                
                // Inform the server of rejected suggestion.
                ['TALK', 'FEED'].forEach((channelKey, channelIndex) => {
                    setTimeout(
                        () => CHANNELS._postToChannelCode(channelKey, rejectedText), 
                        channelIndex * 666
                    );
                });

                // Delete the message with a delay to avoid rate limiting.
                MESSAGES.delayDelete(suggestion, 3333 * index);
            } catch(e) {
                console.log('Reject suggestion handling error');
                console.error(e);
            }
        }, index * 5000);
    }

    // static async onReaction() {
    //     // console.log('Suggestion reaction');
    // }

    // static async onAdd() {
    //     // Validate a suggestion when it is originally added, part of house cleaning.   
    // }

}
