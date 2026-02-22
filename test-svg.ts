import { viz } from './packages/core/src/index';

const scene = viz()
  .view(600, 260)
  .node('n1')
  .at(100, 60)
  .rect(140, 80)
  .label('Manual\nLine\nBreaks', { lineHeight: 1.4, fontSize: 13, fontWeight: 'bold' })
  .node('n2')
  .at(300, 60)
  .circle(50)
  .label('This long text automatically wraps to fit the shape', { maxWidth: 80, fontSize: 11 })
  .done();

console.log(scene.svg());
