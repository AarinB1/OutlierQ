import type { ReactNode } from 'react'

/** Line icons on a 24px grid, 1.7 stroke, round caps: the same drawing rules as
 *  landing/src/components/Icon.tsx. Inline SVG, so every glyph renders the same
 *  on every OS, which the Unicode symbols they replace (⚡ ◉ ⬡ ▲ ...) did not. */
const paths: Record<string, ReactNode> = {
  zap: <path d="M13 3 5 14h6l-1 7 8-11h-6z" />,
  activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  grid: <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />,
  scale: <path d="M12 4v16M7 20h10M5 8h14M5 8l-3 6a3 3 0 0 0 6 0zM19 8l-3 6a3 3 0 0 0 6 0z" />,
  play: <path d="M7 5v14l11-7z" />,
  radar: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 12 18.4 5.6M12 7.5a4.5 4.5 0 1 0 4.5 4.5" />
    </>
  ),
  arrows: <path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4" />,
  cpu: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M10 10h4v4h-4zM9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
    </>
  ),
  layers: <path d="m12 3 9 5-9 5-9-5 9-5ZM3 12.5l9 5 9-5M3 17l9 5 9-5" />,
  pie: <path d="M12 3v9h9A9 9 0 1 1 12 3ZM15 3.5A9 9 0 0 1 20.5 9H15z" />,
  shield: <path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z" />,
  list: <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />,
  'trending-up': <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
  star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />,
  pencil: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />,
  code: <path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14" />,
  rotate: <path d="M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4" />,
  sigma: <path d="M18 5H7l6 7-6 7h11" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" />
    </>
  ),
  spike: <path d="M2 15h6l2-2 2 2 2-11 2 11h6" />,
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </>
  ),
  newspaper: (
    <>
      <rect x="3" y="4" width="15" height="16" rx="2" />
      <path d="M18 8h3v10a2 2 0 0 1-2 2M7 8h7M7 12h7M7 16h4" />
    </>
  ),
  'arrow-up-right': <path d="M7 17 17 7M8 7h9v9" />,
  'arrow-right': <path d="M5 12h14M13 6l6 6-6 6" />,
}

export type IconName = keyof typeof paths

export default function Icon({
  name,
  className = 'h-4 w-4',
  strokeWidth = 1.7,
}: {
  name: IconName
  className?: string
  strokeWidth?: number
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`inline-block shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  )
}
