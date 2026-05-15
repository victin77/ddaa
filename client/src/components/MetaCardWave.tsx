import { useEffect, useId, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Sparkles, TrendingUp, CalendarDays, Target } from 'lucide-react';
import { formatBRL } from '../api';

interface Props {
  pct: number;
  achieved: number;
  monthly: number;
  daysLeft: number;
  isAggregate: boolean;
  onClick?: () => void;
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function useAnimatedNumber(target: number, duration = 1400) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setValue(target * easeOutCubic(t));
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);
  return value;
}

function lighten(hex: string, amount: number) {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((num >> 16) & 0xff) + amount);
  const g = Math.min(255, ((num >> 8) & 0xff) + amount);
  const b = Math.min(255, (num & 0xff) + amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function rgbToHex(r: number, g: number, b: number) {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${((clamp(r) << 16) | (clamp(g) << 8) | clamp(b))
    .toString(16)
    .padStart(6, '0')}`;
}

function lerpColor(a: string, b: string, t: number) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex(
    ca.r + (cb.r - ca.r) * t,
    ca.g + (cb.g - ca.g) * t,
    ca.b + (cb.b - ca.b) * t
  );
}

const COLOR_STOPS: Array<[number, string]> = [
  [0, '#ef4444'],
  [35, '#ff7a3c'],
  [60, '#fbbf24'],
  [85, '#84cc16'],
  [100, '#22c55e'],
];

function colorForPct(pct: number): string {
  if (pct >= 100) return '#22c55e';
  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    const [pa, ca] = COLOR_STOPS[i];
    const [pb, cb] = COLOR_STOPS[i + 1];
    if (pct >= pa && pct <= pb) {
      const t = (pct - pa) / (pb - pa);
      return lerpColor(ca, cb, t);
    }
  }
  return COLOR_STOPS[COLOR_STOPS.length - 1][1];
}

interface Bubble {
  id: number;
  x: number;
  size: number;
  duration: number;
  delay: number;
  drift: number;
}

export default function MetaCardWave({
  pct,
  achieved,
  monthly,
  daysLeft,
  isAggregate,
  onClick,
}: Props) {
  const uid = useId().replace(/:/g, '');
  const safePct = Math.max(0, isFinite(pct) ? pct : 0);
  const animatedPct = useAnimatedNumber(safePct);
  const animatedAchieved = useAnimatedNumber(achieved);
  const hit = Math.round(safePct) >= 100;
  const remaining = Math.max(0, monthly - achieved);

  const waterColor = colorForPct(safePct);
  const waterLight = lighten(waterColor, 60);

  const SIZE = 152;
  const R = 66;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const TOP = CY - R;
  const BOTTOM = CY + R;
  const visiblePct = Math.min(100, safePct);
  const waterY = TOP + (1 - visiblePct / 100) * (BOTTOM - TOP);

  const wavePath = (yOffset: number) =>
    `M -70,${yOffset} Q -52.5,${yOffset - 7} -35,${yOffset} T 0,${yOffset} T 35,${yOffset} T 70,${yOffset} T 105,${yOffset} T 140,${yOffset} T 175,${yOffset} T 210,${yOffset} T 245,${yOffset} L 245,${SIZE + 20} L -70,${SIZE + 20} Z`;

  const waveLine = (yOffset: number) =>
    `M -70,${yOffset} Q -52.5,${yOffset - 7} -35,${yOffset} T 0,${yOffset} T 35,${yOffset} T 70,${yOffset} T 105,${yOffset} T 140,${yOffset} T 175,${yOffset} T 210,${yOffset} T 245,${yOffset}`;

  const bubbles = useMemo<Bubble[]>(
    () =>
      Array.from({ length: 7 }).map((_, i) => ({
        id: i,
        x: 24 + i * 14 + (i % 2 === 0 ? 6 : -4),
        size: 1.4 + ((i * 7) % 10) / 5,
        duration: 4 + ((i * 13) % 25) / 10,
        delay: -((i * 17) % 50) / 10,
        drift: (i % 2 === 0 ? 1 : -1) * (4 + ((i * 5) % 8)),
      })),
    []
  );

  const Wrapper: any = onClick ? 'button' : 'div';
  const hasTarget = monthly > 0;

  return (
    <Wrapper
      onClick={onClick}
      className={clsx(
        'p-5 flex flex-col gap-4 relative overflow-hidden rounded-3xl text-left w-full transition surface',
        onClick && 'hover:bg-bg-elev/40',
        hit && 'meta-glow-hit'
      )}
    >
      <div className="flex items-start gap-3 relative">
        <div className="w-10 h-10 rounded-xl grid place-items-center shrink-0 bg-bg-elev text-ink">
          <Target className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate flex items-center gap-1.5">
            Meta atingida
            {hit && <Sparkles className="w-3.5 h-3.5 text-success animate-pulse" />}
          </div>
          <div className="text-[11px] mt-0.5 truncate text-muted">
            {isAggregate ? 'Soma das metas do time' : 'Sua meta deste mês'}
          </div>
        </div>
      </div>

      {hasTarget ? (
        <div className="flex items-center gap-5 relative">
          <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
            <div
              aria-hidden
              className="absolute inset-[-10%] rounded-full meta-orb-glow"
              style={{
                background: `radial-gradient(circle, ${waterColor}55 0%, ${waterColor}22 35%, transparent 70%)`,
                filter: 'blur(8px)',
                transition: 'background 360ms ease-out',
              }}
            />

            <svg
              width={SIZE}
              height={SIZE}
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              className="relative"
            >
              <defs>
                <clipPath id={`waveclip-${uid}`}>
                  <circle cx={CX} cy={CY} r={R} />
                </clipPath>
                <linearGradient
                  id={`watergrad-${uid}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={waterLight} stopOpacity="0.85" />
                  <stop offset="55%" stopColor={waterColor} stopOpacity="0.95" />
                  <stop offset="100%" stopColor={waterColor} stopOpacity="1" />
                </linearGradient>
                <linearGradient
                  id={`watergrad2-${uid}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={waterLight} stopOpacity="0.5" />
                  <stop offset="100%" stopColor={waterColor} stopOpacity="0.7" />
                </linearGradient>
                <radialGradient
                  id={`highlight-${uid}`}
                  cx="32%"
                  cy="22%"
                  r="50%"
                >
                  <stop offset="0%" stopColor="white" stopOpacity="0.45" />
                  <stop offset="60%" stopColor="white" stopOpacity="0.1" />
                  <stop offset="100%" stopColor="white" stopOpacity="0" />
                </radialGradient>
                <linearGradient
                  id={`rim-${uid}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="white" stopOpacity="0.25" />
                  <stop offset="50%" stopColor={waterColor} stopOpacity="0.4" />
                  <stop offset="100%" stopColor={waterColor} stopOpacity="0.7" />
                </linearGradient>
              </defs>

              <circle
                cx={CX}
                cy={CY}
                r={R}
                fill="currentColor"
                className="text-overlay/[0.06]"
              />

              <g clipPath={`url(#waveclip-${uid})`}>
                <g
                  style={{
                    transform: `translateY(${waterY - TOP}px)`,
                    transition: 'transform 1400ms cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                >
                  <g className="meta-wave-back-anim">
                    <path
                      d={wavePath(TOP + 6)}
                      fill={`url(#watergrad2-${uid})`}
                    />
                  </g>
                  <g className="meta-wave-front-anim">
                    <path
                      d={wavePath(TOP)}
                      fill={`url(#watergrad-${uid})`}
                    />
                    <path
                      d={waveLine(TOP)}
                      fill="none"
                      stroke="white"
                      strokeOpacity={0.55}
                      strokeWidth={1.2}
                      strokeLinecap="round"
                    />
                  </g>
                </g>

                {bubbles.map((b) => (
                  <circle
                    key={b.id}
                    className="meta-bubble"
                    cx={b.x + (CX - R)}
                    cy={BOTTOM - 6}
                    r={b.size}
                    fill="white"
                    fillOpacity={0.55}
                    style={
                      {
                        animationDuration: `${b.duration}s`,
                        animationDelay: `${b.delay}s`,
                        ['--meta-bubble-drift' as any]: `${b.drift}px`,
                      } as React.CSSProperties
                    }
                  />
                ))}

                <ellipse
                  cx={CX - R * 0.32}
                  cy={CY - R * 0.5}
                  rx={R * 0.55}
                  ry={R * 0.3}
                  fill={`url(#highlight-${uid})`}
                  pointerEvents="none"
                />
              </g>

              <circle
                cx={CX}
                cy={CY}
                r={R}
                fill="none"
                stroke={`url(#rim-${uid})`}
                strokeWidth={2.5}
              />
              <circle
                cx={CX}
                cy={CY}
                r={R - 1.5}
                fill="none"
                stroke="white"
                strokeOpacity={0.1}
                strokeWidth={1}
              />
            </svg>

            <div className="absolute inset-0 grid place-items-center pointer-events-none">
              <div className="text-center">
                <div
                  className="text-[34px] font-extrabold tabular-nums leading-none text-white"
                  style={{
                    textShadow:
                      '0 2px 4px rgba(0,0,0,0.55), 0 0 18px rgba(0,0,0,0.35)',
                  }}
                >
                  {Math.round(animatedPct)}%
                </div>
                {hit && (
                  <div
                    className="text-[10px] font-bold text-white mt-1 uppercase tracking-widest"
                    style={{ textShadow: '0 1px 2px rgba(0,0,0,0.55)' }}
                  >
                    bateu!
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted">
                Realizado
              </div>
              <div className="text-xl font-extrabold tabular-nums tracking-tight truncate">
                {formatBRL(animatedAchieved)}
              </div>
              <div className="text-[11px] text-muted truncate">
                de {formatBRL(monthly)}
              </div>
            </div>

            <div className="flex items-center gap-3 text-[11px] text-muted">
              {!hit && (
                <span className="inline-flex items-center gap-1 truncate">
                  <TrendingUp className="w-3 h-3" />
                  Faltam {formatBRL(remaining)}
                </span>
              )}
              {hit && (
                <span className="inline-flex items-center gap-1 text-success truncate font-semibold">
                  <Sparkles className="w-3 h-3" />
                  +{formatBRL(achieved - monthly)}
                </span>
              )}
              <span className="inline-flex items-center gap-1 shrink-0">
                <CalendarDays className="w-3 h-3" />
                {daysLeft === 0 ? 'último dia' : `${daysLeft} d`}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-sm text-muted py-6 text-center">
          {isAggregate
            ? 'Defina metas mensais nos consultores para acompanhar aqui.'
            : 'Seu gestor ainda não definiu sua meta mensal.'}
        </div>
      )}
    </Wrapper>
  );
}
