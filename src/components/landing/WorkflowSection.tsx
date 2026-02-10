import { Upload, Mic, Sparkles, Download } from 'lucide-react';

const steps = [
  {
    num: '01',
    icon: Upload,
    title: 'Drop your video',
    description: 'Drag any video file into Omu. MP4, MOV, WebM -- it all works. No uploads, everything stays in your browser.',
    color: 'text-cyan-400',
    glow: 'bg-cyan-500/20',
    accent: 'border-cyan-500/30',
  },
  {
    num: '02',
    icon: Mic,
    title: 'Talk to it',
    description: '"Add captions." "Remove silences." "Find some B-roll for the intro." Speak naturally, Omu does the rest.',
    color: 'text-teal-400',
    glow: 'bg-teal-500/20',
    accent: 'border-teal-500/30',
  },
  {
    num: '03',
    icon: Sparkles,
    title: 'Watch it happen',
    description: 'See your edits applied in real time. Captions appear, dead air vanishes, B-roll drops in -- all while you watch.',
    color: 'text-emerald-400',
    glow: 'bg-emerald-500/20',
    accent: 'border-emerald-500/30',
  },
  {
    num: '04',
    icon: Download,
    title: 'Export & share',
    description: 'Render locally or in the cloud. Professional quality video, ready for any platform in minutes.',
    color: 'text-sky-400',
    glow: 'bg-sky-500/20',
    accent: 'border-sky-500/30',
  },
];

export default function WorkflowSection() {
  return (
    <section id="workflow" className="relative py-32 px-6">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="relative z-10 max-w-5xl mx-auto">
        <div className="text-center mb-20">
          <span className="text-xs font-medium tracking-widest uppercase text-teal-400 mb-4 block">
            How It Works
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight mb-5">
            Speak. Edit. Ship.
          </h2>
          <p className="text-lg text-white/35 max-w-xl mx-auto">
            From raw footage to polished video in the time it takes to describe what you want.
          </p>
        </div>

        <div className="relative">
          <div className="hidden lg:block absolute top-12 left-[12.5%] right-[12.5%] h-px bg-gradient-to-r from-cyan-500/20 via-teal-500/20 to-sky-500/20" />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((step) => (
              <div key={step.num} className="relative group">
                <div className="relative text-center">
                  <div className="relative mx-auto w-20 h-20 mb-6">
                    <div
                      className={`absolute inset-0 ${step.glow} rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
                    />
                    <div className={`relative w-full h-full rounded-2xl border ${step.accent} bg-white/[0.03] flex items-center justify-center group-hover:bg-white/[0.06] transition-all duration-300`}>
                      <step.icon className={`w-8 h-8 ${step.color}`} />
                    </div>
                  </div>

                  <span className={`text-xs font-mono font-medium ${step.color} mb-2 block`}>
                    {step.num}
                  </span>
                  <h3 className="text-lg font-semibold text-white mb-2">
                    {step.title}
                  </h3>
                  <p className="text-sm text-white/35 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
