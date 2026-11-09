'use client';

import { Play } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from 'react';
import { octopus } from '@/lib/brand';
import type { Locale } from '@/lib/i18n';
import type { OctopusScene, ScreenPoint } from './octopus-scene';

type ReaderId = 'avatar' | 'total' | 'age' | 'items';

interface Reader {
  id: ReaderId;
  component: string;
  path: string;
  /** The arm tip its wire leaves from, in logo units. */
  anchor: readonly [number, number];
  side: 'left' | 'right';
  row: 'top' | 'bottom';
}

const readers: readonly Reader[] = [
  {
    id: 'avatar',
    component: '<Avatar />',
    path: 'user.name',
    anchor: [2.2, 31.4],
    side: 'left',
    row: 'top'
  },
  {
    id: 'total',
    component: '<CartTotal />',
    path: 'cart.total',
    anchor: [123.2, 31.5],
    side: 'right',
    row: 'top'
  },
  {
    id: 'age',
    component: '<AgeBadge />',
    path: 'user.age',
    anchor: [2.8, 63.2],
    side: 'left',
    row: 'bottom'
  },
  {
    id: 'items',
    component: '<ItemList />',
    path: 'cart.items',
    anchor: [122.6, 63.4],
    side: 'right',
    row: 'bottom'
  }
];

/** `cart.total` is a getter over `cart.items`, so a push reaches both. */
const commits: ReadonlyArray<{ code: string; readers: readonly ReaderId[] }> = [
  { code: "user.name = 'Grace'", readers: ['avatar'] },
  { code: 'user.age += 1', readers: ['age'] },
  { code: 'cart.items.push(book)', readers: ['items', 'total'] },
  { code: "prefs.theme = 'dark'", readers: [] }
];

const HEAD: ScreenPoint = { x: 62.7, y: 27.6 };
const PULSE_MS = 950;
const STEP_MS = 3600;

const copy = {
  en: {
    label:
      'The Coaction octopus with four components on its arms. Each commit re-renders only the components that read the path it changed.',
    reads: 'reads',
    rendered: 're-rendered',
    skipped: 'skipped',
    renders: (count: number) =>
      `${count} ${count === 1 ? 'render' : 'renders'}`,
    commit: 'Commit',
    idle: 'Each commit reaches only the components that read what it changed.',
    result: (count: number) =>
      count === 0
        ? 'Nothing reads it, so nothing re-renders.'
        : `${count} of 4 components re-rendered.`
  },
  zh: {
    label:
      'Coaction 章鱼的四条触手连着四个组件。每次提交只会让读取了被修改路径的组件重渲染。',
    reads: '读取',
    rendered: '已重渲染',
    skipped: '已跳过',
    renders: (count: number) => `渲染 ${count} 次`,
    commit: '提交',
    idle: '每次提交只会送达读取了被修改数据的组件。',
    result: (count: number) =>
      count === 0
        ? '没有组件读取它，所以什么都不会重渲染。'
        : `4 个组件中只有 ${count} 个重渲染。`
  }
} as const;

const isDark = () => document.documentElement.classList.contains('dark');

function bezier(
  a: ScreenPoint,
  b: ScreenPoint,
  c: ScreenPoint,
  d: ScreenPoint,
  t: number
): ScreenPoint {
  const m = 1 - t;
  return {
    x:
      m * m * m * a.x +
      3 * m * m * t * b.x +
      3 * m * t * t * c.x +
      t * t * t * d.x,
    y:
      m * m * m * a.y +
      3 * m * m * t * b.y +
      3 * m * t * t * c.y +
      t * t * t * d.y
  };
}

export function OctopusStage({ lang }: { lang: Locale }) {
  const text = copy[lang];
  const gradientId = useId();
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fallbackRef = useRef<SVGSVGElement>(null);
  const wireRefs = useRef<Array<SVGPathElement | null>>([]);
  const pulseRefs = useRef<Array<SVGCircleElement | null>>([]);
  const chipRefs = useRef<Array<HTMLLIElement | null>>([]);
  const sceneRef = useRef<OctopusScene | null>(null);
  const tipsRef = useRef<ScreenPoint[]>([]);
  const headRef = useRef<ScreenPoint>({ x: 0, y: 0 });
  const endsRef = useRef<ScreenPoint[]>([]);
  const pulseRef = useRef<{
    start: number;
    readers: readonly ReaderId[];
  } | null>(null);
  const frameRef = useRef(0);
  const motionRef = useRef(true);
  const visibleRef = useRef(true);
  const hoverRef = useRef(false);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const stepRef = useRef(-1);

  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(-1);
  const [lit, setLit] = useState<readonly ReaderId[] | null>(null);
  const [counts, setCounts] = useState<Record<ReaderId, number>>({
    avatar: 1,
    total: 1,
    age: 1,
    items: 1
  });

  /** Redraws the wires and any pulse travelling along them. */
  const draw = useCallback((now: number) => {
    const tips = tipsRef.current;
    const ends = endsRef.current;
    if (tips.length !== readers.length || ends.length !== readers.length)
      return;
    const pulse = pulseRef.current;
    const progress = pulse ? (now - pulse.start) / PULSE_MS : 2;
    if (pulse && progress >= 1) pulseRef.current = null;

    readers.forEach((reader, index) => {
      const tip = tips[index];
      const end = ends[index];
      // Leave the arm outward, then turn into the chip from below or above.
      const outward = reader.side === 'left' ? -1 : 1;
      const toward = reader.row === 'top' ? 1 : -1;
      const rise = Math.abs(end.y - tip.y);
      const c1 = { x: tip.x + outward * Math.max(rise * 0.35, 18), y: tip.y };
      const c2 = { x: end.x, y: end.y + toward * rise * 0.6 };
      wireRefs.current[index]?.setAttribute(
        'd',
        `M${tip.x.toFixed(1)} ${tip.y.toFixed(1)}C${c1.x.toFixed(1)} ${c1.y.toFixed(1)} ${c2.x.toFixed(1)} ${c2.y.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`
      );

      const dot = pulseRefs.current[index];
      if (!dot) return;
      if (!pulse || progress >= 1 || !pulse.readers.includes(reader.id)) {
        dot.style.opacity = '0';
        return;
      }
      const eased =
        progress < 0.5
          ? 2 * progress * progress
          : 1 - (-2 * progress + 2) ** 2 / 2;
      const split = 0.36;
      const head = headRef.current;
      const point =
        eased < split
          ? {
              x: head.x + (tip.x - head.x) * (eased / split),
              y: head.y + (tip.y - head.y) * (eased / split)
            }
          : bezier(tip, c1, c2, end, (eased - split) / (1 - split));
      dot.setAttribute('cx', point.x.toFixed(1));
      dot.setAttribute('cy', point.y.toFixed(1));
      dot.style.opacity = '1';
    });
  }, []);

  /** Without WebGL the pulses still need frames of their own. */
  const animatePulse = useCallback(() => {
    if (sceneRef.current) return;
    cancelAnimationFrame(frameRef.current);
    const tick = (now: number) => {
      draw(now);
      if (pulseRef.current) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  }, [draw]);

  /** Measures where wires end on the chips and, before WebGL, start on the arms. */
  const measure = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const box = stage.getBoundingClientRect();
    endsRef.current = readers.map((reader, index) => {
      const chip = chipRefs.current[index]?.getBoundingClientRect();
      if (!chip) return { x: 0, y: 0 };
      return {
        x: chip.left + chip.width / 2 - box.left,
        y: (reader.row === 'top' ? chip.bottom : chip.top) - box.top
      };
    });
    const art = fallbackRef.current?.getBoundingClientRect();
    if (!sceneRef.current && art) {
      const place = ([x, y]: readonly [number, number]) => ({
        x: art.left - box.left + (x / octopus.width) * art.width,
        y: art.top - box.top + (y / octopus.height) * art.height
      });
      tipsRef.current = readers.map((reader) => place(reader.anchor));
      headRef.current = place([HEAD.x, HEAD.y]);
    }
    draw(performance.now());
  }, [draw]);

  const clearTimers = () => {
    for (const timer of timersRef.current) clearTimeout(timer);
    timersRef.current = [];
  };

  const runCommit = useCallback(
    (index: number) => {
      const commit = commits[index % commits.length];
      clearTimers();
      stepRef.current = index % commits.length;
      setStep(stepRef.current);
      setLit(null);
      sceneRef.current?.flash();
      const land = () => {
        setCounts((previous) => {
          const next = { ...previous };
          for (const id of commit.readers) next[id] += 1;
          return next;
        });
        setLit(commit.readers);
        timersRef.current.push(setTimeout(() => setLit(null), 1500));
      };
      if (motionRef.current) {
        pulseRef.current = {
          start: performance.now(),
          readers: commit.readers
        };
        animatePulse();
        timersRef.current.push(setTimeout(land, PULSE_MS * 0.92));
      } else {
        land();
      }
    },
    [animatePulse]
  );

  const next = useCallback(() => runCommit(stepRef.current + 1), [runCommit]);

  // Mount the WebGL scene; the SVG octopus stays if WebGL is unavailable.
  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;
    motionRef.current = !window.matchMedia('(prefers-reduced-motion: reduce)')
      .matches;
    let disposed = false;

    measure();
    // three.js needs WebGL 2; without it, skip the download altogether.
    const probe = document.createElement('canvas').getContext('webgl2');
    probe?.getExtension('WEBGL_lose_context')?.loseContext();
    if (probe) {
      import('./octopus-scene')
        .then(({ createOctopusScene }) => {
          if (disposed) return;
          sceneRef.current = createOctopusScene({
            canvas,
            anchors: readers.map((reader) => reader.anchor),
            dark: isDark(),
            animate: motionRef.current,
            onFrame(points, head) {
              tipsRef.current = points;
              headRef.current = head;
              draw(performance.now());
            }
          });
          setReady(true);
        })
        .catch(() => {
          // The context or the chunk failed: the SVG octopus remains.
        });
    }

    const themeObserver = new MutationObserver(() =>
      sceneRef.current?.setDark(isDark())
    );
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
    const sync = () =>
      sceneRef.current?.setActive(visibleRef.current && !document.hidden);
    const visibility = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = entry.isIntersecting;
        sync();
      },
      { threshold: 0.02 }
    );
    visibility.observe(stage);
    document.addEventListener('visibilitychange', sync);
    const resize = new ResizeObserver(() => {
      sceneRef.current?.resize();
      measure();
    });
    resize.observe(stage);

    return () => {
      disposed = true;
      themeObserver.disconnect();
      visibility.disconnect();
      resize.disconnect();
      document.removeEventListener('visibilitychange', sync);
      cancelAnimationFrame(frameRef.current);
      clearTimers();
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [draw, measure]);

  // Commit on a timer while the stage is on screen and not being explored.
  // Each tick schedules the next, so a busy main thread never queues a burst.
  useEffect(() => {
    if (!motionRef.current) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (visibleRef.current && !hoverRef.current && !document.hidden) next();
      timer = setTimeout(tick, STEP_MS);
    };
    timer = setTimeout(tick, 1400);
    return () => clearTimeout(timer);
  }, [next]);

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse') return;
    const box = event.currentTarget.getBoundingClientRect();
    sceneRef.current?.setPointer(
      ((event.clientX - box.left) / box.width) * 2 - 1,
      ((event.clientY - box.top) / box.height) * 2 - 1
    );
  };

  const commit = step >= 0 ? commits[step] : null;
  const stateOf = (id: ReaderId) =>
    lit === null ? 'idle' : lit.includes(id) ? 'rendered' : 'skipped';

  return (
    <figure className="octopus-stage" data-ready={ready || undefined}>
      <div
        ref={stageRef}
        className="octopus-stage__scene"
        onPointerMove={onPointerMove}
        onPointerEnter={() => {
          hoverRef.current = true;
        }}
        onPointerLeave={() => {
          hoverRef.current = false;
          sceneRef.current?.setPointer(0, 0);
        }}
      >
        <p className="sr-only">{text.label}</p>
        <div className="octopus-stage__halo" aria-hidden="true" />
        <svg
          ref={fallbackRef}
          className="octopus-stage__art"
          viewBox={octopus.viewBox}
          aria-hidden="true"
        >
          <defs>
            <radialGradient id={gradientId} cx="38%" cy="22%" r="88%">
              <stop offset="0" stopColor="#ff9a7a" />
              <stop offset="0.42" stopColor="#f3512f" />
              <stop offset="1" stopColor="#b8320f" />
            </radialGradient>
          </defs>
          <path d={octopus.path} fill={`url(#${gradientId})`} />
        </svg>
        <canvas
          ref={canvasRef}
          className="octopus-stage__canvas"
          aria-hidden="true"
          onClick={next}
        />
        <svg className="octopus-stage__wires" aria-hidden="true">
          {readers.map((reader, index) => (
            <path
              key={reader.id}
              ref={(element) => {
                wireRefs.current[index] = element;
              }}
              className="octopus-stage__wire"
              data-state={stateOf(reader.id)}
            />
          ))}
          {readers.map((reader, index) => (
            <circle
              key={reader.id}
              ref={(element) => {
                pulseRefs.current[index] = element;
              }}
              className="octopus-stage__pulse"
              r="5"
              cx="0"
              cy="0"
            />
          ))}
        </svg>
        <ul className="octopus-stage__readers">
          {readers.map((reader, index) => (
            <li
              key={reader.id}
              ref={(element) => {
                chipRefs.current[index] = element;
              }}
              className="octopus-reader"
              data-reader={reader.id}
              data-side={reader.side}
              data-state={stateOf(reader.id)}
            >
              <span className="octopus-reader__name">{reader.component}</span>
              <span className="octopus-reader__path">
                {text.reads} <code>{reader.path}</code>
              </span>
              <span className="octopus-reader__count" key={counts[reader.id]}>
                {text.renders(counts[reader.id])}
              </span>
              <span className="octopus-reader__state" aria-hidden="true">
                {stateOf(reader.id) === 'rendered'
                  ? text.rendered
                  : stateOf(reader.id) === 'skipped'
                    ? text.skipped
                    : ''}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <figcaption className="octopus-stage__caption">
        <button type="button" className="octopus-stage__commit" onClick={next}>
          <Play size={13} aria-hidden="true" /> {text.commit}
        </button>
        <span className="octopus-stage__log" aria-live="polite">
          {commit ? (
            <>
              <code>set(() =&gt; {commit.code})</code>
              <span>{text.result(commit.readers.length)}</span>
            </>
          ) : (
            <span>{text.idle}</span>
          )}
        </span>
      </figcaption>
    </figure>
  );
}
