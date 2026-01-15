import { viz } from 'vizcraft';
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div>
    <h1>VizCraft Animation Demo</h1>
    <div id="viz-container" style="width: 800px; height: 600px; border: 1px solid #ccc;"></div>
    <div style="margin-top: 10px;">
      <button id="btn-reset">Reset</button>
      <button id="btn-move">Move Node B</button>
      <button id="btn-opacity">Fade Node A</button>
      <button id="btn-edge">Animate Edge</button>
    </div>
  </div>
`;

const container = document.getElementById('viz-container')!;
const builder = viz().view(800, 600);

// Initial Setup
const setupScene = () => {
  builder.node('a').at(100, 300).circle(30).label('A');
  builder.node('b').at(400, 300).rect(60, 60).label('B');
  builder.edge('a', 'b').arrow();
  builder.mount(container);
};

setupScene();

// Manual Runtime Updates
const scene = builder.build();
const nodeA = scene.nodes.find((n) => n.id === 'a')!;
const nodeB = scene.nodes.find((n) => n.id === 'b')!;
const edgeAB = scene.edges.find((e) => e.id === 'a->b')!;

document.getElementById('btn-reset')?.addEventListener('click', () => {
  nodeA.runtime = undefined;
  nodeB.runtime = undefined;
  edgeAB.runtime = undefined;
  builder.patchRuntime(container);
});

document.getElementById('btn-move')?.addEventListener('click', () => {
  // Move B to (400, 500)
  nodeB.runtime = { x: 400, y: 500 };
  builder.patchRuntime(container);
});

document.getElementById('btn-opacity')?.addEventListener('click', () => {
  nodeA.runtime = { ...nodeA.runtime, opacity: 0.2 };
  builder.patchRuntime(container);
});

document.getElementById('btn-edge')?.addEventListener('click', () => {
  edgeAB.runtime = {
    opacity: 0.5,
    strokeDashoffset: 10,
  };
  builder.patchRuntime(container);
});
