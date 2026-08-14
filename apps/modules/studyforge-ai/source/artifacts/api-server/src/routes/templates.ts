import { Router, type IRouter } from "express";
import { STUDY_TEMPLATES } from "../lib/templates";

const router: IRouter = Router();

router.get("/templates", (_req, res) => {
  res.json(STUDY_TEMPLATES);
});

export default router;
