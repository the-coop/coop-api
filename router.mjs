import { Router } from "express";

import AuthRouter from "./auth/authRouter.mjs";
import BlogRouter from "./services/blog/blogRouter.mjs";
import BasesRouter from "./services/bases/basesRouter.mjs";
import GroundRouter from "./services/conquest/groundRouter.mjs";
import MembersRouter from "./services/members/membersRouter.mjs";
import ProjectsRouter from "./services/projects/projectsRouter.mjs";
import EconomyRouter from "./services/economy/economyRouter.mjs";
import DonationRouter from "./services/donation/donationRouter.mjs";
import AdvertsRouter from "./services/adverts/advertsRouter.mjs";
import TradingRouter from "./services/economy/tradingRouter.mjs";

const APIRouter = Router();

APIRouter.get('/', (req, res) => res.sendStatus(200));

APIRouter.use('/auth', AuthRouter);

APIRouter.use('/bases', BasesRouter);
APIRouter.use('/ground', GroundRouter);

APIRouter.use('/economy', EconomyRouter);
APIRouter.use('/trades', TradingRouter);

APIRouter.use('/members', MembersRouter);
APIRouter.use('/blog', BlogRouter);
APIRouter.use('/projects', ProjectsRouter);

APIRouter.use('/donation', DonationRouter);
APIRouter.use('/adverts', AdvertsRouter)

export default APIRouter;
