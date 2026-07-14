/**
 * @vitest-environment jsdom
 *
 * MountController click subscription + DOM CustomEvent surface.
 *
 * Verifies that clicks on nodes and edges fire for every element — not just
 * those built with an explicit fluent `.onClick()` handler — so embeds and
 * `fromSpec`-hydrated scenes can wire up click behaviour without touching
 * the SVG internals.
 */
import { describe, expect, it } from 'vitest';
import { fromSpec } from './fromSpec';
import { viz } from './builder';
import type { VizNodeClickEvent, VizEdgeClickEvent } from './types';

function mount(builderFn: () => ReturnType<typeof viz>) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const controller = builderFn().mount(container);
  return { container, controller };
}

describe('MountController.onNodeClick / vizcraft:node-click', () => {
  it('fires on every node click even when no fluent onClick was set', () => {
    const { container, controller } = mount(() =>
      fromSpec({
        view: { width: 400, height: 200 },
        nodes: [
          { id: 'a', x: 80, y: 100 },
          { id: 'b', x: 300, y: 100 },
        ],
      })
    );

    const seen: string[] = [];
    controller.onNodeClick((e) => seen.push(e.id));

    const nodeA = container.querySelector('[data-id="a"]');
    expect(nodeA).not.toBeNull();
    nodeA!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(seen).toEqual(['a']);
    container.remove();
  });

  it('exposes the full VizNode and original MouseEvent in the payload', () => {
    const { container, controller } = mount(() =>
      fromSpec({
        view: { width: 400, height: 200 },
        nodes: [{ id: 'a', label: 'A', x: 80, y: 100 }],
      })
    );

    let payload: VizNodeClickEvent | null = null;
    controller.onNodeClick((e) => (payload = e));

    container
      .querySelector('[data-id="a"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // Assertions on the captured payload — cast once for narrowing.
    const captured = payload as VizNodeClickEvent | null;
    expect(captured).not.toBeNull();
    expect(captured!.id).toBe('a');
    expect(captured!.node.label?.text).toBe('A');
    expect(captured!.originalEvent).toBeInstanceOf(MouseEvent);
    container.remove();
  });

  it('bubbles a vizcraft:node-click CustomEvent up to the SVG root', () => {
    const { container } = mount(() =>
      fromSpec({
        view: { width: 400, height: 200 },
        nodes: [{ id: 'a', x: 80, y: 100 }],
      })
    );
    const svg = container.querySelector('svg')!;

    const seen: string[] = [];
    svg.addEventListener('vizcraft:node-click', ((e: Event) => {
      seen.push((e as CustomEvent<VizNodeClickEvent>).detail.id);
    }) as EventListener);

    container
      .querySelector('[data-id="a"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(seen).toEqual(['a']);
    container.remove();
  });

  it('still calls the fluent onClick handler when one is attached', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const seenFluent: string[] = [];
    const seenSubscription: string[] = [];

    const controller = viz()
      .view(400, 200)
      .node('a')
      .at(80, 100)
      .rect(80, 40)
      .onClick((id) => seenFluent.push(id))
      .done()
      .mount(container);

    controller.onNodeClick((e) => seenSubscription.push(e.id));

    container
      .querySelector('[data-id="a"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(seenFluent).toEqual(['a']);
    expect(seenSubscription).toEqual(['a']);
    container.remove();
  });

  it('unsubscribes when the returned function is called', () => {
    const { container, controller } = mount(() =>
      fromSpec({
        view: { width: 400, height: 200 },
        nodes: [{ id: 'a', x: 80, y: 100 }],
      })
    );

    const seen: string[] = [];
    const unsubscribe = controller.onNodeClick((e) => seen.push(e.id));

    container
      .querySelector('[data-id="a"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    unsubscribe();
    container
      .querySelector('[data-id="a"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(seen).toEqual(['a']);
    container.remove();
  });
});

describe('MountController.onEdgeClick / vizcraft:edge-click', () => {
  it('fires on every edge click even without an explicit hitArea', () => {
    const { container, controller } = mount(() =>
      fromSpec({
        view: { width: 400, height: 200 },
        nodes: [
          { id: 'a', x: 80, y: 100 },
          { id: 'b', x: 300, y: 100 },
        ],
        edges: [{ from: 'a', to: 'b' }],
      })
    );

    let payload: VizEdgeClickEvent | null = null;
    controller.onEdgeClick((e) => (payload = e));

    const hit = container.querySelector('[data-viz-role="edge-hit"]');
    expect(hit).not.toBeNull();
    hit!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const captured = payload as VizEdgeClickEvent | null;
    expect(captured).not.toBeNull();
    expect(captured!.id).toBe('a->b');
    expect(captured!.edge.from).toBe('a');
    container.remove();
  });

  it('bubbles a vizcraft:edge-click CustomEvent on the SVG root', () => {
    const { container } = mount(() =>
      fromSpec({
        view: { width: 400, height: 200 },
        nodes: [
          { id: 'a', x: 80, y: 100 },
          { id: 'b', x: 300, y: 100 },
        ],
        edges: [{ from: 'a', to: 'b' }],
      })
    );
    const svg = container.querySelector('svg')!;
    const seen: string[] = [];
    svg.addEventListener('vizcraft:edge-click', ((e: Event) => {
      seen.push((e as CustomEvent<VizEdgeClickEvent>).detail.id);
    }) as EventListener);

    container
      .querySelector('[data-viz-role="edge-hit"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(seen).toEqual(['a->b']);
    container.remove();
  });
});
