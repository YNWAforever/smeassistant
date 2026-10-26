/**
 * A ring for effort (tasks done this month), deliberately not the score dial:
 * a different colour and no "/100", so it cannot be read as a visibility
 * score. Server-renderable; the fill eases in with CSS and stays still under
 * reduced motion.
 */
export function ProgressRing({ percent, label, size = 96, children }: { percent: number; label: string; size?: number; children?: React.ReactNode }) {
  const value = Math.max(0, Math.min(100, Math.round(percent)))
  const stroke = 9
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  return (
    <figure className="k-progress-ring" role="img" aria-label={label} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        {value > 0 && (
          <circle
            className="k-progress-ring-arc"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - value / 100)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </svg>
      <figcaption aria-hidden="true">{children ?? `${value}%`}</figcaption>
    </figure>
  )
}
