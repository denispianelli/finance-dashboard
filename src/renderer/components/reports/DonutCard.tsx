import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Overline } from '../ui/overline';
import { formatCompact, formatEuro } from '../../lib/euro';

/** One ring slice: an already-coloured share of a total. */
export interface DonutSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

const SIZE = 150;
const THICKNESS = 16;
const R = (SIZE - THICKNESS) / 2;
const CX = SIZE / 2;
const CIRC = 2 * Math.PI * R;

interface HoverState {
  key: string;
  x: number;
  y: number;
}

/** The kit's stroke-dasharray ring with a two-line centre (overline + serif total).
 *  Hovering a slice raises it slightly and shows a kit-style tooltip (label,
 *  amount, share) — same visual language as the recharts ChartTooltipContent. */
function Donut({
  segments,
  centerTop,
  centerMain,
}: {
  segments: DonutSegment[];
  centerTop: string;
  centerMain: string;
}) {
  const total = segments.reduce((s, x) => s + Math.abs(x.value), 0) || 1;
  const arcs = segments.map((s, i) => {
    const dash = (Math.abs(s.value) / total) * CIRC;
    const offset = (segments.slice(0, i).reduce((a, x) => a + Math.abs(x.value), 0) / total) * CIRC;
    return { key: s.key, color: s.color, dash, offset };
  });
  // Sweep the segments in on mount: each grows from 0 to its arc length. A `CIRC`
  // gap (vs `CIRC - dash`) keeps a lone full-circle segment visible — `dash 0`
  // renders nothing in Chromium — and never repeats the dash within the path.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setShown(true);
    });
    return () => {
      cancelAnimationFrame(id);
    };
  }, []);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  const hovered = hover === null ? undefined : segments.find((s) => s.key === hover.key);
  const track = (key: string) => (e: React.MouseEvent) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({ key, x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div ref={wrapRef} className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${String(SIZE)} ${String(SIZE)}`}
        className="-rotate-90"
      >
        <circle cx={CX} cy={CX} r={R} fill="none" stroke="var(--ink-3)" strokeWidth={THICKNESS} />
        {arcs.map((a) => (
          <circle
            key={a.key}
            cx={CX}
            cy={CX}
            r={R}
            fill="none"
            stroke={a.color}
            strokeWidth={hover?.key === a.key ? THICKNESS + 3 : THICKNESS}
            strokeDasharray={`${String(shown ? a.dash : 0)} ${String(CIRC)}`}
            strokeDashoffset={-a.offset}
            strokeLinecap="butt"
            style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.4, 0, 0.2, 1)' }}
            onMouseMove={track(a.key)}
            onMouseLeave={() => {
              setHover(null);
            }}
          />
        ))}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <span className="font-sans text-[9px] font-semibold uppercase tracking-[0.14em] text-paper-mute">
          {centerTop}
        </span>
        <span className="font-serif text-[22px] italic leading-none tracking-[-0.02em] text-paper">
          {centerMain}
        </span>
      </div>
      {hover !== null && hovered !== undefined && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 flex items-center gap-2 whitespace-nowrap rounded-md border border-line-2 bg-ink-2 px-2.5 py-1.5 font-sans text-[11px] shadow-md"
          style={{ left: hover.x + 12, top: hover.y - 8 }}
        >
          <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: hovered.color }} />
          <span className="text-paper-soft">{hovered.label}</span>
          <span className="font-mono tabular-nums text-paper">{formatEuro(hovered.value)}</span>
          <span className="font-mono tabular-nums text-paper-dim">
            {String(Math.round((Math.abs(hovered.value) / total) * 100))}%
          </span>
        </div>
      )}
    </div>
  );
}

function DonutLegend({ segments }: { segments: DonutSegment[] }) {
  return (
    <ul className="flex min-w-0 flex-1 flex-col gap-[9px]">
      {segments.map((s) => (
        <li key={s.key} className="flex items-center gap-2.5 font-sans text-[12px]">
          <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: s.color }} />
          <span className="flex-1 truncate text-paper-soft">{s.label}</span>
          <span className="font-mono tabular-nums text-paper-mute">{formatEuro(s.value)}</span>
        </li>
      ))}
    </ul>
  );
}

export interface DonutCardProps {
  overline: string;
  title: string;
  segments: DonutSegment[];
  /** Small uppercase caption inside the ring, e.g. "Entrées" / "Net". */
  centerTop: string;
  /** Centre figure; defaults to the compact sum of the segments. */
  centerMain?: string;
  emptyHint: string;
  /** Optional content pinned to the right of the section head (e.g. a total). */
  right?: ReactNode;
}

/** A composition donut card: section head, ring with a centre figure, and legend.
 *  Drives both the income/expense category donuts and the net-worth donut. */
export function DonutCard({
  overline,
  title,
  segments,
  centerTop,
  centerMain,
  emptyHint,
  right,
}: DonutCardProps) {
  const total = segments.reduce((s, x) => s + Math.abs(x.value), 0);

  return (
    <div className="flex flex-col gap-3.5 rounded-lg border border-line-2 bg-ink-2 px-[22px] py-5">
      <div className="flex items-center gap-3.5">
        <Overline>{overline}</Overline>
        <span className="font-sans text-sm font-medium tracking-[-0.012em]">{title}</span>
        {right}
      </div>
      {segments.length === 0 ? (
        <div className="flex min-h-[120px] items-center justify-center text-center text-sm text-paper-mute">
          {emptyHint}
        </div>
      ) : (
        <div className="flex items-center gap-[22px]">
          <Donut
            segments={segments}
            centerTop={centerTop}
            centerMain={centerMain ?? formatCompact(total)}
          />
          <DonutLegend segments={segments} />
        </div>
      )}
    </div>
  );
}
