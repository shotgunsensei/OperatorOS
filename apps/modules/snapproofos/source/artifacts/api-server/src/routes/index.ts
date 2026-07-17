import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import organizationsRouter from "./organizations";
import jobsRouter from "./jobs";
import customersRouter from "./customers";
import jobItemsRouter from "./jobItems";
import templatesRouter from "./templates";
import reportsRouter from "./reports";
import exportsRouter from "./exports";
import shareRouter from "./share";
import teamRouter from "./team";
import brandingRouter from "./branding";
import activityRouter from "./activity";
import dashboardRouter from "./dashboard";
import billingRouter from "./billing";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(organizationsRouter);
router.use(jobsRouter);
router.use(customersRouter);
router.use(jobItemsRouter);
router.use(templatesRouter);
router.use(reportsRouter);
router.use(exportsRouter);
router.use(shareRouter);
router.use(teamRouter);
router.use(brandingRouter);
router.use(activityRouter);
router.use(dashboardRouter);
router.use(billingRouter);

export default router;
