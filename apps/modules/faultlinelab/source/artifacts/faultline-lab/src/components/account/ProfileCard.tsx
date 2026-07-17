import { Mail, User as UserIcon } from 'lucide-react';

interface ProfileCardProps {
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
}

export function ProfileCard({ displayName, email, avatarUrl }: ProfileCardProps) {
  return (
    <section className="rounded-xl border border-zinc-800/50 bg-[#111822] p-4 sm:p-5">
      <h2 className="text-xs font-mono text-zinc-500 uppercase tracking-wider mb-4">
        Profile
      </h2>
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0 overflow-hidden">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <UserIcon size={26} className="text-cyan-400" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-base font-semibold text-zinc-100 truncate">{displayName}</p>
          {email ? (
            <p className="text-xs text-zinc-500 flex items-center gap-1.5 mt-0.5">
              <Mail size={11} /> <span className="truncate">{email}</span>
            </p>
          ) : (
            <p className="text-xs text-zinc-600 mt-0.5">No email on file</p>
          )}
        </div>
      </div>
    </section>
  );
}
