import type { CaseDefinition } from '@/types';
import { composeCase, createTemplate } from './authoring';

export const networkingVpnCase: CaseDefinition = composeCase({
  ...createTemplate('networking', {
    id: 'case-networking-vpn-001',
    slug: 'phantom-vpn-tunnel',
    title: 'Phantom VPN Tunnel',
    difficulty: 'advanced',
  }),
  description:
    'A site-to-site VPN tunnel shows UP/green status on both endpoints, but traffic between the remote subnets is failing silently. Users at the branch office cannot reach any resources at HQ.',
  briefing:
    'PRIORITY: CRITICAL\n\nSite-to-site IPSec VPN between HQ (10.1.0.0/24) and Branch Office (10.2.0.0/24) shows healthy/UP on both Cisco ASA firewalls. Branch users report complete inability to access HQ file servers, applications, and printers since approximately 06:00 this morning. HQ users cannot reach branch resources either. The tunnel was working yesterday.',
  symptoms: [
    { id: 's1', description: 'VPN tunnel status shows UP/green on both ASA endpoints', severity: 'medium' },
    { id: 's2', description: 'No traffic flows between 10.1.0.0/24 and 10.2.0.0/24', severity: 'critical' },
    { id: 's3', description: 'Branch users get timeout errors accessing HQ resources', severity: 'high' },
    { id: 's4', description: 'Phase 1 IKE SA is established successfully', severity: 'low' },
  ],
  rootCause: {
    id: 'rc1',
    title: 'Mismatched IPSec Phase 2 Proxy IDs (Crypto ACL)',
    description:
      'A firewall rule change at HQ last night modified the crypto ACL, changing the Phase 2 proxy identity. The tunnel renegotiated Phase 1 successfully (showing green), but Phase 2 SAs are not being established because the proxy IDs no longer match between sites.',
    technicalDetail:
      'The HQ ASA crypto ACL was changed from "permit ip 10.1.0.0/24 10.2.0.0/24" to "permit ip 10.1.0.0/16 10.2.0.0/24" during a late-night change window. This /16 vs /24 mismatch means the Phase 2 proxy identities don\'t match between the two endpoints. IKE Phase 1 (ISAKMP SA) establishes fine because it only negotiates encryption parameters, not traffic selectors. Phase 2 (IPSec SA) fails silently because the proxy IDs disagree, so no IPSec SAs are built and no traffic is encrypted/forwarded.',
  },
  evidence: [
    { id: 'e1', title: 'Tunnel Status Green', description: 'ASDM shows VPN tunnel status as UP on both endpoints', category: 'red-herring', importance: 'medium' },
    { id: 'e2', title: 'Phase 1 Active, Phase 2 Missing', description: '"show crypto isakmp sa" shows ACTIVE, but "show crypto ipsec sa" shows 0 packets encrypted/decrypted', category: 'clue', importance: 'critical' },
    { id: 'e3', title: 'Crypto ACL Mismatch', description: 'HQ crypto ACL uses 10.1.0.0/16 while Branch uses 10.1.0.0/24 — proxy ID mismatch', category: 'clue', importance: 'critical' },
    { id: 'e4', title: 'Recent Change Log', description: 'Change ticket #4521 modified HQ firewall ACLs at 23:45 last night', category: 'clue', importance: 'high' },
    { id: 'e5', title: 'No ESP Traffic', description: 'Packet capture shows ISAKMP (UDP 500) traffic but no ESP packets between sites', category: 'clue', importance: 'high' },
    { id: 'e6', title: 'Routing Table Clean', description: 'Route tables on both sides correctly point VPN traffic to tunnel interface', category: 'contextual', importance: 'low' },
    { id: 'e7', title: 'NAT Not Interfering', description: 'NAT exemption rules are correctly configured for VPN traffic', category: 'contextual', importance: 'low' },
    { id: 'e8', title: 'IKE Debug Messages', description: 'Debug output shows "QM FSM error" during Phase 2 negotiation - proxy ID mismatch', category: 'clue', importance: 'critical' },
  ],
  hints: [
    { level: 1, label: 'Subtle Nudge', text: 'A VPN showing "UP" doesn\'t necessarily mean all phases are healthy. VPN has multiple negotiation phases.', scorePenalty: 5 },
    { level: 2, label: 'Directional Clue', text: 'Phase 1 handles key exchange. Phase 2 handles the actual traffic encryption. Check if both phases are truly established.', scorePenalty: 10 },
    { level: 3, label: 'Stronger Clue', text: 'Compare the crypto ACLs (proxy identities) on both sides. Phase 2 requires these to match exactly.', scorePenalty: 20 },
    { level: 4, label: 'Reveal Path', text: 'A change last night modified the HQ crypto ACL from /24 to /16 subnet mask. The Branch still has /24. This proxy ID mismatch prevents Phase 2 SA establishment.', scorePenalty: 35 },
  ],
  terminalCommands: [
    { command: 'show crypto isakmp sa', description: 'Show IKE Phase 1 SAs', output: 'IKEv1 SAs:\n\n   Active SA: 1\n   Rekey SA: 0 (A tunnel will report 1 Active and 1 Rekey SA during rekey)\n\n   conn-id  slot  status         src              dst\n   1001     0     ACTIVE         203.0.113.1      198.51.100.1\n\n   IKEv1 SA lifetime: 86400 seconds\n   IKEv1 SA remaining: 72531 seconds', revealsEvidence: ['e2'] },
    { command: 'show crypto ipsec sa', description: 'Show IPSec Phase 2 SAs', output: 'interface: outside\n\n  Crypto map tag: VPN-MAP, seq num: 10, local addr: 203.0.113.1\n\n   local  ident (addr/mask/prot/port): (10.1.0.0/255.255.0.0/0/0)\n   remote ident (addr/mask/prot/port): (10.2.0.0/255.255.255.0/0/0)\n\n   #pkts encaps: 0, #pkts encrypt: 0, #pkts digest: 0\n   #pkts decaps: 0, #pkts decrypt: 0, #pkts verify: 0\n\n   *** NO ACTIVE IPSec SAs ***\n   *** Phase 2 negotiation has not completed ***\n\n   Inbound ESP SAs: 0\n   Outbound ESP SAs: 0', revealsEvidence: ['e2'] },
    { command: 'show access-list crypto-acl', aliases: ['show access-list VPN-ACL', 'show crypto map'], description: 'Show crypto ACL on HQ', output: 'access-list crypto-acl line 1 extended permit ip 10.1.0.0 255.255.0.0 10.2.0.0 255.255.255.0 (hitcnt=0)\n\n*** NOTE: Local network mask is /16 (255.255.0.0) ***\n*** Compare with remote side configuration ***', revealsEvidence: ['e3'] },
    { command: 'ping 10.2.0.1', description: 'Ping branch gateway', output: 'Type escape sequence to abort.\nSending 5, 100-byte ICMP Echos to 10.2.0.1, timeout is 2 seconds:\n.....\nSuccess rate is 0 percent (0/5)' },
    { command: 'ping 10.1.0.1', description: 'Ping HQ gateway', output: 'Type escape sequence to abort.\nSending 5, 100-byte ICMP Echos to 10.1.0.1, timeout is 2 seconds:\n.....\nSuccess rate is 0 percent (0/5)' },
    { command: 'tracert 10.2.0.1', aliases: ['traceroute 10.2.0.1'], description: 'Trace route to branch', output: 'Tracing route to 10.2.0.1\n\n  1  *  *  *  Request timed out.\n  2  *  *  *  Request timed out.\n  3  *  *  *  Request timed out.\n\n*** Traffic is not traversing the tunnel ***' },
    { command: 'show vpn-sessiondb', description: 'Show VPN sessions', output: 'Session Type: LAN-to-LAN\n\nConnection   : 203.0.113.1\nIndex        : 1\nIP Addr      : 198.51.100.1\nProtocol     : IKEv1\nEncryption   : AES-256\nHashing      : SHA-256\nBytes Tx     : 4520          Bytes Rx     : 3840\nLogin Time   : 06:00:12 UTC\nDuration     : 4h 23m\nIKE Sessions : 1\nIPSec Sessions: 0           *** NO IPSec sessions ***', revealsEvidence: ['e2'] },
    { command: 'show route', aliases: ['route print', 'show ip route'], description: 'Show routing table', output: 'Codes: C - connected, S - static, O - OSPF\n\nGateway of last resort is 203.0.113.254\n\nC    10.1.0.0 255.255.255.0 is directly connected, inside\nS    10.2.0.0 255.255.255.0 [1/0] via 203.0.113.1, outside (VPN)\nC    203.0.113.0 255.255.255.0 is directly connected, outside\nS*   0.0.0.0 0.0.0.0 [1/0] via 203.0.113.254, outside', revealsEvidence: ['e6'] },
    { command: 'show nat', aliases: ['show xlate'], description: 'Show NAT rules', output: 'Manual NAT Policies (Section 1)\n1 (inside) to (outside) source static obj-10.1.0.0 obj-10.1.0.0\n                        destination static obj-10.2.0.0 obj-10.2.0.0\n    no-proxy-arp route-lookup\n    translate_hits = 0, untranslate_hits = 0\n\n*** NAT exemption for VPN traffic is correctly configured ***', revealsEvidence: ['e7'] },
    { command: 'debug crypto ikev1', aliases: ['debug crypto ike'], description: 'Enable IKE debug', output: '[IKEv1 DEBUG]: Starting QM Phase 2 negotiation\n[IKEv1 DEBUG]: Sending HASH payload\n[IKEv1 DEBUG]: Constructing proxy ID:\n  Local:  10.1.0.0/255.255.0.0\n  Remote: 10.2.0.0/255.255.255.0\n[IKEv1 DEBUG]: Received proxy ID from peer:\n  Local:  10.1.0.0/255.255.255.0\n  Remote: 10.2.0.0/255.255.255.0\n[IKEv1 DEBUG]: *** PROXY ID MISMATCH ***\n[IKEv1 DEBUG]: QM FSM error (P2 struct &0x7f8b)\n[IKEv1 DEBUG]: Removing peer from correlator table failed, no match!\n[IKEv1 DEBUG]: Phase 2 SA not established - check crypto ACLs', revealsEvidence: ['e8'] },
    { command: 'show logging | include vpn', aliases: ['show log'], description: 'Show VPN-related logs', output: '%ASA-3-713061: IKE negotiation: Phase 2 failure\n%ASA-4-713903: Proxy identities not supported\n%ASA-5-713041: IKE Phase 1 completed (203.0.113.1 <-> 198.51.100.1)\n%ASA-3-713902: Tunnel rejected: proxy ID mismatch\n\n*** Change history shows ACL modification at 23:45 last night ***\n*** Change ticket: #4521 ***', revealsEvidence: ['e4'] },
    { command: 'packet-tracer input inside tcp 10.1.0.50 1234 10.2.0.50 80', aliases: ['packet-tracer'], description: 'Trace packet through firewall', output: 'Phase 1: Route Lookup                    - ALLOW\nPhase 2: Access List                      - ALLOW\nPhase 3: NAT Exemption                    - MATCH (no-nat)\nPhase 4: VPN encrypt                      - DROP\n\n*** Packet dropped at VPN encryption phase ***\n*** No valid Phase 2 SA available for this traffic ***\n\nResult: DROP\nReason: No IPSec SA', revealsEvidence: ['e5'] },
  ],
  eventLogs: [
    { id: 'el1', timestamp: '2026-04-15 06:00:12', source: 'VPN', level: 'info', message: 'IKE Phase 1 SA established with 198.51.100.1', details: 'Encryption: AES-256, Hash: SHA-256, DH Group: 14, Lifetime: 86400s' },
    { id: 'el2', timestamp: '2026-04-15 06:00:15', source: 'VPN', level: 'error', message: 'Phase 2 negotiation failed: proxy ID mismatch', details: 'Local proxy: 10.1.0.0/255.255.0.0\nRemote proxy: 10.1.0.0/255.255.255.0\nExpected match, got MISMATCH\nPhase 2 SA NOT established', revealsEvidence: ['e8'] },
    { id: 'el3', timestamp: '2026-04-14 23:45:22', source: 'Configuration', level: 'info', message: 'ACL crypto-acl modified by admin@hq-fw01', details: 'Change ticket: #4521\nOld: permit ip 10.1.0.0 255.255.255.0 10.2.0.0 255.255.255.0\nNew: permit ip 10.1.0.0 255.255.0.0 10.2.0.0 255.255.255.0\nReason: "Expanding VPN scope for new subnets"', revealsEvidence: ['e4'] },
    { id: 'el4', timestamp: '2026-04-15 06:01:00', source: 'VPN', level: 'warning', message: 'IPSec SA count: 0 active', details: 'No inbound or outbound ESP SAs. Traffic cannot be encrypted.' },
    { id: 'el5', timestamp: '2026-04-15 07:30:00', source: 'Monitoring', level: 'info', message: 'VPN Health Check: PASS', details: 'IKE SA: Active\nTunnel Status: UP\nNote: Health check only verifies Phase 1 IKE SA presence', revealsEvidence: ['e1'] },
    { id: 'el6', timestamp: '2026-04-15 08:15:00', source: 'HelpDesk', level: 'warning', message: 'Multiple branch users reporting connectivity issues', details: '15 tickets opened since 08:00. All branch users unable to reach HQ resources.' },
  ],
  ticketHistory: [
    { id: 'th1', author: 'Branch Office Manager', role: 'End User', timestamp: '2026-04-15 07:45 AM', content: 'Nobody in the branch can access the shared drives, ERP, or printers at HQ. This started this morning. Everything was working yesterday.' },
    { id: 'th2', author: 'Tom Rivera', role: 'Network Operations', timestamp: '2026-04-15 08:00 AM', content: "Checked VPN dashboard - tunnel shows GREEN/UP. Phase 1 is established. Bounced the tunnel once, came right back up green. Internet at both sites is fine. Not sure what's going on." },
    { id: 'th3', author: 'Lisa Park', role: 'Network Engineer', timestamp: '2026-04-15 08:30 AM', content: 'Ran a change review — there was a scheduled change last night (ticket #4521) to expand the VPN scope for future subnets. The change was approved and implemented. Could be related but the tunnel is showing healthy.', revealsEvidence: ['e4'] },
    { id: 'th4', author: 'Tom Rivera', role: 'Network Operations', timestamp: '2026-04-15 09:15 AM', content: 'Tried pinging across the tunnel — 100% loss. But the tunnel status is UP. Checked routing — looks correct. NAT exemption is in place. Escalating to senior engineer.', isRedHerring: false },
  ],
  availableTools: ['terminal', 'event-log', 'ticket-history'],
  redHerrings: [
    'The tunnel showing "UP/green" is misleading — the monitoring only checks Phase 1 (IKE SA), not Phase 2 (IPSec SA)',
    'Routing and NAT are correctly configured and are not the issue',
  ],
  remediation:
    'Correct the HQ crypto ACL to match the Branch side: change 10.1.0.0/255.255.0.0 back to 10.1.0.0/255.255.255.0, or update the Branch ACL to match the new /16 scope. Then clear the crypto SA (clear crypto sa) to force renegotiation.',
  preventativeMeasures: [
    'Implement change management verification that checks both sides of VPN configurations',
    'Set up monitoring that validates Phase 2 SA establishment, not just Phase 1',
    'Add packet count monitoring — zero encrypted packets should trigger an alert',
    'Require peer-review for crypto ACL changes',
  ],
  maxScore: 100,
});
