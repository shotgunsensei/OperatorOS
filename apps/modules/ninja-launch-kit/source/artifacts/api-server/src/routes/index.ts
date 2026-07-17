import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sessionRouter from "./session";
import kitsRouter from "./kits";
import brandsRouter from "./brands";
import dashboardRouter from "./dashboard";
import billingRouter from "./billing";
import adminRouter from "./admin";
import templatesRouter from "./templates";
import visualPromoRouter from "./visual-promo";
import ssoRouter from "./sso";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sessionRouter);
router.use(kitsRouter);
router.use(brandsRouter);
router.use(dashboardRouter);
router.use(billingRouter);
router.use(adminRouter);
router.use(templatesRouter);
router.use(visualPromoRouter);
router.use(ssoRouter);

export default router;
