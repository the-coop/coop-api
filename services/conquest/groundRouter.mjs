import { Router } from "express";
import Ground from "../../../../operations/minigames/medium/conquest/ground.mjs";
import GroundHelper from "../../../../operations/minigames/medium/conquest/groundHelper.mjs";

const GroundRouter = Router();

export const getTileState = async (req, res) => {
    return res.status(200).json(await GroundHelper.get(req.params.tile))
}

GroundRouter.get('/tile/:tile', getTileState);

GroundRouter.get('/', (req, res) => {
    return res.status(200).json({
        players: Ground.players
    });
});

export default GroundRouter;

