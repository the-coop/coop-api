import { Router } from "express";

import AuthRouter from "./auth/authRouter.mjs";
import BlogRouter from "./services/blog/blogRouter.mjs";

import MembersRouter from "./services/members/membersRouter.mjs";
import ProjectsRouter from "./services/projects/projectsRouter.mjs";
import EconomyRouter from "./services/economy/economyRouter.mjs";
import DonationRouter from "./services/donation/donationRouter.mjs";
import AdvertsRouter from "./services/adverts/advertsRouter.mjs";
import TradingRouter from "./services/economy/tradingRouter.mjs";

const APIRouter = Router();

APIRouter.get('/', (req, res) => res.sendStatus(200));

APIRouter.use('/auth', AuthRouter);

APIRouter.use('/economy', EconomyRouter);
APIRouter.use('/trades', TradingRouter);

APIRouter.use('/members', MembersRouter);
APIRouter.use('/blog', BlogRouter);
APIRouter.use('/projects', ProjectsRouter);

APIRouter.use('/donation', DonationRouter);

// Have to rename adverts to prompts or ad blockers prevent loading.
APIRouter.use('/prompts', AdvertsRouter)

export default APIRouter;
