import { Router } from "express";
import BaseHelper from "../../../../operations/minigames/medium/conquest/baseHelper.mjs";

const BasesRouter = Router();


export const getBases = async (req, res) => res.status(200).json(await BaseHelper.all());
BasesRouter.get('/', getBases);

export const getBase = async (req, res) => res.status(200).json(await BaseHelper.get(req.params.base));
BasesRouter.get('/:base', getBase);
BasesRouter.get('/base/:base', getBase);



export default BasesRouter;

