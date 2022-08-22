import { Router } from "express";

import Users from "coop-shared/services/users.mjs";
import Election from "coop-shared/services/election.mjs";

const MembersRouter = Router();

MembersRouter.get('/hierarchy', async (req, res) => {
    const hierarchy = await Election.loadHierarchy();

    // Add the next 10 members who weren't already included.
    // TODO: Lock down some unnecessary fields.
    
    const otherUsersRaw = await Users.loadSortedHistoricalPoints();
    hierarchy.other_users = otherUsersRaw;

    res.status(200).json(hierarchy);
});

MembersRouter.get('/build', async (req, res) => {
    const users = await Users.loadAllForStaticGeneration();
    return res.status(200).json(users);
});

MembersRouter.get('/build-single/:discordID', async (req, res) => {
    // TODO: Enhance this with roles
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
