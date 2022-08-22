import { Router } from "express";
import Projects from "coop-shared/services/projects.mjs";

const ProjectsRouter = Router();

ProjectsRouter.get('/', async (req, res) => {
    const projects = await Projects.all();
    res.status(200).json(projects);
});

ProjectsRouter.get('/:slug', async (req, res) => {
    const projects = await Projects.loadBySlug(req.params.slug);
    res.status(200).json(projects);
});

export default ProjectsRouter;
