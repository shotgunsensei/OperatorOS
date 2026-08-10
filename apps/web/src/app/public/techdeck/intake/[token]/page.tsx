'use client';

import React, { useEffect, useState } from 'react';

type IntakeRequest = { title: string; instructions?: string; expiresAt: string; remainingUploads: number; passwordRequired: boolean; allowedFileTypes: string[]; maxFileSizeBytes: number };

export default function TechDeckPublicIntake({ params }: { params: { token: string } }) {
  const [request, setRequest] = useState<IntakeRequest | null>(null);
  const [password, setPassword] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const valid = /^tdi_[A-Za-z0-9_-]{24,200}$/.test(params.token);

  useEffect(() => {
    if (!valid) { setError('This upload request is invalid.'); return; }
    void fetch(`/api/public/techdeck/intake/${encodeURIComponent(params.token)}`, { credentials: 'omit', cache: 'no-store' })
      .then(async response => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Upload request unavailable.'); return payload.request; })
      .then(setRequest).catch(reason => setError(reason instanceof Error ? reason.message : 'Upload request unavailable.'));
  }, [params.token, valid]);

  async function upload(event: React.FormEvent) {
    event.preventDefault(); if (!file) return;
    setPending(true); setError(null); setSuccess(null);
    try {
      const contentBase64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error('The file could not be read.')); reader.onload = () => resolve(String(reader.result).split(',')[1] ?? ''); reader.readAsDataURL(file); });
      const response = await fetch(`/api/public/techdeck/intake/${encodeURIComponent(params.token)}/upload`, { method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({fileName:file.name,mimeType:file.type || 'application/octet-stream',contentBase64,password}) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Upload failed.');
      setSuccess(payload.duplicate ? `Already received — SHA-256 ${payload.sha256}` : `Upload received — SHA-256 ${payload.file.sha256}`); setFile(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Upload failed.'); }
    finally { setPending(false); }
  }

  return <main style={styles.main}><section style={styles.card} data-testid="techdeck-public-intake"><header style={styles.header}><span style={styles.brand}>TechDeck · secure evidence intake</span><h1 style={styles.title}>{request?.title ?? 'Secure upload request'}</h1><p style={styles.muted}>{request?.instructions ?? 'Loading request details…'}</p></header>
    {error && <div style={styles.error} role="alert">{error}</div>}{success && <div style={styles.success} role="status">{success}</div>}
    {request && <form style={styles.form} onSubmit={upload}><div style={styles.facts}><span>{request.remainingUploads} uploads remaining</span><span>Maximum {Math.floor(request.maxFileSizeBytes / 1048576)} MB</span><span>Expires {new Date(request.expiresAt).toLocaleString()}</span></div>{request.passwordRequired && <label style={styles.label}>Request password<input required type="password" autoComplete="one-time-code" maxLength={200} value={password} onChange={event => setPassword(event.target.value)} style={styles.input} /></label>}<label style={styles.label}>Evidence file<input required type="file" accept={request.allowedFileTypes.join(',')} onChange={event => setFile(event.target.files?.[0] ?? null)} style={styles.input} /></label><button disabled={pending || !file} style={styles.button}>{pending ? 'Validating and uploading…' : 'Upload evidence'}</button></form>}
    <footer style={styles.footer}>Files are type-validated, hashed, deduplicated, malware-scan queued, rate-limited, and retained under the requesting organization’s policy.</footer></section></main>;
}

const styles: Record<string, React.CSSProperties> = {main:{minHeight:'100vh',background:'linear-gradient(145deg,#05070d,#0c2639)',padding:24,color:'#e5eefc',fontFamily:'ui-sans-serif,system-ui,sans-serif'},card:{maxWidth:680,margin:'4vh auto 0',border:'1px solid rgba(56,189,248,.34)',borderRadius:10,background:'#0d1320',overflow:'hidden'},header:{padding:24,borderBottom:'1px solid rgba(148,163,184,.18)'},brand:{fontSize:11,textTransform:'uppercase',letterSpacing:1,color:'#38bdf8',fontWeight:900},title:{margin:'7px 0',fontSize:26},muted:{color:'#8fa3bd'},form:{padding:24,display:'grid',gap:16},facts:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:8,color:'#bae6fd',fontSize:12},label:{display:'grid',gap:7,fontSize:13,fontWeight:800},input:{width:'100%',boxSizing:'border-box',border:'1px solid rgba(148,163,184,.3)',background:'#080d16',color:'#e5eefc',borderRadius:7,padding:11,colorScheme:'dark'},button:{border:0,borderRadius:7,background:'#0284c7',color:'white',padding:12,fontWeight:900,cursor:'pointer'},error:{margin:'16px 24px 0',padding:11,borderRadius:7,background:'rgba(127,29,29,.25)',color:'#fecaca'},success:{margin:'16px 24px 0',padding:11,borderRadius:7,background:'rgba(20,83,45,.25)',color:'#bbf7d0',overflowWrap:'anywhere'},footer:{padding:'14px 24px',borderTop:'1px solid rgba(148,163,184,.15)',color:'#71839a',fontSize:11,lineHeight:1.5}};
