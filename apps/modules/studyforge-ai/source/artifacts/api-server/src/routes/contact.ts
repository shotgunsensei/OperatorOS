import { Router, type IRouter } from "express";
import { SubmitContactBody } from "@workspace/api-zod";
import { rateLimit } from "../lib/rateLimit";

const router: IRouter = Router();

const contactLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, key: "contact" });

router.post("/contact", contactLimiter, async (req, res): Promise<void> => {
  const parsed = SubmitContactBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  // For now, log to the structured logger. In production this would forward
  // to an email service (Resend / Postmark / SES) or a CRM webhook.
  req.log.info(
    { contactName: parsed.data.name, contactEmail: parsed.data.email, contactMessageLength: parsed.data.message.length },
    "Contact form submission",
  );
  res.json({ ok: true });
});

export default router;
