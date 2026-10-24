export function BrandMark({ className = "h-full w-full" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#6f4731" />
      <path
        d="M18 18h29l-4 34H22z"
        fill="#d9aa7d"
        stroke="#fffaf4"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M39 6h5L35 38h-5z" fill="#86bda8" />
      <path d="M20 28h25l-3 23H23z" fill="#c48d61" opacity=".9" />
      <circle cx="28" cy="45" r="4" fill="#412a21" />
      <circle cx="37" cy="44" r="4" fill="#412a21" />
      <path
        d="M24 33c7-3 12 3 19 0"
        fill="none"
        stroke="#f2d2b2"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

