import { useAppStore } from '@/stores/useAppStore';
import { ShieldAlert, ExternalLink } from 'lucide-react';

const OPERATOROS_RETURN_URL =
  import.meta.env.VITE_OPERATOROS_BASE_URL ||
  'https://operatoros.app';

interface Props {
  reason?: string | null;
}

const REASON_COPY: Record<string, { title: string; body: string }> = {
  module_disabled: {
    title: 'Faultline Lab is disabled for your workspace',
    body:
      'An administrator on your OperatorOS tenant has turned off access to this module. Re-enable it from the OperatorOS dashboard to continue.',
  },
  access_revoked: {
    title: 'Your access has been revoked',
    body:
      'Your seat or plan no longer grants access to Faultline Lab. Update your subscription or roles in OperatorOS to restore access.',
  },
  access_denied: {
    title: 'Access denied',
    body:
      'Your OperatorOS account does not currently have access to Faultline Lab.',
  },
};

export default function AccessDeniedScreen({ reason }: Props) {
  const copy = REASON_COPY[reason ?? 'access_denied'] ?? REASON_COPY.access_denied;
  const operator = useAppStore((s) => s.operatorIdentity);
  return (
    <div className="min-h-screen bg-[#0a0e14] text-cyan-100 font-mono flex items-center justify-center p-6">
      <div className="max-w-xl w-full border border-cyan-400/30 bg-cyan-400/5 rounded-md p-8 space-y-6">
        <div className="flex items-center gap-3 text-cyan-400">
          <ShieldAlert className="w-7 h-7" aria-hidden />
          <span className="text-xs uppercase tracking-[0.2em] text-cyan-400/70">
            Managed by OperatorOS
          </span>
        </div>
        <h1 className="text-2xl text-cyan-200">{copy.title}</h1>
        <p className="text-sm text-cyan-100/80 leading-relaxed">{copy.body}</p>
        {operator?.planSlug ? (
          <dl className="text-xs grid grid-cols-2 gap-y-1 text-cyan-100/60 border-t border-cyan-400/10 pt-4">
            <dt>Plan</dt>
            <dd className="text-cyan-200/80">{operator.planSlug}</dd>
            {operator.tenantId ? (
              <>
                <dt>Tenant</dt>
                <dd className="text-cyan-200/80 truncate" title={operator.tenantId}>
                  {operator.tenantId}
                </dd>
              </>
            ) : null}
            {operator.moduleRole ? (
              <>
                <dt>Module role</dt>
                <dd className="text-cyan-200/80">{operator.moduleRole}</dd>
              </>
            ) : null}
          </dl>
        ) : null}
        <a
          href={OPERATOROS_RETURN_URL}
          className="inline-flex items-center gap-2 px-4 py-2 border border-emerald-400/40 text-emerald-300 hover:bg-emerald-400/10 rounded transition-colors text-sm uppercase tracking-wider"
        >
          Return to OperatorOS
          <ExternalLink className="w-4 h-4" aria-hidden />
        </a>
      </div>
    </div>
  );
}
