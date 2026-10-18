// Marca Olympia PDV em SVG: "O" com halter em dourado; "PDV" em prata.
export function LogoMark({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="oly-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F3DC8B" />
          <stop offset=".5" stopColor="#C9A23A" />
          <stop offset="1" stopColor="#9C7A1E" />
        </linearGradient>
        <linearGradient id="oly-silver" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset=".55" stopColor="#B9BEC5" />
          <stop offset="1" stopColor="#E9EBEE" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="21" fill="none" stroke="url(#oly-gold)" strokeWidth="7" />
      <g transform="rotate(-40 32 32)" fill="url(#oly-silver)">
        <rect x="18" y="29.5" width="28" height="5" rx="2.5" />
        <rect x="14" y="22" width="6" height="20" rx="2.5" />
        <rect x="44" y="22" width="6" height="20" rx="2.5" />
      </g>
    </svg>
  )
}

export function Logo({ compact }) {
  return (
    <div className="logo">
      <LogoMark size={compact ? 30 : 38} />
      {!compact && (
        <div className="logo-text">
          <span className="logo-word">LYMPIA</span>
          <span className="logo-sub">
            <b>PDV</b>
          </span>
        </div>
      )}
    </div>
  )
}
