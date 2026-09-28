import Header from "./components/Header";
import Hero from "./components/Hero";
import Principles from "./components/Principles";
import SignalLab from "./components/SignalLab";
import Architecture from "./components/Architecture";
import Parameters from "./components/Parameters";
import Docs from "./components/Docs";
import Footer, { Closing } from "./components/Footer";

/** Page order follows the Tidemark layout: hero figure, principles, the
 *  interactive lab, architecture, evidence, docs, close. The lab is an inline
 *  model of the pipeline rather than an iframe of the dashboard demo, which
 *  keeps the page's tab order clean and its JS far under budget (the demo
 *  bundle is ~275 kB gzipped on its own). */
export default function App() {
  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[80] focus:rounded-md focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-paper"
      >
        Skip to content
      </a>
      <Header />
      <main id="main">
        <Hero />
        <Principles />
        <SignalLab />
        <Architecture />
        <Parameters />
        <Docs />
        <Closing />
      </main>
      <Footer />
    </div>
  );
}
