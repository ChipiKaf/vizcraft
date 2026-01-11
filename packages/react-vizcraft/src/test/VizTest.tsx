import { useMemo } from 'react';
import { viz, VizCanvas } from '../index';

export function VizTest() {
  const scene = useMemo(() => {
    return viz()
      .view(800, 600)
      .node('n1')
      .circle(30)
      .at(100, 100)
      .label('Start')
      .class('start-node')
      .node('n2')
      .rect(80, 40, 5)
      .at(300, 100)
      .label('Process')
      .class('process-node')
      .node('n3')
      .diamond(50, 50)
      .at(500, 100)
      .label('Decision')
      .class('decision-node')
      .edge('n1', 'n2')
      .label('Go')
      .arrow()
      .class('primary-link')
      .edge('n2', 'n3')
      .label('Check')
      .arrow()
      .class('primary-link')
      .build();
  }, []);

  const gridScene = useMemo(() => {
    return viz()
      .view(400, 300)
      .grid(3, 3) // 3x3 Grid
      .node('g1')
      .cell(0, 0)
      .circle(20)
      .label('0,0')
      .node('g2')
      .cell(1, 1)
      .rect(40, 40)
      .label('1,1')
      .node('g3')
      .cell(2, 2)
      .diamond(30, 30)
      .label('2,2')
      .edge('g1', 'g2')
      .arrow()
      .edge('g2', 'g3')
      .arrow()
      .build();
  }, []);

  return (
    <div style={{ display: 'flex', gap: 20 }}>
      <div style={{ width: 400, height: 300, border: '1px solid #ccc' }}>
        <h3>Manual Layout</h3>
        <VizCanvas scene={scene} />
      </div>
      <div style={{ width: 400, height: 300, border: '1px solid #ccc' }}>
        <h3>Grid Layout (3x3)</h3>
        <VizCanvas scene={gridScene} />
      </div>
      <style>{`
        .viz-node-shape { fill: #fff; stroke: #333; stroke-width: 2px; }
        .viz-edge { stroke: #666; stroke-width: 2px; }
        .viz-node-label, .viz-edge-label { font-family: sans-serif; font-size: 12px; fill: #333; }
        .start-node .viz-node-shape { stroke: green; }
        .process-node .viz-node-shape { stroke: blue; }
        .decision-node .viz-node-shape { stroke: orange; }
      `}</style>
    </div>
  );
}
