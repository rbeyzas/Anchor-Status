// The mark: an anchor drawn as a score gauge. The ring is the gauge, the
// shank and flukes are the anchor, and the filled dot on the ring is the
// published verdict.
export function Logo({
  size = 28,
  className = '',
  dot = 'rgb(var(--color-accent))',
}: {
  size?: number;
  className?: string;
  dot?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <circle cx="16" cy="8" r="4.25" stroke="currentColor" strokeWidth="2.5" />
      <path d="M16 12.5V27" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M10.5 17.5H21.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path
        d="M5.5 20.5C6.4 25 10.6 27.5 16 27.5C21.4 27.5 25.6 25 26.5 20.5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="20.2" cy="8" r="1.9" fill={dot} />
    </svg>
  );
}

export function Wordmark({ className = '', dot }: { className?: string; dot?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Logo dot={dot} />
      <span className="font-heading text-xl font-bold tracking-[-0.03em]">Anchor Status</span>
    </span>
  );
}
