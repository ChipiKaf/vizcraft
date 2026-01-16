import React, { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { type PlaybackController, viz } from 'vizcraft';

type VizBuilder = ReturnType<typeof viz>;

interface VizPlaybackControlsProps {
  builder: VizBuilder;
  className?: string;
  style?: CSSProperties;
  /** Auto-play on mount. Defaults to true. */
  autoPlay?: boolean;
}

export default function VizPlaybackControls({
  builder,
  className,
  style,
  autoPlay = true,
}: VizPlaybackControlsProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<PlaybackController | null>(null);
  const [, forceRender] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    builder.mount(container);

    if (autoPlay) {
      controllerRef.current?.stop();
      controllerRef.current = builder.play();
      forceRender((n) => n + 1);
    }

    return () => {
      controllerRef.current?.stop();
      controllerRef.current = null;

      // Ensure any internally-tracked playback gets stopped too.
      builder.play(container, []);
      container.innerHTML = '';
    };
  }, [builder, autoPlay]);

  const play = () => {
    controllerRef.current?.stop();
    controllerRef.current = builder.play();
    forceRender((n) => n + 1);
  };

  const pause = () => controllerRef.current?.pause();
  const resume = () => controllerRef.current?.play();
  const stop = () => controllerRef.current?.stop();

  return (
    <div className={className} style={style}>
      <div
        ref={containerRef}
        style={{
          height: 240,
          width: '100%',
          border: '1px solid var(--ifm-color-emphasis-200)',
          borderRadius: 'var(--ifm-global-radius)',
        }}
      />

      <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="button button--primary" onClick={play}>
          Play
        </button>
        <button className="button button--secondary" onClick={pause}>
          Pause
        </button>
        <button className="button button--secondary" onClick={resume}>
          Resume
        </button>
        <button className="button button--danger" onClick={stop}>
          Stop
        </button>
      </div>
    </div>
  );
}
