import type { CaseDefinition } from '@/types';
import { composeCase, createTemplate } from './authoring';

export const automotiveCase: CaseDefinition = composeCase({
  ...createTemplate('automotive', {
    id: 'case-automotive-001',
    slug: 'unstable-idle-ghost',
    title: 'Unstable Idle Ghost',
    difficulty: 'intermediate',
  }),
  description:
    'A 2019 sedan exhibits intermittent rough idle, sporadic misfire counts on cylinders 2 and 3, and voltage fluctuations visible on the OBD scanner. No check engine light is consistently on.',
  briefing:
    "PRIORITY: MEDIUM\n\nCustomer complaint: 2019 Honda Accord 2.0T with 67,000 miles. Vehicle has rough/unstable idle that comes and goes. Sometimes runs perfectly smooth, other times shakes at stoplights. Customer says it's worse when the A/C is on. No persistent check engine light, but the MIL has flashed briefly a few times. Previous shop replaced spark plugs — no improvement.",
  symptoms: [
    { id: 's1', description: 'Intermittent rough idle — RPM fluctuates between 650-850 at rest', severity: 'high' },
    { id: 's2', description: 'Sporadic misfire counts on cylinders 2 and 3', severity: 'high' },
    { id: 's3', description: 'Battery voltage fluctuates 13.2V-14.8V irregularly', severity: 'medium' },
    { id: 's4', description: 'Short-term fuel trim swings -8% to +12% at idle', severity: 'high' },
  ],
  rootCause: {
    id: 'rc1',
    title: 'Failing Alternator with Intermittent Voltage Regulator',
    description:
      "The alternator's internal voltage regulator is failing intermittently, causing erratic charging voltage. The voltage spikes and dips affect the ECU's sensor readings and injector pulse width calculations, creating lean/rich swings that manifest as rough idle and misfires on the weakest coils.",
    technicalDetail:
      'The voltage regulator inside the alternator is intermittently failing, causing charging voltage to swing between 13.2V and 14.8V instead of maintaining steady 14.2V. These voltage fluctuations directly affect: (1) ECU reference voltage for sensor calculations, (2) Injector solenoid response time (higher voltage = shorter effective pulse), (3) Ignition coil dwell time. The misfires on cylinders 2 and 3 are because those coil packs have slightly higher resistance (normal wear) and are most sensitive to voltage variation. The previous spark plug replacement was addressing a symptom, not the cause.',
  },
  evidence: [
    { id: 'e1', title: 'RPM Instability Pattern', description: 'RPM oscillates 650-850 in a semi-regular pattern at idle, worse with electrical loads', category: 'clue', importance: 'high' },
    { id: 'e2', title: 'Voltage Irregularity', description: 'System voltage swings 13.2V-14.8V with no load changes — alternator output is unstable', category: 'clue', importance: 'critical' },
    { id: 'e3', title: 'Misfire Correlation', description: 'Misfire counts on Cyl 2 and 3 increase when voltage exceeds 14.5V', category: 'clue', importance: 'critical' },
    { id: 'e4', title: 'Fuel Trim Swings', description: 'STFT oscillates -8% to +12% — ECU is constantly correcting fuel mixture', category: 'clue', importance: 'high' },
    { id: 'e5', title: 'New Spark Plugs', description: 'Spark plugs were replaced 2,000 miles ago — properly gapped and correct part number', category: 'red-herring', importance: 'medium' },
    { id: 'e6', title: 'A/C Load Trigger', description: 'Symptoms worsen with A/C on — additional electrical load exacerbates voltage regulation issue', category: 'clue', importance: 'medium' },
    { id: 'e7', title: 'Coil Resistance Variance', description: 'Coil packs on Cyl 2 and 3 measure 0.8 ohms higher primary resistance than Cyl 1 and 4', category: 'clue', importance: 'high' },
    { id: 'e8', title: 'No Vacuum Leaks', description: 'Smoke test shows no vacuum leaks in intake system', category: 'contextual', importance: 'low' },
  ],
  hints: [
    { level: 1, label: 'Subtle Nudge', text: 'The misfires happen on specific cylinders, but the cause might not be cylinder-specific. What affects all cylinders but hits some harder?', scorePenalty: 5 },
    { level: 2, label: 'Directional Clue', text: 'Watch the voltage readings carefully. A healthy charging system should be very stable. What happens when voltage is unstable?', scorePenalty: 10 },
    { level: 3, label: 'Stronger Clue', text: "The voltage regulator controls alternator output. If it's failing intermittently, it would cause exactly these symptoms. Check alternator output stability.", scorePenalty: 20 },
    { level: 4, label: 'Reveal Path', text: "The alternator's voltage regulator is failing. Erratic voltage affects injector timing, coil dwell, and ECU calculations. Cylinders 2 and 3 misfire because their coils have slightly higher resistance and are most sensitive to voltage swings.", scorePenalty: 35 },
  ],
  terminalCommands: [
    { command: 'obd read dtc', aliases: ['read dtc', 'read codes', 'dtc'], description: 'Read diagnostic trouble codes', output: 'Scanning for DTCs...\n\nStored Codes:\n  P0302 - Cylinder 2 Misfire Detected (Pending)\n  P0303 - Cylinder 3 Misfire Detected (Pending)\n\nPending Codes:\n  P0302 - Cylinder 2 Misfire Detected\n  P0303 - Cylinder 3 Misfire Detected\n\nFreeze Frame Data (P0302):\n  Engine RPM: 712\n  Vehicle Speed: 0 MPH\n  Coolant Temp: 198°F\n  Calc Load: 34.5%\n  STFT B1: +11.7%\n  LTFT B1: +3.2%\n  System Voltage: 14.7V', revealsEvidence: ['e3'] },
    { command: 'obd live rpm', aliases: ['live rpm', 'rpm'], description: 'Monitor live RPM data', output: 'Live Data Stream - Engine RPM\n================================\nSampling at 10Hz for 5 seconds...\n\n  T+0.0s: 745 RPM\n  T+0.1s: 738 RPM\n  T+0.2s: 712 RPM\n  T+0.3s: 698 RPM\n  T+0.4s: 672 RPM  ▼\n  T+0.5s: 658 RPM  ▼\n  T+0.6s: 681 RPM\n  T+0.7s: 724 RPM  ▲\n  T+0.8s: 768 RPM  ▲\n  T+0.9s: 801 RPM  ▲\n  T+1.0s: 842 RPM  ▲▲\n  T+1.1s: 823 RPM\n  T+1.2s: 789 RPM\n  T+1.3s: 752 RPM\n  T+1.4s: 731 RPM\n\nMin: 658  Max: 842  Avg: 742  Std Dev: 52.3\n*** UNSTABLE - Normal idle variance should be < 20 RPM ***', revealsEvidence: ['e1'] },
    { command: 'obd live voltage', aliases: ['live voltage', 'voltage', 'obd voltage'], description: 'Monitor system voltage', output: 'Live Data Stream - System Voltage\n====================================\nSampling at 5Hz for 4 seconds...\n\n  T+0.0s: 14.2V\n  T+0.2s: 14.1V\n  T+0.4s: 13.8V  ▼\n  T+0.6s: 13.4V  ▼\n  T+0.8s: 13.2V  ▼▼\n  T+1.0s: 13.5V\n  T+1.2s: 14.0V  ▲\n  T+1.4s: 14.4V  ▲\n  T+1.6s: 14.7V  ▲▲\n  T+1.8s: 14.8V  ▲▲ WARNING\n  T+2.0s: 14.6V\n  T+2.2s: 14.3V\n  T+2.4s: 13.9V  ▼\n  T+2.6s: 13.3V  ▼▼\n  T+2.8s: 13.2V  ▼▼\n  T+3.0s: 13.6V\n  T+3.2s: 14.1V  ▲\n  T+3.4s: 14.5V  ▲\n  T+3.6s: 14.8V  ▲▲ WARNING\n\nMin: 13.2V  Max: 14.8V  Range: 1.6V\n*** ABNORMAL - Expected range < 0.3V ***\n*** Voltage regulator may be failing ***', revealsEvidence: ['e2'] },
    { command: 'obd live fuel-trim', aliases: ['live fuel-trim', 'fuel trim', 'stft'], description: 'Monitor fuel trim data', output: 'Live Data Stream - Fuel Trims\n================================\nBank 1:\n  Short Term Fuel Trim: +11.7%  (oscillating -8% to +12%)\n  Long Term Fuel Trim:  +3.2%\n\nFuel Trim History (last 30 seconds):\n  STFT: -8.2, -3.1, +2.4, +7.8, +11.7, +9.3, +4.1, -1.2, -6.8, -8.0\n  Pattern: Oscillating *** ABNORMAL ***\n\nNormal STFT range: -5% to +5%\nCurrent swing: -8% to +12% *** EXCESSIVE ***\n\n*** ECU is constantly hunting for correct fuel mixture ***\n*** This pattern suggests varying input signal quality ***', revealsEvidence: ['e4'] },
    { command: 'obd misfire-counts', aliases: ['misfire', 'misfire counts'], description: 'Read misfire counter data', output: 'Misfire Counts (Current Drive Cycle)\n======================================\n  Cylinder 1:    2  (within normal)\n  Cylinder 2:  147  *** ELEVATED ***\n  Cylinder 3:  118  *** ELEVATED ***\n  Cylinder 4:    5  (within normal)\n\nMisfire Rate:\n  Cyl 2: 3.2% at idle (threshold: 2%)\n  Cyl 3: 2.6% at idle (threshold: 2%)\n\nMisfire Pattern: Intermittent, correlates with voltage peaks\n*** Misfires increase when system voltage exceeds 14.5V ***', revealsEvidence: ['e3'] },
    { command: 'obd freeze-frame', aliases: ['freeze frame', 'freeze'], description: 'Read freeze frame data', output: 'Freeze Frame Data\n===================\nDTC: P0302 (Cylinder 2 Misfire)\nCapture Time: During idle\n\n  Engine RPM:        712\n  Vehicle Speed:     0 MPH\n  Coolant Temp:      198°F\n  Intake Air Temp:   95°F\n  MAP:               10.2 inHg\n  Calculated Load:   34.5%\n  STFT Bank 1:       +11.7%\n  LTFT Bank 1:       +3.2%\n  System Voltage:    14.7V  *** HIGH ***\n  Ignition Advance:  12° BTDC\n  O2 Sensor B1S1:    0.82V\n  A/C Status:        ON', revealsEvidence: ['e6'] },
    { command: 'check vacuum', aliases: ['smoke test', 'vacuum test'], description: 'Check for vacuum leaks', output: 'Vacuum Leak Test Results\n=========================\nSmoke test performed on intake manifold.\n\n  Throttle body seal:     PASS\n  Intake manifold gasket: PASS\n  PCV valve:              PASS\n  Brake booster line:     PASS\n  EVAP purge valve:       PASS\n\nNo vacuum leaks detected.\nIntake system integrity: GOOD', revealsEvidence: ['e8'] },
    { command: 'check coils', aliases: ['coil test', 'coil resistance'], description: 'Test ignition coil packs', output: 'Ignition Coil Pack Test\n=========================\nPrimary Resistance (spec: 0.3-1.0 ohms):\n  Coil 1: 0.52 ohms  PASS\n  Coil 2: 1.31 ohms  *** HIGH but within extended range ***\n  Coil 3: 1.28 ohms  *** HIGH but within extended range ***\n  Coil 4: 0.48 ohms  PASS\n\nSecondary Resistance (spec: 5-15 kohms):\n  All coils within specification.\n\nNote: Coils 2 and 3 have higher primary resistance.\nThis makes them more sensitive to voltage variations.\nAt normal voltage, they function adequately.\nAt abnormal voltage, they may produce weak spark.', revealsEvidence: ['e7'] },
    { command: 'check plugs', aliases: ['spark plug', 'spark plugs'], description: 'Check spark plug condition', output: 'Spark Plug Inspection\n=======================\n  Brand: NGK Iridium (correct for application)\n  Gap:   0.028" (within spec: 0.028-0.031")\n  Installed: ~2,000 miles ago\n  Condition: Good — normal wear pattern\n  Electrode: Clean, no fouling\n  Insulator: No cracks\n\n*** Spark plugs are not the issue ***\n*** Recently replaced, correct specification ***', revealsEvidence: ['e5'] },
    { command: 'obd live all', aliases: ['live data', 'live all'], description: 'Show all live data', output: 'Live OBD Data Snapshot\n========================\n  Engine RPM:           738\n  Vehicle Speed:        0 MPH\n  Coolant Temp:         198°F\n  Intake Air Temp:      96°F\n  MAP:                  10.1 inHg\n  Throttle Position:    15.3%\n  Calculated Load:      34.8%\n  STFT B1:              +9.4%\n  LTFT B1:              +3.2%\n  System Voltage:       14.6V\n  O2 B1S1:              0.78V\n  O2 B1S2:              0.41V\n  Timing Advance:       12° BTDC\n  Fuel Pressure:        58.2 PSI\n  A/C Request:          YES\n  A/C Clutch:           ENGAGED\n  Alternator Load:      varying ***' },
  ],
  eventLogs: [
    { id: 'el1', timestamp: '2026-04-15 10:30:00', source: 'ECU', level: 'warning', message: 'Cylinder 2 misfire rate exceeds threshold', details: 'Misfire count: 147 in current cycle. Rate: 3.2% at idle. DTC P0302 pending.' },
    { id: 'el2', timestamp: '2026-04-15 10:30:00', source: 'ECU', level: 'warning', message: 'Cylinder 3 misfire rate exceeds threshold', details: 'Misfire count: 118 in current cycle. Rate: 2.6% at idle. DTC P0303 pending.' },
    { id: 'el3', timestamp: '2026-04-15 10:28:00', source: 'Charging', level: 'warning', message: 'System voltage out of normal range', details: 'Voltage: 14.8V (max normal: 14.6V). Regulator output inconsistent.', revealsEvidence: ['e2'] },
    { id: 'el4', timestamp: '2026-04-15 10:25:00', source: 'ECU', level: 'info', message: 'Fuel trim adaptation in progress', details: 'STFT oscillation detected. Range: -8% to +12%. ECU adapting.' },
    { id: 'el5', timestamp: '2026-04-14 15:00:00', source: 'Service', level: 'info', message: 'Spark plugs replaced at 65,000 miles', details: 'NGK Iridium installed. Gap verified. No improvement in idle quality reported after replacement.' },
    { id: 'el6', timestamp: '2026-04-10 09:00:00', source: 'Charging', level: 'info', message: 'Alternator output test requested', details: 'Previous shop noted voltage fluctuation but did not diagnose further.' },
  ],
  ticketHistory: [
    { id: 'th1', author: 'Customer (Maria Gonzalez)', role: 'Vehicle Owner', timestamp: '2026-04-15 09:00 AM', content: "My car has been shaking at stoplights for about two weeks now. It comes and goes — sometimes it's fine, sometimes it shakes pretty bad. It seems worse when the A/C is running. My check engine light flashed a couple times but it's not on now." },
    { id: 'th2', author: 'Previous Shop', role: 'External Mechanic', timestamp: '2026-04-01', content: 'Customer came in with rough idle complaint. Found P0302 and P0303 pending. Replaced all 4 spark plugs with NGK Iridium. Cleared codes. Test drove — seemed OK at the time. Customer returned saying problem came back.', isRedHerring: true, revealsEvidence: ['e5'] },
    { id: 'th3', author: 'Service Advisor', role: 'Dealership', timestamp: '2026-04-15 09:15 AM', content: 'Verified customer complaint. Vehicle idles rough intermittently. Previous repair (spark plugs) did not resolve. Customer mentioned the battery was replaced about 6 months ago at a quick-lube shop. Assigned to diagnostic bay.' },
    { id: 'th4', author: 'Tech Notes', role: 'Diagnostic Tech', timestamp: '2026-04-15 09:30 AM', content: 'Initial scan shows P0302/P0303 pending. No stored codes. Noticed voltage seems to bounce around on the scanner. Need to investigate further.' },
  ],
  availableTools: ['terminal', 'event-log', 'ticket-history'],
  redHerrings: [
    'The spark plug replacement was a reasonable first step but did not address the root cause — the plugs were fine',
    "The battery replacement 6 months ago is unrelated to the alternator's voltage regulator failure",
  ],
  remediation:
    'Replace the alternator assembly (includes voltage regulator). Verify stable charging voltage (14.0-14.4V with < 0.3V variance). Clear DTCs and verify idle stability. Coil packs on cylinders 2 and 3 should be monitored — they have elevated resistance but are currently within extended tolerance.',
  preventativeMeasures: [
    'Regular charging system testing during routine maintenance',
    'Monitor voltage regulator output during multi-point inspections',
    'Set voltage fluctuation thresholds in shop scanner software',
    'Document and correlate electrical symptoms with charging system data before replacing ignition components',
  ],
  maxScore: 100,
});
