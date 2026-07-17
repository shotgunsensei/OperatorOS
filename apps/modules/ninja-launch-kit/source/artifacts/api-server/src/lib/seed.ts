import { db, usersTable, brandProfilesTable, launchKitsTable, adminSettingsTable, featuredTemplatesTable } from "@workspace/db";
import { generateKit, deriveTitle, type KitInput } from "./generator";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

export async function runSeed(): Promise<void> {
  const [settings] = await db.select().from(adminSettingsTable).limit(1);
  if (!settings) {
    await db.insert(adminSettingsTable).values({
      demoMode: true,
      signupOpen: true,
      announcement: "Welcome to NinjaLaunchKit — demo mode is on so you can try everything without keys.",
    });
  }

  const [adminUser] = await db.select().from(usersTable).where(eq(usersTable.email, "admin@ninjalaunchkit.local"));
  if (!adminUser) {
    await db.insert(usersTable).values({
      email: "admin@ninjalaunchkit.local",
      name: "Ninja Admin",
      plan: "agency",
      role: "admin",
      subscriptionStatus: "demo",
    });
  }

  const [demo] = await db.select().from(usersTable).where(eq(usersTable.email, "demo@ninjalaunchkit.local"));
  let demoUserId: number;
  if (!demo) {
    const [created] = await db
      .insert(usersTable)
      .values({
        email: "demo@ninjalaunchkit.local",
        name: "Demo Operator",
        plan: "free",
        role: "user",
        subscriptionStatus: "demo",
      })
      .returning();
    demoUserId = created.id;
  } else {
    demoUserId = demo.id;
  }

  const existingBrands = await db.select().from(brandProfilesTable).where(eq(brandProfilesTable.userId, demoUserId));
  if (existingBrands.length === 0) {
    await db.insert(brandProfilesTable).values([
      {
        userId: demoUserId,
        name: "Shotgun Ninjas",
        primaryColor: "#DC2626",
        accentColor: "#0A0A0A",
        logoText: "SHOTGUN NINJAS",
        voice: "Bold, tactical, no fluff. Talk to operators who want to ship and win.",
        tagline: "Move fast. Hit hard. Stay sharp.",
      },
    ]);
  }

  const existingKits = await db.select().from(launchKitsTable).where(eq(launchKitsTable.userId, demoUserId));
  if (existingKits.length === 0) {
    const samples: KitInput[] = [
      {
        businessName: "Iron Forge Mechanics",
        businessType: "Mechanic/Trade",
        targetCustomer: "small fleet owners",
        offer: "Same-day diesel diagnostic + repair",
        price: "$149 diagnostic",
        location: "East Austin, TX",
        tone: "bold",
        painPoint: "trucks down, missed deliveries, vague repair quotes",
        desiredAction: "book a diagnostic slot this week",
        promoDeadline: "Friday 6pm",
        websiteUrl: "https://ironforge.example",
        socialLinks: "@ironforgemech",
        brandProfileId: null,
      },
      {
        businessName: "Lumen & Co. Pottery",
        businessType: "Online Product",
        targetCustomer: "design-forward home cooks",
        offer: "Hand-thrown stoneware dinnerware sets",
        price: "$240 set of 4",
        location: "ships nationwide",
        tone: "premium",
        painPoint: "mass-produced dishes that chip and feel hollow",
        desiredAction: "reserve a set from the spring drop",
        promoDeadline: "April 30",
        websiteUrl: "https://lumenpottery.example",
        socialLinks: "@lumenandco",
        brandProfileId: null,
      },
      {
        businessName: "South Loop Reset",
        businessType: "Course/Coaching",
        targetCustomer: "burned-out founders",
        offer: "6-week reset cohort with weekly 1:1s",
        price: "$1,200",
        location: "online",
        tone: "professional",
        painPoint: "running on adrenaline, no system, decisions made at 11pm",
        desiredAction: "book a 15-minute fit call",
        promoDeadline: "next cohort opens June 1",
        websiteUrl: "https://southloopreset.example",
        socialLinks: "@southloopreset",
        brandProfileId: null,
      },
    ];
    for (const input of samples) {
      const content = generateKit(input);
      await db.insert(launchKitsTable).values({
        userId: demoUserId,
        title: deriveTitle(input),
        businessType: input.businessType,
        input,
        content,
        watermarked: true,
      });
    }
  }

  const existingTemplates = await db.select().from(featuredTemplatesTable);
  if (existingTemplates.length === 0) {
    await db.insert(featuredTemplatesTable).values([
      { title: "Local Service Launch", businessType: "Local Service", description: "For mechanics, plumbers, and trades launching a seasonal promo.", tone: "bold" },
      { title: "Online Product Drop", businessType: "Online Product", description: "For makers and DTC brands launching a limited drop.", tone: "premium" },
      { title: "Coaching Cohort", businessType: "Course/Coaching", description: "For consultants and coaches opening a new cohort.", tone: "professional" },
    ]);
  }

  logger.info("Seed complete");
}
