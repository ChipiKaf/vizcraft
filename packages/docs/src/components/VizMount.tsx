import React, { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { type PlaybackController, viz } from 'vizcraft';

type VizBuilder = ReturnType<typeof viz>;

interface VizMountProps {
  builder: VizBuilder;
  className?: string;
  style?: CSSProperties;
  /** Extra CSS injected into the mounted SVG via `builder.mount(container, { css })`. */
  css?: string | string[];
  /** If true, calls `builder.mount(container, { autoplay: true })`. */
  autoplay?: boolean;
  /** If true, calls `builder.play()` after mount (no-op if no specs). */
  play?: boolean;
}

export default function VizMount({
  builder,
  className,
  style,
  css,
  autoplay,
  play,
}: VizMountProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let controller: PlaybackController | null = null;

    const mountOpts = autoplay
      ? ({ autoplay: true, ...(css ? { css } : {}) } as const)
      : css
        ? ({ css } as const)
        : undefined;

    builder.mount(container, mountOpts as never);

    if (play && !autoplay) {
      controller = builder.play();
    }

    return () => {
      controller?.stop();

      // If autoplay was used, we don't have a handle to the controller.
      // Stop any prior playback for this container via a safe no-op load.
      if (autoplay) builder.play(container, []);
      container.innerHTML = '';
    };
  }, [builder, autoplay, play, css]);

  return <div ref={containerRef} className={className} style={style} />;
}
