import _ from 'lodash';
import { Router } from "express";
import Database from '../../../setup/database.mjs';

const DonationRouter = Router();

DonationRouter.post('/', async (req, res) => {
    try {
        // Guard against false claims.
        const secret = _.get(req.body, 'secret');
        if (process.env.RAISELY_ENCRYPTION_KEY !== secret)
            return console.log('Did not process donation without shared secret.', req.body);

        // Access the webhook body data.
        const data = _.get(req.body, 'data.data');

        // Construct the donation object.
        const donation = {
            discord_full_username: null,
            acknowledged: false,
            amount: data.publicTotal,
            created_on: new Date,
            symbol: data.currencySymbol
        }

        // Access the potential discord ID from webhook payload.
        const discordID = _.get(data, 'public.fullDiscordUsername');
        if (discordID)
            donation.discord_full_username = discordID;
        else
            donation.acknowledged = true;

        // Insert the donation into the database.
        Database.query({
            name: 'insert-donation',
            text: `INSERT INTO donations (
                    discord_full_username, acknowledged, amount, created_on, symbol
                ) VALUES ($1, $2, $3, $4, $5)`,
            values: [
                donation.discord_full_username, 
                donation.acknowledged, 
                donation.amount, 
                donation.created_on,
                donation.symbol
            ]
        });

        res.sendStatus(200);
        
    } catch(e) {
        console.log('Donation failed.');
        console.error(e);

        res.sendStatus(500);
    }
});

export default DonationRouter;