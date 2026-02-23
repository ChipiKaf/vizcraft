import React, { useEffect, useRef, useState } from 'react';
import { viz, type VizBuilder } from 'vizcraft';

export default function ZOrderingDemo() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const builderRef = useRef<VizBuilder>(viz().view(600, 300));
  const mountedRef = useRef(false);
  const [isFront, setIsFront] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const builder = builderRef.current;

    // Initial scene setup
    builder
      // Blue Node (Middle layer)
      .node('b')
      .at(250, 150)
      .circle(50)
      .fill('#89b4fa')
      .zIndex(2)
      .label('Blue (z: 2)')

      // Green Node (Front layer)
      .node('c')
      .at(350, 150)
      .circle(50)
      .fill('#a6e3a1')
      .zIndex(3)
      .label('Green (z: 3)')

      // Dynamic Red Node (Starts in back)
      .node('dynamic')
      .at(300, 100)
      .circle(60)
      .fill('#f38ba8')
      .zIndex(1)
      .label('Red (z: 1)', { dy: -20 });

    builder.mount(container, { panZoom: true });
    mountedRef.current = true;

    return () => {
      container.innerHTML = '';
      mountedRef.current = false;
    };
  }, []);

  const toggleZIndex = () => {
    if (!mountedRef.current || !containerRef.current) return;

    const newZ = isFront ? 1 : 4;

    // Update the node's declarative property then patch the UI
    builderRef.current.node('dynamic', { zIndex: newZ });
    // Update label to reflect the new state
    builderRef.current.node('dynamic', {
      label: { text: `Red (z: ${newZ})`, dy: -20 },
    });

    builderRef.current.patchRuntime(containerRef.current);

    setIsFront(!isFront);
  };

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
          gap: '1rem',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <button className="button button--primary" onClick={toggleZIndex}>
          {isFront
            ? 'Send Red Node to Back (z: 1)'
            : 'Bring Red Node to Front (z: 4)'}
        </button>
      </div>
      <div
        ref={containerRef}
        style={{
          height: '300px',
          width: '100%',
          cursor: 'grab',
          border: '1px solid var(--ifm-color-emphasis-200)',
          borderRadius: '8px',
          overflow: 'hidden',
          background: 'var(--ifm-background-surface-color)',
        }}
      />
    </div>
  );
}
