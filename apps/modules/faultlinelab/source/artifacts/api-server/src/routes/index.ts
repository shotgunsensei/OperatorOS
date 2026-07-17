import { Router, type IRouter } from "express";
import healthRouter from "./health";
import profileRouter from "./profile";
import stripeRouter from "./stripe";
import adminRouter from "./admin";
import storageRouter from "./storage";
import crossPromoRouter from "./crossPromo";
import accountRouter from "./account";
import emailPreferencesRouter from "./emailPreferences";
import operatorOsRouter from "./operatoros";

const router: IRouter = Router();

router.use(healthRouter);
router.use(profileRouter);
router.use(adminRouter);
router.use(storageRouter);
router.use(crossPromoRouter);
router.use(accountRouter);
router.use(emailPreferencesRouter);
router.use(operatorOsRouter);
router.use("/stripe", stripeRouter);

export default router;
