import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    animation: 'src/animation/index.ts',
    interaction: 'src/interaction/index.ts',
    layout: 'src/layout/index.ts',
    serialization: 'src/serialization/index.ts',
    ports: 'src/ports/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: true,
  clean: true,
  minify: true,
  treeshake: true,
  target: 'es2024',
  outDir: 'dist',
});
