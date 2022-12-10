import { Router } from "express";

import Users from "coop-shared/services/users.mjs";
import Election from "coop-shared/services/election.mjs";
import UserRoles from "coop-shared/services/userRoles.mjs";
import ROLES from "coop-shared/config/roles.mjs";
import passport from "passport";
import { WebhookClient } from "discord.js";

const MembersRouter = Router();

MembersRouter.get('/hierarchy', async (req, res) => {
    const hierarchy = await Election.loadHierarchy();

    // Add the next 10 members who weren't already included.
    // TODO: Lock down some unnecessary fields.
    
    const otherUsersRaw = await Users.loadSortedHistoricalPoints();
    hierarchy.other_users = otherUsersRaw;

    res.status(200).json(hierarchy);
});

MembersRouter.get('/roles', passport.authenticate('jwt', { session: false }), async (req, res) => {
    return res.status(200).json(await UserRoles.get(req.user.discord_id));
});

MembersRouter.post('/roles/toggle', passport.authenticate('jwt', { session: false }), async (req, res) => {
    try {
        // Get the role by ID name.
        const role = ROLES[
            Object.keys(ROLES).find(roleKey => ROLES?.[roleKey].id === req.body.role)
        ];

        // Prevent locked roles being added.
        if (role.locked)
            throw new Error('Forbidden role toggling.');

        // Toggle database role
        const hasRole = await UserRoles.find(req.user.discord_id, req.body.role);
        if (hasRole)
            await UserRoles.remove(req.user.discord_id, req.body.role);
        else
            await UserRoles.add(req.user.discord_id, req.body.role);
    
        // Webhook into a channel
        const webhookClient = new WebhookClient({ url: 'https://discord.com/api/webhooks/817551615095078913/uHNjwJslIrnleyNyVkiSzQnZ2m_n0CwEVTIwW_UYwQ4OzpHlOKPaTgXr7LefhOKNYrmk' });
        webhookClient.send({
            content: `<@${req.user.discord_id}> toggled role <@&${role.id}> ${req.body.preference ? 'on' : 'off'}.`,
            username: 'API',
            avatarURL: 'https://cdn.discordapp.com/attachments/902593785500946472/1050617078073282560/2051c96e1868d0ea1253f25b79dd8596-2-3.png',
            allowedMentions: { users: [], roles: [] }
        });

        return res.status(200).json({ success: true });

    } catch(e) {
        console.log('Failed to add role');
        console.error(e);
        return res.status(200).json({ success: false });
    }
});

MembersRouter.get('/build', async (req, res) => {
    const users = await Users.loadAllForStaticGeneration();
    return res.status(200).json(users);
});

MembersRouter.get('/build-single/:discordID', async (req, res) => {
    const user = await Users.loadSingleForStaticGeneration(req.params.discordID);
    return res.status(200).json(user);
});

MembersRouter.get('/', async (req, res) => {
    const users = await Users.load();
    return res.status(200).json(users);
});

MembersRouter.get('/:discordID', async (req, res) => {
    const user = await Users.get(req.params.discordID);
    return res.status(200).json(user);
});

MembersRouter.get('/search/:needle', async (req, res) => {
    const results = await Users.searchByUsername(req.params.needle);
    return res.status(200).json(results);
});

export default MembersRouter;
