import { storage } from "./storage";
import { db } from "./db";
import { users, memberships, DEFAULT_DEPARTMENTS } from "@shared/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import bcrypt from "bcrypt";
import {
  getMasterAdminEmails,
  isDemoSeedsEnabled,
  isLocalReviewerEnabled,
} from "./config/masterAdmin";

const BCRYPT_ROUNDS = 12;

async function hashPasswordBcrypt(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

function getRequiredSeedPassword(label: string, envVar: string): string | null {
  const password = process.env[envVar];
  if (!password) {
    console.warn(`${label} seed skipped: ${envVar} must be set when the seed is explicitly enabled.`);
    return null;
  }
  return password;
}

export async function ensureSuperAdmin() {
  try {
    const masterEmails = getMasterAdminEmails();
    let promoted = 0;
    for (const email of masterEmails) {
      const [existing] = await db.select().from(users).where(eq(users.email, email));
      if (existing && !existing.isSuperAdmin) {
        await db.update(users).set({ isSuperAdmin: true }).where(eq(users.id, existing.id));
        promoted++;
      }
    }
    if (promoted > 0) {
      console.log(`Configured master admin identities reconciled: ${promoted} user(s) promoted by email.`);
    }
  } catch (err) {
    console.error("Error reconciling configured master admins:", err);
  }
}

export async function ensureDemoAccount() {
  if (!isDemoSeedsEnabled()) {
    return;
  }
  try {
    const existing = await storage.getUserByUsername("demo");
    if (existing) {
      const mems = await db.select().from(memberships).where(eq(memberships.userId, existing.id));
      if (mems.length > 0) {
        console.log("Demo account already exists with org, skipping.");
        return;
      }
      const org = await storage.createOrg({
        name: "Metro Health Network",
        slug: "metro-health-" + Date.now(),
        phone: "(555) 100-2000",
        email: "ops@metrohealth.org",
        address: "450 Medical Center Blvd, Suite 100",
      });
      await storage.createMembership(org.id, existing.id, "admin");
      for (const deptName of DEFAULT_DEPARTMENTS) {
        await storage.createDepartment(org.id, { name: deptName });
      }
      console.log("Demo org created for existing demo user.");
      return;
    }
    const demoPassword = getRequiredSeedPassword("Demo", "PULSEDESK_DEMO_PASSWORD");
    if (!demoPassword) return;
    await seedFullDemo(demoPassword);
  } catch (err) {
    console.error("Error ensuring demo account:", err);
  }
}

export async function ensureReviewerAccount() {
  if (!isLocalReviewerEnabled()) {
    return;
  }
  try {
    const existing = await storage.getUserByUsername("reviewer");
    if (existing) {
      const mems = await db.select().from(memberships).where(eq(memberships.userId, existing.id));
      if (mems.length > 0) {
        console.log("Reviewer account already exists with org, skipping.");
        return;
      }
      const demoUser = await storage.getUserByUsername("demo");
      if (demoUser) {
        const demoMems = await db.select().from(memberships).where(eq(memberships.userId, demoUser.id));
        if (demoMems.length > 0) {
          await storage.createMembership(demoMems[0].orgId, existing.id, "admin");
          console.log("Reviewer added as admin to demo org.");
          return;
        }
      }
      return;
    }
    const reviewerPassword = getRequiredSeedPassword("Reviewer", "PULSEDESK_REVIEWER_PASSWORD");
    if (!reviewerPassword) return;
    const reviewerUser = await db.insert(users).values({
      id: crypto.randomUUID(),
      username: "reviewer",
      password: await hashPasswordBcrypt(reviewerPassword),
      fullName: "App Reviewer",
      phone: "",
      email: "",
      isSuperAdmin: false,
    }).returning();
    const demoUser = await storage.getUserByUsername("demo");
    if (demoUser) {
      const demoMems = await db.select().from(memberships).where(eq(memberships.userId, demoUser.id));
      if (demoMems.length > 0) {
        await storage.createMembership(demoMems[0].orgId, reviewerUser[0].id, "admin");
      }
    }
    console.log("Reviewer account created for explicitly enabled local review workflow.");
  } catch (err) {
    console.error("Error ensuring reviewer account:", err);
  }
}

async function seedFullDemo(demoPassword: string) {
  const demoUser = await storage.createUser({
    username: "demo",
    password: await hashPasswordBcrypt(demoPassword),
    fullName: "Sarah Mitchell",
    phone: "(555) 234-5678",
    email: "sarah.mitchell@metrohealth.org",
  });

  const techUser = await storage.createUser({
    username: "jmorales",
    password: await hashPasswordBcrypt(demoPassword),
    fullName: "James Morales",
    phone: "(555) 345-6789",
    email: "james.morales@metrohealth.org",
  });

  const staffUser = await storage.createUser({
    username: "knguyen",
    password: await hashPasswordBcrypt(demoPassword),
    fullName: "Karen Nguyen",
    phone: "(555) 456-7890",
    email: "karen.nguyen@metrohealth.org",
  });

  const org = await storage.createOrg({
    name: "Metro Health Network",
    slug: "metro-health",
    phone: "(555) 100-2000",
    email: "ops@metrohealth.org",
    address: "450 Medical Center Blvd, Suite 100",
  });

  await storage.createMembership(org.id, demoUser.id, "admin");
  await storage.createMembership(org.id, techUser.id, "technician");
  await storage.createMembership(org.id, staffUser.id, "staff");

  const deptRecords: Record<string, any> = {};
  for (const deptName of DEFAULT_DEPARTMENTS) {
    const dept = await storage.createDepartment(org.id, { name: deptName });
    deptRecords[deptName] = dept;
  }

  const vendor1 = await storage.createVendor(org.id, {
    name: "MedTech Solutions",
    serviceType: "Medical Equipment Maintenance",
    phone: "(555) 800-1234",
    email: "service@medtechsolutions.com",
    emergencyContact: "(555) 800-9999",
    contractNotes: "Annual service contract. Priority response within 4 hours.",
  });

  const vendor2 = await storage.createVendor(org.id, {
    name: "ProFacility Services",
    serviceType: "HVAC & Building Maintenance",
    phone: "(555) 800-5678",
    email: "support@profacility.com",
    emergencyContact: "(555) 800-5555",
    contractNotes: "Monthly maintenance contract. Covers all HVAC units.",
  });

  await storage.createVendor(org.id, {
    name: "CleanHealth Environmental",
    serviceType: "Cleaning & Biohazard Remediation",
    phone: "(555) 800-3456",
    email: "dispatch@cleanhealth.com",
    emergencyContact: "(555) 800-3333",
    contractNotes: "Emergency cleaning services available 24/7.",
  });

  const asset1 = await storage.createAsset(org.id, {
    assetTag: "MRI-001",
    name: "Siemens MAGNETOM Vida 3T MRI",
    assetType: "MRI Scanner",
    location: "Building A, Floor 1, Room 102",
    departmentId: deptRecords["Radiology"]?.id,
    serviceVendor: "MedTech Solutions",
    warrantyNotes: "Under warranty until Dec 2026. Extended service plan active.",
    maintenanceNotes: "Quarterly helium level checks required.",
    status: "active",
  });

  const asset2 = await storage.createAsset(org.id, {
    assetTag: "CT-002",
    name: "GE Revolution CT Scanner",
    assetType: "CT Scanner",
    location: "Building A, Floor 1, Room 105",
    departmentId: deptRecords["Radiology"]?.id,
    serviceVendor: "MedTech Solutions",
    warrantyNotes: "Warranty expired. Service contract in place.",
    maintenanceNotes: "Annual tube replacement due Q3 2026.",
    status: "active",
  });

  await storage.createAsset(org.id, {
    assetTag: "US-003",
    name: "Philips EPIQ Elite Ultrasound",
    assetType: "Ultrasound",
    location: "Building B, Floor 2, Room 210",
    departmentId: deptRecords["Clinical Operations"]?.id,
    serviceVendor: "MedTech Solutions",
    warrantyNotes: "Under warranty until Sep 2026.",
    status: "active",
  });

  await storage.createAsset(org.id, {
    assetTag: "LAB-004",
    name: "Roche Cobas 6000 Analyzer",
    assetType: "Lab Analyzer",
    location: "Building A, Floor 2, Lab",
    departmentId: deptRecords["Lab"]?.id,
    serviceVendor: "MedTech Solutions",
    status: "under_service",
    maintenanceNotes: "Calibration error detected. Vendor dispatched.",
  });

  await storage.createAsset(org.id, {
    assetTag: "HVAC-005",
    name: "Carrier AquaEdge 23XRV Chiller",
    assetType: "HVAC Chiller",
    location: "Building A, Mechanical Room",
    departmentId: deptRecords["Facilities"]?.id,
    serviceVendor: "ProFacility Services",
    status: "active",
  });

  const ticket1 = await storage.createTicket(org.id, {
    title: "MRI suite cooling system malfunction",
    description: "The MRI suite temperature is rising above acceptable levels. Current reading is 78°F, should be below 70°F. MRI scanner has auto-shutdown warnings.",
    category: "facilities_building",
    priority: "critical",
    status: "in_progress",
    departmentId: deptRecords["Radiology"]?.id,
    location: "Building A, Floor 1",
    building: "A",
    floor: "1",
    room: "102",
    assetId: asset1.id,
    assignedTo: techUser.id,
    dueDate: new Date(Date.now() + 4 * 60 * 60 * 1000) as any,
    isPatientImpacting: true,
    vendorReference: "ProFacility WO-2024-445",
  }, demoUser.id);

  const ticket2 = await storage.createTicket(org.id, {
    title: "CT scanner calibration error",
    description: "CT scanner showing calibration drift errors during routine quality checks. Image quality may be compromised. Vendor service needed.",
    category: "medical_equipment",
    priority: "high",
    status: "waiting_vendor",
    departmentId: deptRecords["Radiology"]?.id,
    location: "Building A, Floor 1",
    building: "A",
    floor: "1",
    room: "105",
    assetId: asset2.id,
    assignedTo: techUser.id,
    dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000) as any,
    isPatientImpacting: true,
    vendorReference: "MedTech SR-88921",
  }, staffUser.id);

  await storage.createTicket(org.id, {
    title: "Billing office printer not responding",
    description: "HP LaserJet in the billing office is showing offline status. Staff unable to print patient statements and insurance forms.",
    category: "it_infrastructure",
    priority: "normal",
    status: "assigned",
    departmentId: deptRecords["Billing"]?.id,
    location: "Building B, Floor 1",
    building: "B",
    floor: "1",
    room: "112",
    assignedTo: techUser.id,
  }, staffUser.id);

  await storage.createTicket(org.id, {
    title: "Exam room 3 sink leak",
    description: "Slow leak under the sink in exam room 3. Water pooling on floor. Area has been cordoned off but room is out of service.",
    category: "facilities_building",
    priority: "high",
    status: "new",
    departmentId: deptRecords["Nursing"]?.id,
    location: "Building B, Floor 2",
    building: "B",
    floor: "2",
    room: "203",
    isPatientImpacting: true,
  }, staffUser.id);

  await storage.createTicket(org.id, {
    title: "Hand sanitizer dispensers empty - multiple locations",
    description: "Hand sanitizer dispensers empty in hallways B2-01 through B2-08. Compliance concern - need immediate refill.",
    category: "housekeeping_environmental",
    priority: "high",
    status: "triage",
    departmentId: deptRecords["Facilities"]?.id,
    location: "Building B, Floor 2",
    building: "B",
    floor: "2",
    isRepeatIssue: true,
    isRecurring: true,
  }, staffUser.id);

  await storage.createTicket(org.id, {
    title: "Badge reader malfunction at staff entrance",
    description: "Badge reader at the east staff entrance is not reading any cards. Staff having to use alternate entrance.",
    category: "safety_compliance",
    priority: "normal",
    status: "assigned",
    departmentId: deptRecords["IT"]?.id,
    location: "Building A, Ground Floor",
    building: "A",
    floor: "G",
    assignedTo: techUser.id,
  }, demoUser.id);

  await storage.createTicket(org.id, {
    title: "Waiting room chairs need replacement",
    description: "Several chairs in the main waiting room have torn upholstery and broken armrests. Request replacement of 6 chairs.",
    category: "administrative",
    priority: "low",
    status: "new",
    departmentId: deptRecords["Front Desk"]?.id,
    location: "Building A, Floor 1, Main Lobby",
    building: "A",
    floor: "1",
  }, staffUser.id);

  await storage.createTicket(org.id, {
    title: "Network switch failure in Lab",
    description: "Network switch in the lab server closet failed overnight. Lab workstations and analyzer connections are down.",
    category: "it_infrastructure",
    priority: "critical",
    status: "escalated",
    departmentId: deptRecords["Lab"]?.id,
    location: "Building A, Floor 2",
    building: "A",
    floor: "2",
    assignedTo: techUser.id,
    isPatientImpacting: true,
    dueDate: new Date(Date.now() + 2 * 60 * 60 * 1000) as any,
  }, demoUser.id);

  const resolvedTicket = await storage.createTicket(org.id, {
    title: "Broken thermostat in admin office",
    description: "Thermostat in the administration office is not responding to temperature adjustments.",
    category: "facilities_building",
    priority: "normal",
    status: "resolved",
    departmentId: deptRecords["Administration"]?.id,
    location: "Building A, Floor 3",
    building: "A",
    floor: "3",
    room: "301",
    assignedTo: techUser.id,
    rootCause: "Thermostat battery depleted",
    resolutionSummary: "Replaced thermostat batteries and recalibrated temperature settings. Confirmed proper operation.",
  }, staffUser.id);

  await storage.createTicket(org.id, {
    title: "Elevator B intermittent door sensor issue",
    description: "Elevator B doors occasionally fail to close properly. Intermittent sensor issue. Has happened 3 times this week.",
    category: "safety_compliance",
    priority: "high",
    status: "waiting_vendor",
    departmentId: deptRecords["Maintenance"]?.id,
    location: "Building A",
    building: "A",
    isRecurring: true,
    isRepeatIssue: true,
    vendorReference: "Otis Service Req #OT-7892",
  }, demoUser.id);

  await storage.createSupplyRequest(org.id, {
    requestType: "Medical Supplies",
    itemName: "Nitrile Examination Gloves (Medium)",
    quantity: 50,
    urgency: "high",
    departmentId: deptRecords["Nursing"]?.id,
    justification: "Current stock critically low. Less than 2 boxes remaining across all exam rooms.",
    status: "approved",
  }, staffUser.id);

  await storage.createSupplyRequest(org.id, {
    requestType: "Office Supplies",
    itemName: "HP 26A Toner Cartridges",
    quantity: 5,
    urgency: "normal",
    departmentId: deptRecords["Billing"]?.id,
    justification: "Monthly toner resupply for billing department printers.",
    status: "ordered",
  }, staffUser.id);

  await storage.createSupplyRequest(org.id, {
    requestType: "Cleaning Supplies",
    itemName: "Hand Sanitizer Refill Cartridges",
    quantity: 24,
    urgency: "high",
    departmentId: deptRecords["Facilities"]?.id,
    justification: "Multiple dispensers empty across Building B. Compliance requirement.",
    status: "pending",
  }, demoUser.id);

  await storage.createSupplyRequest(org.id, {
    requestType: "Medical Supplies",
    itemName: "Blood Collection Tubes (Lavender Top)",
    quantity: 10,
    urgency: "normal",
    departmentId: deptRecords["Lab"]?.id,
    justification: "Routine lab supply reorder.",
    status: "fulfilled",
  }, staffUser.id);

  await storage.createFacilityRequest(org.id, {
    requestType: "hvac",
    title: "AC unit making unusual noise - Admin wing",
    description: "The rooftop AC unit serving the admin wing is making a grinding noise. Temperature still maintained but noise is concerning.",
    location: "Building A, Admin Wing",
    building: "A",
    floor: "3",
    priority: "normal",
    status: "assigned",
    assignedTo: techUser.id,
  }, staffUser.id);

  await storage.createFacilityRequest(org.id, {
    requestType: "plumbing",
    title: "Water fountain not dispensing cold water",
    description: "The water fountain near the front desk waiting area is only dispensing room temperature water.",
    location: "Building A, Floor 1, Lobby",
    building: "A",
    floor: "1",
    priority: "low",
    status: "new",
  }, staffUser.id);

  await storage.createFacilityRequest(org.id, {
    requestType: "lighting",
    title: "Flickering lights in corridor B2",
    description: "Fluorescent lights in corridor B2 are flickering intermittently. Multiple tubes affected.",
    location: "Building B, Floor 2, Corridor",
    building: "B",
    floor: "2",
    priority: "normal",
    status: "in_progress",
    assignedTo: techUser.id,
  }, demoUser.id);

  await storage.upsertOrgAuthConfig(org.id, {
    authMode: "local",
  });

  console.log("PulseDesk demo data seeded successfully for explicitly enabled demo workflow.");
}

export async function seedDatabase() {
  if (!isDemoSeedsEnabled()) {
    return;
  }
  try {
    const existingUser = await storage.getUserByUsername("demo");
    if (existingUser) {
      console.log("Seed data already exists, skipping...");
      return;
    }
    console.log("Seeding PulseDesk database with demo data...");
    const demoPassword = getRequiredSeedPassword("Demo", "PULSEDESK_DEMO_PASSWORD");
    if (!demoPassword) return;
    await seedFullDemo(demoPassword);
  } catch (err) {
    console.error("Seed error:", err);
  }
}
