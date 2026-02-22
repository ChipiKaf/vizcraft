import React, { useRef, useState, useEffect } from 'react';
import { viz, hitTest, HitResult, hitTestRect } from 'vizcraft';
import type { VizScene } from 'vizcraft';

export default function HitTestingDemo() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState<VizScene | null>(null);
  const [hoverResult, setHoverResult] = useState<HitResult>(null);
  const [selection, setSelection] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const [selectedItems, setSelectedItems] = useState<
    Array<{ type: 'node' | 'edge'; id: string }>
  >([]);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(
    null
  );
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(
    null
  );

  useEffect(() => {
    // Build a demo scene
    const builder = viz();
    const s = builder
      .node('db', {
        at: { x: 100, y: 100 },
        cylinder: { w: 80, h: 100 },
        fill: '#3b82f6',
        label: 'Database',
        ports: [{ id: 'out', offset: { x: 40, y: 0 } }],
      })
      .node('api', {
        at: { x: 300, y: 100 },
        rect: { w: 100, h: 60, rx: 8 },
        fill: '#10b981',
        label: 'REST API',
        ports: [
          { id: 'in', offset: { x: -50, y: 0 } },
          { id: 'out-1', offset: { x: 50, y: -15 } },
          { id: 'out-2', offset: { x: 50, y: 15 } },
        ],
      })
      .node('client1', {
        at: { x: 500, y: 50 },
        rect: { w: 90, h: 40, rx: 20 },
        fill: '#f59e0b',
        label: 'Web App',
      })
      .node('client2', {
        at: { x: 500, y: 150 },
        rect: { w: 90, h: 40, rx: 20 },
        fill: '#8b5cf6',
        label: 'Mobile',
      })
      .edge('db', 'api', {
        id: 'e1',
        fromPort: 'out',
        toPort: 'in',
        stroke: { color: '#94a3b8', width: 2 },
        arrow: true,
      })
      .edge('api', 'client1', {
        id: 'e2',
        fromPort: 'out-1',
        routing: 'curved',
        stroke: { color: '#94a3b8', width: 2 },
        arrow: true,
      })
      .edge('api', 'client2', {
        id: 'e3',
        fromPort: 'out-2',
        routing: 'curved',
        stroke: { color: '#94a3b8', width: 2 },
        arrow: true,
      })
      .build();

    if (mountRef.current) {
      builder.mount(mountRef.current);
    }
    setScene(s);

    return () => {
      if (mountRef.current) mountRef.current.innerHTML = '';
    };
  }, []);

  const getSceneCoord = (e: React.MouseEvent | React.PointerEvent) => {
    if (!mountRef.current) return { x: 0, y: 0 };
    const svg = mountRef.current.querySelector('svg');
    if (!svg) return { x: 0, y: 0 };

    const rect = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;

    // Calculate the scale and offset based on preserveAspectRatio="xMidYMid meet"
    const scale = Math.min(
      rect.width / viewBox.width,
      rect.height / viewBox.height
    );
    const renderWidth = viewBox.width * scale;
    const renderHeight = viewBox.height * scale;

    // SVG is centered in the container
    const offsetX = (rect.width - renderWidth) / 2;
    const offsetY = (rect.height - renderHeight) / 2;

    const mouseX = e.clientX - rect.left - offsetX;
    const mouseY = e.clientY - rect.top - offsetY;

    return {
      x: mouseX / scale,
      y: mouseY / scale,
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!scene) return;
    const pt = getSceneCoord(e);
    setMousePos(pt);

    if (dragStart) {
      // Dragging rubber-band
      setHoverResult(null);
      const x = Math.min(dragStart.x, pt.x);
      const y = Math.min(dragStart.y, pt.y);
      const w = Math.abs(pt.x - dragStart.x);
      const h = Math.abs(pt.y - dragStart.y);
      setSelection({ x, y, w, h });
      setSelectedItems(hitTestRect(scene, { x, y, w, h }));
    } else {
      // Hovering detect
      const hit = hitTest(scene, pt, { edgeTolerance: 6, portTolerance: 15 });
      setHoverResult(hit);
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    const pt = getSceneCoord(e);
    setDragStart(pt);
    setSelection({ x: pt.x, y: pt.y, w: 0, h: 0 });
    setSelectedItems([]);

    // Required to capture events outside div bounds if dragging far
    if (wrapperRef.current) {
      wrapperRef.current.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setDragStart(null);
    setSelection(null);
    setSelectedItems([]);
    if (wrapperRef.current) {
      wrapperRef.current.releasePointerCapture(e.pointerId);
    }
  };

  // Effect to apply styling updates on interaction without React reconciliation of SVG
  useEffect(() => {
    if (!scene || !mountRef.current) return;

    // Apply visual feedback based on hit tests
    const displayScene = {
      ...scene,
      nodes: [...scene.nodes],
      edges: [...scene.edges],
    };

    if (hoverResult) {
      if (hoverResult.type === 'node') {
        const nIndex = displayScene.nodes.findIndex(
          (n) => n.id === hoverResult.id
        );
        if (nIndex >= 0) {
          displayScene.nodes[nIndex] = {
            ...displayScene.nodes[nIndex]!,
            style: {
              ...displayScene.nodes[nIndex]!.style,
              stroke: '#ef4444',
              strokeWidth: 3,
            },
          };
        }
      } else if (hoverResult.type === 'edge') {
        const eIndex = displayScene.edges.findIndex(
          (e) => e.id === hoverResult.id
        );
        if (eIndex >= 0) {
          displayScene.edges[eIndex] = {
            ...displayScene.edges[eIndex]!,
            style: {
              ...displayScene.edges[eIndex]!.style,
              stroke: '#ef4444',
              strokeWidth: 4,
            },
          };
        }
      }
    }

    // Highlight selected items
    for (const item of selectedItems) {
      if (item.type === 'node') {
        const nIndex = displayScene.nodes.findIndex((n) => n.id === item.id);
        if (nIndex >= 0) {
          displayScene.nodes[nIndex] = {
            ...displayScene.nodes[nIndex]!,
            style: {
              ...displayScene.nodes[nIndex]!.style,
              stroke: '#6366f1',
              strokeWidth: 3,
            },
          };
        }
      } else if (item.type === 'edge') {
        const eIndex = displayScene.edges.findIndex((e) => e.id === item.id);
        if (eIndex >= 0) {
          displayScene.edges[eIndex] = {
            ...displayScene.edges[eIndex]!,
            style: {
              ...displayScene.edges[eIndex]!.style,
              stroke: '#6366f1',
              strokeWidth: 3,
            },
          };
        }
      }
    }

    viz().fromScene(displayScene).commit(mountRef.current);
  }, [scene, hoverResult, selectedItems]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div
        ref={wrapperRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={{
          width: '100%',
          height: '300px',
          border: '1px solid var(--ifm-color-emphasis-300)',
          borderRadius: '8px',
          position: 'relative',
          overflow: 'hidden',
          cursor: dragStart ? 'crosshair' : hoverResult ? 'pointer' : 'default',
          touchAction: 'none',
        }}
      >
        <div
          ref={mountRef}
          style={{ width: '100%', height: '100%', position: 'absolute' }}
        />

        {/* Draw selection rectangle overlay (converted to viewBox space) */}
        {selection &&
          selection.w > 0 &&
          selection.h > 0 &&
          mountRef.current?.querySelector('svg') &&
          (() => {
            const svg = mountRef.current.querySelector('svg')!;
            const rect = svg.getBoundingClientRect();
            const viewBox = svg.viewBox.baseVal;
            const scale = Math.min(
              rect.width / viewBox.width,
              rect.height / viewBox.height
            );

            const renderWidth = viewBox.width * scale;
            const renderHeight = viewBox.height * scale;
            const offsetX = (rect.width - renderWidth) / 2;
            const offsetY = (rect.height - renderHeight) / 2;

            return (
              <div
                style={{
                  position: 'absolute',
                  left: selection.x * scale + offsetX,
                  top: selection.y * scale + offsetY,
                  width: selection.w * scale,
                  height: selection.h * scale,
                  backgroundColor: 'rgba(99, 102, 241, 0.2)',
                  border: '1px solid rgba(99, 102, 241, 0.8)',
                  pointerEvents: 'none',
                }}
              />
            );
          })()}

        {/* Draw port hover dot indicator overlay */}
        {hoverResult?.type === 'port' &&
          mountRef.current?.querySelector('svg') &&
          (() => {
            const svg = mountRef.current.querySelector('svg')!;
            const rect = svg.getBoundingClientRect();
            const viewBox = svg.viewBox.baseVal;
            const scale = Math.min(
              rect.width / viewBox.width,
              rect.height / viewBox.height
            );

            const renderWidth = viewBox.width * scale;
            const renderHeight = viewBox.height * scale;
            const offsetX = (rect.width - renderWidth) / 2;
            const offsetY = (rect.height - renderHeight) / 2;

            return (
              <div
                style={{
                  position: 'absolute',
                  left: hoverResult.position.x * scale + offsetX - 6,
                  top: hoverResult.position.y * scale + offsetY - 6,
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  backgroundColor: '#ef4444',
                  border: '2px solid white',
                  pointerEvents: 'none',
                }}
              />
            );
          })()}
      </div>

      <div
        style={{
          padding: '1rem',
          backgroundColor: 'var(--ifm-color-emphasis-100)',
          borderRadius: '8px',
          fontSize: '0.9rem',
        }}
      >
        <strong>Status:</strong>{' '}
        {dragStart ? (
          `Dragging Selection Rect: ${selectedItems.length} items selected`
        ) : hoverResult ? (
          <>
            Hovering{' '}
            <span style={{ color: '#ef4444', fontWeight: 'bold' }}>
              {hoverResult.type}
            </span>{' '}
            (ID:{' '}
            {'nodeId' in hoverResult
              ? `${hoverResult.nodeId}:${hoverResult.portId}`
              : hoverResult.id}
            )
          </>
        ) : (
          'Move mouse over items or click and drag to select.'
        )}
      </div>
    </div>
  );
}
