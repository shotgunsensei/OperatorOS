import {
  faultlineContentHash,
  parseFaultlineChallengeContent,
  type FaultlineCategory,
  type FaultlineChallengeContent,
  type FaultlineDifficulty,
} from './faultlinelab-domain.js';

export interface FaultlineStarterChallenge {
  sourceId: string;
  slug: string;
  title: string;
  category: FaultlineCategory;
  difficulty: FaultlineDifficulty;
  content: FaultlineChallengeContent;
  contentHash: string;
}

function starter(
  metadata: Omit<FaultlineStarterChallenge, 'content' | 'contentHash'>,
  content: unknown,
): FaultlineStarterChallenge {
  const parsed = parseFaultlineChallengeContent({
    ...(content as Record<string, unknown>),
    schemaVersion: 1,
    sourceId: metadata.sourceId,
    maxScore: 100,
  });
  return { ...metadata, content: parsed, contentHash: faultlineContentHash(parsed) };
}

export const FAULTLINELAB_SOURCE_COMMIT =
  '46877aae35565149ccf4f4988dd94627fc6bb92b';

export const FAULTLINELAB_STARTER_CHALLENGES: readonly FaultlineStarterChallenge[] = [
  starter(
    {
      sourceId: 'case-windows-ad-001',
      slug: 'domain-authentication-failure',
      title: 'Domain Authentication Failure',
      category: 'windows-ad',
      difficulty: 'intermediate',
    },
    {
      description:
        'A domain-joined workstation cannot authenticate users after a password reset and reports a broken trust relationship.',
      briefing:
        'A Finance workstation cannot authenticate any domain user. Local administrator access remains available, other workstations can reach the domain controller, and the failure began the morning after a successful password reset.',
      symptoms: [
        { id: 's1', description: 'Domain login fails with a trust relationship error', severity: 'critical' },
        { id: 's2', description: 'Cached credentials allow local access but no domain resources', severity: 'high' },
        { id: 's3', description: 'The workstation clock differs from the domain controller', severity: 'high' },
      ],
      rootCause: {
        id: 'rc-time-skew',
        title: 'Kerberos time skew exceeding tolerance',
        description:
          'The workstation clock drifted more than the Kerberos tolerance because the Windows Time service stopped synchronizing.',
        technicalDetail:
          'Kerberos rejects authenticators when client and server clocks differ beyond the configured maximum skew. The password reset was coincidental.',
      },
      rootCauseOptions: [
        { id: 'rc-time-skew', title: 'Kerberos time skew exceeding tolerance' },
        { id: 'rc-password', title: 'Corrupted password reset replication' },
        { id: 'rc-dns', title: 'Incorrect workstation DNS servers' },
        { id: 'rc-secure-channel', title: 'Random machine account password mismatch' },
      ],
      evidence: [
        { id: 'e1', title: 'Trust relationship error', description: 'The Security log records a failed trust relationship.', category: 'clue', importance: 'medium' },
        { id: 'e2', title: 'Seven-minute offset', description: 'The workstation is 7 minutes 12 seconds ahead of DC01.', category: 'clue', importance: 'critical' },
        { id: 'e3', title: 'W32Time stopped', description: 'The Windows Time service stopped three days earlier.', category: 'clue', importance: 'critical' },
        { id: 'e4', title: 'KRB_AP_ERR_SKEW', description: 'Kerberos error 0x25 reports clock skew too great.', category: 'clue', importance: 'critical' },
        { id: 'e5', title: 'Password reset', description: 'The password reset completed successfully the prior afternoon.', category: 'red-herring', importance: 'medium' },
        { id: 'e6', title: 'DC connectivity', description: 'DC01 responds with sub-millisecond latency.', category: 'contextual', importance: 'low' },
      ],
      hints: [
        { level: 1, label: 'Nudge', text: 'The password reset may be coincidental.', scorePenalty: 5 },
        { level: 2, label: 'Direction', text: 'Kerberos depends on more than credentials and connectivity.', scorePenalty: 10 },
        { level: 3, label: 'Strong clue', text: 'Compare the workstation and domain controller clocks.', scorePenalty: 20 },
        { level: 4, label: 'Reveal path', text: 'Inspect W32Time and the Kerberos five-minute tolerance.', scorePenalty: 35 },
      ],
      commands: [
        { command: 'ping dc01', aliases: [], description: 'Ping the domain controller', output: 'DC01 replies four times with less than 1 ms latency and no loss.', revealsEvidence: ['e6'], risky: false },
        { command: 'w32tm /stripchart /computer:dc01', aliases: ['net time \\dc01'], description: 'Compare the clocks', output: 'Offset +07m12s. Warning: the offset exceeds Kerberos tolerance.', revealsEvidence: ['e2'], risky: false },
        { command: 'sc query w32time', aliases: ['w32tm /query /status'], description: 'Inspect time synchronization', output: 'W32Time is stopped and the system is not synchronized.', revealsEvidence: ['e3'], risky: false },
        { command: 'netdom resetpwd', aliases: [], description: 'Reset the machine-account password', output: 'The command would change the secure channel before the root environmental fault is fixed.', revealsEvidence: [], risky: true },
      ],
      events: [
        { id: 'el1', timestamp: '2026-04-15 10:22:01', source: 'Security', level: 'error', message: 'Kerberos authentication failed', details: 'KRB_AP_ERR_SKEW (0x25). Client/server time difference is 7 minutes 12 seconds.', revealsEvidence: ['e4'] },
        { id: 'el2', timestamp: '2026-04-14 14:32:00', source: 'Security', level: 'info', message: 'Account password reset', details: 'The reset completed and the user authenticated successfully afterward.', revealsEvidence: ['e5'] },
      ],
      tickets: [
        { id: 'th1', author: 'Janet Smith', role: 'End user', timestamp: '2026-04-15 09:30', content: 'The trust relationship message appeared this morning. The new password worked yesterday.', redHerring: false, revealsEvidence: ['e1'] },
        { id: 'th2', author: 'Mike Chen', role: 'Help Desk L1', timestamp: '2026-04-15 09:45', content: 'The password reset is suspected, but other systems and DC01 are healthy.', redHerring: true, revealsEvidence: ['e5'] },
      ],
      availableTools: ['terminal', 'event-log', 'ticket-history'],
      redHerrings: ['The successful password reset is temporally related but not causal.'],
      remediation:
        'Start W32Time, force synchronization with the domain controller, verify the clock, and then repair the secure channel only if it remains broken.',
      remediationKeywords: ['w32time', 'synchronization', 'domain controller', 'secure channel'],
      preventativeMeasures: [
        'Monitor workstation time-service health.',
        'Alert when clock drift approaches Kerberos tolerance.',
      ],
    },
  ),
  starter(
    {
      sourceId: 'case-networking-vpn-001',
      slug: 'phantom-vpn-tunnel',
      title: 'Phantom VPN Tunnel',
      category: 'networking',
      difficulty: 'advanced',
    },
    {
      description:
        'A site-to-site VPN reports an established tunnel, but traffic between the two protected networks cannot pass.',
      briefing:
        'The branch firewall reports IKE and IPsec security associations as established after a subnet expansion. Pings across the tunnel time out while local routing and internet access remain healthy.',
      symptoms: [
        { id: 's1', description: 'VPN dashboard shows an established tunnel', severity: 'medium' },
        { id: 's2', description: 'Cross-site traffic times out in both directions', severity: 'critical' },
        { id: 's3', description: 'Encrypted packet counters do not increase', severity: 'high' },
      ],
      rootCause: {
        id: 'rc-proxy-id',
        title: 'Phase 2 proxy ID mismatch',
        description:
          'One peer still defines the old protected subnet, so traffic selectors do not match the expanded branch network.',
        technicalDetail:
          'IKE can remain established while Phase 2 selectors exclude the actual source network. The tunnel status alone does not prove a usable data plane.',
      },
      rootCauseOptions: [
        { id: 'rc-proxy-id', title: 'Phase 2 proxy ID mismatch' },
        { id: 'rc-preshared-key', title: 'Incorrect IKE pre-shared key' },
        { id: 'rc-route', title: 'Missing branch default route' },
        { id: 'rc-mtu', title: 'Path MTU black hole' },
      ],
      evidence: [
        { id: 'e1', title: 'IKE established', description: 'Phase 1 security association is active.', category: 'contextual', importance: 'medium' },
        { id: 'e2', title: 'Selector mismatch', description: 'Local selector is 10.40.0.0/23 while the peer expects 10.40.0.0/24.', category: 'clue', importance: 'critical' },
        { id: 'e3', title: 'Zero encapsulation', description: 'Interesting traffic does not increment encapsulated packets.', category: 'clue', importance: 'high' },
        { id: 'e4', title: 'Traffic-selector rejection', description: 'The peer log rejects the proposed traffic selector.', category: 'clue', importance: 'critical' },
        { id: 'e5', title: 'Recent firmware advisory', description: 'A firmware advisory exists but does not match this symptom.', category: 'red-herring', importance: 'medium' },
        { id: 'e6', title: 'Local routing healthy', description: 'The new subnet routes correctly to the VPN firewall.', category: 'contextual', importance: 'medium' },
      ],
      hints: [
        { level: 1, label: 'Nudge', text: 'An established control plane does not guarantee data-plane selectors.', scorePenalty: 5 },
        { level: 2, label: 'Direction', text: 'Compare the protected networks configured at both peers.', scorePenalty: 10 },
        { level: 3, label: 'Strong clue', text: 'Inspect proxy IDs and traffic selectors after the subnet expansion.', scorePenalty: 20 },
        { level: 4, label: 'Reveal path', text: 'One peer still uses /24 while the branch proposes /23.', scorePenalty: 35 },
      ],
      commands: [
        { command: 'show vpn ike-sa', aliases: ['show ike sa'], description: 'Inspect IKE state', output: 'IKE SA is established and rekey timers are normal.', revealsEvidence: ['e1'], risky: false },
        { command: 'show vpn ipsec-sa', aliases: ['show ipsec sa'], description: 'Inspect IPsec selectors and counters', output: 'Local proxy 10.40.0.0/23; remote peer proposal 10.40.0.0/24. Encapsulation counter remains zero.', revealsEvidence: ['e2', 'e3'], risky: false },
        { command: 'show route 10.40.1.10', aliases: [], description: 'Check branch routing', output: '10.40.0.0/23 is directly connected through the trusted interface.', revealsEvidence: ['e6'], risky: false },
        { command: 'clear vpn all', aliases: [], description: 'Clear every VPN security association', output: 'All tunnels would be interrupted without correcting the selector mismatch.', revealsEvidence: [], risky: true },
      ],
      events: [
        { id: 'el1', timestamp: '2026-03-21 08:13:22', source: 'Peer firewall', level: 'error', message: 'Traffic selector unacceptable', details: 'Received 10.40.0.0/23; configured local selector is 10.40.0.0/24.', revealsEvidence: ['e4'] },
        { id: 'el2', timestamp: '2026-03-20 16:00:00', source: 'Change control', level: 'info', message: 'Branch subnet expanded', details: 'Branch LAN changed from /24 to /23.', revealsEvidence: ['e2'] },
      ],
      tickets: [
        { id: 'th1', author: 'Alicia Flores', role: 'Network engineer', timestamp: '2026-03-21 08:20', content: 'The tunnel is green, but the data counters stay at zero after yesterday’s subnet expansion.', redHerring: false, revealsEvidence: ['e3'] },
        { id: 'th2', author: 'Vendor support', role: 'Support analyst', timestamp: '2026-03-21 08:40', content: 'A general firmware advisory is available; no matching crash or negotiation signature appears.', redHerring: true, revealsEvidence: ['e5'] },
      ],
      availableTools: ['terminal', 'event-log', 'ticket-history', 'firewall-table'],
      redHerrings: ['The firmware advisory does not explain stable IKE with selector rejection.'],
      remediation:
        'Update both peers to identical /23 Phase 2 traffic selectors, commit the change, renegotiate the IPsec security association, and verify bidirectional counters.',
      remediationKeywords: ['both peers', 'traffic selectors', '/23', 'renegotiate'],
      preventativeMeasures: [
        'Include VPN peer selector validation in subnet-change plans.',
        'Monitor encrypted and decrypted packet counters, not tunnel color alone.',
      ],
    },
  ),
  starter(
    {
      sourceId: 'case-automotive-001',
      slug: 'unstable-idle-ghost',
      title: 'Unstable Idle Ghost',
      category: 'automotive',
      difficulty: 'intermediate',
    },
    {
      description:
        'A vehicle has an intermittent rough idle, flickering lights, and multiple unrelated low-voltage codes after warm-up.',
      briefing:
        'The engine starts normally, then idles poorly after accessories are enabled. The battery recently passed a static test and several sensors have been suggested as possible causes.',
      symptoms: [
        { id: 's1', description: 'Idle speed hunts after the engine warms', severity: 'high' },
        { id: 's2', description: 'Headlamps flicker with blower and rear defrost enabled', severity: 'high' },
        { id: 's3', description: 'Several modules record intermittent low-voltage faults', severity: 'critical' },
      ],
      rootCause: {
        id: 'rc-regulator',
        title: 'Failing alternator voltage regulator',
        description:
          'The alternator regulator becomes unstable under thermal and electrical load, creating voltage ripple and module resets.',
        technicalDetail:
          'A static battery test does not exercise charging-system regulation. Excessive AC ripple and low loaded output affect multiple control modules at once.',
      },
      rootCauseOptions: [
        { id: 'rc-regulator', title: 'Failing alternator voltage regulator' },
        { id: 'rc-maf', title: 'Contaminated mass-airflow sensor' },
        { id: 'rc-vacuum', title: 'Intake vacuum leak' },
        { id: 'rc-battery', title: 'Open battery cell' },
      ],
      evidence: [
        { id: 'e1', title: 'Loaded voltage drop', description: 'Charging voltage falls below specification with accessories enabled.', category: 'clue', importance: 'critical' },
        { id: 'e2', title: 'Excess AC ripple', description: 'Oscilloscope ripple exceeds the allowed charging-system range.', category: 'clue', importance: 'critical' },
        { id: 'e3', title: 'Cross-module undervoltage', description: 'PCM, ABS, and body-control modules record undervoltage together.', category: 'clue', importance: 'high' },
        { id: 'e4', title: 'Battery static test passes', description: 'Open-circuit voltage and conductance are acceptable.', category: 'contextual', importance: 'medium' },
        { id: 'e5', title: 'MAF cleaning recommendation', description: 'A prior quick inspection recommended cleaning the MAF.', category: 'red-herring', importance: 'medium' },
        { id: 'e6', title: 'No intake leak', description: 'Smoke testing finds no intake-system leak.', category: 'contextual', importance: 'medium' },
      ],
      hints: [
        { level: 1, label: 'Nudge', text: 'Look for one fault that can affect several modules.', scorePenalty: 5 },
        { level: 2, label: 'Direction', text: 'Compare static battery health with charging behavior under load.', scorePenalty: 10 },
        { level: 3, label: 'Strong clue', text: 'Measure loaded charging voltage and AC ripple.', scorePenalty: 20 },
        { level: 4, label: 'Reveal path', text: 'The alternator regulator becomes unstable when hot and loaded.', scorePenalty: 35 },
      ],
      commands: [
        { command: 'obd scan all', aliases: ['scan modules'], description: 'Read module diagnostic codes', output: 'PCM, ABS, and BCM contain intermittent system-voltage-low records.', revealsEvidence: ['e3'], risky: false },
        { command: 'measure charging loaded', aliases: ['load test alternator'], description: 'Measure charging output under load', output: 'Voltage cycles between 12.1 V and 14.7 V with accessories enabled.', revealsEvidence: ['e1'], risky: false },
        { command: 'scope alternator ripple', aliases: ['measure ac ripple'], description: 'Measure alternator AC ripple', output: 'Ripple is 1.1 V peak-to-peak, well above specification.', revealsEvidence: ['e2'], risky: false },
        { command: 'disconnect battery running', aliases: [], description: 'Disconnect the battery with the engine running', output: 'This unsafe test risks module damage and is not performed.', revealsEvidence: [], risky: true },
      ],
      events: [
        { id: 'el1', timestamp: '2026-02-10 17:44:00', source: 'PCM freeze frame', level: 'warning', message: 'System voltage low', details: 'Voltage fell to 11.8 V at warm idle with electrical load.', revealsEvidence: ['e1'] },
        { id: 'el2', timestamp: '2026-02-10 17:44:01', source: 'Network gateway', level: 'error', message: 'Multiple module resets', details: 'PCM, ABS, and BCM reset within the same two-second window.', revealsEvidence: ['e3'] },
      ],
      tickets: [
        { id: 'th1', author: 'Jordan Lee', role: 'Vehicle owner', timestamp: '2026-02-11 08:00', content: 'The lights flicker most when the heat and rear defrost are on.', redHerring: false, revealsEvidence: ['e1'] },
        { id: 'th2', author: 'Quick-service technician', role: 'Technician', timestamp: '2026-02-10 15:00', content: 'Battery conductance passed. Suggested cleaning the MAF as a first step.', redHerring: true, revealsEvidence: ['e4', 'e5'] },
      ],
      availableTools: ['terminal', 'event-log', 'ticket-history', 'sensor-graph', 'obd-panel'],
      redHerrings: ['The MAF suggestion does not explain simultaneous undervoltage across modules.'],
      remediation:
        'Replace the failing alternator or voltage regulator, confirm belt and connections, then verify stable loaded voltage and acceptable AC ripple.',
      remediationKeywords: ['alternator', 'voltage regulator', 'loaded voltage', 'ac ripple'],
      preventativeMeasures: [
        'Include loaded charging and ripple checks in electrical diagnosis.',
        'Avoid battery-disconnect charging tests on computer-controlled vehicles.',
      ],
    },
  ),
  starter(
    {
      sourceId: 'case-electronics-001',
      slug: 'mesh-network-phantom',
      title: 'Mesh Network Phantom',
      category: 'electronics',
      difficulty: 'advanced',
    },
    {
      description:
        'A wireless sensor-mesh node drops from the network under transmit load even though its radio signal remains strong.',
      briefing:
        'An environmental sensor works after reboot but disappears during bursts of telemetry. Firmware was recently updated, RSSI is healthy, and replacing the radio module did not resolve the problem.',
      symptoms: [
        { id: 's1', description: 'Sensor node leaves the mesh during transmit bursts', severity: 'critical' },
        { id: 's2', description: 'Radio signal strength remains healthy until reset', severity: 'medium' },
        { id: 's3', description: 'The fault is more frequent at elevated temperature', severity: 'high' },
      ],
      rootCause: {
        id: 'rc-cap-firmware',
        title: 'Firmware timing bug exposing a degraded decoupling capacitor',
        description:
          'New transmit timing produces a current spike that a degraded rail capacitor can no longer absorb, causing a brownout reset.',
        technicalDetail:
          'The firmware changed the duty-cycle timing but is not sufficient alone; capacitance loss and rising ESR create the voltage collapse. Both the physical component and timing exposure must be addressed.',
      },
      rootCauseOptions: [
        { id: 'rc-cap-firmware', title: 'Firmware timing bug exposing a degraded decoupling capacitor' },
        { id: 'rc-radio', title: 'Defective mesh radio transceiver' },
        { id: 'rc-interference', title: 'External 2.4 GHz interference' },
        { id: 'rc-key', title: 'Expired mesh encryption key' },
      ],
      evidence: [
        { id: 'e1', title: 'Rail brownout', description: 'The 3.3 V rail collapses during the transmit burst.', category: 'clue', importance: 'critical' },
        { id: 'e2', title: 'High capacitor ESR', description: 'The decoupling capacitor measures high ESR and reduced capacitance.', category: 'clue', importance: 'critical' },
        { id: 'e3', title: 'Timing changed in firmware', description: 'The new firmware clusters radio transmissions more tightly.', category: 'clue', importance: 'high' },
        { id: 'e4', title: 'Brownout reset flag', description: 'The reset-cause register records brownout detection.', category: 'clue', importance: 'high' },
        { id: 'e5', title: 'Strong RSSI', description: 'Signal remains between -52 and -58 dBm.', category: 'contextual', importance: 'medium' },
        { id: 'e6', title: 'Crowded channel', description: 'Other access points use the same channel but packet retries are normal.', category: 'red-herring', importance: 'medium' },
      ],
      hints: [
        { level: 1, label: 'Nudge', text: 'A radio problem can be caused by something outside the RF path.', scorePenalty: 5 },
        { level: 2, label: 'Direction', text: 'Correlate reset timing with supply behavior.', scorePenalty: 10 },
        { level: 3, label: 'Strong clue', text: 'Inspect the rail during a transmit burst and measure capacitor ESR.', scorePenalty: 20 },
        { level: 4, label: 'Reveal path', text: 'Firmware timing exposes a degraded decoupling capacitor and causes brownout.', scorePenalty: 35 },
      ],
      commands: [
        { command: 'mesh show rssi', aliases: ['radio status'], description: 'Inspect radio link quality', output: 'RSSI -55 dBm, link quality 94 percent, retries normal.', revealsEvidence: ['e5'], risky: false },
        { command: 'scope rail transmit', aliases: ['scope 3v3'], description: 'Capture the power rail during transmit', output: 'The 3.3 V rail dips to 2.41 V for 8 ms during clustered transmit.', revealsEvidence: ['e1'], risky: false },
        { command: 'measure capacitor esr', aliases: ['lcr c17'], description: 'Measure decoupling capacitor C17', output: 'C17 measures 34 uF equivalent with 1.8 ohm ESR instead of 100 uF low-ESR.', revealsEvidence: ['e2'], risky: false },
        { command: 'erase node flash', aliases: [], description: 'Erase all node firmware and calibration', output: 'The destructive erase is blocked because it would remove calibration evidence.', revealsEvidence: [], risky: true },
      ],
      events: [
        { id: 'el1', timestamp: '2026-01-29 13:05:20', source: 'Bootloader', level: 'error', message: 'Brownout reset detected', details: 'Reset-cause register BOR=1 after radio transmit.', revealsEvidence: ['e4'] },
        { id: 'el2', timestamp: '2026-01-27 09:00:00', source: 'Firmware release', level: 'info', message: 'Telemetry batching enabled', details: 'Version 4.2 groups samples into a shorter radio transmit window.', revealsEvidence: ['e3'] },
      ],
      tickets: [
        { id: 'th1', author: 'Priya Raman', role: 'Embedded engineer', timestamp: '2026-01-29 13:30', content: 'The reset starts exactly when the radio burst begins, especially after the enclosure warms.', redHerring: false, revealsEvidence: ['e1'] },
        { id: 'th2', author: 'Site technician', role: 'Field technician', timestamp: '2026-01-29 12:00', content: 'The channel is crowded, but a replacement radio behaved the same way.', redHerring: true, revealsEvidence: ['e6'] },
      ],
      availableTools: ['terminal', 'event-log', 'ticket-history', 'sensor-graph'],
      redHerrings: ['Channel crowding is present but retry and RSSI evidence do not match a link failure.'],
      remediation:
        'Replace the degraded low-ESR capacitor and adjust firmware transmit scheduling or current ramping, then verify rail margin across temperature and burst load.',
      remediationKeywords: ['replace', 'capacitor', 'firmware', 'transmit scheduling'],
      preventativeMeasures: [
        'Include power-rail margin tests in firmware release qualification.',
        'Track capacitor ESR across accelerated thermal aging.',
      ],
    },
  ),
] as const;

export function faultlineStarterManifest() {
  return {
    schemaVersion: 1,
    sourceCommit: FAULTLINELAB_SOURCE_COMMIT,
    challenges: FAULTLINELAB_STARTER_CHALLENGES.map((challenge) => ({
      sourceId: challenge.sourceId,
      slug: challenge.slug,
      title: challenge.title,
      category: challenge.category,
      difficulty: challenge.difficulty,
      contentHash: challenge.contentHash,
    })),
  };
}
