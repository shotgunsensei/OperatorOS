import type { CaseDefinition } from '@/types';
import { composeCase, createTemplate } from './authoring';

/**
 * Reference case for the Case Authoring Framework.
 *
 * Pattern: seed a `CaseDraft` from `createTemplate('<domain>', …)` to
 * inherit category-correct defaults (tools, briefing prefix, root-cause
 * scaffolding), then override every authored field with the real case
 * content and pass the draft through `composeCase` to validate it and
 * lift it into a fully-formed `CaseDefinition`.
 *
 * See `replit.md` ("Reference case") for the rationale.
 */
export const windowsAdCase: CaseDefinition = composeCase({
  ...createTemplate('windows-ad', {
    id: 'case-windows-ad-001',
    slug: 'domain-authentication-failure',
    title: 'Domain Authentication Failure',
    difficulty: 'intermediate',
  }),
  description:
    'A domain-joined workstation cannot authenticate users after a recent password reset. Users report "The trust relationship between this workstation and the primary domain failed" errors.',
  briefing:
    'PRIORITY: HIGH\n\nA domain-joined PC (WS-PC042) in the Finance department cannot authenticate any domain user after a password reset was performed yesterday by the Help Desk. The machine was working fine before the reset. Local admin access is available. The domain controller (DC01) appears healthy from other machines.',
  symptoms: [
    { id: 's1', description: 'Domain login fails with trust relationship error', severity: 'critical' },
    { id: 's2', description: 'Cached credentials allow local profile access but no network resources', severity: 'high' },
    { id: 's3', description: 'DNS resolution to domain controller intermittently fails', severity: 'medium' },
    { id: 's4', description: 'System clock shows 7-minute offset from domain controller', severity: 'high' },
  ],
  rootCause: {
    id: 'rc1',
    title: 'Kerberos Time Skew Exceeding Tolerance',
    description:
      'The workstation clock has drifted 7 minutes from the domain controller, exceeding the default Kerberos 5-minute maximum tolerance. This causes all Kerberos authentication tickets to be rejected.',
    technicalDetail:
      "Kerberos protocol requires clocks to be synchronized within 5 minutes (default MaxClockSkew). The workstation's time service (W32Time) stopped syncing after a failed NTP update, causing progressive drift. The password reset was coincidental — the real failure is the time skew preventing Kerberos ticket validation.",
  },
  evidence: [
    { id: 'e1', title: 'Trust Relationship Error', description: 'Event log shows "The trust relationship between this workstation and the primary domain failed"', category: 'clue', importance: 'medium' },
    { id: 'e2', title: 'Time Offset Detected', description: 'System clock is 7 minutes ahead of DC01 (w32tm /stripchart shows +420s offset)', category: 'clue', importance: 'critical' },
    { id: 'e3', title: 'W32Time Service Stopped', description: 'Windows Time service (W32Time) is in stopped state, last sync failed 3 days ago', category: 'clue', importance: 'critical' },
    { id: 'e4', title: 'Kerberos Error KRB_AP_ERR_SKEW', description: 'Security event log shows Kerberos error 0x25 (KRB_AP_ERR_SKEW) - clock skew too great', category: 'clue', importance: 'critical' },
    { id: 'e5', title: 'DNS Resolution Working', description: 'nslookup resolves DC01 correctly most of the time', category: 'contextual', importance: 'low' },
    { id: 'e6', title: 'Password Reset Logged', description: 'Help Desk ticket shows password was reset yesterday at 14:32', category: 'red-herring', importance: 'medium' },
    { id: 'e7', title: 'Cached Credentials Active', description: 'Cached domain credentials allow limited local access', category: 'contextual', importance: 'low' },
    { id: 'e8', title: 'DC Connectivity Confirmed', description: 'Ping to DC01 succeeds with <1ms latency', category: 'contextual', importance: 'low' },
    { id: 'e9', title: 'DCDIAG Clean', description: 'dcdiag /s:DC01 shows all tests passed on the domain controller', category: 'contextual', importance: 'medium' },
    { id: 'e10', title: 'Secure Channel Broken', description: 'nltest /sc_verify shows secure channel is broken', category: 'clue', importance: 'high' },
  ],
  hints: [
    { level: 1, label: 'Subtle Nudge', text: 'The password reset might be a coincidence. What else could prevent Kerberos authentication?', scorePenalty: 5 },
    { level: 2, label: 'Directional Clue', text: "Kerberos is sensitive to certain environmental factors. Check if the workstation's environment matches the domain controller.", scorePenalty: 10 },
    { level: 3, label: 'Stronger Clue', text: 'Compare the system clocks between the workstation and DC01. Kerberos has a strict tolerance.', scorePenalty: 20 },
    { level: 4, label: 'Reveal Path', text: "The W32Time service has stopped, causing the clock to drift beyond Kerberos' 5-minute tolerance. Check w32tm and the time service status.", scorePenalty: 35 },
  ],
  terminalCommands: [
    { command: 'ping dc01', aliases: ['ping DC01'], description: 'Ping domain controller', output: 'Pinging DC01 [192.168.1.10] with 32 bytes of data:\nReply from 192.168.1.10: bytes=32 time<1ms TTL=128\nReply from 192.168.1.10: bytes=32 time<1ms TTL=128\nReply from 192.168.1.10: bytes=32 time<1ms TTL=128\nReply from 192.168.1.10: bytes=32 time<1ms TTL=128\n\nPing statistics for 192.168.1.10:\n    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),\nApproximate round trip times in milli-seconds:\n    Minimum = 0ms, Maximum = 0ms, Average = 0ms', revealsEvidence: ['e8'] },
    { command: 'nslookup dc01', aliases: ['nslookup DC01'], description: 'DNS lookup for DC01', output: 'Server:  dc01.contoso.local\nAddress:  192.168.1.10\n\nName:    dc01.contoso.local\nAddress:  192.168.1.10', revealsEvidence: ['e5'] },
    { command: 'ipconfig /all', aliases: ['ipconfig'], description: 'Network configuration', output: 'Windows IP Configuration\n\n   Host Name . . . . . . . . . . . : WS-PC042\n   Primary Dns Suffix  . . . . . . : contoso.local\n   Node Type . . . . . . . . . . . : Hybrid\n   IP Routing Enabled. . . . . . . : No\n\nEthernet adapter Ethernet:\n\n   Connection-specific DNS Suffix  : contoso.local\n   IPv4 Address. . . . . . . . . . : 192.168.1.142\n   Subnet Mask . . . . . . . . . . : 255.255.255.0\n   Default Gateway . . . . . . . . : 192.168.1.1\n   DNS Servers . . . . . . . . . . : 192.168.1.10\n                                     192.168.1.11' },
    { command: 'w32tm /stripchart /computer:dc01', aliases: ['w32tm /stripchart /computer:DC01'], description: 'Check time offset against DC', output: 'Tracking DC01 [192.168.1.10].\nThe current time is 4/15/2026 10:23:47 AM.\n10:23:47, d:+07m12.431s\n10:23:49, d:+07m12.431s\n10:23:51, d:+07m12.432s\n\n*** WARNING: Time offset exceeds 5 minute Kerberos tolerance ***\n*** Authentication failures are expected ***', revealsEvidence: ['e2'] },
    { command: 'w32tm /query /status', description: 'Check time service status', output: 'Leap Indicator: 3(not synchronized)\nStratum: 0 (unspecified)\nPrecision: -6 (15.625ms per tick)\nRoot Delay: 0.0000000s\nRoot Dispersion: 0.0000000s\nReferenceId: 0x00000000 (unspecified)\nLast Successful Sync Time: 4/12/2026 2:15:33 PM\nSource: Free-running System Clock\nPoll Interval: 0 (unspecified)\n\n*** W32Time service is NOT synchronized ***', revealsEvidence: ['e3'] },
    { command: 'sc query w32time', description: 'Query W32Time service', output: 'SERVICE_NAME: w32time\n        TYPE               : 20  WIN32_SHARE_PROCESS\n        STATE              : 1  STOPPED\n        WIN32_EXIT_CODE    : 0  (0x0)\n        SERVICE_EXIT_CODE  : 0  (0x0)\n        CHECKPOINT         : 0x0\n        WAIT_HINT          : 0x0', revealsEvidence: ['e3'] },
    { command: 'dcdiag /s:dc01', aliases: ['dcdiag'], description: 'Domain controller diagnostics', output: 'Directory Server Diagnosis\n\nPerforming initial setup:\n   Trying to find home server...\n   Home Server = DC01\n   * Identified AD Forest.\n\nDoing initial required tests\n   Testing server: Default-First-Site\\DC01\n      Starting test: Connectivity\n         ......................... DC01 passed test Connectivity\n      Starting test: Advertising\n         ......................... DC01 passed test Advertising\n      Starting test: FrsEvent\n         ......................... DC01 passed test FrsEvent\n      Starting test: DFSREvent\n         ......................... DC01 passed test DFSREvent\n      Starting test: SysVolCheck\n         ......................... DC01 passed test SysVolCheck\n      Starting test: KccEvent\n         ......................... DC01 passed test KccEvent\n      Starting test: KnowsOfRoleHolders\n         ......................... DC01 passed test KnowsOfRoleHolders\n      Starting test: MachineAccount\n         ......................... DC01 passed test MachineAccount\n      Starting test: NCSecDesc\n         ......................... DC01 passed test NCSecDesc\n      Starting test: Services\n         ......................... DC01 passed test Services\n      Starting test: Replications\n         ......................... DC01 passed test Replications\n      Starting test: RidManager\n         ......................... DC01 passed test RidManager\n      Starting test: VerifyReferences\n         ......................... DC01 passed test VerifyReferences', revealsEvidence: ['e9'] },
    { command: 'nltest /sc_verify:contoso.local', aliases: ['nltest /sc_verify:contoso'], description: 'Verify secure channel', output: 'Flags: 0\nTrusted DC Name \\\\DC01.contoso.local\nTrusted DC Connection Status Status = 0 0x0 NERR_Success\nTrust Verification Status = 1789 0x6fd ERROR_TRUSTED_RELATIONSHIP_FAILURE\nThe command completed successfully', revealsEvidence: ['e10'] },
    { command: 'net time \\\\dc01', aliases: ['net time \\\\DC01', 'net time'], description: 'Check DC time', output: 'Current time at \\\\DC01 is 4/15/2026 10:16:35 AM\n\nLocal time at WS-PC042 is          4/15/2026 10:23:47 AM\n\n*** Time difference: 7 minutes 12 seconds ***', revealsEvidence: ['e2'] },
    { command: 'tracert dc01', aliases: ['tracert DC01'], description: 'Trace route to DC', output: 'Tracing route to DC01 [192.168.1.10]\nover a maximum of 30 hops:\n\n  1    <1 ms    <1 ms    <1 ms  DC01 [192.168.1.10]\n\nTrace complete.' },
    { command: 'route print', description: 'Print routing table', output: 'IPv4 Route Table\n===========================================================================\nActive Routes:\nNetwork Destination        Netmask          Gateway       Interface  Metric\n          0.0.0.0          0.0.0.0      192.168.1.1    192.168.1.142     25\n        127.0.0.0        255.0.0.0         On-link         127.0.0.1    331\n      192.168.1.0    255.255.255.0         On-link     192.168.1.142    281\n    192.168.1.142  255.255.255.255         On-link     192.168.1.142    281\n    192.168.1.255  255.255.255.255         On-link     192.168.1.142    281\n===========================================================================\nPersistent Routes:\n  None' },
    { command: 'klist', description: 'List Kerberos tickets', output: 'Current LogonId is 0:0x3e7\n\nCached Tickets: (0)\n\n*** No Kerberos tickets found ***\n*** This is consistent with authentication failure ***' },
    { command: 'systeminfo', description: 'System information', output: 'Host Name:                 WS-PC042\nOS Name:                   Microsoft Windows 10 Enterprise\nOS Version:                10.0.19045 N/A Build 19045\nSystem Type:               x64-based PC\nDomain:                    contoso.local\nLogon Server:              (cached credentials)\nSystem Boot Time:          4/13/2026, 8:15:22 AM\nOriginal Install Date:     1/15/2025, 9:30:00 AM\nTime Zone:                 (UTC-05:00) Eastern Time (US & Canada)' },
  ],
  eventLogs: [
    { id: 'el1', timestamp: '2026-04-15 10:22:01', source: 'Security', level: 'error', message: 'Kerberos authentication failed (KRB_AP_ERR_SKEW)', details: 'Error Code: 0x25\nTarget: krbtgt/CONTOSO.LOCAL\nClient Time: 10:23:47\nServer Time: 10:16:35\nMax Skew: 5 minutes\nActual Skew: 7 minutes 12 seconds', revealsEvidence: ['e4'] },
    { id: 'el2', timestamp: '2026-04-15 10:20:33', source: 'Security', level: 'error', message: 'The trust relationship between this workstation and the primary domain failed', details: 'Logon attempt by CONTOSO\\jsmith failed.\nError: The trust relationship between this workstation and the primary domain failed.', revealsEvidence: ['e1'] },
    { id: 'el3', timestamp: '2026-04-15 09:45:00', source: 'System', level: 'warning', message: 'W32Time: Time Provider NtpClient unable to reach NTP server', details: 'NtpClient was unable to set a domain peer to use as a time source because of discovery error. NtpClient will retry in 15 minutes.' },
    { id: 'el4', timestamp: '2026-04-14 14:32:00', source: 'Security', level: 'info', message: 'Account password was reset', details: 'Subject: HelpDesk\\admin01\nTarget Account: CONTOSO\\jsmith\nPassword Last Set: 4/14/2026 2:32:00 PM', revealsEvidence: ['e6'] },
    { id: 'el5', timestamp: '2026-04-12 14:15:33', source: 'System', level: 'warning', message: 'W32Time service is stopping', details: 'The Windows Time service is stopping. Last sync: 4/12/2026 2:15:33 PM' },
    { id: 'el6', timestamp: '2026-04-12 14:15:00', source: 'System', level: 'error', message: 'W32Time: Failed to sync time', details: 'The time provider NtpClient is currently receiving valid time data from DC01.contoso.local but encountered error during sync. Will retry.' },
    { id: 'el7', timestamp: '2026-04-15 10:18:00', source: 'Security', level: 'info', message: 'Cached credentials used for local logon', details: 'Logon Type: CachedInteractive\nAccount: CONTOSO\\jsmith\nStatus: Success (cached)', revealsEvidence: ['e7'] },
    { id: 'el8', timestamp: '2026-04-15 08:00:00', source: 'Application', level: 'info', message: 'Windows Update check completed', details: 'No updates available.' },
  ],
  ticketHistory: [
    { id: 'th1', author: 'Janet Smith', role: 'End User', timestamp: '2026-04-15 09:30 AM', content: "I can't log into my computer with my domain account. It says something about a \"trust relationship.\" I just had my password reset yesterday and it worked fine after that. This morning it won't let me in at all." },
    { id: 'th2', author: 'Mike Chen', role: 'Help Desk L1', timestamp: '2026-04-15 09:45 AM', content: 'Attempted remote login — same error. Verified the password reset was completed successfully yesterday. User was able to log in after the reset. Suspecting the password reset may have corrupted something. Escalating.', isRedHerring: true, revealsEvidence: ['e6'] },
    { id: 'th3', author: 'Sarah Wong', role: 'Help Desk L2', timestamp: '2026-04-15 10:00 AM', content: 'Confirmed DC01 is healthy from other workstations. Other users on the same subnet can authenticate fine. Issue appears isolated to WS-PC042. Local admin access works with cached creds.' },
    { id: 'th4', author: 'Mike Chen', role: 'Help Desk L1', timestamp: '2026-04-14 02:35 PM', content: 'Password reset completed for jsmith per manager request. User confirmed she could log in successfully after the reset. Ticket closed.' },
  ],
  availableTools: ['terminal', 'event-log', 'ticket-history'],
  redHerrings: [
    'The password reset is coincidental — it completed successfully and the user logged in fine afterward',
    'DNS intermittent issues are caused by timing out during Kerberos pre-auth, not actual DNS failure',
  ],
  remediation:
    'Start the W32Time service, force a time sync with the domain controller (w32tm /resync /force), then rejoin the domain or reset the computer account to restore the secure channel.',
  preventativeMeasures: [
    'Monitor W32Time service status across domain workstations',
    'Set up alerts for time synchronization failures',
    'Configure GPO to auto-restart W32Time service on failure',
    'Implement NTP monitoring for clock drift detection',
  ],
  maxScore: 100,
});
