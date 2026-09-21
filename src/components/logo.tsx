export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--primary)" />
      <g fill="var(--primary-fg)">
        <rect x="8" y="12.5" width="2.6" height="7" rx="1.3" />
        <rect x="12.6" y="9" width="2.6" height="14" rx="1.3" />
        <rect x="17.2" y="11" width="2.6" height="10" rx="1.3" />
        <rect x="21.8" y="13.5" width="2.6" height="5" rx="1.3" opacity="0.55" />
      </g>
    </svg>
  );
}
