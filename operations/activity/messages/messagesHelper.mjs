import { MESSAGES, CHANNELS, SERVER }  from "../../../organisation/coop.mjs";
import { EMOJIS } from "../../../organisation/config.mjs";

import createEmbed from "./embedHelper.mjs";
import { silentOpts } from "../../channelHelper.mjs";
import TemporaryMessages from "../../maintenance/temporaryMessages.mjs";

export default class MessagesHelper {

    static embed(embedConf) {
        return { 
            embeds: [createEmbed(embedConf)]
        };
    }

    static getRegexMatch(regex, str) {
        let match = null;
        const result = regex.exec(str);
        if (result && result[1])
            match = result[1];
        return match;
    }

    static parselink(link) {
        let result = null;

        // Remove domains.
        let subjStr = link.replace('https://discordapp.com/channels/', '');
        subjStr = subjStr.replace('https://discord.com/channels/', '');

        const msgPcs = subjStr.split('/');

        const data = {
            guild: msgPcs[0],
            channel: msgPcs[1],
            message: msgPcs[2]
        };
        
        result = data;

        return result;
    }

    static unparse(obj) {
        return this.link({ 
            guild: { id: obj.guild.id },
            channel: { id: obj.channel.id },
            id: obj.id
        });
    }

    static link(msg) {
        const link = `https://discordapp.com/channels/` +
            `${msg.guild.id}/` +
            `${msg.channel.id}/` +
            `${msg.id}`;
        return link;
    }

    static async deleteByLink(link) {
        const data = this.parselink(link);
        const coop = SERVER._coop();
        const chan = coop.channels.cache.get(data.channel);
        const message = await chan.messages.fetch(data.message);
        return message.delete();
    }

    // Build the string as normal, combining all the strings and placeholders:
    static noWhiteSpace(strings, ...placeholders) {
        let withSpace = strings.reduce((result, string, i) => (result + placeholders[i - 1] + string));
        let withoutSpace = withSpace.replace(/\s\s+/g, ' ');
        return withoutSpace;
    }
    
    static purifyEmojiIDStr(str) {
        let result = null

        if (str && typeof str === 'string')
            result = str.trim().replace('>', '').replace('<', '')

        return result;
    }

    static strToEmojiID(str) {
        return this.purifyEmojiIDStr(str);
    }
    
    static getEmojiIdentifier(msg) {
        return this.purifyEmojiIDStr(msg.content);
    }

    static isOnlyEmojis(text) {
        const onlyEmojis = text.replace(new RegExp('[\u0000-\u1eeff]', 'g'), '');
        // eslint-disable-next-line
        const visibleChars = text.replace(new RegExp('[\n\r\s]+|( )+', 'g'), '');
        return onlyEmojis.length === visibleChars.length;
    }

    static isOnlyEmojisOrIDs(text) {
        // eslint-disable-next-line
        const codeChars = text.replace(new RegExp(':\w+:', 'g'), '')
        // eslint-disable-next-line
        const visibleChars = text.replace(new RegExp('[\n\r\s]+|( )+', 'g'), '')
        const isOnlyIDCodes = codeChars.length === visibleChars.length;
        return this.isOnlyEmojis(text) || isOnlyIDCodes;
    }

    static countAllEmojiCodes(text) {
        const numCodes = text.match(/(:\w+:)/gm).length;
        return numCodes;
    }

    static emojiToUni(emoji) {
        return emoji.codePointAt(0).toString(16);
    }

    // Handles :single: and :double:id emoji input
    // Not sure about emoji direct unicode (image char)
    static emojiCodeText(code) {
        let displayStr = '?';

        const emoji = EMOJIS[code.toUpperCase()];
        if (emoji) displayStr = this.emojiText(emoji);

        return displayStr;
    }

    static emojiText(emoji) {
        // const numColons = emoji.split(":").length - 1;
        const truePieces = emoji.split(':').filter(piece => piece !== '');
        if (truePieces.length === 1) return emoji;
        return `<${emoji}>`;
    }

    static delayReactionRemove(reaction, delay) {
        if (reaction) setTimeout(() => reaction.remove(), delay);
    }

    static delayReactionRemoveUser(reaction, userID, delay) {
        setTimeout(() => reaction.users.remove(userID), delay);
    }

    static delayReact(msg, emoji, delay = 666) {
        return new Promise((resolve, reject) => {
            // Ignore a message that has been deleted/etc.
            if (!msg || typeof msg === 'undefined') return resolve(false);

            // Add the reaction.
            setTimeout(() => { 
                msg.react(emoji)
                    .then(react => resolve(react))
                    .catch(e => {
                        // Ignore already deleted messages.
                        if (e.message !== 'Unknown Message') {
                            console.error(e);
                            reject(e);
                        } else {
                            resolve(false);
                        }
                    });
            }, delay);
        });
    }

    static delayDelete(msg, delay = 666) {
        // TODO: Check if message is in a DM... since these can't be deleted.
        if (msg.channel.type === 'DM') return true;

        // TODO: This should definitely be applied to temp_messages too, since... can't be deleted.
        if (msg) 
            setTimeout(async () => { 
                try {
                    if (typeof msg.delete === 'function') 
                        await msg.delete();

                } catch(e) {
                    // Ignore messages already deleted.
                    if (e.message.trim() !== 'Unknown Message') {
                        // Report other types of error.
                        console.log('Delay delete error.');
                        console.error(e);
                    }
                }
            }, delay);
    }

    static delayEdit(msg, newContent, delay = 666) {
        if (msg) setTimeout(async () => { 
            try {
                await msg.edit(newContent);
            } catch(e) {
                console.log('Delay edit error.');
                console.error(e);
            }
        }, delay);
    }

    static silentSelfDestruct(msgOrChannelRef, content, delayMs = 666, fuseMs = 30000) {
        return new Promise((resolve, reject) => {
            setTimeout(async () => {
                try {
                    if (msgOrChannelRef) {
                        // Add a reference to help ensure another layer of cleanup.
                        let messageRef = null;

                        // If passed a message directly, use "say" method.
                        if (typeof msgOrChannelRef.send !== 'function')
                            messageRef = await msgOrChannelRef.channel.send(Object.assign({ content, ...silentOpts }));

                        // If passed a channel, use channel's "say" method.
                        if (typeof msgOrChannelRef.send === 'function')
                            messageRef = await msgOrChannelRef.send(Object.assign({ content, ...silentOpts }));
                        
                        if (messageRef) {
                            this.ensureDeletion(messageRef, fuseMs);
                            resolve(messageRef);
                        } else {
                            resolve(null);
                        }
                    }

                } catch(e) {
                    console.log('Error silent-self-destructing message.');
                    console.error(e);
                    reject('self_destruct_message_error');
                }
            }, delayMs);
        });
    }

    static ensureDeletion(messageRef, fuseMs = 0) {
        this.delayDelete(messageRef, fuseMs);
        TemporaryMessages.add(messageRef);
    }

    static selfDestruct(msgOrChannelRef, content, delayMs = 666, fuseMs = 30000) {
        return new Promise((resolve, reject) => {
            setTimeout(async () => {
                try {
                    if (msgOrChannelRef) {
                        // Add a reference to help ensure another layer of cleanup.
                        let messageRef = null;

                        // If passed a message directly, use "say" method.
                        if (typeof msgOrChannelRef.send !== 'function')
                            messageRef = await msgOrChannelRef.channel.send(content);

                        // If passed a channel, use channel's "say" method.
                        if (typeof msgOrChannelRef.send === 'function')
                            messageRef = await msgOrChannelRef.send(content);
                        
                        if (messageRef) {
                            this.delayDelete(messageRef, fuseMs);
                            TemporaryMessages.add(messageRef)
                            resolve(messageRef);
                        }
                    }

                } catch(e) {
                    console.log('Error self-destructing message.');
                    console.error(e);
                    reject('self_destruct_message_error');
                }
            }, delayMs);
        });
    }

    // Convert emojiID into Discord format, but not if its merely an unicode emoji.
    static emojifyID = emojiID => {
        if (emojiID) {
            const idParts = emojiID.split(':');
            if (idParts.length > 1) return idParts[2].length > 1 ? `<${emojiID}>` : emojiID;
        }
        return emojiID;
    }

    static titleCase = (str) => {
        str = str.toLowerCase().split(' ');
        for (let i = 0; i < str.length; i++) str[i] = str[i].charAt(0).toUpperCase() + str[i].slice(1); 
        return str.join(' ');
    }

    static async getByLink(link) {
        let msg = null;
        
        try {
            const msgData = this.parselink(link);
            const channel = CHANNELS._get(msgData.channel);
            const fetchedMsg = await channel.messages.fetch(msgData.message);
            if (fetchedMsg) msg = fetchedMsg;
            return msg;

        } catch(e) {
            return msg;
        }
    }

    static async editByLink(link, content) {
        try {
            const msg = await this.getByLink(link);
            const editedMsg = await msg.edit(content);
            return editedMsg;
        } catch(e) {
            console.log('Error editing message by link');
            console.error(e);
        }
    }

    static randomChars(qty) {
        const characters = 'abcdefghijklmnopqrstuvwxyz';
        let result = '';
        for ( let i = 0; i < qty; i++ ) {
            const randIndex = Math.floor(Math.random() * characters.length);
            result += characters.charAt(randIndex);
        }
        return result;
    }

    static async preloadMsgLinks(messageLinks = []) {
        return await Promise.all(messageLinks.map((link, index) => {
            return new Promise((resolve, reject) => {
                setTimeout(async () => {
                    const entityIDs = MESSAGES.parselink(link);
                    const chan = CHANNELS._get(entityIDs.channel);
                    if (chan) {
                        const msg = await chan.messages.fetch(entityIDs.message);
                        if (msg) resolve(msg);
                        if (!msg) reject(`${entityIDs.message} message does not exist.`);
                    } else {
                        reject(`${entityIDs.channel} channel does not exist.`);
                    }
                }, 666 * index);
            });
        }));
    }

}