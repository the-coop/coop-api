import { CHANNELS, ROLES, TIME } from "../../../organisation/coop.mjs";
import SacrificeHelper from "./sacrificeHelper.mjs";

export default class ProspectHelper {

    static async randomReady() {
        try {
            // Recurring event for testing prospects.
            const prospects = ROLES._getUsersWithRoleCodes(['PROSPECT']);

            const secsNow = TIME._secs();
            const daySecs = (60 * 60) * 24;
            const prospectCandidates = prospects.map(p => {
                const secsJoined = (p.joinedTimestamp / 1000)
                const stayDur = secsNow - secsJoined;
                const cutReady = stayDur >= daySecs * 14;
                return {
                    user: p.user,
                    joined: secsJoined,
                    duration: stayDur,
                    ready: cutReady
                };
            });

            // Select only the ready ones.
            const readyProspects = Array.from(prospectCandidates.filter(p => p.ready));
            if (readyProspects.length === 0)
                // Offer subliminal hint that there are no prospects ready at all.
                return CHANNELS._tempSend('TALK', 'Recruit?', 333, 4444);

            // Sort the ready prospects by tenure.
            readyProspects.sort((a, b) => a.duration < b.duration ? -1 : 1);
            
            // Select the longest tenure prospect who is ready and offer rite of passage.
            await SacrificeHelper.offer(readyProspects[0].user);

        } catch(e) {
            console.log('Error sacrificing random ready prospect member!');
            console.error(e);
        }
    }

}