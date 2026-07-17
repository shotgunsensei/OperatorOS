import { eq, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  studySetsTable,
  examCountdownsTable,
  foldersTable,
} from "@workspace/db";
import { hashPassword } from "./auth";
import { applyMaterialsToSet } from "./studySetService";
import { generateMaterials } from "./generator";
import { logger } from "./logger";

interface SeedSet {
  title: string;
  subject: string;
  course?: string;
  difficulty: "easy" | "medium" | "hard";
  examOffsetDays?: number;
  notes: string;
}

const SAMPLE_SETS: SeedSet[] = [
  {
    title: "Cell Biology Fundamentals",
    subject: "Biology",
    course: "BIO 101",
    difficulty: "medium",
    examOffsetDays: 12,
    notes: `The cell is the basic unit of life. Prokaryotic cells lack a nucleus and membrane-bound organelles, while eukaryotic cells contain both. The cell membrane is a phospholipid bilayer that controls what enters and exits the cell. Mitochondria produce ATP through cellular respiration and are known as the powerhouse of the cell. The nucleus contains DNA and controls cellular activities. Ribosomes synthesize proteins from amino acids using messenger RNA. The endoplasmic reticulum transports materials within the cell. The Golgi apparatus modifies and packages proteins for transport. Lysosomes contain digestive enzymes that break down waste. Photosynthesis in chloroplasts converts light energy into glucose. The cell cycle includes interphase, mitosis, and cytokinesis. Meiosis produces gametes with half the chromosome number. DNA replication is semi-conservative and occurs during the S phase.`,
  },
  {
    title: "Algebra II Essentials",
    subject: "Mathematics",
    course: "MATH 200",
    difficulty: "medium",
    examOffsetDays: 21,
    notes: `Linear equations have the form y equals mx plus b where m is the slope and b is the y-intercept. The slope formula is rise over run. Quadratic equations follow ax squared plus bx plus c equals zero. The quadratic formula solves any quadratic equation. The discriminant is b squared minus 4ac. A positive discriminant means two real solutions. Polynomials are expressions with multiple terms. Factoring breaks polynomials into simpler products. The FOIL method multiplies two binomials. Exponential functions grow rapidly and have the form y equals a times b to the x power. Logarithms are the inverse of exponential functions. Systems of equations can be solved by substitution or elimination. Functions map inputs to unique outputs.`,
  },
  {
    title: "World History: 20th Century",
    subject: "History",
    course: "HIST 105",
    difficulty: "medium",
    examOffsetDays: 9,
    notes: `World War I began in 1914 after the assassination of Archduke Franz Ferdinand. The Treaty of Versailles ended the war in 1919 and imposed harsh penalties on Germany. The Russian Revolution of 1917 led to the rise of the Soviet Union under Lenin. The Great Depression began in 1929 with the stock market crash. World War II started in 1939 with the German invasion of Poland. The Holocaust killed six million Jews and millions of others. The atomic bombs dropped on Hiroshima and Nagasaki ended the war in 1945. The Cold War divided the world between the United States and the Soviet Union. The Berlin Wall fell in 1989 and the Soviet Union dissolved in 1991. Decolonization transformed Africa and Asia after World War II.`,
  },
  {
    title: "Spanish Vocabulary: Travel",
    subject: "Spanish",
    course: "SPAN 110",
    difficulty: "easy",
    examOffsetDays: 5,
    notes: `Aeropuerto means airport. Estacion means station. Tren means train. Autobus means bus. Coche means car. Bicicleta means bicycle. Hotel means hotel. Habitacion means room. Llave means key. Maleta means suitcase. Pasaporte means passport. Boleto means ticket. Mapa means map. Calle means street. Plaza means square. Restaurante means restaurant. Comida means food. Cena means dinner. Desayuno means breakfast. Agua means water. Cafe means coffee.`,
  },
  {
    title: "CompTIA A+ Hardware Basics",
    subject: "IT Certification",
    course: "CompTIA A+",
    difficulty: "hard",
    examOffsetDays: 30,
    notes: `The CPU is the central processing unit and executes instructions. RAM is random access memory and provides volatile storage. DDR4 and DDR5 are common RAM types. The motherboard connects all components. ATX, microATX, and ITX are common motherboard form factors. Power supplies convert AC to DC and provide power to components. Hard disk drives store data magnetically. Solid state drives use flash memory and are faster. NVMe drives connect via PCIe for the highest speeds. Graphics processing units render images and accelerate compute. Common ports include USB, HDMI, DisplayPort, Ethernet, and audio jacks. BIOS and UEFI are firmware that initialize hardware at boot.`,
  },
  {
    title: "Nursing: Vital Signs",
    subject: "Medicine",
    course: "NURS 201",
    difficulty: "medium",
    examOffsetDays: 14,
    notes: `Vital signs include temperature, pulse, respiration, and blood pressure. Normal adult body temperature is around 98.6 degrees Fahrenheit. Normal resting heart rate is 60 to 100 beats per minute. Tachycardia is a heart rate over 100. Bradycardia is a heart rate under 60. Normal respiration rate is 12 to 20 breaths per minute. Normal blood pressure is around 120 over 80. Hypertension is elevated blood pressure. Hypotension is low blood pressure. Pulse oximetry measures blood oxygen saturation. Normal oxygen saturation is 95 to 100 percent. Pain is sometimes called the fifth vital sign and is rated on a 0 to 10 scale.`,
  },
  {
    title: "Intro to Psychology",
    subject: "Psychology",
    course: "PSYC 100",
    difficulty: "easy",
    examOffsetDays: 18,
    notes: `Psychology is the scientific study of behavior and mental processes. Behaviorism focuses on observable behavior. Classical conditioning was developed by Pavlov using dogs and bells. Operant conditioning was developed by Skinner using reinforcement and punishment. Cognitive psychology studies thinking, memory, and problem solving. The brain has four lobes: frontal, parietal, temporal, and occipital. Neurons communicate using neurotransmitters at synapses. Memory has three stages: sensory, short-term, and long-term. Sleep includes REM and non-REM stages. Maslow proposed a hierarchy of human needs. Personality theories include the Big Five traits.`,
  },
  {
    title: "Literature: The Great Gatsby",
    subject: "Literature",
    course: "ENGL 220",
    difficulty: "medium",
    examOffsetDays: 7,
    notes: `The Great Gatsby was written by F. Scott Fitzgerald and published in 1925. Jay Gatsby is a wealthy man who throws lavish parties hoping to win back Daisy Buchanan. Daisy is married to Tom Buchanan, a brutish old-money aristocrat. Nick Carraway is the narrator and Daisy's cousin. The green light at the end of Daisy's dock symbolizes Gatsby's hopes and dreams. The Valley of Ashes represents moral and social decay. The eyes of Doctor T J Eckleburg watch over the wasteland like a forgotten god. The novel critiques the American Dream and the corruption of wealth. Major themes include illusion versus reality, time, and class.`,
  },
];

export async function ensureSeed(): Promise<void> {
  const userCount = await db.execute(sql`SELECT COUNT(*)::int AS c FROM users`);
  const c = (userCount.rows[0] as { c: number } | undefined)?.c ?? 0;
  if (c > 0) {
    logger.info({ users: c }, "Seed skipped (users already exist)");
    return;
  }
  logger.info("Seeding StudyForge AI demo data...");

  const passwordHash = hashPassword("demo123");
  const [student] = await db
    .insert(usersTable)
    .values({
      email: "student@example.com",
      name: "Alex Student",
      passwordHash,
      role: "student",
      plan: "free",
    })
    .returning();
  await db.insert(usersTable).values({
    email: "tutor@example.com",
    name: "Jordan Tutor",
    passwordHash,
    role: "tutor",
    plan: "tutor",
  });
  await db.insert(usersTable).values({
    email: "admin@example.com",
    name: "Riley Admin",
    passwordHash,
    role: "admin",
    plan: "pro",
  });

  // Add a couple of folders for the student
  const [biologyFolder] = await db
    .insert(foldersTable)
    .values({ userId: student.id, name: "Sciences", color: "#7c3aed" })
    .returning();
  await db.insert(foldersTable).values({
    userId: student.id,
    name: "Languages",
    color: "#3b82f6",
  });

  const today = new Date();
  for (const seed of SAMPLE_SETS) {
    const examDate = seed.examOffsetDays
      ? new Date(today.getTime() + seed.examOffsetDays * 86400000).toISOString().slice(0, 10)
      : null;
    const folderId = seed.subject === "Biology" || seed.subject === "Mathematics" ? biologyFolder.id : null;
    const [set] = await db
      .insert(studySetsTable)
      .values({
        userId: student.id,
        folderId,
        title: seed.title,
        subject: seed.subject,
        course: seed.course ?? null,
        difficulty: seed.difficulty,
        notes: seed.notes,
        examDate,
      })
      .returning();
    const materials = generateMaterials({
      notes: seed.notes,
      title: seed.title,
      subject: seed.subject,
      difficulty: seed.difficulty,
      examDate,
      maxFlashcards: 25,
    });
    await applyMaterialsToSet(set.id, materials);
    if (examDate) {
      await db.insert(examCountdownsTable).values({
        userId: student.id,
        studySetId: set.id,
        examName: seed.title,
        examDate,
      });
    }
  }
  logger.info("Seeding complete.");
}
