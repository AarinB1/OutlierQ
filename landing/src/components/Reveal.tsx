import { useEffect, useRef, useState, type ReactNode } from "react";

interface RevealProps {
  children: ReactNode;
  delay?: number;
  className?: string;
  /** Render visible immediately, with no observer and no fade.
   *
   *  Use this for anything above the fold. An element at opacity:0 is not a
   *  paint candidate, so wrapping the hero in a fade-in pushes both First
   *  Contentful Paint and Largest Contentful Paint back by the animation's
   *  delay plus its duration — measured here as ~690 ms of pure LCP cost on
   *  throttled mobile for zero information gained. Reveals are for content
   *  that arrives by scrolling. */
  instant?: boolean;
}

/** Fade/slide-in on scroll via IntersectionObserver. CSS handles
 *  prefers-reduced-motion (see .reveal in index.css). */
export default function Reveal({
  children,
  delay = 0,
  className = "",
  instant = false,
}: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (instant) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -32px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [instant]);

  if (instant) {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={`reveal ${shown ? "reveal-shown" : ""} ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
