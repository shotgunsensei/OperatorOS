type Tone = "bold" | "friendly" | "professional" | "playful" | "urgent" | "premium";

export interface KitInput {
  businessName: string;
  businessType: string;
  targetCustomer: string;
  offer: string;
  price?: string;
  location?: string;
  tone: Tone;
  painPoint: string;
  desiredAction: string;
  promoDeadline?: string;
  websiteUrl?: string;
  socialLinks?: string;
  brandProfileId?: number | null;
}

export interface GoogleAd {
  headline: string;
  description: string;
}
export interface EmailMessage {
  day: number;
  subject: string;
  body: string;
}
export interface FaqItem {
  question: string;
  answer: string;
}
export interface KitContent {
  heroHeadline: string;
  subheadline: string;
  valueProposition: string;
  offerStack: string[];
  adHeadlines: string[];
  adDescriptions: string[];
  googleAds: GoogleAd[];
  socialPosts: string[];
  smsPromos: string[];
  emailSequence: EmailMessage[];
  faq: FaqItem[];
  ctaButtons: string[];
  qrFlyerCopy: string;
  launchChecklist: string[];
}

const TONE_OPENERS: Record<Tone, string[]> = {
  bold: ["Stop settling.", "Built different.", "No more excuses.", "Cut the noise.", "Step up."],
  friendly: ["Hey there —", "Good news for you:", "Let's make it easy:", "Here's the deal:", "Friendly heads up:"],
  professional: ["Introducing", "Now available:", "A smarter way to", "Designed for", "Trusted by"],
  playful: ["Pssst...", "Plot twist:", "Surprise!", "You + this =", "Imagine if..."],
  urgent: ["Don't wait.", "Last chance:", "Move fast:", "Time's running out.", "Right now:"],
  premium: ["Crafted for", "Reserved for", "An invitation to", "The standard for", "Where excellence meets"],
};

const TONE_CLOSERS: Record<Tone, string[]> = {
  bold: ["No fluff. Just results.", "Built to win.", "Punch above your weight.", "Take the shot."],
  friendly: ["We're glad you're here.", "Let's do this together.", "Anything you need, just ask.", "Welcome aboard."],
  professional: ["Industry-grade results.", "Engineered for outcomes.", "Quality you can measure.", "Backed by real results."],
  playful: ["Let's have fun with it.", "Trust us, it's good.", "You'll thank yourself later.", "Game on."],
  urgent: ["Act before it's gone.", "Now or never.", "Don't blink.", "Limited spots remaining."],
  premium: ["For those who notice the details.", "Excellence, delivered.", "The finer way to do this.", "Worth every second."],
};

function pick<T>(arr: T[], n: number): T {
  return arr[((n % arr.length) + arr.length) % arr.length] as T;
}
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function generateKit(input: KitInput): KitContent {
  const t: Tone = (input.tone ?? "bold") as Tone;
  const seed = hash(
    `${input.businessName}|${input.offer}|${input.targetCustomer}|${input.painPoint}|${t}`,
  );
  const opener = pick(TONE_OPENERS[t], seed);
  const closer = pick(TONE_CLOSERS[t], seed + 3);
  const name = input.businessName.trim() || "Your Brand";
  const offer = input.offer.trim() || "our flagship offer";
  const audience = input.targetCustomer.trim() || "people like you";
  const pain = input.painPoint.trim() || "the same old problem";
  const action = input.desiredAction.trim() || "get started today";
  const price = input.price?.trim();
  const location = input.location?.trim();
  const deadline = input.promoDeadline?.trim();
  const url = input.websiteUrl?.trim();

  const heroHeadline = `${opener} ${titleCase(offer)} — Built for ${titleCase(audience)}`;
  const subheadline = `${name} helps ${audience} finally fix ${pain}. ${closer}`;
  const valueProposition = `If you're ${audience} tired of ${pain}, ${name} gives you ${offer}${
    price ? ` — starting at ${price}` : ""
  }${location ? `, available ${location}` : ""}. ${closer}`;

  const offerStack: string[] = [
    `${titleCase(offer)} — the core of what you get`,
    `Done-for-you onboarding so you stop guessing`,
    `Plain-language guide written for ${audience}`,
    `Real human support — no bots, no scripts`,
    `Money-back guarantee if it isn't a fit`,
  ];
  if (deadline) offerStack.push(`Bonus drop available until ${deadline}`);

  const adHeadlines: string[] = [
    `${titleCase(offer)} for ${titleCase(audience)}`,
    `Stop ${pain} — Try ${name}`,
    `${name}: ${titleCase(offer)} Done Right`,
    deadline ? `Ends ${deadline}: ${titleCase(offer)}` : `Limited Spots: ${titleCase(offer)}`,
    price ? `${price} for ${titleCase(offer)}` : `Free Quote: ${titleCase(offer)}`,
  ];
  const adDescriptions: string[] = [
    `${name} solves ${pain} for ${audience}. Click to ${action}.`,
    `Real ${audience} are switching to ${name}. See why in 30 seconds.`,
    `No fluff. ${titleCase(offer)} that actually works for ${audience}. ${action.charAt(0).toUpperCase() + action.slice(1)}.`,
    `${closer} ${titleCase(offer)} from ${name}.`,
    `${opener} ${titleCase(offer)}${price ? ` from ${price}` : ""}. ${action.charAt(0).toUpperCase() + action.slice(1)}.`,
  ];

  const googleAds: GoogleAd[] = [
    { headline: `${name} | ${titleCase(offer)}`, description: `${titleCase(offer)} for ${audience}. ${closer}` },
    { headline: `Fix ${titleCase(pain)} — Today`, description: `${name} helps ${audience} ${action}. ${price ? `From ${price}.` : ""}` },
    { headline: `${titleCase(audience)}, Read This`, description: `${name} delivers ${offer} without the usual headaches. ${closer}` },
    { headline: `Still ${titleCase(pain)}?`, description: `${name} is built for ${audience} who want ${offer}. Click to ${action}.` },
    { headline: `${name} — Trusted by ${titleCase(audience)}`, description: `${closer} ${titleCase(offer)}${deadline ? ` — ends ${deadline}` : ""}.` },
  ];

  const socialPosts: string[] = [
    `${opener} ${titleCase(offer)} — and yes, it's actually for ${audience}.`,
    `${name} exists because ${pain} should have been solved a decade ago.`,
    `Quick story: ${audience} kept asking us for ${offer}. So we built it. ${closer}`,
    `If ${pain} sounds familiar, this is your sign.`,
    `Three reasons ${audience} pick ${name} over the alternatives:\n1. ${titleCase(offer)}\n2. Real human support\n3. ${closer}`,
    `${titleCase(action)}. That's the whole pitch. Link in bio${url ? `: ${url}` : ""}.`,
    `Behind-the-scenes: how we built ${offer} for ${audience}. Thread coming.`,
    `Honest question for ${audience}: how much longer are you willing to put up with ${pain}?`,
    deadline ? `${deadline} is the deadline. Don't sleep on this.` : `New cohort opening this month. Don't sleep on this.`,
    `If this post made you nod, you're our people. ${closer}`,
  ];

  const smsPromos: string[] = [
    `${name}: ${titleCase(offer)}${price ? ` from ${price}` : ""}. Reply YES to ${action}.`,
    `${opener} ${titleCase(offer)} for ${audience}. Tap to learn more${url ? `: ${url}` : ""}.`,
    `Heads up — ${name} is offering ${offer}${deadline ? ` until ${deadline}` : ""}. Reply STOP to opt out.`,
    `Last chance${deadline ? ` (${deadline})` : ""}: ${titleCase(offer)} from ${name}.`,
    `${name}: still struggling with ${pain}? We can help. Reply YES.`,
  ];

  const emailSequence: EmailMessage[] = [
    {
      day: 1,
      subject: `Welcome to ${name} — here's what you actually get`,
      body: `Hey,\n\n${opener} ${titleCase(offer)} is built for ${audience}, and you're in.\n\nHere's what to expect:\n• Day 2: the story behind why ${name} exists\n• Day 3: how to get the most out of ${offer}\n• Day 5: a real customer story\n• Day 7: a special offer for new members\n\n${closer}\n\n— The ${name} team`,
    },
    {
      day: 2,
      subject: `Why ${name} exists`,
      body: `Most ${audience} we talked to were exhausted by ${pain}. We were too. So we built ${offer} the way it should have been from day one.\n\nIf you're curious, hit reply and tell us what brought you here.\n\n— ${name}`,
    },
    {
      day: 3,
      subject: `The 3 things to do first`,
      body: `Here's the fastest path to results with ${offer}:\n\n1. ${action.charAt(0).toUpperCase() + action.slice(1)} — don't overthink it.\n2. Tell us about ${pain} so we can tailor things.\n3. Use ${name} for 7 days. That's it.\n\n${closer}`,
    },
    {
      day: 5,
      subject: `Real story: how ${audience} used ${name}`,
      body: `One of our customers — ${audience}, exactly like you — was deep in ${pain}. After picking up ${offer}, things shifted within a week.\n\nWant the full story? Just reply.\n\n— ${name}`,
    },
    {
      day: 7,
      subject: `Your invitation: ${titleCase(offer)}${price ? ` — ${price}` : ""}`,
      body: `You've been with us a week. Time to make it official.\n\n${titleCase(offer)}${price ? `, ${price}` : ""}${deadline ? `, available until ${deadline}` : ""}.\n\nReady? ${action.charAt(0).toUpperCase() + action.slice(1)}${url ? ` at ${url}` : ""}.\n\n${closer}`,
    },
  ];

  const faq: FaqItem[] = [
    {
      question: `Who is ${name} for?`,
      answer: `${titleCase(audience)} who are tired of ${pain} and want ${offer} without the usual runaround.`,
    },
    {
      question: `How is this different from the alternatives?`,
      answer: `Most options were built for everyone. ${name} was built specifically for ${audience}. ${closer}`,
    },
    {
      question: `What does it cost?`,
      answer: price
        ? `${titleCase(offer)} starts at ${price}. No hidden fees, no surprise upsells.`
        : `Pricing depends on what you need. ${action.charAt(0).toUpperCase() + action.slice(1)} and we'll quote you fast.`,
    },
    {
      question: `How fast can I get started?`,
      answer: `Most ${audience} are up and running the same day. ${action.charAt(0).toUpperCase() + action.slice(1)} now and we'll handle the rest.`,
    },
    {
      question: `What if it's not a fit?`,
      answer: `We'd rather you say so than stay stuck. We offer a clear refund window — no awkward conversations.`,
    },
    {
      question: location ? `Do you serve ${location}?` : `Do you work with people outside the area?`,
      answer: location
        ? `Yes — ${name} serves ${location} and the surrounding area. Reach out for specifics.`
        : `Yes — ${name} works with ${audience} anywhere. Location is not a blocker.`,
    },
  ];

  const ctaButtons: string[] = [
    `${titleCase(action)}`,
    `Get ${titleCase(offer)} Now`,
    `Start with ${name}`,
    `Claim My Spot`,
    deadline ? `Lock In Before ${deadline}` : `See Pricing`,
    `Talk to ${name}`,
  ];

  const qrFlyerCopy = [
    `${name.toUpperCase()}`,
    `${titleCase(offer)} for ${titleCase(audience)}`,
    price ? `Starting at ${price}` : `Built for ${audience}`,
    location ? `Serving ${location}` : ``,
    deadline ? `Offer ends ${deadline}` : ``,
    `Scan to ${action}`,
    url ?? `Visit ${name} online`,
  ].filter(Boolean).join("\n");

  const launchChecklist: string[] = [
    `Confirm landing page copy reads correctly on mobile`,
    `Set up tracking pixels (Facebook + Google) before going live`,
    `Schedule the 5-email sequence in your email tool`,
    `Queue 10 social posts across the next 14 days`,
    `Print and place QR flyers in 3-5 visible locations${location ? ` around ${location}` : ""}`,
    `Configure SMS promo with opt-out and frequency cap`,
    `Test the primary CTA path end-to-end (click → form → confirmation)`,
    `Brief any team members on tone (${t}) and how to respond to inquiries`,
    deadline ? `Set a calendar reminder for ${deadline} (deadline copy goes stale fast)` : `Set a calendar reminder to refresh creatives every 14 days`,
    `Capture before/after metrics so the next launch is sharper`,
  ];

  return {
    heroHeadline,
    subheadline,
    valueProposition,
    offerStack,
    adHeadlines,
    adDescriptions,
    googleAds,
    socialPosts,
    smsPromos,
    emailSequence,
    faq,
    ctaButtons,
    qrFlyerCopy,
    launchChecklist,
  };
}

export function exportKitAsText(title: string, content: KitContent): string {
  const lines: string[] = [];
  const sep = "=".repeat(60);
  lines.push(sep, title.toUpperCase(), sep, "");

  lines.push("HERO HEADLINE", "-".repeat(40), content.heroHeadline, "");
  lines.push("SUBHEADLINE", "-".repeat(40), content.subheadline, "");
  lines.push("VALUE PROPOSITION", "-".repeat(40), content.valueProposition, "");

  lines.push("OFFER STACK", "-".repeat(40));
  content.offerStack.forEach((o, i) => lines.push(`${i + 1}. ${o}`));
  lines.push("");

  lines.push("AD HEADLINES", "-".repeat(40));
  content.adHeadlines.forEach((h, i) => lines.push(`${i + 1}. ${h}`));
  lines.push("");

  lines.push("AD DESCRIPTIONS", "-".repeat(40));
  content.adDescriptions.forEach((d, i) => lines.push(`${i + 1}. ${d}`));
  lines.push("");

  lines.push("GOOGLE ADS", "-".repeat(40));
  content.googleAds.forEach((a, i) =>
    lines.push(`${i + 1}. ${a.headline}`, `   ${a.description}`),
  );
  lines.push("");

  lines.push("SOCIAL POSTS", "-".repeat(40));
  content.socialPosts.forEach((p, i) => lines.push(`${i + 1}. ${p}`, ""));

  lines.push("SMS PROMOS", "-".repeat(40));
  content.smsPromos.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  lines.push("");

  lines.push("EMAIL SEQUENCE", "-".repeat(40));
  content.emailSequence.forEach((e) => {
    lines.push(`Day ${e.day} — Subject: ${e.subject}`, e.body, "");
  });

  lines.push("FAQ", "-".repeat(40));
  content.faq.forEach((f) => lines.push(`Q: ${f.question}`, `A: ${f.answer}`, ""));

  lines.push("CTA BUTTONS", "-".repeat(40));
  content.ctaButtons.forEach((c, i) => lines.push(`${i + 1}. ${c}`));
  lines.push("");

  lines.push("QR FLYER COPY", "-".repeat(40), content.qrFlyerCopy, "");

  lines.push("LAUNCH CHECKLIST", "-".repeat(40));
  content.launchChecklist.forEach((c, i) => lines.push(`[ ] ${i + 1}. ${c}`));

  return lines.join("\n");
}

export function exportKitAsMarkdown(title: string, content: KitContent): string {
  const md: string[] = [];
  md.push(`# ${title}`, "");
  md.push(`## Hero Headline`, "", content.heroHeadline, "");
  md.push(`## Subheadline`, "", content.subheadline, "");
  md.push(`## Value Proposition`, "", content.valueProposition, "");

  md.push(`## Offer Stack`, "");
  content.offerStack.forEach((o) => md.push(`- ${o}`));
  md.push("");

  md.push(`## Ad Headlines`, "");
  content.adHeadlines.forEach((h, i) => md.push(`${i + 1}. ${h}`));
  md.push("");

  md.push(`## Ad Descriptions`, "");
  content.adDescriptions.forEach((d, i) => md.push(`${i + 1}. ${d}`));
  md.push("");

  md.push(`## Google Ads`, "");
  content.googleAds.forEach((a, i) =>
    md.push(`${i + 1}. **${a.headline}** — ${a.description}`),
  );
  md.push("");

  md.push(`## Social Posts`, "");
  content.socialPosts.forEach((p, i) => md.push(`### Post ${i + 1}`, "", p, ""));

  md.push(`## SMS Promos`, "");
  content.smsPromos.forEach((s, i) => md.push(`${i + 1}. ${s}`));
  md.push("");

  md.push(`## Email Sequence`, "");
  content.emailSequence.forEach((e) =>
    md.push(`### Day ${e.day} — ${e.subject}`, "", e.body, ""),
  );

  md.push(`## FAQ`, "");
  content.faq.forEach((f) =>
    md.push(`**Q: ${f.question}**`, "", f.answer, ""),
  );

  md.push(`## CTA Buttons`, "");
  content.ctaButtons.forEach((c) => md.push(`- ${c}`));
  md.push("");

  md.push(`## QR Flyer Copy`, "", "```", content.qrFlyerCopy, "```", "");

  md.push(`## Launch Checklist`, "");
  content.launchChecklist.forEach((c) => md.push(`- [ ] ${c}`));

  return md.join("\n");
}

export function deriveTitle(input: KitInput): string {
  return `${input.businessName} — ${input.offer}`.slice(0, 120);
}
