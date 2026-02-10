import { useState } from 'react';
import { Film, ArrowLeft, Trophy, Clock, ArrowRight } from 'lucide-react';
import { useUIStore } from '../../store/ui-store';
import WaitlistForm from './WaitlistForm';

export default function RoleGatePage() {
  const setAppView = useUIStore((s) => s.setAppView);
  const [selected, setSelected] = useState<'reviewer' | 'beta' | null>(null);

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
          onClick={() => setAppView('landing')}
          className="flex items-center gap-2 text-sm text-white/40 hover:text-white/70 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      </header>

      <div className="relative z-10 flex-1 flex items-center justify-center px-6 pb-16">
        <div className="w-full max-w-[720px]">
          <div className="flex items-center justify-center gap-2.5 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-400 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Film className="w-5 h-5 text-white" />
            </div>
            <span className="text-2xl font-bold tracking-tight">Omu</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-center mb-2">
            How would you like to get started?
          </h1>
          <p className="text-sm text-white/40 text-center mb-10 max-w-md mx-auto">
            Choose your path to access the Omu editor.
          </p>

          {selected === 'beta' ? (
            <BetaWaitlistView onBack={() => setSelected(null)} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <RoleCard
                icon={<Trophy className="w-6 h-6 text-amber-400" />}
                iconBg="bg-amber-500/10"
                title="Hackathon Reviewer"
                description="Full access to the editor. Enter your access password to start editing videos."
                buttonLabel="Continue"
                onClick={() => setAppView('auth')}
              />
              <RoleCard
                icon={<Clock className="w-6 h-6 text-cyan-400" />}
                iconBg="bg-cyan-500/10"
                title="Beta User"
                description="Join the waitlist for early access. We'll notify you when it's your turn."
                buttonLabel="Join Waitlist"
                onClick={() => setSelected('beta')}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RoleCard({
  icon,
  iconBg,
  title,
  description,
  buttonLabel,
  onClick,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
  buttonLabel: string;
  onClick: () => void;
}) {
  return (
    <div className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-md p-6 shadow-2xl shadow-black/20 hover:border-white/[0.12] hover:bg-white/[0.04] transition-all duration-300 flex flex-col">
      <div className={`w-12 h-12 rounded-xl ${iconBg} flex items-center justify-center mb-5`}>
        {icon}
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-white/40 leading-relaxed mb-6 flex-1">{description}</p>
      <button
        onClick={onClick}
        className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 text-white font-medium text-sm shadow-lg shadow-cyan-500/15 hover:shadow-cyan-500/25 hover:brightness-110 transition-all duration-200"
      >
        {buttonLabel}
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function BetaWaitlistView({ onBack }: { onBack: () => void }) {
  return (
    <div className="max-w-[420px] mx-auto">
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-md p-8 shadow-2xl shadow-black/20">
        <div className="mb-8">
          <h2 className="text-2xl font-bold tracking-tight mb-2">Join the waitlist</h2>
          <p className="text-sm text-white/40 leading-relaxed">
            Enter your email and we'll let you know when early access opens up.
          </p>
        </div>
        <WaitlistForm />
      </div>
      <p className="text-center mt-6 text-sm text-white/30">
        Have a reviewer account?{' '}
        <button
          onClick={onBack}
          className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
        >
          Go back
        </button>
      </p>
    </div>
  );
}
