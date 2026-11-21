import { fileURLToPath } from 'node:url';

export default {
  base: './',
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        hanuman: fileURLToPath(new URL('./hanuman.html', import.meta.url)),
      },
    },
  },
  esbuild: { target: 'esnext' },
  optimizeDeps: { esbuildOptions: { target: 'esnext' } },
};
