import announcementOpts from "./announceOpts.mjs";
import communityOpts from "./communityOpts.mjs";
import gameOpts from "./gameOpts.mjs";

import { CHANNELS as CHANNELS_CONFIG, KEY_MESSAGES } from '../../../organisation/config.mjs';
import COOP, { CHICKEN, CHANNELS } from "../../../organisation/coop.mjs";

export default class AboutHelper {

    // Refactor to a reduce.
    static getEmojiHandler(emoji) {
        return Object.keys(this.sectionEmojis).reduce((acc, section) => {
            const methods = this.sectionEmojis[section];
            if (typeof methods[emoji] === 'function') return acc = methods[emoji];
            return acc;
        }, null);
    }
    
    static sectionEmojis = {
        ANNOUNCEMENTS: {
            '📢': announcementOpts.announcementSubToggle,
            '📰': announcementOpts.newsletterToggle, // unfinished
            '☠️': announcementOpts.privacyBomb,
        },
        FOCUS: {
            '💬': (r, user) => COOP.ROLES.toggle(user.id, 'SOCIAL'),
            '💻': (react, user) => COOP.ROLES.toggle(user.id, 'CODE'),
            '💼': (react, user) => COOP.ROLES.toggle(user.id, 'BUSINESS'),
            '🖌️': (react, user) => COOP.ROLES.toggle(user.id, 'ART')
        },
        GAMES: {
            '🎮': (react, user) => COOP.ROLES.toggle(user.id, 'GAMING'),
            '🗡': gameOpts.conquestToggle,
            '📉': gameOpts.logsToggle,
        },
        COMMUNITY: {
            '🧵': communityOpts.miscToggle, // Done
            '👷': communityOpts.projectsToggle // Done
        },
        ACADEMY_AGENCY: {
            '🏢': (react, user) => COOP.ROLES.toggle(user.id, 'AGENCY'),
            '📝': (react, user) => COOP.ROLES.toggle(user.id, 'ACADEMY')
        },
        GUIDE: {
            '📖': (react, user) => COOP.ROLES.toggle(user.id, 'GUIDE'),
        },
        BONUS_EGGS: {
            '🥚': (react, user) => {
                COOP.ROLES.toggle(user.id, 'BONUS_EGGS_PING');
            }
        },
        TREE_FELL: {
            '🪓': (react, user) => {
                COOP.ROLES.toggle(user.id, 'TREE_FELL_PING');
            }
        },
        ROCK_SLIDE: {
            '⛏️': (react, user) => {
                COOP.ROLES.toggle(user.id, 'ROCK_SLIDE_PING');
            }
        },
        INTRO_POSTED: {
            '👋': (react, user) => {
                COOP.ROLES.toggle(user.id, 'INTRO_POSTED_PING');
            }
        },
        CRATEDROP: {
            'average_crate_open': (react, user) => {
                COOP.ROLES.toggle(user.id, 'CRATEDROP_PING');
            }
        },
        MARKET_OPEN_PING: {
            '⏰': (react, user) => {
                console.log('HIT MARKET OPEN PING');
                console.log(COOP.ROLES.toggle(user.id, 'MARKET_OPEN_PING'));
            }
        }
    }

    static optionEmojis = [
        ...Object.keys(this.sectionEmojis.ANNOUNCEMENTS),
        ...Object.keys(this.sectionEmojis.FOCUS),
        ...Object.keys(this.sectionEmojis.GAMES),
        ...Object.keys(this.sectionEmojis.COMMUNITY),
        ...Object.keys(this.sectionEmojis.ACADEMY_AGENCY),
        ...Object.keys(this.sectionEmojis.GUIDE),
        ...Object.keys(this.sectionEmojis.BONUS_EGGS),
        ...Object.keys(this.sectionEmojis.TREE_FELL),
        ...Object.keys(this.sectionEmojis.ROCK_SLIDE),
        ...Object.keys(this.sectionEmojis.INTRO_POSTED),
        ...Object.keys(this.sectionEmojis.CRATEDROP),
        ...Object.keys(this.sectionEmojis.MARKET_OPEN_PING)
    ]

    static async onReaction(reaction, user) {
        const reactEmoji = reaction.emoji.name;

        // Check if this reaction is on about channel.
        if (reaction.message.channel.id !== CHANNELS_CONFIG.ROLES.id) return false;

        console.log(reaction, user);

        // Ignore Cooper.
        if (COOP.USERS.isCooper(user.id)) return false;

        // Check if in array of interaction emojis.
        if (!this.optionEmojis.includes(reactEmoji)) return false;

        // Check if the user is a member, only members may gain access.
        const member = await COOP.USERS.loadSingle(user.id);
        if (!member) return false;

        // Map emojis to right option handler.
        const resultCallback = this.getEmojiHandler(reactEmoji);
        if (resultCallback) resultCallback(reaction, user);
    }

    // TODO: Move this somewhere more important and preload ALL key messages.
    static async preloadMesssages() {
        console.log('preload role msgs');
        return await COOP.MESSAGES.preloadMsgLinks(
            Object.keys(KEY_MESSAGES).map(key => KEY_MESSAGES[key])
        );
    }
    
}