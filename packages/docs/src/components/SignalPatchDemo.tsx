import React, { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { viz, type MountController } from 'vizcraft';

interface SignalPatchDemoProps {
  style?: CSSProperties;
}

/**
 * Interactive demo for manual signal patching.
 * Drives progress from a custom rAF loop and calls patchSignals() each frame.
 */
export default function SignalPatchDemo({ style }: SignalPatchDemoProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const builder = viz()
      .view(520, 160)
      .node('a', {
        circle: { r: 22 },
        at: { x: 80, y: 80 },
        fill: '#89b4fa',
        label: 'A',
      })
      .node('b', {
        circle: { r: 22 },
        at: { x: 260, y: 80 },
        fill: '#a6e3a1',
        label: 'B',
      })
      .node('c', {
        circle: { r: 22 },
        at: { x: 440, y: 80 },
        fill: '#f9e2af',
        label: 'C',
      })
      .edge('a', 'b', { arrow: true })
      .edge('b', 'c', { arrow: true });

    const controller: MountController = builder.mount(container);

    let progress = 0;
    let rafId = 0;

    const animate = () => {
      progress = (progress + 0.003) % 2; // two hops: 0→1→2
      controller.patchSignals([
        {
          key: 'manual-sig',
          chain: [
            { from: 'a', to: 'b' },
            { from: 'b', to: 'c' },
          ],
          progress,
          color: '#cba6f7',
          glowColor: '#cba6f7',
        },
      ]);
      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      controller.clearSignals();
      container.innerHTML = '';
    };
  }, []);

  return <div ref={containerRef} style={style} />;
}
