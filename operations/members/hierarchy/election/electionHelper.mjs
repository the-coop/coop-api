import moment from 'moment';

import Chicken from "../../../chicken.mjs";

import { CHANNELS, SERVER, MESSAGES, ROLES, USERS, ITEMS, TIME, STATE } from '../../../../organisation/coop.mjs';

import DatabaseHelper from '../../../databaseHelper.mjs';
import Database from '../../../../organisation/setup/database.mjs';
import VotingHelper from '../../../activity/redemption/votingHelper.mjs';
import EventsHelper from '../../../eventsHelper.mjs';

import { baseTickDur } from '../../../manifest.mjs';


export const LEADERS_RATIO_PERC = .025;


export default class ElectionHelper {

    // Duration of election voting
    static VOTING_DUR_SECS = (3600 * 24) * 7;

    // Allow for a week of voting before reset.
    static TERM_DUR_SECS = ((3600 * 24) * 30) + this.VOTING_DUR_SECS;

    static async addVote(userID, candidateID) {
        const query = {
            name: "add-vote",
            text: `INSERT INTO election_votes(candidate_id, voter_id, time)
                VALUES($1, $2, $3)`,
            values: [candidateID, userID, (parseInt(Date.now() / 1000))]
        };
        
        const result = await Database.query(query);
        return result;
    }
    
    static async clearVotes() {
        const query = {
            name: "delete-votes",
            text: `DELETE FROM election_votes`
        };
        
        const result = await Database.query(query);
        return result;
    }

    static async clearElection() {
        // vv same as below but for votes.
        await this.clearVotes();
        await this.clearCandidates();
    }

    static async clearCandidates() {
        const candidates = await this.getAllCandidates();
        
        // Bulk delete may be better here.
        // Ensure all messages deleted, use bulk delete won't be outside of 14 days

        // TODO: Could create as temp messages so this is unnecessary?
        // Or offer as double feature.

        candidates.map((candidate, index) => setTimeout(() => 
            MESSAGES.deleteByLink(candidate.campaign_msg_link), 1500 * index));

        // Clear database
        const query = {
            name: "delete-candidates",
            text: `DELETE FROM candidates`
        };
        const result = await Database.query(query);
        return result;
    }

    static async votingPeriodLeftSecs() {
        let leftSecs = 0;

        const isVotingPeriod = await this.isVotingPeriod();
        if (isVotingPeriod) {
            const endOfVoting = (await this.lastElecSecs()) + this.VOTING_DUR_SECS;
            const diff = endOfVoting - parseInt(Date.now() / 1000);
            if (diff > 0) leftSecs = diff;
        }

        return leftSecs;
    }
    
    // Calculate if current moment in seconds is a voting period.
    static async isVotingPeriod() {
        // Declare the variable for voting period calculation.
        let isVotingOn = false;

        try {
            // Calculate current seconds.
            const nowSecs = parseInt(Date.now() / 1000);

            // Load election data required for calculating election start.
            const isElectionOn = await this.isElectionOn();
            const lastElectionSecs = await this.lastElecSecs();

            // Check if current moment is earlier than the end of voting.
            if (isElectionOn && nowSecs < lastElectionSecs + this.VOTING_DUR_SECS)
                isVotingOn = true;
                
            // If election isn't running, check if next election period due.
            if (!isElectionOn && nowSecs > lastElectionSecs + this.TERM_DUR_SECS) 
                isVotingOn = true;

            // Provide calculation for whether current moment in seconds is a voting period.
            return isVotingOn;

        } catch(e) {
            console.log('Voting period check failure.')
            console.error(e);

            // Don't start any elections if this is throwing errors, lol.
            return false;
        }
    }

    // Setup the intervals needed for detection.
    static setupIntervals() {
        // Processes announcements and election events.
        EventsHelper.runInterval(() => this.checkProgress(), baseTickDur);

        // Ensure leadership and commander based on items so they are treated seriously.
        EventsHelper.runInterval(() => this.ensureItemSeriousness(), baseTickDur * 3);

        // Ensure leadership and commander based on items so they are treated seriously.
        EventsHelper.runInterval(() => this.trackHierarchy(), baseTickDur * 5);
    }


    static async startElection() {
        try {
            // Turn election on and set latest election to now! :D
            Chicken.setConfig('election_on', 'true');
            Chicken.setConfig('last_election', parseInt(Date.now() / 1000));
            
            // Update the election message
            const readableElecLeft = TIME.humaniseSecs((await this.votingPeriodLeftSecs()));
            const startElecText = `The election is currently ongoing! Time remaining: ${readableElecLeft}`;
            this.editElectionInfoMsg(startElecText);

            // Inform all members so they can fairly stand.
            const electionText = `our latest ${CHANNELS.textRef('ELECTION')} is running, all members are welcome to stand or vote for their preferred commander and leaders. \n` +
                `For further information on our elections refer to our forth amendment in ${CHANNELS.textRef('ABOUT')}\n\n` +
                `To stand for election, use the /stand (slash command). \n\n` +
                `Time remaining: ${readableElecLeft}.`;

            CHANNELS._postToFeed(`@everyone, ${electionText}`);

            // Indicate successful start.
            return true;

        } catch(e) {
            console.log('Starting the election failed... :\'(');
            console.error(e);
        }
    }

    static getMaxNumLeaders() {
        return VotingHelper.getNumRequired(LEADERS_RATIO_PERC);
    }

    // Provide updates and functionality for an ongoing election.
    static async commentateElectionProgress(postUpdate = true) {
        // Check time since last election commentation message (prevent spam).
        const lastElecMsgSecs = parseInt(await Chicken.getConfigVal('last_elecupdatemsg_secs'));
        const nowSecs = TIME._secs();
        const diff = nowSecs - lastElecMsgSecs;
        const hourSecs = 3600;

        // Defaul to a 3 hourSecs gap between election messages.
        let bufferSecs = (hourSecs * 6);

        // If election end approaching use quicker interval:
        if (diff < hourSecs * 10)
        // (within 10 hourSecss should count every 2 hourSecss)
            bufferSecs = hourSecs * 2;
        else if (diff < hourSecs * 8)
            // (within 8 hourSecss should count every 1 hourSecss)
            bufferSecs = hourSecs * 1;
        else if (diff < hourSecs * 4)
            // (within 4 hourSecss should count every 0.5 hourSecss)
            bufferSecs = hourSecs * 0.5;
        
        // Prevent the message version based on dynamic freshnesh.
        const fresh = nowSecs < lastElecMsgSecs + bufferSecs;

        if (fresh && postUpdate) return false;

        // Note: Votes aren't saved in the database... we rely solely on Discord counts.
        const votes = await this.fetchAllVotes();

        const votingPeriodSecs = await this.votingPeriodLeftSecs();
        const readableElecLeft = TIME.humaniseSecs(votingPeriodSecs);

        const hierarchy = this.calcHierarchy(votes);
        const maxNumLeaders = this.getMaxNumLeaders();
        const numLeaders = hierarchy.leaders.length;

        const electionProgressText = `**Election is still running for ${readableElecLeft}, latest vote results:**` +
            `\n\n` +
            `**Commander:** ${hierarchy.commander ? 
                `${hierarchy.commander.username} (${hierarchy.commander.votes} Votes)` : ''}` +
            `\n\n` +
            `**Leaders ${numLeaders}/${maxNumLeaders}:**\n${
                hierarchy.leaders
                    .map(leader => `${leader.username} (${leader.votes} Votes)`)
                    .join('\n')
            }` +
            `\n\n`;
        
        // Ensure Cooper knows when the last time this was updated (sent).
        Chicken.setConfig('last_elecupdatemsg_secs', TIME._secs());

        // Inform the community and update records.
        await this.editElectionInfoMsg(electionProgressText);
        
        // Post an update if chosen.
        if (postUpdate)
            CHANNELS._codes(['FEED', 'TALK', 'ACTIONS'], electionProgressText);
    }

    static async endElection() {
        console.log('Ending the election.')
        try {
            const votes = await this.fetchAllVotes();
            const hierarchy = this.calcHierarchy(votes);
           
            // Remove previous hierarchy from the database.
            await this.resetHierarchyData();

            // Remove roles from previous hierarchy.
            await this.resetHierarchyRoles(hierarchy);

            // Add roles to winning commander.
            if (hierarchy.commander)
                ROLES._add(hierarchy.commander.id, 'COMMANDER');

            // Add role to winning leaders.
            Promise.all(hierarchy.leaders.map(async (leader, index) => {
                await new Promise(r => setTimeout(r, 333 * index));
                return await ROLES._add(leader.id, 'LEADER');
            }));

            // Cleanup database records fresh for next run.
            await this.clearElection();

            // Set Cooper's config election_on to 'false' so he does not think election is ongoing.
            await Chicken.setConfig('election_on', 'false');

            const nextElecFmt = await this.nextElecFmt();

            // Announce the winners!
            const declareText = `**Latest <#${CHANNELS.config.ELECTION.id}> ends with these results!**\n\n` +

                `**New ${ROLES._textRef('COMMANDER')}:**\n${hierarchy.commander ? 
                    hierarchy.commander.username : 'None elected.' }\n\n` +

                `**New ${ROLES._textRef('LEADER')}:** \n` +
                    `${hierarchy.leaders.map(leader => `${leader.username} (${leader.votes} Votes)`).join('\n')}\n\n` +

                `**Next Election:** ${nextElecFmt}.`;
            
            CHANNELS._postToFeed(declareText);
            await this.editElectionInfoMsg(declareText);

            // Handle election items.
            await this.resetHierarchyItems(hierarchy);

            // Add the election crown to elected commander.
            if (hierarchy.commander)
                ITEMS.add(hierarchy.commander.id, 'ELECTION_CROWN', 1, 'Election victory (commander)');

            // Add the leader swords to elected leaders
            hierarchy.leaders.map(leader => 
                ITEMS.add(leader.id, 'LEADERS_SWORD', 1, 'Election victory (leader)')
            );

        } catch(e) {
            console.log('Something went wrong ending the election...');
            console.error(e);
        }
    }

    static async resetHierarchyData() {
        return Database.query("DELETE FROM hierarchy");
    }

    static async resetHierarchyRoles(hierarchy) {
        try {
            const exCommander = ROLES._getUsersWithRoleCodes(['COMMANDER']).first();
            const exLeaders = ROLES._getUsersWithRoleCodes(['LEADER']);
            
            // Remove the former leader roles.
            let index = 0;
            Promise.all(exLeaders.map(async (exLeader) => {
                index++;

                // Check ex leader is not re-elected.
                let leaderReElected = false;
                hierarchy.leaders.map(l => {
                    if (l.id === exLeader.user.id)
                        leaderReElected = true;
                });
                // If it isn't a relected leader, remove role.
                if (!leaderReElected) {
                    await new Promise(r => setTimeout(r, 444 * index));
                    await ROLES._remove(exLeader.user.id, 'LEADER');
                }
                return true;
            }));

            // Only check if there is a new and old commander.
            if (hierarchy.commander && exCommander) {
                // Check if Commander is re-elected
                if (exCommander.user.id !== hierarchy.commander.id) {
                    // Remove the former commander role.
                    await ROLES._remove(exCommander.user.id, 'COMMANDER');
            
                    // Add former commander to ex commander!
                    if (!ROLES._has(exCommander, 'FORMER_COMMANDER')) {
                        CHANNELS._postToFeed(`${exCommander.user.username} is recognised as a former commander and allowed access into the former commanders' secret channel!`);
                        await ROLES._add(exCommander.user.id, 'FORMER_COMMANDER');
        
                        // Update last served data for the former commander.
                        // last_served
                    }
                } else {
                    CHANNELS._postToFeed(`${exCommander.user.username} is re-elected as Commander for another term!`);
                }
            }

            return true;

        } catch(e) {
            console.log('Error resetting hierarchy roles.');
            console.error(e);
        }
    }

    static async resetHierarchyItems(hierarchy) {
        try {
            // Load hierarchy of users (role-based hierarchy).
            const leaderItems = await ITEMS.getUsersWithItem('LEADERS_SWORD');
            const commanderItems = await ITEMS.getUsersWithItem('ELECTION_CROWN');        

            // Remove all of the swords from the old leaders.            
            leaderItems.map(async exLeader => {
                // Check ex leader is not re-elected.
                let leaderReElected = false;
                hierarchy.leaders.map(l => {
                    if (l.id === exLeader.owner_id)
                        leaderReElected = true;
                });
                
                // If it isn't a relected leader, remove role.
                if (!leaderReElected)
                    ITEMS.subtract(exLeader.owner_id, 'LEADERS_SWORD', 1, 'Election reset');
            });

            // Remove commander crown if not re-elected.
            if (typeof commanderItems[0] !== 'undefined' && hierarchy.commander) {
                const exCommanderID = commanderItems[0].owner_id;
                if (exCommanderID !== hierarchy.commander.id) {
                    ITEMS.subtract(commanderItems[0].owner_id, 'ELECTION_CROWN', 1, 'Election reset');
                }
            }

        } catch(e) {
            console.log('Error resetting hierarchy items');
            console.error(e);
        }
    }

    static async ensureItemSeriousness() {
        try {
            // Load hierarchy on basis of items.
            const leaderItems = await ITEMS.getUsersWithItem('LEADERS_SWORD');
            const commanderItem = await ITEMS.getUserWithItem('ELECTION_CROWN');
            const swordOwners = leaderItems.map(item => item.owner_id);

            // Load users by roles for comparison/checking.
            const roleHierarchy = this._roleHierarchy();

            // Any leader who has role but not leaders_sword -> role removed.
            roleHierarchy.leaders.map(leader => {
                // Check each role item for existence in leader items ownership data.
                if (!swordOwners.includes(leader.user.id) && ROLES._has(leader, 'LEADER'))
                    ROLES._remove(leader.user.id, 'LEADER');
            });

            // Any commander who has role but not election_crown -> role removed.
            if (roleHierarchy.commander && commanderItem) {
                const isUsurper = commanderItem.owner_id !== roleHierarchy.commander.user.id;
                if (isUsurper && ROLES._has(roleHierarchy.commander, 'COMMANDER'))
                    ROLES._remove(roleHierarchy.commander.user.id, 'COMMANDER');
            }
        
            // Get leaders by loading members via IDs
            const rightfulLeaders = USERS._filter(user => swordOwners.includes(user.id));

            // Any leader who has leaders_sword but not role -> leaders_sword added.
            rightfulLeaders.map(leader => {
                if (!ROLES._has(leader, 'LEADER'))
                    ROLES._add(leader.user.id, 'LEADER');
            });

            // Any commander who has election_crown but not role -> election_crown added.
            if (commanderItem) {
                const rightfulCommander = USERS._get(commanderItem.owner_id);
                if (!ROLES._has(rightfulCommander, 'COMMANDER'))
                    ROLES._add(rightfulCommander.user.id, 'COMMANDER');
            }

        } catch(e) {
            console.log('Error ensuring item seriousness.');
            console.error(e);
        }
    }

    static async checkProgress() {
        // A variable used for tracking election before/after (start).
        let electionJustStarted = false;
        
        try {
            // Load the current state of election from database.
            const isElecOn = await this.isElectionOn();
            const isVotingPeriod = await this.isVotingPeriod();

            // Election needs to be started?
            if (isVotingPeriod && !isElecOn) {
                await this.startElection();
                electionJustStarted = true;
            }
            
            // Code to only run until after the first time after election start, not before.
            if (!electionJustStarted) {
                // Commentate election and detect conclusion of.
                if (isElecOn) {
                    // Election needs to be declared?
                    if (!isVotingPeriod && isElecOn) 
                        await this.endElection();
            
                    // Update election progress but only send feed update message sometimes
                    const tenPercentRoll = STATE.CHANCE.bool({ likelihood: 2.5 });
                    if (isVotingPeriod && isElecOn)
                        await this.commentateElectionProgress(tenPercentRoll);
                }
                
                // If election isn't running (sometimes) update about next election secs.
                if (!isElecOn) 
                    await this.countdownFeedback();
            }

        } catch(e) {
            console.log('SOMETHING WENT WRONG WITH CHECKING ELECTION!');
            console.error(e);
        }
    }

    static async getElectionMsg() {
        const electionInfoMsgLink = await Chicken.getConfigVal('election_message_link');
        const msgData = MESSAGES.parselink(electionInfoMsgLink);   
        const channel = CHANNELS._get(msgData.channel);
        const msg = await channel.messages.fetch(msgData.message);
        return msg;
    }

    static async editElectionInfoMsg(text) {
        const msg = await this.getElectionMsg();
        const editedMsg = await msg.edit(text);
        return editedMsg;
    }

    static async getVoteByVoterID(voterID) {
        const query = {
            name: "get-voter",
            text: `SELECT * FROM election_votes WHERE voter_id = $1`,
            values: [voterID]
        };
        
        const result = await Database.query(query);
        const voter = DatabaseHelper.single(result);

        return voter;
    }

    // Check if this reaction applies to elections.
    static async onReaction(reaction, user) {
        // Check if occurred in election channel
        if (reaction.message.channel.id !== CHANNELS.config.ELECTION.id) return false;

        // Ignore Cooper's prompt emoji.
        if (USERS.isCooper(user.id)) return false;

        // Check if reaction is crown (indicates vote)
        if (reaction.emoji.name !== '👑') return false;

        // Prevent PROSPECTS from electing people.
        if (ROLES._idHasCode(user.id, 'PROSPECT')) {
            reaction.users.remove(user.id);
            return MESSAGES.selfDestruct(reaction.message, `${user.username} you can't vote as a PROSPECT. :dagger:`);
        }

        try {
            // Check if reaction message is a campaign message and get author.
            const msgLink = MESSAGES.link(reaction.message);
            const candidate = await this.getCandByMsgLink(msgLink); 

            // If is candidate message and identified, allow them the vote.
            if (candidate) {
                // Check if already voted
                const vote = await this.getVoteByVoterID(user.id);
                const candidateUser = (await USERS._fetch(candidate.candidate_id)).user;

                // Add vote to database
                await this.addVote(user.id, candidate.candidate_id);

                // Announce and update.
                await this.commentateElectionProgress(false);
                
                // Disabled vote limits, but use it to prevent feedback spam.
                if (!vote) {
                    // Acknowledge vote in feed.
                    CHANNELS._postToFeed(`${user.username} cast their vote for ${candidateUser.username}!`);
                }
            }
        } catch(e) {
            console.log('Could not process election vote.');
            console.error(e);
        }
    }

    static calcHierarchy(votes) {
        const commander = votes[0];
        const numLeaders = this.getMaxNumLeaders();
        const leaders = votes.slice(1, numLeaders + 1);

        const hierarchy = { commander, leaders, numLeaders };

        return hierarchy;
    }

    static async loadAllCampaigns() {
        const candidates = await this.getAllCandidates();
        let preloadMsgIDSets = await Promise.all(candidates.map(async candidate => {
            const userStillExists = !!(await USERS.loadSingle(candidate.candidate_id))

            // Attempt to clear up if they have left etc.
            if (!userStillExists) {
                Database.query({ text: `DELETE FROM candidates WHERE campaign_msg_link = '${candidate.campaign_msg_link}'` });
                MESSAGES.deleteByLink(candidate.campaign_msg_link);
                return false;
            }

            // Return formatted.
            return MESSAGES.parselink(candidate.campaign_msg_link);
        }));

        // Filter out the potentially expired(kicked/left/banned user) IDs.
        preloadMsgIDSets = preloadMsgIDSets.filter(idSet => !!idSet);

        // Preload each candidate message.
        let campaigns = await Promise.allSettled(preloadMsgIDSets.map((idSet, index) => {
            const guild = SERVER._coop();
            return new Promise((resolve) => {
                setTimeout(async () => {
                    try {
                        // This could be more efficient.
                        const chan = guild.channels.cache.get(idSet.channel);
                        if (chan) {
                            const msg = await chan.messages.fetch(idSet.message);
                            if (msg) resolve(msg);
                        }
                    } catch(e) {
                        console.log('Error loading campaign message');
                        console.log(idSet);
                    }
                }, 666 * index);
            });
        }));

        // take only the fulfilled ones, let the rest keep failing until they're cleaned up.
        campaigns = campaigns
            .filter(campaign => campaign.status === 'fulfilled')
            .map(campaign => campaign.value);

        return campaigns;
    }

    static async getCandByMsgLink(msgLink) {
        const query = {
            name: "get-candidate-by-msg",
            text: `SELECT * FROM candidates WHERE campaign_msg_link = $1`,
            values: [msgLink]
        };

        return await DatabaseHelper.singleQuery(query);
    }

    // TODO: could use this feature/data to direct message the candidates an update
    static async fetchAllVotes() {
        const votes = [];

        // Calculate votes and map author data.
        const campaignMsgs = await this.loadAllCampaigns();
        await Promise.all(campaignMsgs.map(async campaignMsg => {
            // Find the candidate for these reactions.
            let candidate = null;
            const embed = campaignMsg.embeds[0] || null;

            if (embed) {
                // eslint-disable-next-line
                const idMatches = embed.description.match(/\<@(\d+)\>/gms);
                
                let embedUserID = idMatches[0];

                embedUserID = embedUserID.replace('<@', '');
                embedUserID = embedUserID.replace('>', '');
                if (embedUserID) candidate = await USERS._fetch(embedUserID);
            }

            // Add to the overall data.
            if (candidate) {
                votes.push({
                    username: candidate.user.username,
                    id: candidate.id,
                    // Count all crown reactions.
                    votes: campaignMsg.reactions.cache.reduce((acc, reaction) => {
                        if (reaction.emoji.name === '👑') 
                            return acc += (reaction.count - 1);
                        else 
                            return acc;
                    }, 0)
                });
            }
        }));
        
        // Sort votes by most voted for candidate.
        votes.sort((a, b) => {
            if (a.votes < b.votes) return 1;
            if (a.votes > b.votes) return -1;
            return 0;
        });

        return votes;
    }

    static async getCandidate(userID) {
        const query = {
            name: "get-candidate",
            text: `SELECT * FROM candidates WHERE candidate_id = $1`,
            values: [userID]
        };
        
        const candidate = await DatabaseHelper.singleQuery(query);

        return candidate;
    }


    // Preload campaign messages into cache so they are always reactable.
    static async preloadIfNecessary() {
        const isElectionOn = await this.isVotingPeriod();
        if (isElectionOn) {
            await this.loadAllCampaigns();
            console.warn('Cached election candidates.');
        }
    }

    static async addCandidate(userID, msgLink) {
        const query = {
            name: "add-candidate",
            text: `INSERT INTO candidates(campaign_msg_link, candidate_id)
                VALUES($1, $2)`,
            values: [msgLink, userID]
        };
        
        const result = await Database.query(query);
        return result;
    }

    static async getAllCandidates() {
        const query = {
            name: "get-all-candidates",
            text: `SELECT * FROM candidates`
        };
        
        let candidates = null;
        const result = await Database.query(query);
        if (result.rows) candidates = result.rows;

        return candidates;
    }

    static async lastElecSecs() {
        const lastElecSecsVal = await Chicken.getConfigVal('last_election');
        const lastElecSecs = parseInt(lastElecSecsVal);
        return lastElecSecs;        
    }

    static async lastElecFmt() {
        const lastElecSecs = await this.lastElecSecs();
        const lastElecMoment = moment.unix(lastElecSecs);
        return lastElecMoment.format('dddd, MMMM Do YYYY, h:mm:ss a');
    }

    static async nextElecFmt() {
        const nextElecSecs = await this.nextElecSecs();
        const nextElecMoment = moment.unix(nextElecSecs);
        
        return nextElecMoment.format('dddd, MMMM Do YYYY, h:mm:ss a');
    }

    static async nextElecSecs() {
        const lastElecSecs = await this.lastElecSecs();
        const nextElecSecs = lastElecSecs + this.TERM_DUR_SECS;
        return nextElecSecs;
    }

    // This is only active from next election interval moment to a week after that
    static async isElectionOn() {
        const electionOnVal = await Chicken.getConfigVal('election_on');
        return electionOnVal === 'true';
    }

    static async isElectionTime() {
        const lastElecSecs = await this.lastElecSecs();
        const nextElecSecs = await this.nextElecSecs();
        const nextDeclareSecs = lastElecSecs + this.TERM_DUR_SECS + this.VOTING_DUR_SECS;

        const nowSecs = parseInt(Date.now() / 1000);

        if (nowSecs >= nextElecSecs && nowSecs <= nextDeclareSecs) return true;

        return false;
    }

    static _roleHierarchy() {
        const hierarchy = {
            commander: ROLES._getUserWithCode('COMMANDER'),
            leaders: ROLES._getUsersWithRoleCodes(['LEADER']),
            motw: ROLES._getUserWithCode('MEMBEROFWEEK')
        };
        return hierarchy;
    }

    static async humanRemainingNext() {
        const diff = await this.nextElecSecs() - parseInt(Date.now() / 1000)
        const humanRemaining = TIME.humaniseSecs(diff);
        return humanRemaining;
    }

    static async countdownFeedback() {
        const elecMsg = await this.getElectionMsg();
        const diff = parseInt(Date.now()) - elecMsg.editedTimestamp;
        const hour = 3600;

        if (diff > hour * 4) {
            const humanRemaining = await this.humanRemainingNext();
            const nextElecReadable = await this.nextElecFmt();

            const hierarchy = this._roleHierarchy();
            const commander = hierarchy?.commander?.user || null;

            await this.editElectionInfoMsg(
                `**Election is over, here are your current officials:** \n\n` +
                ( !commander && hierarchy.leaders.size === 0 ?
                    '_No hierarchy currently exists until the next election..._\n\n'
                    :
                    (
                        ( 
                            commander ?
                                `**${ROLES._textRef('COMMANDER')}:**\n${commander.username} :crown: \n\n`
                                :
                                ''
                        ) 
                        +
                        ( 
                            hierarchy.leaders.length ?
                                `**${ROLES._textRef('LEADER')}:**\n` +
                                    `${hierarchy.leaders.map(leader => `${leader.user.username} :crossed_swords:`).join('\n')}\n\n`
                                    :
                                    ''
                        )
                    )
                )
                +
                `**Next Election:** ${nextElecReadable} (${humanRemaining})`
            );
        }

        // TODO: Post the occassional reminder too...
    }

    static async loadHierarchy() {
        const hierarchy = {
            commander: await this.loadHierarchySingleType('COMMANDER') || null,
            leaders: await this.loadHierarchyEntitiesByType('LEADER') || [],
            motw: await this.loadHierarchySingleType('MEMBEROFWEEK') || null
        }
        return hierarchy;
    }

    static loadHierarchySingleType(type) {
        return DatabaseHelper.singleQuery({
            text: "SELECT * FROM hierarchy WHERE type = $1",
            values: [type]
        });
    }

    static loadHierarchyEntitiesByType(type) {
        return DatabaseHelper.manyQuery({
            text: "SELECT * FROM hierarchy WHERE type = $1",
            values: [type]
        });
    }

    static removeIDFromTrackedHierarchy(userID) {
        return Database.query({ 
            text: "DELETE FROM hierarchy WHERE discord_id = $1",
            values: [userID] 
        })
    }

    static trackHierarchicalEntity(userID, username, avatar, type) {
        const image = USERS.avatar({ id: userID, avatar });
        return Database.query({ 
            text: "INSERT INTO hierarchy(discord_id, username, image, type) VALUES ($1, $2, $3, $4)",
            values: [userID, username, image, type]
        });
    }

    static async trackHierarchy() {
        const savedHierarchy = await this.loadHierarchy();
        const roleHierarchy = this._roleHierarchy();

        // Check if saved commander lost role.
        if (savedHierarchy.commander) {
            const prevCommanderID = savedHierarchy.commander.discord_id;
            const isPrevCommanderStill = ROLES._idHasCode(prevCommanderID, 'COMMANDER');
            
            // Remove stale commander from tracking.
            if (!isPrevCommanderStill)
                this.removeIDFromTrackedHierarchy(prevCommanderID);
        
        // There wasn't a tracked commander, has this changed?
        } else {
            if (roleHierarchy.commander) {
                const commander = roleHierarchy.commander.user;
                this.trackHierarchicalEntity(commander.id, commander.username, commander.avatar, 'COMMANDER');
            }
        }

        // Check if saved leaders are still leaders.
        savedHierarchy.leaders.map(savedLeader => {
            if (!ROLES._idHasCode(savedLeader.discord_id, 'LEADER')) {

                // Remove from the hierarchy.
                this.removeIDFromTrackedHierarchy(savedLeader.discord_id);
            }
        });

        // Check if role based leaders need to be tracked.
        roleHierarchy.leaders.map(roleLeader => {
            let untracked = true;
            savedHierarchy.leaders.map(savedLeader => {
                if (roleLeader.user.id === savedLeader.discord_id)
                    untracked = false;
            });

            if (untracked)
                this.trackHierarchicalEntity(
                    roleLeader.user.id, 
                    roleLeader.user.username, 
                    roleLeader.user.avatar,
                    'LEADER'
                );
        });

        // Check if saved MOTW lost role.
        if (savedHierarchy.motw) {
            const prevMOTWID = savedHierarchy.motw.discord_id;
            const isMOTWStill = ROLES._idHasCode(prevMOTWID, 'MEMBEROFWEEK');
            
            // Remove stale MOTW from tracking.
            if (!isMOTWStill)
                this.removeIDFromTrackedHierarchy(prevMOTWID);
        
        // There wasn't a tracked MOTW, has this changed?
        } else {
            if (roleHierarchy.motw) {
                const motw = roleHierarchy.motw.user;
                this.trackHierarchicalEntity(motw.id, motw.username, motw.avatar, 'MEMBEROFWEEK');
            }
        }
    }
}
