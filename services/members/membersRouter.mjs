import { Router } from "express";
import ElectionHelper from "../../../../operations/members/hierarchy/election/electionHelper.mjs";
import { USERS } from '../../../coop.mjs';

const MembersRouter = Router();

MembersRouter.get('/hierarchy', async (req, res) => {
    const hierarchy = await ElectionHelper.loadHierarchy();

    // Add the next 10 members who weren't already included.
    // TODO: Lock down some unnecessary fields.
    
    const otherUsersRaw = await USERS.loadSortedHistoricalPoints();
    hierarchy.other_users = otherUsersRaw;

    res.status(200).json(hierarchy);
});

MembersRouter.get('/build', async (req, res) => {
    const users = await USERS.loadAllForStaticGeneration();
    return res.status(200).json(users);
});

MembersRouter.get('/build-single/:discordID', async (req, res) => {
    // TODO: Enhance this with roles
    const user = await USERS.loadSingleForStaticGeneration(req.params.discordID);
    return res.status(200).json(user);
});

MembersRouter.get('/', async (req, res) => {
    const users = await USERS.load();
    return res.status(200).json(users);
});

MembersRouter.get('/:discordID', async (req, res) => {
    const user = await USERS.loadSingle(req.params.discordID);
    return res.status(200).json(user);
});

MembersRouter.get('/search/:needle', async (req, res) => {
    const results = await USERS.searchByUsername(req.params.needle);
    return res.status(200).json(results);
});

export default MembersRouter;
