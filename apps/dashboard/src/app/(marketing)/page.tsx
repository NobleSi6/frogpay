import { Header } from "@/features/landing/components/Header"
import { HeroSection } from "@/features/landing/components/HeroSection"
import { AboutSection } from "@/features/landing/components/AboutSection"
import { ServicesSection } from "@/features/landing/components/ServicesSection"
import { TestimonialsSection } from "@/features/landing/components/TestimonialsSection"
import { Footer } from "@/features/landing/components/Footer"

export default function MarketingPage() {
  return (
    <div className="min-h-screen scroll-smooth bg-background text-foreground antialiased">
      <Header />

      <main>
        <HeroSection />
        <AboutSection />
        <ServicesSection />
        <TestimonialsSection />
      </main>

      <Footer />
    </div>
  )
}
