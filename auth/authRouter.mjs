import { Router } from "express";
import Access from "./access.mjs";
import passport from 'passport';
import Users from "coop-shared/services/users.mjs";

const AuthRouter = Router();

// Route which handles authentication via Discord oAuth but also Cooper DMs.
AuthRouter.post('/access', Access);

// An endpoint mostly related to session/user data during-around authentication.
AuthRouter.get('/me', passport.authenticate('jwt', { session: false }), async ({ user }, res) => {
    const userAdorned = await Users.loadSingleForStaticGeneration(user.discord_id);
    res.status(200).json({ user: userAdorned });
});

export default AuthRouter;
