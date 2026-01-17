import React, { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  createBuilderPlayback,
  type ExtendAdapter,
  type PlaybackController,
  viz,
} from 'vizcraft';

type VizBuilder = ReturnType<typeof viz>;

interface VizPlaybackControlsProps {
  builder: VizBuilder;
  className?: string;
  style?: CSSProperties;
  /** Auto-play on mount. Defaults to true. */
  autoPlay?: boolean;
  /** Optional extension point for custom animatable properties. */
  extendAdapter?: ExtendAdapter;
}

export default function VizPlaybackControls({
  builder,
  className,
  style,
  autoPlay = true,
  extendAdapter,
}: VizPlaybackControlsProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<PlaybackController | null>(null);
  const [, forceRender] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    builder.mount(container);

    const start = () => {
      controllerRef.current?.stop();

      // If the caller didn't provide an explicit adapter extension, prefer the
      // builder's built-in play(), which also honors per-spec anim.extendAdapter().
      if (!extendAdapter) {
        controllerRef.current = builder.play();
        forceRender((n) => n + 1);
        return;
      }

      const scene = builder.build();
      const specs = scene.animationSpecs ?? [];
      if (specs.length === 0) {
        controllerRef.current = builder.play();
        forceRender((n) => n + 1);
        return;
      }

      const controller = createBuilderPlayback({
        builder,
        container,
        extendAdapter,
      });
      controller.load({
        version: 'viz-anim/1',
        tweens: specs.flatMap((s) => s.tweens),
      });
      controller.play();
      controllerRef.current = controller;
      forceRender((n) => n + 1);
    };

    if (autoPlay) {
      start();
    }

    return () => {
      controllerRef.current?.stop();
      controllerRef.current = null;

      // Ensure any internally-tracked playback gets stopped too.
      builder.play(container, []);
      container.innerHTML = '';
    };
  }, [builder, autoPlay, extendAdapter]);

  const play = () => {
    const container = containerRef.current;
    if (!container) return;

    controllerRef.current?.stop();

    if (!extendAdapter) {
      controllerRef.current = builder.play();
      forceRender((n) => n + 1);
      return;
    }

    const scene = builder.build();
    const specs = scene.animationSpecs ?? [];
    if (specs.length === 0) {
      controllerRef.current = builder.play();
      forceRender((n) => n + 1);
      return;
    }

    const controller = createBuilderPlayback({
      builder,
      container,
      extendAdapter,
    });
    controller.load({
      version: 'viz-anim/1',
      tweens: specs.flatMap((s) => s.tweens),
    });
    controller.play();
    controllerRef.current = controller;
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
