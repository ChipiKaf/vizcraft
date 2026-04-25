import React, { useEffect, useRef, useState } from 'react';
import {
  createStepControllerFromSpec,
  type StepController,
  type VizSpec,
} from 'vizcraft';

const DEMO_SPEC: VizSpec = {
  view: { width: 560, height: 180 },
  nodes: [
    {
      id: 'client',
      label: 'Client',
      x: 80,
      y: 90,
      shape: 'rect',
      width: 100,
      height: 36,
      fill: '#89b4fa',
    },
    {
      id: 'cache',
      label: 'Cache',
      x: 280,
      y: 90,
      shape: 'rect',
      width: 100,
      height: 36,
      fill: '#a6e3a1',
    },
    {
      id: 'db',
      label: 'DB',
      x: 480,
      y: 90,
      shape: 'rect',
      width: 100,
      height: 36,
      fill: '#f9e2af',
    },
  ],
  edges: [
    { from: 'client', to: 'cache', arrow: 'end' },
    { from: 'cache', to: 'db', arrow: 'end' },
  ],
  steps: [
    {
      label: 'Request arrives at the cache',
      highlight: ['client', 'cache'],
      signals: [{ id: 'req', chain: ['client', 'cache'], durationPerHop: 900 }],
    },
    {
      label: 'Cache miss — forwarding to DB',
      highlight: ['cache', 'db'],
      overlays: [
        {
          type: 'text',
          nodeId: 'cache',
          y: -28,
          text: 'MISS',
          fill: '#f38ba8',
          fontSize: 11,
        },
      ],
      signals: [{ id: 'fwd', chain: ['cache', 'db'], durationPerHop: 900 }],
    },
    {
      label: 'DB responds and cache is populated',
      signals: [
        { id: 'rsp1', chain: ['db', 'cache'], durationPerHop: 700 },
        { id: 'rsp2', chain: ['cache', 'client'], durationPerHop: 700 },
      ],
    },
  ],
};

const TOTAL = DEMO_SPEC.steps!.length;

export default function StepControllerDemo() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const ctrlRef = useRef<StepController | null>(null);
  const [current, setCurrent] = useState(0);
  const [stepLabel, setStepLabel] = useState(DEMO_SPEC.steps![0]!.label);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ctrl = createStepControllerFromSpec(DEMO_SPEC, container, {
      onStepChange: (i, step) => {
        setCurrent(i);
        setStepLabel(step.label);
        setReady(false);
      },
      onReady: () => setReady(true),
    });

    ctrlRef.current = ctrl;

    return () => {
      ctrl.destroy();
      ctrlRef.current = null;
    };
  }, []);

  const atFirst = current === 0;
  const atLast = current === TOTAL - 1;

  return (
    <div>
      <div ref={containerRef} />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginTop: '12px',
          paddingTop: '10px',
          borderTop: '1px solid var(--ifm-color-emphasis-200)',
        }}
      >
        <button
          onClick={() => ctrlRef.current?.prev()}
          disabled={atFirst}
          style={{ padding: '4px 14px' }}
        >
          ← Prev
        </button>
        <span
          style={{
            flex: 1,
            textAlign: 'center',
            fontSize: '13px',
          }}
        >
          Step {current + 1} / {TOTAL} — {stepLabel}
        </span>
        <button
          onClick={() => ctrlRef.current?.next()}
          disabled={!ready || atLast}
          style={{ padding: '4px 14px' }}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
