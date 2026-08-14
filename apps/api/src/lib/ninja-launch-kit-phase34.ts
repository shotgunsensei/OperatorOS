import { createHash } from 'node:crypto';
import sourceCatalog from '../generated/ninja-launch-kit-source-catalog.js';

export type NinjaLaunchPlan = 'free' | 'pro' | 'agency';
export type NinjaLaunchTone = 'bold' | 'friendly' | 'professional' | 'playful' | 'urgent' | 'premium';
export type NinjaLaunchExportFormat = 'txt' | 'markdown' | 'json';

export interface NinjaLaunchInput {
  businessName: string;
  businessType: string;
  targetCustomer: string;
  offer: string;
  price?: string;
  location?: string;
  tone: NinjaLaunchTone;
  painPoint: string;
  desiredAction: string;
  promoDeadline?: string;
  websiteUrl?: string;
  socialLinks?: string;
  brandProfileId?: string | null;
}

export interface NinjaLaunchContent {
  heroHeadline: string;
  subheadline: string;
  valueProposition: string;
  offerStack: string[];
  adHeadlines: string[];
  adDescriptions: string[];
  googleAds: Array<{ headline: string; description: string }>;
  socialPosts: string[];
  smsPromos: string[];
  emailSequence: Array<{ day: number; subject: string; body: string }>;
  faq: Array<{ question: string; answer: string }>;
  ctaButtons: string[];
  qrFlyerCopy: string;
  launchChecklist: string[];
}

export interface NinjaLaunchBrand {
  name: string;
  logoText?: string | null;
  primaryColor: string;
  accentColor: string;
  voice?: string | null;
}

export interface NinjaLaunchVisualBrief {
  id: string;
  title: string;
  category: 'image' | 'brand';
  dimensions: string | null;
  tools: readonly string[];
  composition: string;
  palette: string[];
  brief: string;
  locked: boolean;
}

export const NINJA_LAUNCH_SOURCE_CATALOG = sourceCatalog;
export const NINJA_LAUNCH_TEMPLATE_COUNT = sourceCatalog.counts.templates;
export const NINJA_LAUNCH_VISUAL_PROMO_COUNT = sourceCatalog.counts.visualPromos;

export const NINJA_LAUNCH_PLAN_LIMITS = Object.freeze({
  free: {
    kitsPerMonth: 2,
    brandProfiles: 0,
    exportFormats: ['txt'] as const,
    watermarked: true,
    variants: false,
    emailSms: false,
    whiteLabel: false,
    clientWorkspaces: false,
  },
  pro: {
    kitsPerMonth: null,
    brandProfiles: 5,
    exportFormats: ['txt', 'markdown', 'json'] as const,
    watermarked: false,
    variants: true,
    emailSms: true,
    whiteLabel: false,
    clientWorkspaces: false,
  },
  agency: {
    kitsPerMonth: null,
    brandProfiles: null,
    exportFormats: ['txt', 'markdown', 'json'] as const,
    watermarked: false,
    variants: true,
    emailSms: true,
    whiteLabel: true,
    clientWorkspaces: true,
  },
});

const toneOpeners: Record<NinjaLaunchTone, string[]> = {
  bold: ['Stop settling.', 'Built different.', 'Cut the noise.'],
  friendly: ['Good news:', "Let's make this easy:", 'Friendly heads up:'],
  professional: ['Introducing', 'A smarter way to', 'Designed for'],
  playful: ['Plot twist:', 'Imagine if...', 'You + this ='],
  urgent: ["Don't wait.", 'Move fast:', "Time's running out."],
  premium: ['Crafted for', 'An invitation to', 'The standard for'],
};

function hashNumber(value: string): number {
  let valueHash = 0;
  for (const character of value) valueHash = ((valueHash << 5) - valueHash + character.charCodeAt(0)) | 0;
  return Math.abs(valueHash);
}

function pick<T>(values: readonly T[], seed: number): T {
  return values[seed % values.length] as T;
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function templateRank(tier: NinjaLaunchPlan): number {
  return tier === 'agency' ? 2 : tier === 'pro' ? 1 : 0;
}

export function mayUseTemplate(plan: NinjaLaunchPlan, tier: NinjaLaunchPlan): boolean {
  return templateRank(plan) >= templateRank(tier);
}

export function catalogForPlan(plan: NinjaLaunchPlan) {
  return sourceCatalog.templates.map((template) => ({
    ...template,
    locked: !mayUseTemplate(plan, template.tier),
    prefill: mayUseTemplate(plan, template.tier) ? template.prefill : undefined,
  }));
}

export function templateBySlug(slug: string) {
  return sourceCatalog.templates.find((template) => template.slug === slug) ?? null;
}

export function generateDeterministicKit(input: NinjaLaunchInput): NinjaLaunchContent {
  const seed = hashNumber(JSON.stringify(input));
  const opener = pick(toneOpeners[input.tone], seed);
  const place = input.location ? ` in ${input.location}` : '';
  const price = input.price ? ` for ${input.price}` : '';
  const deadline = input.promoDeadline ? ` before ${input.promoDeadline}` : '';
  const destination = input.websiteUrl || 'the approved launch destination';
  const cta = input.desiredAction.trim();
  return {
    heroHeadline: `${opener} ${input.businessName} makes ${input.offer} possible.`,
    subheadline: `${input.targetCustomer}${place} can solve ${input.painPoint}${price}${deadline}.`,
    valueProposition: `${input.businessName} gives ${input.targetCustomer} a clear path from ${input.painPoint} to ${input.offer}, with a direct next step and no invented claims.`,
    offerStack: [input.offer, input.price ? `Transparent price: ${input.price}` : 'Clear offer details', input.location ? `Available in ${input.location}` : 'Simple next-step instructions'],
    adHeadlines: [`${input.offer} from ${input.businessName}`, `${cta} today`, `${input.painPoint}? Start here.`, `${input.businessName}${place}`, `${input.offer}${price}`],
    adDescriptions: [
      `${input.targetCustomer}: ${input.offer}. ${cta} at ${destination}.`,
      `A direct answer to ${input.painPoint}${place}. Review details and ${cta.toLowerCase()}.`,
      `${input.businessName} presents ${input.offer}${deadline}. Terms require owner review.`,
    ],
    googleAds: [
      { headline: `${input.offer}`.slice(0, 30), description: `${input.businessName}: ${cta}. ${input.painPoint} addressed clearly.`.slice(0, 90) },
      { headline: `${cta} | ${input.businessName}`.slice(0, 30), description: `${input.targetCustomer}${place}: see the offer and approved details.`.slice(0, 90) },
    ],
    socialPosts: [
      `${opener} If ${input.painPoint} sounds familiar, ${input.businessName} built ${input.offer} for you. ${cta}: ${destination}`,
      `What would change if ${input.painPoint} stopped slowing you down? Explore ${input.offer}${price}.`,
      `${input.businessName}${place}. One focused offer: ${input.offer}. One clear next step: ${cta}.`,
      `Behind the launch: we designed this for ${input.targetCustomer} and kept the offer straightforward.`,
      `${input.promoDeadline ? `Deadline: ${input.promoDeadline}. ` : ''}${cta} at ${destination}.`,
    ],
    smsPromos: [
      `${input.businessName}: ${input.offer}${price}. ${cta}: ${destination}`.slice(0, 300),
      `${input.promoDeadline ? `Ends ${input.promoDeadline}. ` : ''}${input.offer}. ${cta}: ${destination}`.slice(0, 300),
    ],
    emailSequence: [
      { day: 0, subject: `${input.offer} from ${input.businessName}`, body: `${input.targetCustomer},\n\n${input.businessName} created ${input.offer} to address ${input.painPoint}.\n\n${cta}: ${destination}` },
      { day: 2, subject: `A clearer way past ${input.painPoint}`, body: `Here is what the offer includes:\n- ${input.offer}\n- ${input.price || 'Full details at the approved destination'}\n\n${cta}: ${destination}` },
      { day: 5, subject: `${input.promoDeadline ? `Before ${input.promoDeadline}: ` : ''}${cta}`, body: `If ${input.offer} fits your needs, review the approved terms and take the next step at ${destination}.` },
    ],
    faq: [
      { question: 'Who is this for?', answer: input.targetCustomer },
      { question: 'What is included?', answer: input.offer },
      { question: 'What does it cost?', answer: input.price || 'See the approved offer details.' },
      { question: 'Where is it available?', answer: input.location || 'See the approved launch destination.' },
      { question: 'What should I do next?', answer: `${cta} at ${destination}.` },
    ],
    ctaButtons: [cta, `See ${input.offer}`, 'View offer details', input.promoDeadline ? `Act before ${input.promoDeadline}` : 'Get started'],
    qrFlyerCopy: `${input.businessName}\n${input.offer}\n${input.price || ''}\n${cta}\nScan the owner-provided QR code or visit ${destination}.`,
    launchChecklist: [
      'Confirm the offer, audience, price, location, and deadline.',
      'Review every claim, disclaimer, destination URL, and consent requirement.',
      'Approve landing, ads, email/SMS, social, FAQ, CTA, and flyer copy.',
      'Build and review all entitled visual-promo assets.',
      'Test mobile pages, forms, analytics, and source attribution.',
      'Schedule launch channels and assign an owner.',
      'Export and archive the approved launch kit.',
      'Record post-launch results from real provider data only.',
    ],
  };
}

export function isCompleteContent(value: unknown): value is NinjaLaunchContent {
  if (!value || typeof value !== 'object') return false;
  const content = value as Record<string, unknown>;
  const strings = ['heroHeadline', 'subheadline', 'valueProposition', 'qrFlyerCopy'];
  const arrays = ['offerStack', 'adHeadlines', 'adDescriptions', 'googleAds', 'socialPosts', 'smsPromos', 'emailSequence', 'faq', 'ctaButtons', 'launchChecklist'];
  return strings.every((key) => typeof content[key] === 'string' && String(content[key]).trim().length > 0)
    && arrays.every((key) => Array.isArray(content[key]) && (content[key] as unknown[]).length > 0);
}

function paletteFor(input: NinjaLaunchInput, brand?: NinjaLaunchBrand | null): string[] {
  if (brand) return [brand.primaryColor, brand.accentColor, '#F8FAFC'];
  const type = input.businessType.toLowerCase();
  if (/auto|mechanic|repair|garage/.test(type)) return ['#0F172A', '#F97316', '#E2E8F0'];
  if (/health|fitness|wellness/.test(type)) return ['#0E7C66', '#FACC15', '#F8FAFC'];
  if (/cyber|tech|it|software|saas/.test(type)) return ['#0B1220', '#22D3EE', '#94A3B8'];
  if (/food|restaurant|cafe|bakery/.test(type)) return ['#7C2D12', '#FBBF24', '#FEF3C7'];
  return ['#111827', '#DC2626', '#F3F4F6'];
}

export function generateVisualPromos(input: NinjaLaunchInput, content: NinjaLaunchContent, plan: NinjaLaunchPlan, brand?: NinjaLaunchBrand | null): NinjaLaunchVisualBrief[] {
  const palette = paletteFor(input, brand);
  const label = brand?.logoText || brand?.name || input.businessName;
  return sourceCatalog.visualPromos.map((definition, index) => {
    const locked = plan === 'free' && definition.id !== 'facebook-ad';
    const composition = definition.category === 'image'
      ? `Use a ${index % 2 === 0 ? 'left-weighted' : 'centered'} hierarchy: brand mark, ${content.heroHeadline}, concise offer, then ${input.desiredAction}. Preserve clear space for safe cropping.`
      : `Build a reusable ${definition.title.toLowerCase()} system for ${label}, with accessible contrast and consistent application across the launch kit.`;
    return {
      ...definition,
      composition,
      palette,
      locked,
      brief: locked ? '' : [
        `${definition.title} — ${definition.dimensions || 'scalable brand system'}`,
        `Brand: ${label}`,
        `Audience: ${input.targetCustomer}`,
        `Message: ${content.heroHeadline}`,
        `Composition: ${composition}`,
        `Palette: ${palette.join(', ')}`,
        `Tools: ${definition.tools.join(', ')}`,
        `CTA: ${input.desiredAction}`,
        'Use only owner-approved claims, imagery, logos, and destination links.',
        plan === 'agency' ? 'White-label delivery: remove Ninja Launch Kit attribution before client handoff.' : 'Retain Ninja Launch Kit attribution where the current plan requires it.',
      ].join('\n'),
    };
  });
}

function renderSections(title: string, input: NinjaLaunchInput, content: NinjaLaunchContent, visuals: NinjaLaunchVisualBrief[], markdown: boolean): string {
  const heading = (level: number, value: string) => markdown ? `${'#'.repeat(level)} ${value}` : value.toUpperCase();
  const list = (values: readonly string[]) => values.map((value) => `- ${value}`).join('\n');
  const unlocked = visuals.filter((brief) => !brief.locked);
  return [
    heading(1, title),
    `${input.businessName} · ${input.businessType} · ${input.targetCustomer}`,
    heading(2, 'Landing copy'), content.heroHeadline, content.subheadline, content.valueProposition, list(content.offerStack),
    heading(2, 'Advertising'), list(content.adHeadlines), list(content.adDescriptions),
    heading(2, 'Google ads'), ...content.googleAds.map((ad) => `${ad.headline}\n${ad.description}`),
    heading(2, 'Email sequence'), ...content.emailSequence.map((email) => `Day ${email.day}: ${email.subject}\n${email.body}`),
    heading(2, 'SMS'), list(content.smsPromos),
    heading(2, 'Social posts'), list(content.socialPosts),
    heading(2, 'FAQ'), ...content.faq.map((item) => `${item.question}\n${item.answer}`),
    heading(2, 'Calls to action'), list(content.ctaButtons),
    heading(2, 'QR and flyer copy'), content.qrFlyerCopy,
    heading(2, 'Launch checklist'), list(content.launchChecklist),
    heading(2, 'Visual promo briefs'), ...unlocked.map((brief) => `${heading(3, brief.title)}\n${brief.brief}`),
  ].join('\n\n');
}

export function exportProductKit(args: { title: string; input: NinjaLaunchInput; content: NinjaLaunchContent; visuals: NinjaLaunchVisualBrief[]; plan: NinjaLaunchPlan; format: NinjaLaunchExportFormat }) {
  const watermark = NINJA_LAUNCH_PLAN_LIMITS[args.plan].watermarked ? '\n\nGenerated with Ninja Launch Kit — OperatorOS.' : '';
  const payload = {
    schemaVersion: 1,
    title: args.title,
    input: args.input,
    content: args.content,
    visualPromos: args.visuals.filter((brief) => !brief.locked),
    plan: args.plan,
    whiteLabel: args.plan === 'agency',
  };
  const content = args.format === 'json'
    ? JSON.stringify(payload, null, 2)
    : `${renderSections(args.title, args.input, args.content, args.visuals, args.format === 'markdown')}${watermark}`;
  return {
    content,
    mimeType: args.format === 'json' ? 'application/json' : args.format === 'markdown' ? 'text/markdown; charset=utf-8' : 'text/plain; charset=utf-8',
    extension: args.format === 'markdown' ? 'md' : args.format,
    sha256: sha256(content),
  };
}
