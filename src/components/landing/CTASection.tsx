import { ArrowRight, Film } from 'lucide-react';
import { useUIStore } from '../../store/ui-store';

export default function CTASection() {
  const setAppView = useUIStore((s) => s.setAppView);

  return (
    <section className="relative py-32 px-6">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="relative z-10 max-w-3xl mx-auto text-center">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-cyan-500/6 rounded-full blur-[120px] pointer-events-none" />

        <h2 className="relative text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight mb-5">
          Stop clicking.
          <br />
          Start talking.
        </h2>
        <p className="relative text-lg text-white/35 max-w-lg mx-auto mb-10">
          Drop your video in, tell Omu what you want, and watch it happen. No account needed.
        </p>

        <button
          onClick={() => setAppView('editor')}
          className="relative group inline-flex items-center gap-3 px-10 py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 text-white font-medium text-lg shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 hover:scale-[1.02] transition-all duration-200"
        >
          Launch Omu
          <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>

      <footer className="relative z-10 mt-32 max-w-6xl mx-auto border-t border-white/5 pt-10 pb-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-cyan-500 to-teal-400 flex items-center justify-center">
              <Film className="w-3 h-3 text-white" />
            </div>
            <span className="text-sm font-bold text-white/60">Omu</span>
          </div>

          <div className="flex items-center gap-6 text-xs text-white/25">
            <span>Voice-powered editing</span>
            <span className="w-1 h-1 rounded-full bg-white/15" />
            <span>Browser-based</span>
            <span className="w-1 h-1 rounded-full bg-white/15" />
            <span>No downloads</span>
          </div>
        </div>
      </footer>
    </section>
  );
}
