import dotenv from 'dotenv';
import { Intents, Client } from 'discord.js';

import {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    entersState,
    StreamType,
    AudioPlayerStatus,
    VoiceConnectionStatus,
} from '@discordjs/voice';





import _ from 'lodash';
import Database from './database.mjs';
import COOP, { CHANNELS, CHICKEN, ITEMS, MESSAGES, REACTIONS, ROLES, SERVER, TIME, USERS } from '../coop.mjs';
import { CHANNELS as CHANNELS_CONFIG, RAW_EMOJIS, ITEMS as ITEMS_CONFIG } from '../config.mjs';

// v DEV IMPORT AREA v
import BaseHelper from '../../operations/minigames/medium/conquest/baseHelper.mjs';
import UsersHelper from '../../operations/members/usersHelper.mjs';
import ElectionHelper from '../../operations/members/hierarchy/election/electionHelper.mjs';
import CompetitionHelper, { COMPETITION_DUR } from '../../operations/social/competitionHelper.mjs';
import EventsHelper from '../../operations/eventsHelper.mjs';
import EconomyHelper from '../../operations/minigames/medium/economy/economyHelper.mjs';
import DatabaseHelper from '../../operations/databaseHelper.mjs';
import CratedropMinigame from '../../operations/minigames/small/cratedrop.mjs';
import DropTable from '../../operations/minigames/medium/economy/items/droptable.mjs';
import AdvertsHelper from '../../operations/marketing/adverts/advertsHelper.mjs';

import EmojiHelper from 'coopshared/helper/ui/EmojiHelper.mjs';
// const EmojiHelper = require('coopshared/helper/ui/EmojiHelper.mjs');

import { getAccount } from '../../patching/blockchain/account.mjs';
import transaction from '../../patching/blockchain/transaction.mjs';
// import algosdk from 'algosdk';
import transfer from '../../patching/blockchain/transfer.mjs';
import mint from '../../patching/blockchain/mint.mjs';

// import AlgodLogin, { ALGOD_CLIENT, API_URL, INDEXER_URL } from '../../patching/blockchain/algodclient.mjs';
import optin from '../../patching/blockchain/optin.mjs';
import ActivityHelper from '../../operations/activity/activityHelper.mjs';
import BlogHelper from '../../operations/marketing/blog/blogHelper.mjs';

import EMOJIS from 'coopshared/config/emojis.mjs';
import ServerHelper from '../../operations/serverHelper.mjs';
import SpotlightHelper from '../../operations/members/spotlightHelper.mjs';
import SacrificeHelper from '../../operations/members/redemption/sacrificeHelper.mjs';
import TemporaryMessages from '../../operations/maintenance/temporaryMessages.mjs';
import StockHelper from '../../operations/stock/stockHelper.mjs';
import AboutHelper from '../../operations/marketing/about/aboutHelper.mjs';



// import transaction from '../../patching/blockchain/transaction.mjs';
// import { getAccount } from '../../patching/blockchain/account.mjs';
// ^ DEV IMPORT AREA ^

// Load ENV variables.
dotenv.config();

// Commonly useful.
const listenReactions = (fn) => COOP.STATE.CLIENT.on('messageReactionAdd', fn);
const listenChannelUpdates = (fn) => COOP.STATE.CLIENT.on('channelUpdate', fn);
const listenMessages = (fn) => COOP.STATE.CLIENT.on('messageCreate', fn);

const shallowBot = async () => {
    console.log('Starting shallow bot');

    // Instantiate a CommandoJS "client".
    COOP.STATE.CLIENT = new Client({ 
        owner: '786671654721683517',
        intents: [
            Intents.FLAGS.GUILDS,
            Intents.FLAGS.GUILD_MEMBERS,
            Intents.FLAGS.DIRECT_MESSAGES,
            Intents.FLAGS.DIRECT_MESSAGE_REACTIONS,
            Intents.FLAGS.GUILD_MESSAGES,
            Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
            Intents.FLAGS.GUILD_PRESENCES,
            Intents.FLAGS.GUILD_VOICE_STATES
        ]
    });

    // Connect to Postgres database.
    await Database.connect();

    // Login, then wait for the bot to be fully online before testing.
    await COOP.STATE.CLIENT.login(process.env.DISCORD_TOKEN);
    COOP.STATE.CLIENT.on('ready', async () => {
        console.log('Shallow bot is ready');

        // DEV WORK AND TESTING ON THE LINES BELOW.

        // StockHelper.announce();

        // Intercept hourly to find market open?

        // Ticker of the day (cost gold coin)
        
        // StockHelper.update();

        // AboutHelper.preloadMesssages();

        // console.log(await SacrificeHelper.preload());

        // CHANNELS._hide(CHANNELS.config.ELECTION.id);
        
        // ServerHelper.checkMissingChannels();
        
        // Track whether spotlight should be active.
        
        // Make competitions take more leaders to start

        // Send Poof and Doc test eggs

        // Create a monthly trigger and clear supporter roles on it


        // Create export_nft command
        // Create import_nft functionality

        // const txs = await ITEMS.getTransactions();
        // const txs = await CHICKEN.getTransactionsPreviousDay();
        // const txsText = ActivityHelper.categorisePresentTransactions(txs);

        // console.log('Previous is the txs for previous day.');
        // console.log(txs);
        // console.log(txsText);

        // DEV WORK AND TESTING ON THE LINES ABOVE.
    });
};

shallowBot();