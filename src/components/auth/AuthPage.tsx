import { useState } from 'react';
import { Film, ArrowLeft } from 'lucide-react';
import { useUIStore } from '../../store/ui-store';
import AuthForm from './AuthForm';

export default function AuthPage() {
  const setAppView = useUIStore((s) => s.setAppView);
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/4 -left-1/4 w-[700px] h-[700px] bg-cyan-500/[0.06] rounded-full blur-[150px] animate-landing-float" />
        <div className="absolute -bottom-1/4 -right-1/4 w-[600px] h-[600px] bg-teal-500/[0.04] rounded-full blur-[120px] animate-landing-float-delayed" />
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '48px 48px',
          }}
        />
      </div>

      <header className="relative z-10 px-6 h-16 flex items-center">
        <button
          onClick={() => setAppView('role-gate')}
          className="flex items-center gap-2 text-sm text-white/40 hover:text-white/70 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      </header>

      <div className="relative z-10 flex-1 flex items-center justify-center px-6 pb-16">
        <div className="w-full max-w-[420px]">
          <div className="flex items-center justify-center gap-2.5 mb-10">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-400 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Film className="w-5 h-5 text-white" />
            </div>
            <span className="text-2xl font-bold tracking-tight">Omu</span>
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-md p-8 shadow-2xl shadow-black/20">
            {mode === 'reset' ? (
              <ResetHeader />
            ) : (
              <AuthHeader mode={mode} />
            )}

            <AuthForm mode={mode} setMode={setMode} />
          </div>

          <AuthFooter mode={mode} setMode={setMode} />
        </div>
      </div>
    </div>
  );
}

function AuthHeader({ mode }: { mode: 'login' | 'signup' }) {
  return (
    <div className="mb-8">
      <h1 className="text-2xl font-bold tracking-tight mb-2">
        {mode === 'login' ? 'Welcome back' : 'Create your account'}
      </h1>
      <p className="text-sm text-white/40 leading-relaxed">
        {mode === 'login'
          ? 'Sign in to continue editing your videos.'
          : 'Start editing videos with the power of AI.'}
      </p>
    </div>
  );
}

function ResetHeader() {
  return (
    <div className="mb-8">
      <h1 className="text-2xl font-bold tracking-tight mb-2">Reset password</h1>
      <p className="text-sm text-white/40 leading-relaxed">
        Enter your email and we'll send you a reset link.
      </p>
    </div>
  );
}

function AuthFooter({
  mode,
  setMode,
}: {
  mode: 'login' | 'signup' | 'reset';
  setMode: (m: 'login' | 'signup' | 'reset') => void;
}) {
  if (mode === 'reset') {
    return (
      <p className="text-center mt-6 text-sm text-white/30">
        Remember your password?{' '}
        <button
          onClick={() => setMode('login')}
          className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
        >
          Sign in
        </button>
      </p>
    );
  }

  return (
    <p className="text-center mt-6 text-sm text-white/30">
      {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
      <button
        onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
        className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
      >
        {mode === 'login' ? 'Sign up' : 'Sign in'}
      </button>
    </p>
  );
}
