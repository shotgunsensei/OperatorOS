import { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { toast } from 'sonner';
import { fetchEmailPreferences, updateEmailPreferences } from '@/lib/api';

export function EmailPreferencesCard() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchEmailPreferences()
      .then((res) => {
        if (cancelled) return;
        setEnabled(res.renewalEmailsEnabled);
      })
      .catch(() => {
        // Non-fatal — leave toggle hidden if we can't read prefs.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || enabled === null) return null;

  const handleToggle = async () => {
    const next = !enabled;
    setSaving(true);
    // Optimistic flip so the switch feels instant.
    setEnabled(next);
    try {
      const res = await updateEmailPreferences({ renewalEmailsEnabled: next });
      setEnabled(res.renewalEmailsEnabled);
      toast.success(
        res.renewalEmailsEnabled
          ? 'Renewal emails turned on'
          : 'Renewal emails turned off',
      );
    } catch {
      setEnabled(!next);
      toast.error("Couldn't update email preferences. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-zinc-800/50 bg-[#111822] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Mail size={16} className="text-zinc-400 mt-0.5" />
          <div>
            <p className="text-sm text-zinc-200">Email me about upcoming charges</p>
            <p className="text-xs text-zinc-500 mt-1 max-w-sm">
              We'll send a heads-up a few days before each renewal or when your
              access is about to lapse. Every email includes a one-click
              unsubscribe link.
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Toggle renewal emails"
          onClick={handleToggle}
          disabled={saving}
          className={`shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            enabled ? 'bg-cyan-500' : 'bg-zinc-700'
          } ${saving ? 'opacity-60 cursor-wait' : 'cursor-pointer'}`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              enabled ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>
    </section>
  );
}
