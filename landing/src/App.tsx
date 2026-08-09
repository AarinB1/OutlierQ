import { useRef } from "react";
import Nav from "./components/Nav";
import SectionNav from "./components/SectionNav";
import Hero from "./components/Hero";
import CategoryStrip from "./components/CategoryStrip";
import DetectionSection from "./components/DetectionSection";
import SignalsSection from "./components/SignalsSection";
import ArbitrageSection from "./components/ArbitrageSection";
import TrackingSection from "./components/TrackingSection";
import HowItWorks from "./components/HowItWorks";
import FAQ from "./components/FAQ";
import DemoBand from "./components/DemoBand";
import Footer from "./components/Footer";
import { useScrolledPast } from "./lib/useActiveSection";

/** Why the hero product frame is a static HTML/CSS mockup rather than a deferred
 *  <iframe> of the demo (both were on the table; see the report):
 *
 *   1. Tab order. An iframe's inner focusables cannot be reliably removed from
 *      the tab sequence — `tabindex="-1"` does not cross into a nested browsing
 *      context and `inert` does not propagate into one either. A hero iframe of
 *      the full dashboard would insert dozens of tab stops ahead of this page's
 *      own navigation, which fails the keyboard-order requirement outright.
 *   2. Weight. The demo bundle measures 971.8 kB raw / 272.3 kB gzipped JS
 *      (recharts + lightweight-charts). That is >2x this entire page's JS
 *      budget, executing inside the hero viewport and competing for the main
 *      thread during the LCP window on mobile.
 *
 *  The mockup costs no extra bytes beyond markup, and the address pill in the
 *  frame chrome is a real link to the demo, so the affordance survives. */
export default function App() {
  const heroEnd = useRef<HTMLDivElement>(null);
  const pastHero = useScrolledPast(heroEnd);

  return (
    <div className="min-h-screen">
      {/* Page-wide film grain; fixed, never interactive. */}
      <div aria-hidden="true" className="grain" />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[80] focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink"
      >
        Skip to content
      </a>
      <Nav />
      <SectionNav shown={pastHero} />
      <main id="main">
        <Hero />
        {/* Sentinel: marks the end of the hero for the sticky rail. */}
        <div ref={heroEnd} aria-hidden="true" className="h-px" />
        <CategoryStrip />
        <DetectionSection />
        <SignalsSection />
        <ArbitrageSection />
        <TrackingSection />
        <HowItWorks />
        <FAQ />
        <DemoBand />
      </main>
      <Footer />
    </div>
  );
}
