import LandingHeader from './LandingHeader';
import HeroSection from './HeroSection';
import FeaturesSection from './FeaturesSection';
import WorkflowSection from './WorkflowSection';
import TestimonialsSection from './TestimonialsSection';
import CTASection from './CTASection';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white overflow-y-auto overflow-x-hidden landing-scroll">
      <LandingHeader />
      <HeroSection />
      <FeaturesSection />
      <WorkflowSection />
      <TestimonialsSection />
      <CTASection />
    </div>
  );
}
