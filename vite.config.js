import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: '/rameau-jazz-web/',
  server: {
    port: 3000
  },
  build: {
    outDir: 'dist'
  }
})
