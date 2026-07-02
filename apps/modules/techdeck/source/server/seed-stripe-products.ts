import { getUncachableStripeClient } from "./stripeClient";

const PLANS = [
  {
    code: "pro",
    name: "Tech Deck Pro",
    description: "For individual IT professionals - 5 users, 25 GB storage, API access, client portal, status pages",
    monthlyPriceCents: 2900,
  },
  {
    code: "msp",
    name: "Tech Deck MSP",
    description: "For Managed Service Providers - 25 users, 100 GB storage, 500 reports/month, 50 webhooks",
    monthlyPriceCents: 7900,
  },
  {
    code: "enterprise",
    name: "Tech Deck Enterprise",
    description: "For large organizations - unlimited users, unlimited storage, unlimited reports, priority support",
    monthlyPriceCents: 29900,
  },
];

async function seedProducts() {
  console.log("Connecting to Stripe...");
  const stripe = await getUncachableStripeClient();

  for (const plan of PLANS) {
    console.log(`\nChecking if "${plan.name}" exists...`);

    const existing = await stripe.products.search({
      query: `metadata['plan_code']:'${plan.code}'`,
    });

    if (existing.data.length > 0) {
      console.log(`  "${plan.name}" already exists (${existing.data[0].id})`);

      const prices = await stripe.prices.list({
        product: existing.data[0].id,
        active: true,
      });

      if (prices.data.length > 0) {
        console.log(`  Price: ${prices.data[0].id} ($${(prices.data[0].unit_amount || 0) / 100}/mo)`);
      }
      continue;
    }

    console.log(`  Creating product "${plan.name}"...`);
    const product = await stripe.products.create({
      name: plan.name,
      description: plan.description,
      metadata: {
        plan_code: plan.code,
        app: "techdeck",
      },
    });
    console.log(`  Product created: ${product.id}`);

    console.log(`  Creating monthly price ($${plan.monthlyPriceCents / 100}/mo)...`);
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.monthlyPriceCents,
      currency: "usd",
      recurring: { interval: "month" },
      metadata: {
        plan_code: plan.code,
      },
    });
    console.log(`  Price created: ${price.id}`);
  }

  console.log("\nDone! Stripe products and prices are ready.");
  console.log("The webhook sync will automatically populate the stripe schema in your database.");
}

seedProducts().catch((err) => {
  console.error("Failed to seed Stripe products:", err);
  process.exit(1);
});
