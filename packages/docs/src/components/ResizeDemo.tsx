import React, { useEffect, useRef, useState } from 'react';
import { viz } from 'vizcraft';

export default function ResizeDemo() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const builderRef = useRef(viz().view(400, 200));
  const mountedRef = useRef(false);
  const [size, setSize] = useState({ w: 100, h: 50 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const builder = builderRef.current;

    // Initial scene setup
    builder
      .node('dynamic')
      .at(200, 100)
      .rect(100, 50, 10)
      .fill('var(--ifm-color-emphasis-200)')
      .stroke({ color: 'var(--ifm-color-emphasis-500)', width: 2 })
      .label('Resize Me')
      .node('left')
      .at(50, 100)
      .circle(20)
      .fill('#f9e2af')
      .node('right')
      .at(350, 100)
      .circle(20)
      .fill('#f9e2af')
      .edge('left', 'dynamic', { arrow: true })
      .edge('dynamic', 'right', { arrow: true })
      .done();

    builder.mount(container);
    mountedRef.current = true;

    return () => {
      container.innerHTML = '';
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!mountedRef.current) return;
    const container = containerRef.current;
    if (!container) return;

    const builder = builderRef.current;
    builder.resizeNode('dynamic', { w: size.w, h: size.h });
    builder.patchRuntime(container);
  }, [size]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        width: '100%',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: '2rem',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <label
          style={{
            display: 'flex',
            flexDirection: 'column',
            fontSize: '0.875rem',
            fontWeight: 600,
          }}
        >
          Width: {size.w}px
          <input
            type="range"
            min="50"
            max="250"
            value={size.w}
            onChange={(e) =>
              setSize((s) => ({ ...s, w: parseInt(e.target.value) }))
            }
          />
        </label>
        <label
          style={{
            display: 'flex',
            flexDirection: 'column',
            fontSize: '0.875rem',
            fontWeight: 600,
          }}
        >
          Height: {size.h}px
          <input
            type="range"
            min="30"
            max="150"
            value={size.h}
            onChange={(e) =>
              setSize((s) => ({ ...s, h: parseInt(e.target.value) }))
            }
          />
        </label>
      </div>
      <div
        ref={containerRef}
        style={{ height: '200px', width: '100%', cursor: 'default' }}
      />
    </div>
  );
}
