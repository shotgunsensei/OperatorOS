'use client';

import {
  ArrowLeft,
  Bell,
  BellOff,
  Check,
  Edit3,
  MessageCircle,
  MessageSquarePlus,
  MoreHorizontal,
  Reply,
  Send,
  Trash2,
  UsersRound,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from './AuthProvider';
import { useTenant } from './TenantProvider';
import { getActiveTenantId } from '@/lib/auth';
import {
  type MessengerConversation,
  type MessengerMember,
  type MessengerMessage,
  type MessengerSocketState,
  TenantMessengerSocket,
  tenantMessengerApi,
} from '@/lib/messenger';
import styles from './TenantMessenger.module.css';

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('') || '?';
}

function relativeTime(value: string | null) {
  if (!value) return '';
  const milliseconds = Date.now() - new Date(value).getTime();
  if (milliseconds < 60_000) return 'now';
  if (milliseconds < 3_600_000) return `${Math.floor(milliseconds / 60_000)}m`;
  if (milliseconds < 86_400_000) return `${Math.floor(milliseconds / 3_600_000)}h`;
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function conversationName(conversation: MessengerConversation, currentUserId: string) {
  if (conversation.kind === 'group') return conversation.title || 'Group conversation';
  return conversation.participants.find(participant => participant.userId !== currentUserId)?.name || 'Former member';
}

function conversationPresence(conversation: MessengerConversation, currentUserId: string) {
  if (conversation.kind === 'group') return conversation.participants.some(participant => participant.userId !== currentUserId && participant.presence === 'online') ? 'online' : 'offline';
  return conversation.participants.find(participant => participant.userId !== currentUserId)?.presence ?? 'offline';
}

function errorMessage(error: any) {
  if (error?.code === 'TENANT_NOT_FOUND') return 'Messaging is available only inside an organization you belong to.';
  return error?.error || error?.message || 'Messenger is temporarily unavailable.';
}

export default function TenantMessenger() {
  const { user } = useAuth();
  const { activeTenant } = useTenant();
  const tenantId = activeTenant?.id ?? user?.currentTenantId ?? getActiveTenantId();
  const [open, setOpen] = useState(false);
  const [conversations, setConversations] = useState<MessengerConversation[]>([]);
  const [members, setMembers] = useState<MessengerMember[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessengerMessage[]>([]);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<MessengerMessage | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [confirmDeleteMessageId, setConfirmDeleteMessageId] = useState<string | null>(null);
  const [confirmDeleteConversation, setConfirmDeleteConversation] = useState(false);
  const [newConversation, setNewConversation] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [groupTitle, setGroupTitle] = useState('');
  const [renamingConversation, setRenamingConversation] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [socketState, setSocketState] = useState<MessengerSocketState>('closed');
  const [toast, setToast] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const selectedIdRef = useRef<string | null>(null);
  const openRef = useRef(false);
  const conversationRef = useRef<MessengerConversation[]>([]);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const shouldScrollToEndRef = useRef(true);
  const toastTimerRef = useRef<number | null>(null);
  const loadedTenantRef = useRef<string | null>(null);

  const selectedConversation = conversations.find(item => item.id === selectedId) ?? null;
  const unreadCount = conversations.reduce((sum, item) => sum + item.unreadCount, 0);

  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => { openRef.current = open; }, [open]);
  useEffect(() => { conversationRef.current = conversations; }, [conversations]);
  useEffect(() => {
    if (typeof Notification !== 'undefined') setNotificationPermission(Notification.permission);
    return () => {
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const loadConversations = useCallback(async (quiet = false) => {
    if (!tenantId || !user) return;
    if (!quiet) setLoading(true);
    try {
      const response = await tenantMessengerApi.conversations();
      setConversations(response.conversations);
      setError(null);
      if (selectedIdRef.current && !response.conversations.some(item => item.id === selectedIdRef.current)) {
        setSelectedId(null);
        setMessages([]);
      }
    } catch (caught) {
      if (!quiet) setError(errorMessage(caught));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [tenantId, user?.id]);

  const loadMembers = useCallback(async (search = '', quiet = false) => {
    if (!tenantId || !user) return;
    try {
      const response = await tenantMessengerApi.members(search);
      setMembers(response.members);
    } catch (caught) {
      if (!quiet) setError(errorMessage(caught));
    }
  }, [tenantId, user?.id]);

  const notifyIncoming = useCallback((event: Record<string, any>) => {
    if (!user || event?.message?.senderUserId === user.id || event?.muted) return;
    const conversation = conversationRef.current.find(item => item.id === event.conversationId);
    const title = conversation ? conversationName(conversation, user.id) : event.message?.senderName || 'New message';
    const preview = String(event.message?.body || 'Sent a message').slice(0, 160);
    setToast(`${title}: ${preview}`);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 5000);
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
      try {
        const notification = new Notification(title, { body: preview, tag: `operatoros-message-${event.conversationId}` });
        notification.onclick = () => { window.focus(); setOpen(true); setSelectedId(event.conversationId); notification.close(); };
      } catch { /* in-app toast and unread badge remain available */ }
    }
  }, [user]);

  useEffect(() => {
    if (!tenantId || !user) {
      loadedTenantRef.current = null;
      setConversations([]);
      setMembers([]);
      setSelectedId(null);
      setHasMoreMessages(false);
      setSocketState('closed');
      return;
    }
    if (loadedTenantRef.current !== tenantId) {
      loadedTenantRef.current = tenantId;
      setOpen(false);
      setConversations([]);
      setMembers([]);
      setSelectedId(null);
      setMessages([]);
      setHasMoreMessages(false);
      setError(null);
      setNewConversation(false);
    }
    void loadConversations();
    void loadMembers('', true);
    const socket = new TenantMessengerSocket(tenantId, event => {
      if (event.type === 'message.created') {
        if (selectedIdRef.current === event.conversationId) {
          shouldScrollToEndRef.current = true;
          setMessages(current => current.some(item => item.id === event.message.id) ? current : [...current, event.message]);
          if (openRef.current) void tenantMessengerApi.markRead(event.conversationId).catch(() => undefined);
        }
        notifyIncoming(event);
        void loadConversations(true);
      } else if (event.type === 'message.updated') {
        if (selectedIdRef.current === event.conversationId) {
          setMessages(current => current.map(item => item.id === event.message.id ? event.message : item));
        }
        void loadConversations(true);
      } else if (event.type === 'conversation.updated') {
        void loadConversations(true);
      } else if (event.type === 'presence.updated') {
        setMembers(current => current.map(member => member.id === event.userId ? { ...member, presence: event.presence, lastSeenAt: event.lastSeenAt } : member));
        setConversations(current => current.map(conversation => ({
          ...conversation,
          participants: conversation.participants.map(participant => participant.userId === event.userId
            ? { ...participant, presence: event.presence, lastSeenAt: event.lastSeenAt }
            : participant),
        })));
      }
    }, setSocketState);
    socket.connect();
    const conversationPoll = window.setInterval(() => void loadConversations(true), 12_000);
    const memberPoll = window.setInterval(() => void loadMembers('', true), 30_000);
    return () => {
      socket.close();
      window.clearInterval(conversationPoll);
      window.clearInterval(memberPoll);
    };
  }, [tenantId, user?.id, loadConversations, loadMembers, notifyIncoming]);

  useEffect(() => {
    if (!open || !selectedId) return;
    let active = true;
    setLoadingMessages(true);
    setError(null);
    tenantMessengerApi.messages(selectedId).then(response => {
      if (active) {
        shouldScrollToEndRef.current = true;
        setMessages(response.messages);
        setHasMoreMessages(response.hasMore);
      }
      return tenantMessengerApi.markRead(selectedId);
    }).then(() => loadConversations(true)).catch(caught => { if (active) setError(errorMessage(caught)); }).finally(() => { if (active) setLoadingMessages(false); });
    return () => { active = false; };
  }, [open, selectedId, loadConversations]);

  useEffect(() => {
    if (!shouldScrollToEndRef.current) return;
    messageEndRef.current?.scrollIntoView({ block: 'end' });
    shouldScrollToEndRef.current = false;
  }, [messages, selectedId]);
  useEffect(() => {
    const timer = window.setTimeout(() => void loadMembers(memberSearch, true), 250);
    return () => window.clearTimeout(timer);
  }, [memberSearch, loadMembers]);

  const openConversation = (id: string) => {
    setNewConversation(false);
    setSelectedId(id);
    setReplyTo(null);
    setEditingId(null);
    setRenamingConversation(false);
    setConfirmDeleteConversation(false);
    shouldScrollToEndRef.current = true;
  };

  const beginNewConversation = () => {
    setSelectedId(null);
    setMessages([]);
    setHasMoreMessages(false);
    setNewConversation(true);
    setSelectedMembers(new Set());
    setGroupTitle('');
    setMemberSearch('');
  };

  const loadOlderMessages = async () => {
    if (!selectedId || !messages[0] || loadingOlder) return;
    setLoadingOlder(true);
    setError(null);
    try {
      const response = await tenantMessengerApi.messages(selectedId, messages[0].id);
      shouldScrollToEndRef.current = false;
      setMessages(current => [...response.messages, ...current.filter(item => !response.messages.some(older => older.id === item.id))]);
      setHasMoreMessages(response.hasMore);
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setLoadingOlder(false); }
  };

  const createConversation = async () => {
    if (selectedMembers.size === 0) return;
    setSending(true);
    setError(null);
    try {
      const response = await tenantMessengerApi.createConversation([...selectedMembers], selectedMembers.size > 1 ? groupTitle.trim() || undefined : undefined);
      await loadConversations(true);
      setNewConversation(false);
      setSelectedId(response.conversation.id);
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setSending(false); }
  };

  const sendMessage = async () => {
    if (!selectedId || !draft.trim() || sending) return;
    setSending(true);
    setError(null);
    const body = draft.trim();
    const clientId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      const response = await tenantMessengerApi.send(selectedId, { body, clientMessageId: clientId, replyToMessageId: replyTo?.id });
      shouldScrollToEndRef.current = true;
      setMessages(current => current.some(item => item.id === response.message.id) ? current : [...current, response.message]);
      setDraft('');
      setReplyTo(null);
      await loadConversations(true);
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setSending(false); }
  };

  const saveEdit = async (message: MessengerMessage) => {
    if (!selectedId || !editDraft.trim()) return;
    setSending(true);
    try {
      const response = await tenantMessengerApi.editMessage(selectedId, message.id, editDraft.trim(), message.version);
      setMessages(current => current.map(item => item.id === message.id ? response.message : item));
      setEditingId(null);
      setEditDraft('');
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setSending(false); }
  };

  const deleteMessage = async (message: MessengerMessage) => {
    if (!selectedId) return;
    setSending(true);
    try {
      const response = await tenantMessengerApi.deleteMessage(selectedId, message.id, message.version);
      setMessages(current => current.map(item => item.id === message.id ? response.message : item));
      setConfirmDeleteMessageId(null);
      await loadConversations(true);
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setSending(false); }
  };

  const toggleMute = async () => {
    if (!selectedConversation) return;
    try {
      const response = await tenantMessengerApi.updateConversation(selectedConversation.id, { muted: !selectedConversation.muted });
      setConversations(current => current.map(item => item.id === response.conversation.id ? response.conversation : item));
    } catch (caught) { setError(errorMessage(caught)); }
  };

  const saveConversationTitle = async () => {
    if (!selectedConversation || selectedConversation.kind !== 'group' || !renameDraft.trim()) return;
    setSending(true);
    setError(null);
    try {
      const response = await tenantMessengerApi.updateConversation(selectedConversation.id, {
        title: renameDraft.trim(),
        expectedVersion: selectedConversation.version,
      });
      setConversations(current => current.map(item => item.id === response.conversation.id ? response.conversation : item));
      setRenamingConversation(false);
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setSending(false); }
  };

  const hideConversation = async () => {
    if (!selectedConversation) return;
    try {
      await tenantMessengerApi.hideConversation(selectedConversation.id);
      setConversations(current => current.filter(item => item.id !== selectedConversation.id));
      setSelectedId(null);
      setMessages([]);
      setHasMoreMessages(false);
      setConfirmDeleteConversation(false);
    } catch (caught) { setError(errorMessage(caught)); }
  };

  const enableDesktopAlerts = async () => {
    if (typeof Notification === 'undefined') return;
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
    } catch {
      setError('Desktop alerts are unavailable in this browser. In-app alerts and unread badges remain enabled.');
    }
  };

  const sortedMembers = useMemo(() => [...members].sort((a, b) => Number(b.presence === 'online') - Number(a.presence === 'online') || a.name.localeCompare(b.name)), [members]);
  const canRenameSelected = selectedConversation?.kind === 'group'
    && selectedConversation.participants.some(participant => participant.userId === user?.id && participant.role === 'owner');

  if (!user || !tenantId) return null;

  return (
    <div className={styles.root} data-testid="tenant-messenger">
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen(value => !value)}
        aria-label={`Open organization messenger${unreadCount ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open}
        data-testid="tenant-messenger-toggle"
      >
        <MessageCircle size={17} aria-hidden="true" />
        <span className={styles.triggerLabel}>Messages</span>
        {unreadCount > 0 && <span className={styles.badge}>{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>

      {typeof document !== 'undefined' && createPortal(
        <>
          {open && (
            <>
              <button className={styles.backdrop} type="button" aria-label="Close messenger" onClick={() => setOpen(false)} data-testid="tenant-messenger-backdrop" data-operatoros-priority-layer="messenger-backdrop" />
              <section className={`${styles.panel} ${selectedId ? styles.panelConversation : ''}`} role="dialog" aria-modal="true" aria-label="Organization messenger" data-testid="tenant-messenger-panel" data-operatoros-priority-layer="messenger-panel">
            <aside className={styles.sidebar}>
              <div className={styles.sidebarHeader}>
                <span className={`${styles.connection} ${socketState === 'open' ? styles.connectionOpen : ''}`} aria-hidden="true" />
                <div className={styles.sidebarTitle}>
                  <strong>{activeTenant?.name || 'Organization'} messages</strong>
                  <span className={styles.subtle}>{socketState === 'open' ? 'Live and organization-only' : socketState === 'closed' ? 'Offline — reconnecting with polling' : 'Connecting securely…'}</span>
                </div>
                <button type="button" className={styles.iconButton} onClick={beginNewConversation} aria-label="Start a conversation" title="New conversation"><MessageSquarePlus size={16} /></button>
                <button type="button" className={styles.iconButton} onClick={() => setOpen(false)} aria-label="Close messenger"><X size={16} /></button>
              </div>
              {notificationPermission === 'default' && (
                <div className={styles.settingsRow}>
                  <span>Desktop alerts are optional.</span>
                  <button type="button" className={styles.secondaryButton} onClick={() => void enableDesktopAlerts()}><Bell size={13} /> Enable</button>
                </div>
              )}
              {error && <div className={styles.error} role="alert">{error}</div>}
              {newConversation ? (
                <div className={styles.composerView}>
                  <div className={styles.searchWrap}>
                    <input className={styles.input} value={memberSearch} onChange={event => setMemberSearch(event.target.value)} placeholder="Find a teammate" aria-label="Find a teammate" autoFocus />
                  </div>
                  <div className={styles.memberList}>
                    {sortedMembers.length === 0 ? <div className={styles.state}>No matching members in this organization.</div> : sortedMembers.map(member => {
                      const selected = selectedMembers.has(member.id);
                      return <button key={member.id} type="button" className={`${styles.member} ${selected ? styles.memberSelected : ''}`} onClick={() => setSelectedMembers(current => { const next = new Set(current); if (next.has(member.id)) next.delete(member.id); else next.add(member.id); return next; })}>
                        <span className={styles.avatar}>{initials(member.name)}<span className={`${styles.presence} ${member.presence === 'online' ? styles.presenceOnline : ''}`} /></span>
                        <span className={styles.memberMeta}><strong>{member.name}</strong><span>{member.presence === 'online' ? 'Online' : 'Offline'} · {member.email}</span></span>
                        <span className={styles.check}><Check size={13} /></span>
                      </button>;
                    })}
                  </div>
                  <div className={styles.newFooter}>
                    {selectedMembers.size > 1 && <input className={styles.input} value={groupTitle} onChange={event => setGroupTitle(event.target.value)} maxLength={120} placeholder="Group name (optional)" aria-label="Group name" />}
                    <button type="button" className={styles.primaryButton} disabled={!selectedMembers.size || sending} onClick={() => void createConversation()}><UsersRound size={15} /> {selectedMembers.size > 1 ? `Create group (${selectedMembers.size + 1})` : 'Start conversation'}</button>
                    <button type="button" className={styles.secondaryButton} onClick={() => setNewConversation(false)}>Cancel</button>
                  </div>
                </div>
              ) : loading ? <div className={styles.state}>Loading conversations…</div> : conversations.length === 0 ? (
                <div className={styles.state}><MessageCircle size={25} /><p>No conversations yet.</p><button type="button" className={styles.primaryButton} onClick={beginNewConversation}>Message a teammate</button></div>
              ) : (
                <div className={styles.conversationList}>
                  {conversations.map(conversation => {
                    const name = conversationName(conversation, user.id);
                    const presence = conversationPresence(conversation, user.id);
                    return <button key={conversation.id} type="button" className={`${styles.conversation} ${conversation.id === selectedId ? styles.conversationActive : ''}`} onClick={() => openConversation(conversation.id)} data-testid={`messenger-conversation-${conversation.id}`}>
                      <span className={styles.avatar}>{conversation.kind === 'group' ? <UsersRound size={17} /> : initials(name)}<span className={`${styles.presence} ${presence === 'online' ? styles.presenceOnline : ''}`} /></span>
                      <span className={styles.conversationBody}><span className={styles.conversationRow}><span className={styles.conversationName}>{name}</span><time className={styles.conversationTime}>{relativeTime(conversation.lastMessageAt)}</time></span><span className={styles.preview}>{conversation.lastMessage?.deleted ? 'Message deleted' : conversation.lastMessage?.body || 'No messages yet'}</span></span>
                      {conversation.unreadCount > 0 && <span className={styles.unread}>{conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}</span>}
                    </button>;
                  })}
                </div>
              )}
            </aside>

            <div className={styles.chat}>
              {selectedConversation ? (
                <>
                  <div className={styles.chatHeader}>
                    <button type="button" className={`${styles.iconButton} ${styles.backButton}`} onClick={() => setSelectedId(null)} aria-label="Back to conversations"><ArrowLeft size={16} /></button>
                    <span className={styles.avatar}>{selectedConversation.kind === 'group' ? <UsersRound size={17} /> : initials(conversationName(selectedConversation, user.id))}</span>
                    {renamingConversation ? (
                      <div className={styles.renameForm}>
                        <input className={styles.input} value={renameDraft} onChange={event => setRenameDraft(event.target.value)} maxLength={120} aria-label="Group conversation name" autoFocus />
                        <button type="button" className={styles.primaryButton} disabled={!renameDraft.trim() || sending} onClick={() => void saveConversationTitle()}>Save</button>
                        <button type="button" className={styles.secondaryButton} onClick={() => setRenamingConversation(false)}>Cancel</button>
                      </div>
                    ) : (
                      <div className={styles.chatIdentity}><strong>{conversationName(selectedConversation, user.id)}</strong><span className={styles.subtle}>{selectedConversation.kind === 'group' ? `${selectedConversation.participants.length} organization members` : `${conversationPresence(selectedConversation, user.id) === 'online' ? 'Online' : 'Offline'} · same organization only`}</span></div>
                    )}
                    <div className={styles.chatActions}>
                      {canRenameSelected && !renamingConversation && <button type="button" className={styles.iconButton} onClick={() => { setRenameDraft(selectedConversation.title || ''); setRenamingConversation(true); }} aria-label="Rename group conversation" title="Rename group"><Edit3 size={15} /></button>}
                      <button type="button" className={styles.iconButton} onClick={() => void toggleMute()} aria-label={selectedConversation.muted ? 'Unmute conversation' : 'Mute conversation'} title={selectedConversation.muted ? 'Unmute' : 'Mute'}>{selectedConversation.muted ? <BellOff size={15} /> : <Bell size={15} />}</button>
                      {confirmDeleteConversation ? <><button type="button" className={styles.dangerButton} onClick={() => void hideConversation()}>Remove</button><button type="button" className={styles.secondaryButton} onClick={() => setConfirmDeleteConversation(false)}>Cancel</button></> : <button type="button" className={styles.iconButton} onClick={() => setConfirmDeleteConversation(true)} aria-label="Remove conversation from my history" title="Remove from my history"><Trash2 size={15} /></button>}
                    </div>
                  </div>
                  <div className={styles.messages} aria-live="polite">
                    {loadingMessages ? <div className={styles.state}>Loading saved messages…</div> : messages.length === 0 ? <div className={styles.state}>No messages yet. Start the conversation below.</div> : <>
                      {hasMoreMessages && <div className={styles.olderMessages}><button type="button" className={styles.secondaryButton} disabled={loadingOlder} onClick={() => void loadOlderMessages()}>{loadingOlder ? 'Loading…' : 'Load earlier messages'}</button></div>}
                      {messages.map(message => (
                      <article key={message.id} className={styles.message} data-testid={`messenger-message-${message.id}`}>
                        <span className={styles.messageAvatar}>{initials(message.senderName)}</span>
                        <div>
                          <div className={styles.messageHeader}><strong>{message.senderName}</strong><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time>{message.editedAt && <span className={styles.edited}>edited</span>}</div>
                          {message.replyTo && <div className={styles.replyQuote}><strong>{message.replyTo.senderName}</strong>: {message.replyTo.deleted ? 'Message deleted' : message.replyTo.body}</div>}
                          {editingId === message.id ? <><textarea className={styles.textarea} value={editDraft} onChange={event => setEditDraft(event.target.value)} maxLength={4000} aria-label="Edit message" /><div className={styles.messageActions} style={{ opacity: 1 }}><button type="button" className={styles.primaryButton} onClick={() => void saveEdit(message)} disabled={!editDraft.trim() || sending}>Save</button><button type="button" className={styles.secondaryButton} onClick={() => setEditingId(null)}>Cancel</button></div></> : <div className={`${styles.messageBubble} ${message.deletedAt ? styles.deleted : ''}`}>{message.deletedAt ? 'Message deleted' : message.body}</div>}
                          {!message.deletedAt && editingId !== message.id && <div className={styles.messageActions}>
                            <button type="button" className={styles.textButton} onClick={() => setReplyTo(message)}><Reply size={11} /> Reply</button>
                            {message.senderUserId === user.id && <button type="button" className={styles.textButton} onClick={() => { setEditingId(message.id); setEditDraft(message.body || ''); }}><Edit3 size={11} /> Edit</button>}
                            {message.senderUserId === user.id && (confirmDeleteMessageId === message.id ? <><button type="button" className={styles.textButton} onClick={() => void deleteMessage(message)}>Confirm delete</button><button type="button" className={styles.textButton} onClick={() => setConfirmDeleteMessageId(null)}>Cancel</button></> : <button type="button" className={styles.textButton} onClick={() => setConfirmDeleteMessageId(message.id)}><Trash2 size={11} /> Delete</button>)}
                          </div>}
                        </div>
                      </article>
                      ))}
                    </>}
                    <div ref={messageEndRef} />
                  </div>
                  <div className={styles.composer}>
                    {replyTo && <div className={styles.replyBar}><span>Replying to <strong>{replyTo.senderName}</strong>: {(replyTo.body || '').slice(0, 80)}</span><button type="button" className={styles.textButton} onClick={() => setReplyTo(null)}>Cancel</button></div>}
                    <textarea className={styles.textarea} value={draft} onChange={event => setDraft(event.target.value)} maxLength={4000} placeholder={`Message ${conversationName(selectedConversation, user.id)}`} aria-label="Message" onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} />
                    <div className={styles.composerActions}><span className={styles.characterCount}>{draft.length}/4000 · Enter to send, Shift+Enter for a new line</span><button type="button" className={styles.primaryButton} disabled={!draft.trim() || sending} onClick={() => void sendMessage()}><Send size={14} /> {sending ? 'Sending…' : 'Send'}</button></div>
                  </div>
                </>
              ) : (
                <div className={styles.state} style={{ margin: 'auto', maxWidth: 380 }}><MoreHorizontal size={28} /><h2 style={{ color: '#eef5ff', fontSize: 17 }}>Organization messenger</h2><p>Select a saved conversation or start an organization-only direct or group message.</p></div>
              )}
            </div>
              </section>
            </>
          )}
          <div aria-live="assertive" aria-atomic="true">{toast && <div className={styles.toast} data-operatoros-priority-layer="messenger-toast">{toast}</div>}</div>
        </>,
        document.body,
      )}
    </div>
  );
}
