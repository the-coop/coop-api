import { Router } from "express";
import BlogHelper from "../../../../operations/marketing/blog/blogHelper.mjs";
import SubscriptionHelper from "../../../../operations/marketing/newsletter/subscriptionHelper.mjs";

const BlogRouter = Router();

BlogRouter.get('/', async (req, res) => {
    const posts = await BlogHelper.loadHeadlines();
    res.status(200).json(posts);
});

BlogRouter.get('/build', async (req, res) => {
    const posts = await BlogHelper.loadAllForBuild();
    res.status(200).json(posts);
});

BlogRouter.get('/:slug', async (req, res) => {
    const post = await BlogHelper.loadPostBySlug(req.params.slug);
    res.status(200).json(post);
});

BlogRouter.get('/draft/:draftslug', async (req, res) => {
    const post = await BlogHelper.loadDraftByChannelID(req.params.draftslug);
    res.status(200).json(post);
});

BlogRouter.post('/subscribe', async (req, res) => {
    const result = {
        success: false
    };

    try {
        const existing = await SubscriptionHelper.getByEmail(req.body.email);
        if (existing) throw new Error('Email subscription already exists.');

        const didCreate = await SubscriptionHelper.create(req.body.email, null, 1);
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
        const existing = await SubscriptionHelper.getByEmail(req.body.email);
        if (!existing) throw new Error('Not a valid subscription.');
        
        const didUnsubscribe = await SubscriptionHelper.unsubscribeByEmail(req.body.email);
        if (didUnsubscribe) result.success = true;

    } catch(e) {
        console.log('Error subscribing via website.');
        console.error(e);
    }

    return res.status(200).json(result);
});

export default BlogRouter;
