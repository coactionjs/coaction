import type { CSSProperties } from 'react';
import { octopus } from '@/lib/brand';

const LAYERS = 14;

/**
 * The octopus extruded in CSS 3D: copies of the traced mark stacked in depth,
 * the front one lit. Decorative; one per page (it names its gradient).
 */
export function ExtrudedOctopus({ className = '' }: { className?: string }) {
  return (
    <div className={`extruded ${className}`} aria-hidden="true">
      <div className="extruded__body">
        {Array.from({ length: LAYERS }, (_, layer) => (
          <svg
            key={layer}
            className="extruded__layer"
            viewBox={octopus.viewBox}
            style={{ '--layer': layer } as CSSProperties}
          >
            {layer === 0 ? (
              <defs>
                <linearGradient
                  id="extruded-face"
                  x1="0"
                  y1="0"
                  x2="0.4"
                  y2="1"
                >
                  <stop offset="0" stopColor="#ff8f6b" />
                  <stop offset="0.5" stopColor="#f3512f" />
                  <stop offset="1" stopColor="#d23f19" />
                </linearGradient>
              </defs>
            ) : null}
            <path
              d={octopus.path}
              fill={layer === 0 ? 'url(#extruded-face)' : 'currentColor'}
            />
          </svg>
        ))}
      </div>
      <div className="extruded__shadow" />
    </div>
  );
}
