import { Router } from "express";
import TradingHelper from "../../../../operations/minigames/medium/economy/items/tradingHelper.mjs";
import { ITEMS, USABLE } from "../../../coop.mjs";
import Auth from "../../auth/_auth.mjs";

const TradingRouter = Router();


TradingRouter.get('/mine', Auth.guard(), async (req, res) => {
    let trades = [];

    try {
        const discordID = req.user?.discord_id;
        if (discordID)
            trades = await TradingHelper.getByTrader(discordID);

    } catch(e) {
        console.log('Error with a trade.');
        console.error(e);
    }

    res.status(200).json(trades);
});

TradingRouter.delete('/:tradeID', Auth.guard(), async (req, res) => {
    try {
        // Check if valid trade ID given.
        const trade = await TradingHelper.get(req.params.tradeID);
        if (!trade) throw new Error(`invalid_trade_id`);

        // Make sure trade belongs to the user.
        if (trade.trader_id !== req.user.discord_id) 
            throw new Error(`lack_authorization`);

        // Let helper handle accepting logic as it's used in multiple places so far.
        const tradeCancelled = await TradingHelper._cancel(trade);
        if (tradeCancelled)
            return res.status(200).json({ success: true });
        
        return res.status(200).json({ success: true });
        
    } catch(e) {
        if (!['lack_authorization', 'invalid_trade_id'].includes(e.message)) {
            console.log('Failed to cancel trade.');
            console.error(e);
        }
    }
    res.status(200).json({ success: false });
});

TradingRouter.get('/:tradeID', async (req, res) => {
    const tradeID = req.params.tradeID;
    const trade = await TradingHelper.get(tradeID);
    res.status(200).json(trade);
});


TradingRouter.post('/accept', Auth.guard(), async (req, res) => {
    try {
        // Check if valid trade ID given.
        const trade = await TradingHelper.get(req.body.trade_id);
        if (!trade) throw new Error(`invalid_trade_id`);

        // Make sure user cannot accept their own trade.
        if (req.user.discord_id === trade.trader_id) 
            throw new Error(`impossible_accept`);

        // Check if user can fulfil the trade.
        const hasEnough = await ITEMS.hasQty(req.user.discord_id, trade.receive_item, trade.receive_qty);
        if (!hasEnough) throw new Error(`insufficient_offer`);

        // Let helper handle accepting logic as it's used in multiple places so far.
        const tradeAccepted = await TradingHelper._accept(trade, req.user.discord_id);
        if (tradeAccepted)
            return res.status(200).json({ success: true });
        
    } catch(e) {
        if (!['insufficient_offer', 'invalid_trade_id', 'impossible_accept'].includes(e.message)) {
            console.log('Failed to trade item.');
            console.error(e);
        }
    }
    res.status(200).json({ success: false });
});


TradingRouter.post('/create', Auth.guard(), async (req, res) => {
    const result = {
        success: true,
        created_trade: null,
        errors: {
             invalid_offer_item: false,
             invalid_offer_qty: false,
             invalid_receive_item: false,
             invalid_receive_qty: false
        }
    };

    try {
        const { offer_item, offer_qty, receive_item, receive_qty } = req.body;
        const { discord_id, username } = req.user;

        // Check item codes are valid.
        if (!USABLE.isUsable(offer_item)) throw new Error('invalid_offer_item');
        if (!USABLE.isUsable(receive_item)) throw new Error('invalid_receive_item');

        // Check that item quantities are above zero (or one if non-decimal item).
        if (offer_qty <= 0) throw new Error('invalid_offer_qty');
        if (receive_qty <= 0) throw new Error('invalid_receive_qty');

        // Check item quanties are owned.
        const affordable = await ITEMS.hasQty(discord_id, offer_item, offer_qty);
        if (!affordable) throw new Error('invalid_offer_qty');

        // Pay the trade offer price.
        const didUse = await USABLE.use(discord_id, offer_item, offer_qty);

        // Create the trade.
        if (didUse)            
            result.created_trade = await TradingHelper.create(
                discord_id, username, 
                offer_item, receive_item,
                offer_qty, receive_qty
            );

        console.log(req.body);
        console.log(result.created_trade);

    } catch(e) {
        if (['invalid_receive_item', 'invalid_offer_item', 'invalid_offer_qty', 'invalid_receive_qty'].includes(e.message))
            result.errors[e.message] = true;

        result.success = false;
    }

    res.status(200).json(result);
});

export default TradingRouter;
