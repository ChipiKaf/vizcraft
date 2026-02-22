import { describe, it, expect } from 'vitest';
import { viz } from '../src/builder';
import { serializeScene, deserializeScene } from '../src/serialization';

describe('Serialization and Deserialization', () => {
  it('should serialize a scene by preserving primitive data and stripping functions', () => {
    // 1. Build a scene with some non-serializable properties
    const originalBuilder = viz()
      .view(500, 500)
      .grid(5, 5, { x: 10, y: 10 })
      .node('n1')
      .at(100, 100)
      .onClick(() => console.log('clicked n1'))
      .done()
      .node('n2')
      .at(200, 200)
      .done()
      .edge('n1', 'n2')
      .onClick(() => console.log('clicked edge'))
      .done();

    originalBuilder.animate((anim) => {
      anim.node('n1').to({ x: 150 }, { duration: 1000 });
    });

    const originalScene = originalBuilder.build();

    // 2. Serialize
    const serialized = serializeScene(originalScene);

    // Assert basics
    expect(serialized.version).toBe('vizcraft/1');
    expect(serialized.viewBox).toEqual({ w: 500, h: 500 });
    expect(serialized.grid?.cols).toBe(5);

    // Nodes
    expect(serialized.nodes).toHaveLength(2);
    // Should still have id and pos
    expect(serialized.nodes[0].id).toBe('n1');
    expect(serialized.nodes[0].pos).toEqual({ x: 100, y: 100 });
    // Should NOT have onClick function
    expect(serialized.nodes[0].onClick).toBeUndefined();

    // Edges
    expect(serialized.edges).toHaveLength(1);
    expect(serialized.edges[0].from).toBe('n1');
    expect(serialized.edges[0].to).toBe('n2');
    // Should NOT have onClick function
    expect(serialized.edges[0].onClick).toBeUndefined();

    // AnimationSpecs
    expect(serialized.animationSpecs).toHaveLength(1);
    expect(serialized.animationSpecs![0].tweens[0].target).toBe('node:n1');
  });

  it('should deserialize a valid payload back to a VizScene', () => {
    const rawPayload = {
      version: 'vizcraft/1',
      viewBox: { w: 1000, h: 800 },
      nodes: [
        { id: 'test', pos: { x: 50, y: 50 }, shape: { kind: 'circle', r: 10 } },
      ],
      edges: [],
    };

    const scene = deserializeScene(rawPayload);
    expect(scene.viewBox).toEqual({ w: 1000, h: 800 });
    expect(scene.nodes).toHaveLength(1);
    expect(scene.nodes[0].id).toBe('test');
    expect(scene.edges).toHaveLength(0);
  });

  it('should throw Error when deserializing an invalid payload', () => {
    // Missing viewBox
    expect(() =>
      deserializeScene({
        version: 'vizcraft/1',
        nodes: [],
        edges: [],
      })
    ).toThrowError(/missing or invalid viewBox/);

    // Unsupported version
    expect(() =>
      deserializeScene({
        version: 'vizcraft/2',
        viewBox: { w: 100, h: 100 },
        nodes: [],
        edges: [],
      })
    ).toThrowError(/unsupported version/);
  });

  it('can hydrate a builder from a scene via `.fromScene()`', () => {
    const originalScene = viz()
      .view(300, 300)
      .node('a')
      .at(10, 10)
      .done()
      .node('b')
      .at(20, 20)
      .done()
      .edge('a', 'b')
      .done()
      .build();

    const serialized = serializeScene(originalScene);

    // Let's pretend we saved it to LocalStorage and parsed it
    const parsedPayload = JSON.parse(JSON.stringify(serialized));
    const loadedScene = deserializeScene(parsedPayload);

    // 3. Hydrate a new builder
    const hydratedBuilder = viz().fromScene(loadedScene);

    // You can modify it after hydration
    hydratedBuilder.node('c').at(30, 30);
    hydratedBuilder.edge('b', 'c');

    const finalScene = hydratedBuilder.build();

    expect(finalScene.viewBox).toEqual({ w: 300, h: 300 });
    expect(finalScene.nodes).toHaveLength(3);
    expect(finalScene.edges).toHaveLength(2);
    expect(finalScene.nodes[0].id).toBe('a');
    expect(finalScene.nodes[2].id).toBe('c');
  });
});
