import AverageEggHandler from "./handlers/averageEggHandler.mjs";
import RareEggHandler from "./handlers/rareEggHandler.mjs";
import LegendaryEggHandler from "./handlers/legendaryEggHandler.mjs";
import DiamondHandler from "./handlers/diamondHandler.mjs";
import ShieldHandler from "./handlers/shieldHandler.mjs";
import RPGHandler from "./handlers/rpgHandler.mjs";
import BombHandler from "./handlers/bombHandler.mjs";
import ToxicEggHandler from "./handlers/toxicEggHandler.mjs";

import EggHuntMinigame from "../../../small/egghunt.mjs";
import ReactionHelper from "../../../../activity/messages/reactionHelper.mjs";

import { EMOJIS, RAW_EMOJIS } from "../../../../../organisation/config.mjs";
import { STATE, CHICKEN, ROLES, REACTIONS, MESSAGES, ITEMS, CHANNELS, USERS, USABLE } from "../../../../../organisation/coop.mjs";
import ElectionHelper from "../../../../members/hierarchy/election/electionHelper.mjs";
import GoldCoinHandler from "./handlers/goldCoinHandler.mjs";
import MineHandler from "./handlers/mineHandler.mjs";
import DefuseKitHandler from "./handlers/defuseKitHandler.mjs";


export default class UsableItemHelper {

    static async onReaction(reaction, user) {
        // console.log(reaction.emoji);
        // console.log(eaction.emoji.name);

        // SPAMREFORM: Should remove reaction if insufficient qty)
        // SPAMREFORM: Should fail silently.
        // if (this.isUsable(reaction.emoji.name))

        // Check emoji isn't a usable item and ignore if not.

        // Prevent Cooper from interacting with items.
        if (!USERS.isCooper(user.id)) {
            // Player usable items reaction detectors/handlers.
            BombHandler.onReaction(reaction, user);
            DiamondHandler.onReaction(reaction, user);
            ShieldHandler.onReaction(reaction, user);
            RPGHandler.onReaction(reaction, user);
            GoldCoinHandler.onReaction(reaction, user);
            MineHandler.onReaction(reaction, user);
            DefuseKitHandler.onReaction(reaction, user);

            // Check if message is dropped item message being picked up.
            if (this.isPickupable(reaction, user))
                this.pickup(reaction, user);

            const isDroppedEmoji = reaction.emoji.name === RAW_EMOJIS.DROPPED;
            if (isDroppedEmoji) this.redrop(reaction, user);
        }

        // Allow Cooper to add average/rare/legendary eggs when prompted.
        ToxicEggHandler.onReaction(reaction, user);
        LegendaryEggHandler.onReaction(reaction, user);
        AverageEggHandler.onReaction(reaction, user);
        RareEggHandler.onReaction(reaction, user);
    }

    static async redrop(reaction, user) {
        const emojiID = MESSAGES.getEmojiIdentifier(reaction.message);
        const itemCode = ITEMS.emojiToItemCode(emojiID);
        const guards = [
            // Prevent non-members from picking things up.
            ROLES._idHasCode(user.id, 'MEMBER'),
    
            // If invalid item code or not usable, don't allow pick up event.
            itemCode && this.isUsable(itemCode),
    
            // Attempt to consume the item
            await USABLE.use(user.id, itemCode, 1, 'Via redropping.')
        ];

        // Check all guards passed.
        if (!guards.every(g => g))
            return REACTIONS.removeUserSpecificEmoji(reaction.message, user.id, RAW_EMOJIS.DROPPED);

        // Indicate who is dropping items.
        const emojiText = MESSAGES.emojiText(EMOJIS[itemCode]);
        const dropText = `${user.username} dropped ${itemCode} ${emojiText}`;
        reaction.message.channel.send(dropText);

        // Drop the item based on its code.
        this.drop(reaction.message.channel, itemCode);
    }

    static async drop(channel, itemCode) {
		const emojiText = MESSAGES.emojiText(EMOJIS[itemCode]);
		const dropMsg = await channel.send(emojiText);

		// Add indicative and suggestive icons, maybe refactor.
		MESSAGES.delayReact(dropMsg, EMOJIS.BASKET, 333);
		MESSAGES.delayReact(dropMsg, RAW_EMOJIS.DROPPED, 666);

        return dropMsg;
    }

    static async use(userID, itemCode, useQty, note = 'Used item') {
        // Attempt to load item ownership.
        const ownedQty = await ITEMS.getUserItemQty(userID, itemCode);

        // Check if enough qty of item is owned.
        if (ownedQty - useQty >= 0) {
            // TODO: Just ensure that subtract does this itself...? Get rid of use?
            await ITEMS.subtract(userID, itemCode, useQty, note);
            return true;
        } else return false;
    }

    static getUsableItems() {
        const unusable = this.NON_USABLE_EMOJIS;
        const codeFilter = itemCode => !unusable.includes(itemCode);
        return Object.keys(EMOJIS).filter(codeFilter);
    }

    static isDroppedItemMsg(msg) {
        return ReactionHelper.didUserReactWith(
            msg, CHICKEN.getDiscordID(), RAW_EMOJIS.DROPPED
        );
    }

    static isUsable(itemCode) {
		return this.getUsableItems().includes(itemCode);
    }

    static NON_USABLE_EMOJIS = [
        "COOP",
        "VOTE_FOR",
        "VOTE_AGAINST",

        "LEGENDARY_CRATE",
        "LEGENDARY_CRATE_OPEN",
        "RARE_CRATE",
        "RARE_CRATE_OPEN",
        "AVERAGE_CRATE",
        "AVERAGE_CRATE_OPEN",

        "POLL_FOR",
        "POLL_AGAINST",
        "ROADMAP",
        "SACRIFICE_SHIELD",
        "ROCK",

        "DROPPED",
        "BASKET",

        // Maybe usable.
        "DAGGER",
    ];

    // Check if a message has an emoji and is pickupable.
    static isPickupable(reaction) {
        // Check if message has dropped emoji and by Cooper (official/valid drop).
        if (!this.isDroppedItemMsg(reaction.message)) return false;

        // Check if they are trying to collect via basket
        if (reaction.emoji.name !== EMOJIS.BASKET) return false;

        // Don't allow more pickups after 1 count.
        if (reaction.count > 2) return false;
    
        // Appears to be safe to pickup.
        return true;
    }

    // The event handler for when someone wants to pickup a dropped item message.
    static async pickup(reaction, user) {
        try {
            // TODO: ADD TO STATISTICS!

            // Find item code via emoji/emoji ID (trimmed) string in comparison to emojis.
            const emojiID = MESSAGES.getEmojiIdentifier(reaction.message);
            const itemCode = ITEMS.emojiToItemCode(emojiID);

            // Prevent non-members from picking things up.
            if (!ROLES._idHasCode(user.id, 'MEMBER'))
                return MESSAGES.selfDestruct(reaction.message,
                    `${user.username} you can't pick that up, only members (role) can pick up items.`
                );

            // If invalid item code or not usable, don't allow pick up event.
            if (!itemCode || !this.isUsable(itemCode))
                // TODO: Maybe use reply functionality to point to message they tried to pick up?
                return MESSAGES.selfDestruct(reaction.message,
                    `${user.username} you can't pick that up.`
                );

            // If collecting a dropped egg, high chance (40%) of breaking due to having been dropped.
            if (EggHuntMinigame.reactValid(reaction) && STATE.CHANCE.bool({ likelihood: 40 })) {
                // Clear after a while of showing the edited state.
                MESSAGES.delayDelete(reaction.message, 10000);
                return MESSAGES.delayEdit(reaction.message,
                    `${user.username} broke ${reaction.message.content}...`, 0
                );
            }

            // Remove the emojis
            REACTIONS.removeAll(reaction.message);

            // Add recalculated item ownership to user.
            const addEvent = await ITEMS.add(user.id, itemCode, 1, 'USABLE_PICKUP - Picked up in ' + reaction.message.channel.name);

            // Add user's item counts to message.
            const editText = `${reaction.message.content} collected by ${user.username}, now has x${addEvent}.`;
            MESSAGES.delayEdit(reaction.message, editText, 0);

			// Intercept the giving of election items.
			if (itemCode === 'LEADERS_SWORD' || itemCode === 'ELECTION_CROWN')
				ElectionHelper.ensureItemSeriousness();

            // Format and display success message temporarily to channel and as a record in actions channel.
            const emojiText = MESSAGES.emojiText(emojiID);
            const displayItemCode = ITEMS.escCode(itemCode);

            // TODO: Replace this so if the channel is spammable it remains as a message.
            const actionText = `${user.username} picked up ${displayItemCode} ${emojiText} and now has x${addEvent}.`;
            CHANNELS.propagate(reaction.message, actionText, 'ACTIONS', false);
        } catch(e) {
			console.log('Error with pickup handler.');
			console.error(e);
        }
    }



}
