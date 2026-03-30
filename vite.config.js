import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  build:{
    outDir: 'docs',
    emptyOutDir: true,
    assetsDir: 'static',
  },resolve: {
    alias: {
      'three': 'three/build/three.module.js'
    }
  },
  assetsInclude: ['**/*.cur'],
  base:'/moyushushi.git.io/gesture-disaster-system/'
})
