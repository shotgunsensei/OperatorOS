import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import subscriptionRouter from "./subscription";
import scriptsRouter from "./scripts";
import adminRouter from "./admin";
import generateRouter from "./generate";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(subscriptionRouter);
router.use(scriptsRouter);
router.use(adminRouter);
router.use(generateRouter);

export default router;
