import { Router } from "express";
import Blog from 'coop-shared/services/blog.mjs';
import Subscription from 'coop-shared/services/subscription.mjs';

const BlogRouter = Router();

BlogRouter.get('/', async (req, res) => {
    const posts = await Blog.loadHeadlines();
    res.status(200).json(posts);
});

BlogRouter.get('/build', async (req, res) => {
    const posts = await Blog.loadAllForBuild();
    res.status(200).json(posts);
});

BlogRouter.get('/:slug', async (req, res) => {
    const post = await Blog.loadPostBySlug(req.params.slug);
    res.status(200).json(post);
});

BlogRouter.get('/draft/:draftslug', async (req, res) => {
    const post = await Blog.loadDraftByChannelID(req.params.draftslug);
    res.status(200).json(post);
});

BlogRouter.post('/subscribe', async (req, res) => {
    const result = {
        success: false
    };

    try {
        const existing = await Subscription.getByEmail(req.body.email);
        if (existing) throw new Error('Email subscription already exists.');

        const didCreate = await Subscription.create(req.body.email, null, 1);
        if (didCreate) result.success = true;

    } catch(e) {
        console.log('Error subscribing via website.');
        console.error(e);
    }

    return res.status(200).json(result);
});


BlogRouter.post('/unsubscribe', async (req, res) => {
    const result = {
        success: false
    };

    try {
        const existing = await Subscription.getByEmail(req.body.email);
        if (!existing) throw new Error('Not a valid subscription.');
        
        const didUnsubscribe = await Subscription.unsubscribeByEmail(req.body.email);
        if (didUnsubscribe) result.success = true;

    } catch(e) {
        console.log('Error subscribing via website.');
        console.error(e);
    }

    return res.status(200).json(result);
});

export default BlogRouter;
