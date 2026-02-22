import React, { useEffect, useRef, useState } from 'react';
import { viz, type VizBuilder } from 'vizcraft';

export default function MutationDemo() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const builderRef = useRef<VizBuilder>(viz().view(600, 300));
  const mountedRef = useRef(false);
  const [nodeCount, setNodeCount] = useState(2);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const builder = builderRef.current;

    // Initial scene setup
    builder
      .node('root')
      .at(100, 150)
      .circle(30)
      .fill('#f9e2af')
      .label('Root')
      .node('n1')
      .at(250, 150)
      .rect(80, 40)
      .fill('#9ccfd8')
      .label('Node 1')
      .edge('root', 'n1', { id: 'e-root-n1', arrow: true });

    builder.mount(container, { panZoom: true });
    mountedRef.current = true;

    return () => {
      container.innerHTML = '';
      mountedRef.current = false;
    };
  }, []);

  const handleAddNode = () => {
    if (!mountedRef.current || !containerRef.current) return;
    const builder = builderRef.current;
    const id = `n${nodeCount}`;
    const parentId = nodeCount === 2 ? 'n1' : `n${nodeCount - 1}`;

    builder.addNode({
      id,
      pos: {
        x: 250 + (nodeCount - 1) * 150,
        y: 150 + (Math.random() * 80 - 40),
      },
      shape: { kind: 'rect', w: 80, h: 40 },
      style: { fill: '#cba6f7', stroke: '#111', strokeWidth: 2 },
      label: { text: `Node ${nodeCount}` },
    });

    builder.addEdge({
      id: `e-${parentId}-${id}`,
      from: parentId,
      to: id,
      arrow: 'end',
      stroke: { color: '#666', width: 2 },
    });

    builder.commit(containerRef.current);
    setNodeCount((c) => c + 1);
  };

  const handleUpdateRoot = () => {
    if (!mountedRef.current || !containerRef.current) return;
    builderRef.current.updateNode('root', {
      style: {
        fill:
          '#' +
          Math.floor(Math.random() * 16777215)
            .toString(16)
            .padStart(6, '0'),
      },
      pos: { x: 100, y: 150 + (Math.random() * 60 - 30) },
    });
    builderRef.current.commit(containerRef.current);
  };

  const handleRemoveLast = () => {
    if (!mountedRef.current || !containerRef.current) return;
    if (nodeCount <= 2) return; // don't remove root or n1
    const idToRemove = `n${nodeCount - 1}`;
    builderRef.current.removeNode(idToRemove);
    // removeNode automatically cleans up edges connected to it inside builder!
    builderRef.current.commit(containerRef.current);
    setNodeCount((c) => c - 1);
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
        <button className="button button--primary" onClick={handleAddNode}>
          Add Node
        </button>
        <button className="button button--secondary" onClick={handleUpdateRoot}>
          Update Root
        </button>
        <button
          className="button button--danger"
          onClick={handleRemoveLast}
          disabled={nodeCount <= 2}
        >
          Remove Last
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
        }}
      />
    </div>
  );
}
