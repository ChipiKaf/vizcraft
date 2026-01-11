import React, { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { viz } from 'vizcraft';

type VizBuilder = ReturnType<typeof viz>;

interface VizMountProps {
  builder: VizBuilder;
  className?: string;
  style?: CSSProperties;
}

export default function VizMount({ builder, className, style }: VizMountProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    builder.mount(container);

    return () => {
      container.innerHTML = '';
    };
  }, [builder]);

  return <div ref={containerRef} className={className} style={style} />;
}
