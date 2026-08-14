import { getUncachableStripeClient } from './stripeClient';

const DESIRED_PRODUCTS = [
  {
    name: 'PulseDesk Pro',
    description: '365/Entra login, up to 50 users',
    metadata: { plan: 'pro', maxMembers: '50', entraEnabled: 'true' },
    monthlyPrice: 6000,
  },
  {
    name: 'PulseDesk Pro Plus',
    description: '365/Entra login, up to 100 users',
    metadata: { plan: 'pro_plus', maxMembers: '100', entraEnabled: 'true' },
    monthlyPrice: 8000,
  },
  {
    name: 'PulseDesk Enterprise',
    description: 'All features, up to 200 users',
    metadata: { plan: 'enterprise', maxMembers: '200', entraEnabled: 'true' },
    monthlyPrice: 10000,
  },
  {
    name: 'PulseDesk Unlimited',
    description: 'All features, unlimited users',
    metadata: { plan: 'unlimited', maxMembers: 'unlimited', entraEnabled: 'true' },
    monthlyPrice: 20000,
  },
];

async function createProducts() {
  try {
    const stripe = await getUncachableStripeClient();

    console.log('Syncing PulseDesk subscription products...');

    const existing = await stripe.products.list({ limit: 100, active: true });
    const existingByName: Record<string, any> = {};
    for (const p of existing.data) {
      if (p.name.startsWith('PulseDesk')) {
        existingByName[p.name] = p;
      }
    }

    for (const desired of DESIRED_PRODUCTS) {
      const existing = existingByName[desired.name];

      if (existing) {
        const needsUpdate =
          existing.description !== desired.description ||
          JSON.stringify(existing.metadata) !== JSON.stringify(desired.metadata);

        if (needsUpdate) {
          await stripe.products.update(existing.id, {
            description: desired.description,
            metadata: desired.metadata,
          });
          console.log(`Updated product: ${desired.name}`);
        }

        const prices = await stripe.prices.list({ product: existing.id, active: true });
        const monthlyPrice = prices.data.find(p => p.recurring?.interval === 'month');
        if (!monthlyPrice || monthlyPrice.unit_amount !== desired.monthlyPrice) {
          if (monthlyPrice) {
            await stripe.prices.update(monthlyPrice.id, { active: false });
          }
          await stripe.prices.create({
            product: existing.id,
            unit_amount: desired.monthlyPrice,
            currency: 'usd',
            recurring: { interval: 'month' },
          });
          console.log(`Updated ${desired.name} monthly price to $${(desired.monthlyPrice / 100).toFixed(0)}/mo`);
        }

        const yearlyPrices = prices.data.filter(p => p.recurring?.interval === 'year');
        for (const yp of yearlyPrices) {
          await stripe.prices.update(yp.id, { active: false });
          console.log(`Deactivated old yearly price for ${desired.name}`);
        }

        delete existingByName[desired.name];
        continue;
      }

      const product = await stripe.products.create({
        name: desired.name,
        description: desired.description,
        metadata: desired.metadata,
      });
      console.log(`Created product: ${desired.name} (${product.id})`);

      await stripe.prices.create({
        product: product.id,
        unit_amount: desired.monthlyPrice,
        currency: 'usd',
        recurring: { interval: 'month' },
      });
      console.log(`Created ${desired.name} monthly price: $${(desired.monthlyPrice / 100).toFixed(0)}/mo`);
    }

    for (const [name, product] of Object.entries(existingByName)) {
      await stripe.products.update(product.id, { active: false });
      console.log(`Deactivated obsolete product: ${name}`);
    }

    console.log('Product sync complete!');
  } catch (error: any) {
    console.error('Error syncing products:', error.message);
    process.exit(1);
  }
}

createProducts();
