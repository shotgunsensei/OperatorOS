import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import dashboardRouter from "./dashboard";
import studySetsRouter from "./studySets";
import quizzesRouter from "./quizzes";
import foldersRouter from "./folders";
import examCountdownsRouter from "./examCountdowns";
import templatesRouter from "./templates";
import billingRouter from "./billing";
import adminRouter from "./admin";
import contactRouter from "./contact";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(dashboardRouter);
router.use(studySetsRouter);
router.use(quizzesRouter);
router.use(foldersRouter);
router.use(examCountdownsRouter);
router.use(templatesRouter);
router.use(billingRouter);
router.use(adminRouter);
router.use(contactRouter);

export default router;
