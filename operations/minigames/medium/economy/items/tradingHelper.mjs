import { KEY_MESSAGES, RAW_EMOJIS } from "../../../../../organisation/config.mjs";
import { ITEMS, USABLE, USERS, CHANNELS, REACTIONS, CHICKEN } from "../../../../../organisation/coop.mjs";
import DatabaseHelper from "../../../../databaseHelper.mjs";
import Database from "../../../../../organisation/setup/database.mjs";


// TODO: Rename file.
export default class TradingHelper {

    static async onReaction(reaction, user) {
        // Prevent Cooper from collecting his own eggs.
        if (USERS.isCooper(user.id)) return false;
        if (!USERS.isCooperMsg(reaction.message)) return false;

        // Check if it is a trade actionable message.
        const isTrade = REACTIONS.didUserReactWith(reaction.message, CHICKEN.getDiscordID(), RAW_EMOJIS.TRADE);
        if (!isTrade) return false;
        
        const isAcceptEmoji = reaction.emoji.name === RAW_EMOJIS.HANDSHAKE;
        console.log('Someone trying to accept a trade', isAcceptEmoji);
    }

    static async updateChannel() {
        // Update message at top of trades :)
        // const dateFmt = TIME.secsLongFmt(Date.now() / 1000);
        // const editResult = await MESSAGES.editByLink(KEY_MESSAGES.trade_info, 'Trade Message Updated ' + dateFmt);
        // return editResult;

        // Post latest/most recent 5-10 trades in talk.
        const lastTrades = await this.all();
        if (lastTrades.length > 0)
            CHANNELS._send('TALK', '**Latest active trades**:\n' + this.manyTradeItemsStr(lastTrades), 0, 30000);
    }

    static async remove(tradeID) {
        const query = {
            name: "remove-trade-id",
            text: `DELETE FROM open_trades WHERE id = $1`,
            values: [tradeID]
        };

        const result = await Database.query(query);
        return result;
    }

    // Defaults to returning 15 latest trades.
    static async all(limit = 15) {
        const query = {
            name: "get-all-trades",
            text: `SELECT * FROM open_trades ORDER BY id DESC LIMIT $1;`,
            values: [limit]
        };

        const result = await Database.query(query);
        return DatabaseHelper.many(result);
    }

    static async create(userID, username, offerItem, receiveItem, offerQty, receiveQty) {
        const query = {
            name: "create-trade",
            text: `INSERT INTO open_trades(trader_id, trader_username, offer_item, receive_item, offer_qty, receive_qty) 
                VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            values: [userID, username, offerItem, receiveItem, offerQty, receiveQty]
        };
        const result = DatabaseHelper.single(await Database.query(query));
        return result;
    }

    static async findOfferMatches(offerItem) {
        const query = {
            name: "get-trades-by-offer",
            text: `SELECT * FROM open_trades WHERE offer_item = $1`,
            values: [offerItem]
        };

        const result = await Database.query(query);
        return DatabaseHelper.many(result);
    }

    static async findEitherMatching(receiveItem) {
        const query = {
            name: "get-trades-by-offer",
            text: `SELECT * FROM open_trades WHERE receive_item = $1 OR offer_item = $1`,
            values: [receiveItem]
        };

        const result = await Database.query(query);
        return DatabaseHelper.many(result);
    }

    static async findOfferReceiveMatches(offerItem, receiveItem) {
        const query = {
            name: "get-trades-by-offer-receive",
            text: `SELECT * FROM open_trades WHERE offer_item = $1 AND receive_item = $2`,
            values: [offerItem, receiveItem]
        };

        const result = await Database.query(query);
        return DatabaseHelper.many(result);
    }

    static async matches(offerItem, receiveItem, offerQty, receiveQty) {
        const query = {
            name: "get-trades-by-offer-receive-qty",
            text: `SELECT * FROM open_trades 
                WHERE offer_item = $1 AND receive_item = $2 AND offer_qty = $3 AND receive_qty <= $4`,
            values: [offerItem, receiveItem, offerQty, receiveQty]
        };

        const result = await Database.query(query);
        return DatabaseHelper.many(result);
    }

    static async listMatch(offerItem, receiveItem) {
        const query = {
            name: "get-matches-of-type",
            text: `SELECT * FROM open_trades WHERE offer_item = $1 and receive_item = $2`,
            values: [offerItem, receiveItem]
        };
        
        const result = await Database.query(query);
        return DatabaseHelper.many(result);
    }

    static async get(tradeID) {
        const query = {
            name: "get-open-trade-id",
            text: `SELECT * FROM open_trades WHERE id = $1`,
            values: [tradeID]
        };
        
        const result = await Database.query(query);
        return DatabaseHelper.single(result);
    }

    static async getByTrader(traderID) {
        const query = {
            name: "get-open-by-trader-id",
            text: `SELECT * FROM open_trades WHERE trader_id = $1 ORDER BY id DESC`,
            values: [traderID]
        };
        
        const result = await Database.query(query);
        return DatabaseHelper.many(result);
    }


    // Turn trade into items receive/loss string from searcher perspective 
    // (not trader perspective).
    static tradeItemsStr(trade) {
        return ITEMS.exchangeItemsQtysStr(
            trade.receive_item, trade.receive_qty,
            trade.offer_item, trade.offer_qty
        );
    }

    static manyTradeItemsStr(trades) {
        return trades.map(trade => 
            `#${trade.id} by ${trade.trader_username}\n${this.tradeItemsStr(trade)}\n\n`
        ).join('');
    }


    static async _accept(trade, accepteeID) {
        try {
            const didUse = await USABLE.use(accepteeID, trade.receive_item, trade.receive_qty);
            if (didUse) {
                // Add the offer items to the acceptee.
                await ITEMS.add(accepteeID, trade.offer_item, trade.offer_qty, 'Trade accepted');
    
                // Add the receive items to the trader.
                await ITEMS.add(trade.trader_id, trade.receive_item, trade.receive_qty, 'Trade accepted');
    
                // Delete/close the open trade offer.
                await this.remove(trade.id);

                return true;
            }
        } catch(e) {
            console.log('Accepting trade error');
            console.error(e);
        }
        return false;
    }

    // This method directly takes items from user to close a trade.
    static async accept(openTradeID, accepteeID, accepteeName) {
        try {
            // Get trade by ID.
            const trade = await this.get(openTradeID);

            // Trade may have been removed before accept.
            if (await this._accept(trade, accepteeID)) {
                // Build string for logging/feedback.
                const exchangeStr = this.tradeItemsStr(trade);
                const actionStr = `**${accepteeName} accepted trade #${trade.id} from ${trade.trader_username}`;
                const tradeConfirmStr = `${actionStr}**\n\n${exchangeStr}`;
                                    
                // Log confirmed trades
                CHANNELS._postToChannelCode('TRADE', tradeConfirmStr, 999);

                // Return successful result.
                return true;
            }
        } catch(e) {
            console.log('Error accepting trade offer.');
            console.error(e);
        }        
        return false;
    }

    static async _cancel(trade) {
        try {
            // Add the offer items to the cancelee.
            await ITEMS.add(trade.trader_id, trade.offer_item, trade.offer_qty, 'Trade cancelled');

            // Delete/close the open trade offer.
            await this.remove(trade.id);

            return true;

        } catch(e) {
            console.log('Error cancelling trade offer.');
            console.error(e);
            return false;
        }        
    }

    static async cancel(cancelTradeID, canceleeName) {
        try {
            // Get trade by ID
            const trade = await this.get(cancelTradeID);
            await this._cancel(trade);

            // Build string for logging/feedback.
            const lossItemQtyStr = ITEMS.lossItemQtyStr(trade.offer_item, trade.offer_qty);
            const tradeCancelStr = `**${canceleeName} cancelled trade #${trade.id}**\n\n${lossItemQtyStr}`;

            // Log confirmed trades
            CHANNELS._postToChannelCode('TRADE', tradeCancelStr, 999);

            // Return successful result.
            return true;

        } catch(e) {
            console.log('Error accepting trade offer.');
            console.error(e);
            return false;
        }        
    }

    // Calculate conversion rate between items based on current open trade rates.
    static async conversionRate(offerItem, receiveItem) {
        const matches = await this.findOfferReceiveMatches(offerItem, receiveItem);
        const ratios = matches.map(match => match.receive_qty / match.offer_qty);
        const sumAverage = ratios.reduce((acc, val) => {
          acc += val;
          return acc;
        }, 0);
        const average = sumAverage / ratios.length;

        return average;
    }

}