import { Router } from "express";
import Access from "./access.mjs";
import Auth from 'coop-shared/helper/authHelper.mjs';

const AuthRouter = Router();

// Route which handles authentication via Discord oAuth but also Cooper DMs.
AuthRouter.post('/access', Access);

// An endpoint mostly related to session/user data during-around authentication.
AuthRouter.get('/me', Auth.guard(), ({ user }, res) => {
    res.status(200).json({ 
        user: { 
            id: user.discord_id,
            username: user.username
        }
    });
});

export default AuthRouter;
