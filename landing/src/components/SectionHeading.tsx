import type { ReactNode } from "react";

/** Numbered eyebrow and a two-line heading on the left, a short paragraph
 *  bottom-aligned on the right. Stacks below `md`. */
export default function SectionHeading({
  eyebrow,
  title,
  aside,
  id,
}: {
  eyebrow: string;
  title: ReactNode;
  aside: ReactNode;
  id?: string;
}) {
  return (
    <div className="mb-10 flex flex-col gap-5 md:mb-12 md:flex-row md:items-end md:justify-between md:gap-12">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2
          id={id}
          className="heading mt-5 text-ink"
          style={{ fontSize: "clamp(2.1rem, 3.5vw, 2.85rem)" }}
        >
          {title}
        </h2>
      </div>
      <div className="max-w-[23rem] text-[15px] leading-[1.8] text-muted md:mb-1">{aside}</div>
    </div>
  );
}
