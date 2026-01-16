import { playAnimationSpec, viz } from 'vizcraft';
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
      <span style="margin: 0 10px;">|</span>
      <button id="btn-play-spec">Play AnimationSpec</button>
      <button id="btn-pause-spec">Pause</button>
      <button id="btn-resume-spec">Resume</button>
      <button id="btn-stop-spec">Stop</button>
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

let activeController: ReturnType<typeof playAnimationSpec> | null = null;

document.getElementById('btn-reset')?.addEventListener('click', () => {
  activeController?.stop();
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

// Data-only AnimationSpec playback
document.getElementById('btn-play-spec')?.addEventListener('click', () => {
  activeController?.stop();

  const spec = builder.animate((anim) =>
    anim
      .node('a')
      .to({ x: 200, opacity: 0.3 }, { duration: 600 })
      .node('b')
      .to({ x: 500, y: 450 }, { duration: 700 })
      .edge('a->b')
      .to({ strokeDashoffset: -100 }, { duration: 1000 })
  );

  activeController = playAnimationSpec({ builder, container, spec });
});

document.getElementById('btn-pause-spec')?.addEventListener('click', () => {
  activeController?.pause();
});

document.getElementById('btn-resume-spec')?.addEventListener('click', () => {
  activeController?.play();
});

document.getElementById('btn-stop-spec')?.addEventListener('click', () => {
  activeController?.stop();
});
