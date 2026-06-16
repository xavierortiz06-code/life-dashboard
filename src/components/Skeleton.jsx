// Skeleton placeholders shown on first load (before cached data exists).
// Shapes roughly match the card lists they stand in for.

export function SkeletonBar({ w = '100%', h = 12, style }) {
  return <div className="skeleton" style={{ width: w, height: h, ...style }} />
}

export function SkeletonCard({ lines = 2 }) {
  return (
    <div className="skeleton-card">
      <SkeletonBar w="38%" h={13} />
      {Array.from({ length: lines }, (_, i) => (
        <SkeletonBar key={i} w={`${82 - i * 14}%`} h={10} />
      ))}
    </div>
  )
}

export default function SkeletonList({ rows = 3, lines = 2 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {Array.from({ length: rows }, (_, i) => <SkeletonCard key={i} lines={lines} />)}
    </div>
  )
}
