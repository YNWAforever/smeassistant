import type { IllustrationKind } from "@/lib/copy-visual"

/**
 * One consistent empty-state set: same 120×88 frame, same stroke, token
 * colours only (light and dark). Decorative: the state's heading carries the
 * meaning, so every illustration is aria-hidden.
 */
export function EmptyIllustration({ kind, className }: { kind: IllustrationKind; className?: string }) {
  return (
    <svg viewBox="0 0 120 88" width="120" height="88" aria-hidden="true" className={`k-illustration ${className ?? ""}`} data-kind={kind}>
      <ellipse cx="60" cy="80" rx="40" ry="5" className="k-ill-shadow" />
      {kind === "noData" && (
        <>
          <rect x="28" y="14" width="48" height="58" rx="6" className="k-ill-paper" />
          <line x1="37" y1="28" x2="66" y2="28" className="k-ill-line" />
          <line x1="37" y1="38" x2="58" y2="38" className="k-ill-line" />
          <circle cx="76" cy="52" r="13" className="k-ill-accent-ring" />
          <line x1="85" y1="61" x2="95" y2="71" className="k-ill-accent-stroke" />
        </>
      )}
      {kind === "noActions" && (
        <>
          <rect x="30" y="12" width="60" height="62" rx="6" className="k-ill-paper" />
          {[26, 42, 58].map((y) => (
            <g key={y}>
              <rect x="39" y={y - 5} width="10" height="10" rx="2" className="k-ill-box" />
              <line x1="55" y1={y} x2="80" y2={y} className="k-ill-line" />
            </g>
          ))}
        </>
      )}
      {kind === "allDone" && (
        <>
          <circle cx="60" cy="42" r="28" className="k-ill-success" />
          <path d="M47 42l9 9 17-19" className="k-ill-check" />
          <path d="M96 18l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" className="k-ill-spark" />
          <path d="M22 54l1.5 3.5 3.5 1.5-3.5 1.5-1.5 3.5-1.5-3.5-3.5-1.5 3.5-1.5z" className="k-ill-spark" />
        </>
      )}
      {kind === "error" && (
        <>
          <path d="M38 62a16 16 0 0 1 2-31 20 20 0 0 1 38-4 15 15 0 0 1 4 35z" className="k-ill-paper" />
          <line x1="60" y1="34" x2="60" y2="48" className="k-ill-danger-stroke" />
          <circle cx="60" cy="55" r="2.5" className="k-ill-danger-dot" />
        </>
      )}
      {kind === "denied" && (
        <>
          <rect x="38" y="36" width="44" height="36" rx="7" className="k-ill-accent" />
          <path d="M47 36v-9a13 13 0 0 1 26 0v9" className="k-ill-accent-stroke" />
          <circle cx="60" cy="52" r="4" className="k-ill-keyhole" />
          <line x1="60" y1="55" x2="60" y2="62" className="k-ill-keyhole-line" />
        </>
      )}
    </svg>
  )
}
