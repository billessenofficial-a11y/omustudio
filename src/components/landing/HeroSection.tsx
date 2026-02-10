import { useState, useEffect } from 'react';
import { ArrowRight, Mic, Captions, Scissors, ImagePlus, Music, Sparkles } from 'lucide-react';
import { useUIStore } from '../../store/ui-store';

const demoSteps = [
  {
    icon: Mic,
    label: '"Remove all the silences"',
    action: 'Detecting silence...',
    result: 'Removed 12 silent gaps -- 47s trimmed',
    color: 'text-rose-400',
    bg: 'bg-rose-500/10',
    barColor: 'bg-rose-500',
  },
  {
    icon: Captions,
    label: '"Add captions to everything"',
    action: 'Transcribing audio...',
    result: 'Added 94 word-level captions with animations',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    barColor: 'bg-amber-500',
  },
  {
    icon: ImagePlus,
    label: '"Add b-roll where it makes sense"',
    action: 'Analyzing transcript context...',
    result: 'Inserted 6 contextual B-roll clips',
    color: 'text-teal-400',
    bg: 'bg-teal-500/10',
    barColor: 'bg-teal-500',
  },
  {
    icon: Music,
    label: '"Add background music"',
    action: 'Matching mood & tempo...',
    result: 'Added lo-fi track, auto-ducked under speech',
    color: 'text-sky-400',
    bg: 'bg-sky-500/10',
    barColor: 'bg-sky-500',
  },
];

export default function HeroSection() {
  const setAppView = useUIStore((s) => s.setAppView);
  const [activeStep, setActiveStep] = useState(0);
  const [phase, setPhase] = useState<'typing' | 'processing' | 'done'>('typing');

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    const runCycle = () => {
      setPhase('typing');
      timers.push(setTimeout(() => setPhase('processing'), 1800));
      timers.push(setTimeout(() => setPhase('done'), 3200));
      timers.push(
        setTimeout(() => {
          setActiveStep((prev) => (prev + 1) % demoSteps.length);
          setPhase('typing');
        }, 5500)
      );
    };

    runCycle();
    const interval = setInterval(runCycle, 5500);

    return () => {
      clearInterval(interval);
      timers.forEach(clearTimeout);
    };
  }, [activeStep]);

  const step = demoSteps[activeStep];
  const StepIcon = step.icon;

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-cyan-500/8 rounded-full blur-[120px] animate-landing-float" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-teal-500/6 rounded-full blur-[100px] animate-landing-float-delayed" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-sky-500/4 rounded-full blur-[150px]" />
      </div>

      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
          backgroundSize: '48px 48px',
        }}
      />

      <div className="relative z-10 max-w-6xl mx-auto px-6 text-center pt-24">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 bg-white/[0.03] backdrop-blur-sm mb-8 animate-landing-fade-up">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-xs font-medium text-white/60">The future of video editing</span>
        </div>

        <h1 className="text-5xl sm:text-6xl lg:text-[5.5rem] font-bold tracking-tight text-white leading-[1.05] mb-6 animate-landing-fade-up animation-delay-100">
          Edit your videos
          <br />
          <span className="bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400 bg-clip-text text-transparent">
            Hands-free
          </span>
        </h1>

        <p className="text-lg sm:text-xl text-white/40 max-w-2xl mx-auto mb-14 leading-relaxed animate-landing-fade-up animation-delay-200">
          Forget clicking through endless menus. Just speak your edits and watch them happen. Remove silences, add captions, insert B-roll -- what used to take hours now takes seconds.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20 animate-landing-fade-up animation-delay-300">
          <button
            onClick={() => setAppView('role-gate')}
            className="group relative flex items-center gap-3 px-8 py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 text-white font-medium text-base shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 hover:scale-[1.02] transition-all duration-200"
          >
            Start Editing Free
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>

          <a
            href="#demo"
            className="flex items-center gap-2.5 px-6 py-3.5 rounded-xl border border-white/10 text-white/70 font-medium text-base hover:bg-white/5 hover:text-white hover:border-white/20 transition-all duration-200"
          >
            <Mic className="w-4 h-4" />
            Watch the Demo
          </a>
        </div>

        <div id="demo" className="animate-landing-fade-up animation-delay-400">
          <div className="relative mx-auto max-w-4xl">
            <div className="absolute -inset-1 bg-gradient-to-b from-cyan-500/20 via-transparent to-transparent rounded-2xl blur-xl" />

            <div className="relative rounded-2xl border border-white/10 bg-[#111111] overflow-hidden shadow-2xl shadow-black/40">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-[#0D0D0D]">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                  <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                  <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                </div>
                <div className="flex-1 flex justify-center">
                  <div className="px-3 py-0.5 rounded bg-white/5 text-[10px] text-white/30 font-mono">
                    Omu Editor
                  </div>
                </div>
              </div>

              <div className="aspect-[16/9] relative bg-[#0A0A0A]">
                <div className="absolute inset-0 flex">
                  <div className="hidden sm:block w-48 border-r border-white/5 p-3 space-y-2">
                    <div className="h-3 w-16 bg-white/10 rounded" />
                    <div className="space-y-1.5">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.03]">
                          <div className="w-8 h-6 rounded bg-white/5" />
                          <div className="flex-1 space-y-1">
                            <div className="h-2 w-12 bg-white/8 rounded" />
                            <div className="h-1.5 w-8 bg-white/5 rounded" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col">
                    <div className="flex-1 flex items-center justify-center relative p-4 sm:p-8">
                      <div className="w-full max-w-md mx-auto">
                        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-6 backdrop-blur-sm">
                          <div className="flex items-center gap-3 mb-4">
                            <div className={`w-8 h-8 rounded-lg ${step.bg} flex items-center justify-center transition-all duration-300`}>
                              <StepIcon className={`w-4 h-4 ${step.color} transition-colors duration-300`} />
                            </div>
                            <div className="flex-1">
                              <div className="text-[11px] text-white/30 mb-0.5">Voice Command</div>
                              <div className="text-sm text-white/80 font-medium truncate">
                                {phase === 'typing' ? (
                                  <span className="inline-flex items-center gap-1">
                                    {step.label}
                                    <span className="w-0.5 h-4 bg-white/60 animate-pulse" />
                                  </span>
                                ) : (
                                  step.label
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="h-px bg-white/5 mb-4" />

                          <div className="min-h-[48px] flex items-center">
                            {phase === 'processing' && (
                              <div className="flex items-center gap-3 animate-landing-fade-up">
                                <div className="flex gap-1">
                                  <div className="w-1.5 h-1.5 rounded-full bg-white/40" style={{ animation: 'chat-dot 1.4s ease-in-out infinite' }} />
                                  <div className="w-1.5 h-1.5 rounded-full bg-white/40" style={{ animation: 'chat-dot 1.4s ease-in-out 0.2s infinite' }} />
                                  <div className="w-1.5 h-1.5 rounded-full bg-white/40" style={{ animation: 'chat-dot 1.4s ease-in-out 0.4s infinite' }} />
                                </div>
                                <span className="text-xs text-white/40">{step.action}</span>
                              </div>
                            )}
                            {phase === 'done' && (
                              <div className="w-full animate-landing-fade-up">
                                <div className="flex items-center gap-2 mb-2">
                                  <div className={`w-1.5 h-1.5 rounded-full ${step.barColor}`} />
                                  <span className="text-xs text-white/60">{step.result}</span>
                                </div>
                                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${step.barColor} transition-all duration-700`}
                                    style={{ width: '100%' }}
                                  />
                                </div>
                              </div>
                            )}
                            {phase === 'typing' && (
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
                                <span className="text-xs text-white/30">Listening...</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="h-20 sm:h-24 border-t border-white/5 p-2">
                      <div className="flex gap-0.5 h-full">
                        <div className="h-full flex-[3] rounded bg-cyan-500/15 border border-cyan-500/20 relative overflow-hidden">
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="flex gap-px h-2/3 items-end">
                              {Array.from({ length: 40 }).map((_, i) => (
                                <div
                                  key={i}
                                  className="w-[2px] bg-cyan-400/40 rounded-full"
                                  style={{ height: `${20 + Math.sin(i * 0.5) * 40 + Math.random() * 40}%` }}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="h-full flex-[2] rounded bg-teal-500/15 border border-teal-500/20" />
                        <div className="h-full flex-[4] rounded bg-cyan-500/15 border border-cyan-500/20 relative overflow-hidden">
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="flex gap-px h-2/3 items-end">
                              {Array.from({ length: 60 }).map((_, i) => (
                                <div
                                  key={i}
                                  className="w-[2px] bg-cyan-400/40 rounded-full"
                                  style={{ height: `${15 + Math.cos(i * 0.3) * 35 + Math.random() * 50}%` }}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="h-full flex-[1] rounded bg-emerald-500/15 border border-emerald-500/20" />
                      </div>
                    </div>
                  </div>

                  <div className="hidden sm:block w-44 border-l border-white/5 p-3 space-y-3">
                    <div className="h-3 w-14 bg-white/10 rounded" />
                    <div className="space-y-2">
                      {demoSteps.map((s, i) => (
                        <div
                          key={i}
                          className={`flex items-center gap-2 p-1.5 rounded-lg transition-all duration-300 cursor-pointer ${
                            i === activeStep ? `${s.bg} border border-white/10` : 'opacity-40'
                          }`}
                          onClick={() => {
                            setActiveStep(i);
                            setPhase('typing');
                          }}
                        >
                          <s.icon className={`w-3 h-3 ${s.color}`} />
                          <span className="text-[10px] text-white/60 truncate">
                            {['Silences', 'Captions', 'B-Roll', 'Music'][i]}
                          </span>
                          {i === activeStep && i <= activeStep && (
                            <div className={`ml-auto w-1.5 h-1.5 rounded-full ${s.barColor}`} />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 mt-6">
              {demoSteps.map((s, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setActiveStep(i);
                    setPhase('typing');
                  }}
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    i === activeStep ? `${s.barColor} scale-125` : 'bg-white/15 hover:bg-white/30'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
