import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import productRouter from "./product";
import billingRouter from "./billing";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(productRouter);
router.use(billingRouter);

export default router;
