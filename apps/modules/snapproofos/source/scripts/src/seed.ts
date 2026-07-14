import { db, templatesTable } from "@workspace/db";

const systemTemplates = [
  {
    name: "MSP Onsite Visit",
    description: "Standard managed service provider onsite visit documentation",
    industry: "IT / MSP",
    icon: "monitor",
    defaultJobType: "onsite_visit",
    sections: ["site_info", "findings", "recommendations", "parts", "labor", "notes"],
    isSystem: true,
  },
  {
    name: "Network Remediation Summary",
    description: "Network issue diagnosis, remediation steps, and resolution documentation",
    industry: "IT / MSP",
    icon: "wifi",
    defaultJobType: "network_remediation",
    sections: ["network_topology", "findings", "remediation_steps", "testing_results", "recommendations"],
    isSystem: true,
  },
  {
    name: "Workstation Deployment",
    description: "New workstation setup, configuration, and deployment tracking",
    industry: "IT / MSP",
    icon: "laptop",
    defaultJobType: "workstation_deployment",
    sections: ["hardware_specs", "software_installed", "configuration", "testing", "handoff_notes"],
    isSystem: true,
  },
  {
    name: "Server / Infrastructure Visit",
    description: "Server maintenance, upgrades, or infrastructure work documentation",
    industry: "IT / MSP",
    icon: "server",
    defaultJobType: "server_visit",
    sections: ["infrastructure_overview", "changes_made", "findings", "recommendations", "backup_status"],
    isSystem: true,
  },
  {
    name: "Vehicle Diagnostic Inspection",
    description: "Automotive diagnostic inspection and repair documentation",
    industry: "Automotive",
    icon: "car",
    defaultJobType: "vehicle_diagnostic",
    sections: ["vehicle_info", "diagnostic_codes", "findings", "repairs_performed", "parts", "labor", "recommendations"],
    isSystem: true,
  },
  {
    name: "Repair Estimate",
    description: "Detailed repair estimate with parts and labor breakdown",
    industry: "General Service",
    icon: "calculator",
    defaultJobType: "repair_estimate",
    sections: ["scope_of_work", "findings", "parts", "labor", "estimate_total", "terms"],
    isSystem: true,
  },
  {
    name: "Contractor Site Visit",
    description: "General contractor site visit and work documentation",
    industry: "Construction",
    icon: "hard-hat",
    defaultJobType: "site_visit",
    sections: ["site_conditions", "work_performed", "materials_used", "findings", "next_steps", "photos"],
    isSystem: true,
  },
  {
    name: "Security / Camera Install",
    description: "Security system or camera installation documentation",
    industry: "Security / Low-Voltage",
    icon: "shield",
    defaultJobType: "security_install",
    sections: ["equipment_installed", "camera_locations", "network_config", "testing_results", "client_training", "warranty_info"],
    isSystem: true,
  },
];

async function seed() {
  console.log("Seeding system templates...");

  for (const template of systemTemplates) {
    await db.insert(templatesTable).values(template).onConflictDoNothing();
  }

  console.log("Seed complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
