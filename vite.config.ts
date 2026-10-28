import { defineConfig } from 'vite';

// base relativa ('./') faz o build funcionar em qualquer subcaminho do GitHub Pages
// (https://usuario.github.io/nome-do-repositorio/) sem configurar o nome do repositório.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        // Phaser fica num arquivo separado: muda pouco e fica em cache entre versões do jogo.
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
  server: {
    host: true,
  },
});
