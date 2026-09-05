'use client';

import React, { useEffect, useMemo, useState } from 'react';

type PublicStatus = { page: Record<string, any>; components: Array<Record<string, any>>; incidents: Array<Record<string, any>> };

export default function TechDeckPublicStatus({ params }: { params: { slug: string } }) {
  const [data, setData] = useState<PublicStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const valid = /^[a-z0-9-]{1,120}$/.test(params.slug);

  useEffect(() => {
    if (!valid) { setError('This status page address is invalid.'); setLoading(false); return; }
    void fetch(`/api/public/techdeck/status/${encodeURIComponent(params.slug)}`, { credentials: 'omit', cache: 'no-store' })
      .then(async response => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Status is unavailable.'); return payload; })
      .then(setData).catch(reason => setError(reason instanceof Error ? reason.message : 'Status is unavailable.')).finally(() => setLoading(false));
  }, [params.slug, valid]);

  const overall = useMemo(() => {
    const states = data?.components.map(row => String(row.status)) ?? [];
    return states.includes('major_outage') ? 'Major outage' : states.includes('partial_outage') ? 'Partial outage' : states.includes('degraded') ? 'Degraded performance' : states.includes('maintenance') ? 'Maintenance' : 'All systems operational';
  }, [data]);

  return <main style={styles.main}><section style={styles.card} data-testid="techdeck-public-status">
    <header style={styles.header}><div><span style={styles.brand}>TechDeck · public service status</span><h1 style={styles.title}>{data?.page.title ?? 'Service status'}</h1><p style={styles.description}>{data?.page.description}</p></div><span style={styles.secure}>Public, no sign-in</span></header>
    {loading ? <div style={styles.state} aria-busy="true">Loading current service state…</div> : error ? <div style={{ ...styles.state, color: '#fecaca' }} role="alert">{error}</div> : data && <div style={styles.content}>
      <div style={styles.overall}>{overall}</div>
      <section><h2 style={styles.sectionTitle}>Components</h2>{data.components.length === 0 ? <p style={styles.empty}>No components published.</p> : <div style={styles.list}>{data.components.map(row => <article key={row.id} style={styles.row}><div><strong>{row.name}</strong><p>{row.description}</p></div><span style={{ ...styles.pill, color: tone(row.status) }}>{String(row.status).replaceAll('_', ' ')}</span></article>)}</div>}</section>
      <section><h2 style={styles.sectionTitle}>Incident history</h2>{data.incidents.length === 0 ? <p style={styles.empty}>No incidents reported.</p> : <div style={styles.list}>{data.incidents.map(row => <article key={row.id} style={styles.incident}><div style={styles.incidentHead}><strong>{row.title}</strong><span>{row.status}</span></div><p>{row.description}</p>{(row.updates ?? []).map((update: Record<string, any>, index: number) => <div key={index} style={styles.update}><strong>{update.status}</strong> {update.message}</div>)}</article>)}</div>}</section>
    </div>}
    <footer style={styles.footer}>Published from TechDeck. Sign-in details, internal notes, and private files are never included.</footer>
  </section></main>;
}

const tone = (value: unknown) => value === 'operational' ? '#4ade80' : value === 'maintenance' ? '#fbbf24' : '#fb7185';
const styles: Record<string, React.CSSProperties> = {
  main:{minHeight:'100vh',background:'radial-gradient(circle at top,#10304a,#05070d 48%)',padding:24,color:'#e5eefc',fontFamily:'ui-sans-serif,system-ui,sans-serif'},card:{maxWidth:850,margin:'0 auto',border:'1px solid rgba(56,189,248,.3)',borderRadius:10,background:'#0d1320',overflow:'hidden',boxShadow:'0 30px 90px rgba(0,0,0,.35)'},header:{display:'flex',justifyContent:'space-between',gap:18,padding:24,borderBottom:'1px solid rgba(148,163,184,.18)'},brand:{color:'#38bdf8',fontSize:11,fontWeight:900,textTransform:'uppercase',letterSpacing:1},title:{margin:'6px 0 0',fontSize:28},description:{margin:'8px 0 0',color:'#8fa3bd'},secure:{height:'fit-content',padding:'6px 9px',borderRadius:999,background:'#082f49',color:'#bae6fd',fontSize:11,fontWeight:800},state:{padding:40,textAlign:'center',color:'#8fa3bd'},content:{padding:24,display:'grid',gap:24},overall:{border:'1px solid rgba(74,222,128,.3)',background:'rgba(20,83,45,.22)',color:'#bbf7d0',padding:15,borderRadius:8,fontSize:18,fontWeight:900},sectionTitle:{fontSize:16,margin:'0 0 10px'},list:{display:'grid',gap:8},row:{display:'flex',justifyContent:'space-between',gap:14,alignItems:'center',border:'1px solid rgba(148,163,184,.17)',padding:12,borderRadius:7},pill:{textTransform:'capitalize',fontSize:12,fontWeight:900},empty:{color:'#8fa3bd'},incident:{borderLeft:'3px solid #f59e0b',background:'#080d16',padding:13,borderRadius:6},incidentHead:{display:'flex',justifyContent:'space-between',gap:12,textTransform:'capitalize'},update:{marginTop:7,color:'#a9bad0',fontSize:12},footer:{borderTop:'1px solid rgba(148,163,184,.15)',padding:'14px 24px',color:'#71839a',fontSize:11}
};
