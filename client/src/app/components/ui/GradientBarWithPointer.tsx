// GradientBarWithPointer.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';

interface GradientBarWithPointerProps {
  value: number; // -1 to 1
  height?: number;
  pointerSize?: number;
  className?: string;
}

export const GradientBarWithPointer: React.FC<GradientBarWithPointerProps> = ({
  value,
  height = 24,
  pointerSize = 20,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [barWidth, setBarWidth] = useState(0);

  const clamped = Math.max(-1, Math.min(1, value));
  const percent = ((clamped + 1) / 2) * 100;

  const ticks = useMemo(
    () => Array.from({ length: 21 }, (_, index) => Number((-1 + index * 0.1).toFixed(1))),
    [],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      setBarWidth(container.clientWidth);
    };

    measure();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }

    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width ?? container.clientWidth;
      setBarWidth(nextWidth);
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const pointerLeft = useMemo(() => {
    if (!barWidth) {
      return `calc(${percent}% - ${pointerSize / 2}px)`;
    }

    const rawX = (percent / 100) * barWidth;
    const clampedX = Math.max(pointerSize / 2, Math.min(barWidth - pointerSize / 2, rawX));
    return `${clampedX - pointerSize / 2}px`;
  }, [barWidth, percent, pointerSize]);

  const labelInterval = barWidth < 360 ? 5 : barWidth < 520 ? 2 : 1;
  const labelTicks = useMemo(
    () => ticks.filter((_, index) => index % labelInterval === 0),
    [ticks, labelInterval],
  );

  const labelFontSize = barWidth < 360 ? 9 : barWidth < 520 ? 10 : 11;

  return (
    <div ref={containerRef} className={`w-full ${className}`}>
      {/* Pointer Triangle (above bar) */}
      <div className="relative mb-2" style={{ height: pointerSize + 4 }}>
        <div
          className="absolute"
          style={{
            left: pointerLeft,
            top: 4,
            width: pointerSize,
            height: pointerSize,
            pointerEvents: 'none',
          }}
        >
          <svg width={pointerSize} height={pointerSize} viewBox={`0 0 ${pointerSize} ${pointerSize}`}>
            {/* Triangle pointing down - larger and more visible */}
            <polygon
              points={`${pointerSize / 2},${pointerSize} 0,0 ${pointerSize},0`}
              fill="#ffffff"
              stroke="#1e293b"
              strokeWidth="2"
              opacity="1"
              filter="drop-shadow(0 2px 3px rgba(0,0,0,0.3))"
            />
          </svg>
        </div>
      </div>

      {/* Bar with tick marks */}
      <div className="relative w-full flex items-center" style={{ height }}>
        {/* Gradient Bar: Red (left), Yellow (center), Green (right) */}
        <div
          className="w-full rounded-full shadow-md"
          style={{
            height: height - 4,
            background:
              'linear-gradient(90deg, #ef4444 0%, #facc15 50%, #10b981 100%)',
          }}
        />

        {/* Tick marks (vertical lines) */}
        <div className="absolute inset-0 w-full" style={{ pointerEvents: 'none' }}>
          {ticks.map((tick) => {
            const tickPercent = ((tick + 1) / 2) * 100;
            const isBoundary = Math.abs(tick) === 1;
            return (
              <div
                key={tick}
                className="absolute"
                style={{
                  left: `${tickPercent}%`,
                  top: 0,
                  width: isBoundary ? '3px' : '1.5px',
                  height: '100%',
                  backgroundColor: isBoundary ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.5)',
                  transform: 'translateX(-50%)',
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Labels below bar - compact and organized */}
      <div className="relative w-full mt-3" style={{ height: 24 }}>
        {labelTicks.map((tick) => {
          const tickPercent = ((tick + 1) / 2) * 100;
          const isBoundary = Math.abs(tick) === 1;
          const labelPositionStyle =
            tick === -1
              ? { left: '0%', transform: 'none' }
              : tick === 1
                ? { left: '100%', transform: 'translateX(-100%)' }
                : { left: `${tickPercent}%`, transform: 'translateX(-50%)' };

          return (
            <div
              key={tick}
              className="absolute text-center whitespace-nowrap"
              style={{
                top: 0,
                color: isBoundary ? '#1e293b' : '#64748b',
                fontWeight: isBoundary ? 700 : 500,
                fontSize: `${isBoundary ? labelFontSize + 1 : labelFontSize}px`,
                lineHeight: 1,
                ...labelPositionStyle,
              }}
            >
              {tick.toFixed(1)}
            </div>
          );
        })}
      </div>
    </div>
  );
};
