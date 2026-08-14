export interface StudyTemplateDef {
  id: string;
  name: string;
  description: string;
  subject: string;
  difficulty: string;
  sampleNotes: string;
  icon: string;
}

export const STUDY_TEMPLATES: StudyTemplateDef[] = [
  {
    id: "vocab-memorization",
    name: "Vocabulary Memorization",
    description: "Drill new terms with flashcards and short-answer recall.",
    subject: "Languages",
    difficulty: "easy",
    icon: "BookOpenText",
    sampleNotes:
      "Ephemeral: lasting for a very short time. Ubiquitous: present everywhere. Pragmatic: dealing with things sensibly and realistically. Ambiguous: open to more than one interpretation. Esoteric: intended for or likely to be understood by only a small number of people with specialized knowledge.",
  },
  {
    id: "chapter-review",
    name: "Chapter Review",
    description: "Turn a textbook chapter into review notes and a quiz.",
    subject: "General",
    difficulty: "medium",
    icon: "BookMarked",
    sampleNotes:
      "Chapter 4 covers cellular respiration. Glycolysis converts glucose into pyruvate in the cytoplasm. The Krebs cycle occurs in the mitochondrial matrix and produces NADH and FADH2. The electron transport chain uses these carriers to generate ATP. Aerobic respiration yields about 36 ATP per glucose molecule.",
  },
  {
    id: "cert-exam",
    name: "Certification Exam Prep",
    description: "Practice MCQs and a study plan up to your exam date.",
    subject: "IT Certification",
    difficulty: "hard",
    icon: "ShieldCheck",
    sampleNotes:
      "CompTIA A+ covers hardware, networking, mobile devices, security, and troubleshooting. RAM types include DDR4 and DDR5. Common motherboard form factors are ATX, microATX, and ITX. Network protocols: TCP is connection-oriented, UDP is connectionless. Common ports: 80 HTTP, 443 HTTPS, 22 SSH, 25 SMTP.",
  },
  {
    id: "medical-terms",
    name: "Medical Terminology",
    description: "Memorize prefixes, roots, and suffixes used in clinical settings.",
    subject: "Medicine",
    difficulty: "medium",
    icon: "Stethoscope",
    sampleNotes:
      "Cardio refers to the heart. Hepato refers to the liver. Nephro refers to the kidney. Itis means inflammation. Ectomy means surgical removal. Ology means the study of. Tachycardia is a fast heart rate. Bradycardia is a slow heart rate. Hypertension is high blood pressure.",
  },
  {
    id: "math-formulas",
    name: "Math Formula Practice",
    description: "Drill key formulas with flashcards and short answers.",
    subject: "Mathematics",
    difficulty: "medium",
    icon: "Sigma",
    sampleNotes:
      "The quadratic formula solves ax^2 + bx + c = 0 as x = (-b plus or minus the square root of b^2 - 4ac) divided by 2a. The Pythagorean theorem states a^2 + b^2 = c^2. The area of a circle is pi r squared. The slope formula is rise over run.",
  },
  {
    id: "history-timeline",
    name: "History Timeline Review",
    description: "Lock in dates, people, and key events.",
    subject: "History",
    difficulty: "medium",
    icon: "Landmark",
    sampleNotes:
      "1776: American Declaration of Independence. 1789: French Revolution begins. 1865: American Civil War ends. 1914: World War I begins. 1929: Great Depression begins. 1945: World War II ends. 1969: Apollo 11 lands on the moon.",
  },
  {
    id: "language-learning",
    name: "Language Learning",
    description: "Build vocabulary and grammar with flashcards and quizzes.",
    subject: "Spanish",
    difficulty: "easy",
    icon: "Languages",
    sampleNotes:
      "Hola means hello. Gracias means thank you. Por favor means please. Buenos dias means good morning. Buenas noches means good night. Como estas means how are you. Estoy bien means I am well. Mucho gusto means nice to meet you.",
  },
  {
    id: "science-test",
    name: "Science Test Prep",
    description: "Cover concepts, definitions, and practice problems.",
    subject: "Biology",
    difficulty: "medium",
    icon: "Atom",
    sampleNotes:
      "Photosynthesis converts light energy into chemical energy stored in glucose. It occurs in chloroplasts. The light-dependent reactions occur in the thylakoid membrane. The Calvin cycle occurs in the stroma. Mitochondria are the powerhouses of the cell. DNA replication is semi-conservative.",
  },
  {
    id: "literature-analysis",
    name: "Literature Analysis",
    description: "Themes, characters, and literary devices in one place.",
    subject: "Literature",
    difficulty: "medium",
    icon: "Library",
    sampleNotes:
      "In The Great Gatsby, Jay Gatsby represents the corruption of the American Dream. Daisy Buchanan symbolizes wealth and unattainable love. The green light at the end of Daisy's dock represents Gatsby's hopes and dreams. Nick Carraway is the narrator and moral compass of the story.",
  },
  {
    id: "final-cram",
    name: "Final Exam Cram Plan",
    description: "Last-minute review with a tight, focused schedule.",
    subject: "General",
    difficulty: "hard",
    icon: "Flame",
    sampleNotes:
      "Final exams cover all major topics from the semester. Focus on weak areas first. Review past quiz mistakes. Practice with timed mock exams. Sleep well the night before. Eat a balanced meal before the exam. Read each question carefully and manage your time.",
  },
];
