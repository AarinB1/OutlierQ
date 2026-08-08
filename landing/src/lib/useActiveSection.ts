import { useEffect, useState } from "react";

/** Returns the id of the section currently occupying the middle of the viewport.
 *
 *  One IntersectionObserver watches every section; the rootMargin crops the root
 *  to a horizontal band across the viewport middle so exactly one section is
 *  usually intersecting. When several are (short sections), the one nearest the
 *  band's top wins. Cheap: no scroll listener, no layout reads per frame. */
export function useActiveSection(ids: readonly string[]): string {
  const [active, setActive] = useState<string>("");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const els = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;

    const visible = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.set(e.target.id, e.boundingClientRect.top);
          else visible.delete(e.target.id);
        }
        if (visible.size === 0) return;
        let best = "";
        let bestTop = -Infinity;
        for (const [id, top] of visible) {
          // Prefer the section whose top is highest but still at or above the band.
          if (top > bestTop) {
            bestTop = top;
            best = id;
          }
        }
        setActive(best);
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ids]);

  return active;
}

/** True once the page has scrolled past `el` (used to reveal the sticky nav).
 *  Driven by an IntersectionObserver on the element itself, not scrollY, so it
 *  costs nothing while idle. */
export function useScrolledPast(ref: React.RefObject<HTMLElement>): boolean {
  const [past, setPast] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (!e) return;
        // Sentinel sits at the end of the hero. Once it has left the top of the
        // viewport (not intersecting and above the fold) we are past the hero.
        setPast(!e.isIntersecting && e.boundingClientRect.top < 0);
      },
      { threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);

  return past;
}
