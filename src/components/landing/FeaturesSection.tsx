import {
  Mic,
  Captions,
  Scissors,
  ImagePlus,
  Music,
  FileText,
} from 'lucide-react';

const features = [
  {
    icon: Mic,
    title: 'Voice-First Editing',
    description:
      'Speak naturally and watch your video transform. "Remove the intro", "speed up this section", "make it shorter" -- Omu understands intent, not just commands.',
    color: 'from-cyan-400 to-teal-500',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/20',
  },
  {
    icon: Captions,
    title: 'Auto Captions',
    description:
      'Word-level captions generated instantly with AI transcription. Fully styled, animated, and timed to perfection. One voice command away.',
    color: 'from-amber-400 to-orange-500',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
  },
  {
    icon: Scissors,
    title: 'Silence Removal',
    description:
      'Detect and eliminate dead air automatically. Tighten your pacing with a single command -- no manual cutting required.',
    color: 'from-rose-400 to-pink-500',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/20',
  },
  {
    icon: ImagePlus,
    title: 'AI B-Roll',
    description:
      'Omu reads your transcript, understands the context, and suggests relevant B-roll footage. Drop it right onto the timeline.',
    color: 'from-teal-400 to-emerald-500',
    bg: 'bg-teal-500/10',
    border: 'border-teal-500/20',
  },
  {
    icon: Music,
    title: 'Background Music',
    description:
      'Add music that matches the mood of your content. Auto-ducking keeps your voice clear while the beat plays underneath.',
    color: 'from-sky-400 to-blue-500',
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/20',
  },
  {
    icon: FileText,
    title: 'Transcript Editing',
    description:
      'Edit your video by editing text. Delete a sentence from the transcript and it vanishes from the timeline. The fastest way to cut.',
    color: 'from-emerald-400 to-green-500',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
  },
];

export default function FeaturesSection() {
  return (
    <section id="features" className="relative py-32 px-6">
      <div className="absolute inset-0">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto">
        <div className="text-center mb-20">
          <span className="text-xs font-medium tracking-widest uppercase text-cyan-400 mb-4 block">
            Capabilities
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight mb-5">
            Say it. Done.
          </h2>
          <p className="text-lg text-white/35 max-w-xl mx-auto">
            Every feature is a voice command away. No menus, no hunting for buttons -- just tell Omu what you need.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((feature) => (
            <div
              key={feature.title}
              className={`group relative rounded-2xl border ${feature.border} ${feature.bg} p-7 hover:scale-[1.02] transition-all duration-300`}
            >
              <div
                className={`w-10 h-10 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-5 shadow-lg group-hover:scale-110 transition-transform duration-300`}
              >
                <feature.icon className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                {feature.title}
              </h3>
              <p className="text-sm text-white/40 leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
