'use client';

import { useEffect, useState } from 'react';
import { saasApi } from '@/lib/auth';
import { colors } from '../SaasLayout';

export default function NotesPage() {
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const loadNotes = async () => {
    setLoading(true);
    try { const d = await saasApi.getNotes(); setNotes(d.notes); } catch {} finally { setLoading(false); }
  };

  useEffect(() => { loadNotes(); }, []);

  const handleCreate = async () => {
    if (!title.trim()) return;
    await saasApi.createNote({ title: title.trim(), content: content.trim() });
    setTitle(''); setContent(''); setShowCreate(false);
    await loadNotes();
  };

  const handleSave = async (id: string) => {
    await saasApi.updateNote(id, { title, content });
    setEditingId(null);
    await loadNotes();
  };

  const handleDelete = async (id: string) => {
    await saasApi.deleteNote(id);
    setNotes(notes.filter(n => n.id !== id));
  };

  const handlePin = async (id: string, isPinned: boolean) => {
    await saasApi.updateNote(id, { isPinned: !isPinned });
    await loadNotes();
  };

  const startEdit = (note: any) => {
    setEditingId(note.id);
    setTitle(note.title);
    setContent(note.content || '');
  };

  const sorted = [...notes].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1200 }} data-testid="notes-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: 0 }}>Notes</h1>
          <p style={{ fontSize: 14, color: colors.textMuted, margin: '4px 0 0' }}>{notes.length} notes</p>
        </div>
        <button data-testid="button-create-note" onClick={() => { setShowCreate(true); setTitle(''); setContent(''); }}
          style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: colors.accent, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          New note
        </button>
      </div>

      {showCreate && (
        <div style={{ background: colors.bgSecondary, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <input data-testid="input-note-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Note title"
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.bg, color: colors.text, fontSize: 14, outline: 'none', marginBottom: 12, boxSizing: 'border-box' }} />
          <textarea data-testid="input-note-content" value={content} onChange={e => setContent(e.target.value)} placeholder="Write your note..."
            rows={6} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.bg, color: colors.text, fontSize: 14, outline: 'none', marginBottom: 12, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowCreate(false)}
              style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${colors.border}`, background: 'transparent', color: colors.text, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            <button data-testid="button-submit-note" onClick={handleCreate}
              style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: colors.accent, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Save note</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, color: colors.textMuted }}>Loading notes...</div>
      ) : sorted.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, background: colors.bgSecondary, border: `1px solid ${colors.border}`, borderRadius: 12 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>◪</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 8 }}>No notes yet</div>
          <div style={{ fontSize: 13, color: colors.textMuted }}>Capture ideas, meeting notes, or anything you need</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {sorted.map(n => (
            <div key={n.id} data-testid={`card-note-${n.id}`}
              style={{ background: colors.bgSecondary, border: `1px solid ${n.isPinned ? colors.accentYellow + '44' : colors.border}`, borderRadius: 12, padding: 20 }}>
              {editingId === n.id ? (
                <>
                  <input value={title} onChange={e => setTitle(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.bg, color: colors.text, fontSize: 14, outline: 'none', marginBottom: 8, boxSizing: 'border-box' }} />
                  <textarea value={content} onChange={e => setContent(e.target.value)} rows={4}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.bg, color: colors.text, fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                    <button onClick={() => setEditingId(null)} style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${colors.border}`, background: 'transparent', color: colors.text, cursor: 'pointer', fontSize: 12 }}>Cancel</button>
                    <button onClick={() => handleSave(n.id)} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: colors.accent, color: '#fff', cursor: 'pointer', fontSize: 12 }}>Save</button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
                      {n.isPinned && <span style={{ color: colors.accentYellow, marginRight: 6 }}>📌</span>}
                      {n.title}
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => handlePin(n.id, n.isPinned)} style={{ background: 'none', border: 'none', color: n.isPinned ? colors.accentYellow : colors.textDim, cursor: 'pointer', fontSize: 12 }} title={n.isPinned ? 'Unpin' : 'Pin'}>📌</button>
                      <button onClick={() => startEdit(n)} style={{ background: 'none', border: 'none', color: colors.textDim, cursor: 'pointer', fontSize: 12 }}>✏</button>
                      <button onClick={() => handleDelete(n.id)} style={{ background: 'none', border: 'none', color: colors.textDim, cursor: 'pointer', fontSize: 12 }}
                        onMouseEnter={e => (e.currentTarget.style.color = colors.accentRed)} onMouseLeave={e => (e.currentTarget.style.color = colors.textDim)}>×</button>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: colors.textMuted, lineHeight: 1.5, maxHeight: 100, overflow: 'hidden' }}>{n.content || 'No content'}</div>
                  <div style={{ fontSize: 11, color: colors.textDim, marginTop: 8 }}>{new Date(n.updatedAt).toLocaleDateString()}</div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
