import { SignIn, SignUp } from '@clerk/react';
import { useState } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { ArrowLeft } from 'lucide-react';
import logoUrl from '@assets/faultlinelogotrans_1776394938786.png';
import heroUrl from '@assets/faultlinelabhero_1776394938788.jpg';
import ShotgunNinjasSSOButton from './auth/ShotgunNinjasSSOButton';

export default function AuthScreen() {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const setView = useAppStore(s => s.setView);

  return (
    <div
      className="min-h-screen bg-[#0a0e14] flex flex-col items-center justify-center p-4 relative overflow-hidden"
      style={{
        backgroundImage: `linear-gradient(rgba(10,14,20,0.88), rgba(10,14,20,0.96)), url(${heroUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <button
        onClick={() => setView('incident-board')}
        className="absolute top-4 left-4 flex items-center gap-2 text-zinc-400 hover:text-cyan-400 transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
        <span className="text-sm font-mono">Back</span>
      </button>

      <div className="mb-8 text-center flex flex-col items-center">
        <img
          src={logoUrl}
          alt="Faultline Lab"
          className="h-32 sm:h-40 w-auto mb-2 drop-shadow-[0_0_24px_rgba(34,211,238,0.25)] select-none"
          draggable={false}
        />
        <p className="text-zinc-400 text-sm mt-1">
          {mode === 'sign-in' ? 'Sign in to sync your progress' : 'Create your investigator account'}
        </p>
      </div>

      <div className="w-full max-w-md">
        {mode === 'sign-in' ? (
          <SignIn
            signUpUrl="#sign-up"
            appearance={{
              elements: {
                rootBox: 'w-full',
                cardBox: 'shadow-none bg-transparent',
                card: 'bg-zinc-900/80 border border-zinc-800 shadow-xl',
                headerTitle: 'text-zinc-100',
                headerSubtitle: 'text-zinc-400',
                formFieldLabel: 'text-zinc-300',
                formFieldInput: 'bg-zinc-800 border-zinc-700 text-zinc-100',
                formButtonPrimary: 'bg-cyan-600 hover:bg-cyan-500',
                footerActionLink: 'text-cyan-400 hover:text-cyan-300',
                identityPreviewEditButton: 'text-cyan-400',
                socialButtonsBlockButton: 'bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700',
              },
            }}
          />
        ) : (
          <SignUp
            signInUrl="#sign-in"
            appearance={{
              elements: {
                rootBox: 'w-full',
                cardBox: 'shadow-none bg-transparent',
                card: 'bg-zinc-900/80 border border-zinc-800 shadow-xl',
                headerTitle: 'text-zinc-100',
                headerSubtitle: 'text-zinc-400',
                formFieldLabel: 'text-zinc-300',
                formFieldInput: 'bg-zinc-800 border-zinc-700 text-zinc-100',
                formButtonPrimary: 'bg-cyan-600 hover:bg-cyan-500',
                footerActionLink: 'text-cyan-400 hover:text-cyan-300',
                socialButtonsBlockButton: 'bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700',
              },
            }}
          />
        )}
        <ShotgunNinjasSSOButton productSlug="faultline-lab" />
      </div>

      <button
        onClick={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}
        className="mt-6 text-sm text-zinc-500 hover:text-cyan-400 transition-colors font-mono"
      >
        {mode === 'sign-in' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
      </button>
    </div>
  );
}
