import { Router } from "express";

import Adverts from "coop-shared/services/adverts.mjs";

// import STATE from "../../../state.mjs";

const AdvertsRouter = Router();

AdvertsRouter.get('/', async (req, res) => {
    // const posts = await Blog.loadHeadlines();
    // res.status(200).json(posts);
});

// AdvertsRouter.get('/test', async (req, res) => {
//     // Try to add a message into a discord channel when this is hit.
//     // res.status(200).json({ test: STATE.CLIENT.user.id });
// });

AdvertsRouter.get('/latest', async (req, res) => {
    res.status(200).json(await Adverts.latest());
});

export default AdvertsRouter;
