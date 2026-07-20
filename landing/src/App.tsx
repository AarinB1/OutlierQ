import Nav from "./components/Nav";
import Hero from "./components/Hero";
import SignalsSection from "./components/SignalsSection";
import ArbitrageSection from "./components/ArbitrageSection";
import TrackingSection from "./components/TrackingSection";
import HowItWorks from "./components/HowItWorks";
import FAQ from "./components/FAQ";
import Footer from "./components/Footer";

export default function App() {
  return (
    <div className="min-h-screen">
      <Nav />
      <main>
        <Hero />
        <SignalsSection />
        <ArbitrageSection />
        <TrackingSection />
        <HowItWorks />
        <FAQ />
      </main>
      <Footer />
    </div>
  );
}
