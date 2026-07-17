import { useMemo, useState } from 'react';
import { Network, Filter, ChevronRight, ChevronDown } from 'lucide-react';
import { useAppStore } from '@/stores/useAppStore';
import type { CaseDefinition } from '@/types';

interface Packet {
  no: number;
  time: string;
  src: string;
  dst: string;
  proto: string;
  port: number;
  length: number;
  info: string;
  payload: string;
  flags: string;
  evidenceHint?: string;
}

function seededRand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const PROTOCOLS = [
  { name: 'TCP', port: 443, info: 'TLS handshake' },
  { name: 'TCP', port: 80, info: 'HTTP GET /' },
  { name: 'UDP', port: 53, info: 'DNS query' },
  { name: 'TCP', port: 22, info: 'SSH session data' },
  { name: 'ICMP', port: 0, info: 'Echo (ping) request' },
  { name: 'TCP', port: 3389, info: 'RDP keepalive' },
  { name: 'UDP', port: 500, info: 'IKE_SA_INIT' },
  { name: 'UDP', port: 4500, info: 'NAT-T ESP' },
  { name: 'TCP', port: 445, info: 'SMB negotiate' },
  { name: 'TCP', port: 88, info: 'Kerberos AS-REQ' },
];

function generatePackets(caseDef: CaseDefinition): Packet[] {
  const rnd = seededRand(hashString(caseDef.id));
  const out: Packet[] = [];
  const baseIp = `10.${Math.floor(rnd() * 250)}.${Math.floor(rnd() * 250)}`;
  const peerIp = `192.168.${Math.floor(rnd() * 250)}.${Math.floor(rnd() * 250)}`;
  const evidenceList = caseDef.evidence;

  let t = 0;
  for (let i = 1; i <= 80; i++) {
    t += rnd() * 0.8;
    const proto = PROTOCOLS[Math.floor(rnd() * PROTOCOLS.length)];
    const fromClient = rnd() > 0.4;
    const src = fromClient ? `${baseIp}.${10 + Math.floor(rnd() * 200)}` : `${peerIp}.${10 + Math.floor(rnd() * 200)}`;
    const dst = fromClient ? `${peerIp}.${10 + Math.floor(rnd() * 200)}` : `${baseIp}.${10 + Math.floor(rnd() * 200)}`;
    const length = 40 + Math.floor(rnd() * 1400);
    const flags = proto.name === 'TCP' ? ['SYN', 'ACK', 'PSH,ACK', 'FIN,ACK', 'RST'][Math.floor(rnd() * 5)] : '';

    let evidenceHint: string | undefined;
    let info = proto.info;
    if (rnd() < 0.12 && evidenceList.length > 0) {
      const ev = evidenceList[Math.floor(rnd() * evidenceList.length)];
      evidenceHint = ev.title;
      info = `${proto.info} | ${ev.title.slice(0, 40)}`;
    }

    const payload = Array.from({ length: 6 }, () =>
      Array.from({ length: 16 }, () =>
        Math.floor(rnd() * 256).toString(16).padStart(2, '0')
      ).join(' ')
    ).join('\n');

    out.push({
      no: i,
      time: t.toFixed(3),
      src,
      dst,
      proto: proto.name,
      port: proto.port,
      length,
      info,
      payload,
      flags,
      evidenceHint,
    });
  }
  return out;
}

const protoColors: Record<string, string> = {
  TCP: 'text-cyan-300',
  UDP: 'text-purple-300',
  ICMP: 'text-amber-300',
};

export default function WiresharkPanel() {
  const currentCaseDef = useAppStore((s) => s.currentCaseDef);
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [followIp, setFollowIp] = useState<string | null>(null);

  const packets = useMemo(
    () => (currentCaseDef ? generatePackets(currentCaseDef) : []),
    [currentCaseDef]
  );

  if (!currentCaseDef) return null;

  const f = filter.trim().toLowerCase();
  const filtered = packets.filter((p) => {
    if (followIp && p.src !== followIp && p.dst !== followIp) return false;
    if (!f) return true;
    if (f.startsWith('proto:')) return p.proto.toLowerCase() === f.slice(6).trim();
    if (f.startsWith('port:')) return String(p.port) === f.slice(5).trim();
    if (f.startsWith('ip:')) {
      const v = f.slice(3).trim();
      return p.src.includes(v) || p.dst.includes(v);
    }
    return (
      p.info.toLowerCase().includes(f) ||
      p.src.includes(f) ||
      p.dst.includes(f) ||
      p.proto.toLowerCase().includes(f)
    );
  });

  const flagged = packets.filter((p) => p.evidenceHint);

  return (
    <div className="flex flex-col h-full bg-[#0c1017] rounded-lg border border-emerald-900/30 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-[#111822] border-b border-zinc-800/50 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Network size={14} className="text-emerald-400" />
          <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider truncate">
            Packet Capture · {packets.length} frames · {flagged.length} flagged
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Filter size={12} className="text-zinc-500" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="filter (e.g. proto:tcp, port:443, ip:10.0)"
            className="bg-[#0a0e14] border border-zinc-800 rounded px-2 py-1 text-xs font-mono text-zinc-200 w-56 focus:outline-none focus:border-emerald-500/40"
          />
          {followIp && (
            <button
              onClick={() => setFollowIp(null)}
              className="text-[10px] font-mono text-amber-300 hover:text-amber-200 px-2 py-0.5 border border-amber-500/30 rounded"
            >
              Clear stream: {followIp}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-2 px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-zinc-600 bg-[#0a0e14] border-b border-zinc-800/30">
        <div className="col-span-1">No.</div>
        <div className="col-span-1">Time</div>
        <div className="col-span-3">Source</div>
        <div className="col-span-3">Destination</div>
        <div className="col-span-1">Proto</div>
        <div className="col-span-1">Len</div>
        <div className="col-span-2">Info</div>
      </div>

      <div className="flex-1 overflow-y-auto font-mono text-[11px]">
        {filtered.map((p) => {
          const isOpen = expanded === p.no;
          return (
            <div key={p.no} className={`border-b border-zinc-900/60 ${p.evidenceHint ? 'bg-emerald-500/5' : ''}`}>
              <button
                onClick={() => setExpanded(isOpen ? null : p.no)}
                className="w-full grid grid-cols-12 gap-2 px-3 py-1 hover:bg-zinc-800/30 text-left"
              >
                <div className="col-span-1 text-zinc-500 flex items-center gap-1">
                  {isOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                  {p.no}
                </div>
                <div className="col-span-1 text-zinc-500">{p.time}</div>
                <div className="col-span-3 text-zinc-300 truncate">{p.src}</div>
                <div className="col-span-3 text-zinc-300 truncate">{p.dst}</div>
                <div className={`col-span-1 ${protoColors[p.proto] || 'text-zinc-300'}`}>{p.proto}</div>
                <div className="col-span-1 text-zinc-500">{p.length}</div>
                <div className="col-span-2 text-zinc-400 truncate">{p.info}</div>
              </button>
              {isOpen && (
                <div className="px-3 py-2 bg-[#08121a] border-t border-zinc-800/40 space-y-2">
                  <div className="grid grid-cols-2 gap-3 text-[11px]">
                    <div>
                      <div className="text-zinc-500">Frame {p.no} · {p.length} bytes</div>
                      <div className="text-zinc-400">Ethernet II → IPv4 → {p.proto}</div>
                      {p.flags && <div className="text-zinc-400">Flags: {p.flags}</div>}
                      <div className="text-zinc-400">Port: {p.port}</div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); setFollowIp(p.src); }}
                        className="text-left text-cyan-300 hover:text-cyan-200"
                      >
                        Follow stream from {p.src}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setFollowIp(p.dst); }}
                        className="text-left text-cyan-300 hover:text-cyan-200"
                      >
                        Follow stream to {p.dst}
                      </button>
                    </div>
                  </div>
                  {p.evidenceHint && (
                    <div className="text-[11px] text-emerald-300">
                      ▸ Decoded payload references evidence: <span className="font-semibold">{p.evidenceHint}</span>
                    </div>
                  )}
                  <pre className="text-[10px] text-zinc-500 leading-tight whitespace-pre overflow-x-auto">
{p.payload}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="p-6 text-center text-zinc-600 text-xs">No packets match the current filter.</div>
        )}
      </div>
    </div>
  );
}
