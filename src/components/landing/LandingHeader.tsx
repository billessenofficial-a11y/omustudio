import { useState, useEffect } from 'react';
import { Film, ArrowRight } from 'lucide-react';
import { useUIStore } from '../../store/ui-store';

export default function LandingHeader() {
  const setAppView = useUIStore((s) => s.setAppView);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-[#0A0A0A]/90 backdrop-blur-xl border-b border-white/5'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-400 flex items-center justify-center">
            <Film className="w-4.5 h-4.5 text-white" />
          </div>
          <span className="text-lg font-bold tracking-tight text-white">
            Omu
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-8">
          <a href="#demo" className="text-sm text-white/50 hover:text-white transition-colors">
            Demo
          </a>
          <a href="#features" className="text-sm text-white/50 hover:text-white transition-colors">
            Features
          </a>
          <a href="#workflow" className="text-sm text-white/50 hover:text-white transition-colors">
            How It Works
          </a>
        </nav>

        <button
          onClick={() => setAppView('editor')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-[#0A0A0A] text-sm font-medium hover:bg-white/90 transition-all"
        >
          Open Editor
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
}
