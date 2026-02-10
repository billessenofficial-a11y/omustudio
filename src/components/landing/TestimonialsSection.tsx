import { Star } from 'lucide-react';

const testimonials = [
  {
    name: 'Sarah Chen',
    role: 'YouTube Creator, 1.2M subs',
    avatar: 'SC',
    text: 'I literally just said "add captions and remove the dead air" and Omu did it in seconds. What used to take me 2 hours now takes 5 minutes.',
    rating: 5,
  },
  {
    name: 'Marcus Rivera',
    role: 'Content Agency Lead',
    avatar: 'MR',
    text: 'We produce 30+ videos a month. The voice-driven workflow changed everything. Our editors talk to Omu like an assistant and it just works.',
    rating: 5,
  },
  {
    name: 'Aisha Patel',
    role: 'Freelance Video Editor',
    avatar: 'AP',
    text: 'The B-roll suggestions are shockingly good. I said "add visuals for the travel section" and it pulled in exactly what I would have picked manually.',
    rating: 5,
  },
];

export default function TestimonialsSection() {
  return (
    <section id="testimonials" className="relative py-32 px-6">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="relative z-10 max-w-6xl mx-auto">
        <div className="text-center mb-20">
          <span className="text-xs font-medium tracking-widest uppercase text-emerald-400 mb-4 block">
            Testimonials
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight mb-5">
            Creators love Omu
          </h2>
          <p className="text-lg text-white/35 max-w-xl mx-auto">
            From solo YouTubers to production teams, Omu is replacing hours of manual editing.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <div
              key={t.name}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-7 hover:bg-white/[0.04] hover:border-white/10 transition-all duration-300"
            >
              <div className="flex gap-0.5 mb-5">
                {Array.from({ length: t.rating }).map((_, i) => (
                  <Star
                    key={i}
                    className="w-4 h-4 fill-amber-400 text-amber-400"
                  />
                ))}
              </div>

              <p className="text-sm text-white/50 leading-relaxed mb-6">
                "{t.text}"
              </p>

              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center text-xs font-medium text-white/60">
                  {t.avatar}
                </div>
                <div>
                  <div className="text-sm font-medium text-white/80">
                    {t.name}
                  </div>
                  <div className="text-xs text-white/30">{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
