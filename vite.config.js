import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import cesium from 'vite-plugin-cesium'
// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(),cesium()],
  define: {
    CESIUM_BASE_URL: JSON.stringify('/node_modules/cesium/Build/Cesium/')
  },
  optimizeDeps: {
    include: ['cesium', '@supermap/vue-iclient3d-webgl']
  },
  build:{
    outDir: 'docs',
    emptyOutDir: true,
    assetsDir: 'static',
  },
  assetsInclude: ['**/*.cur'],
  base:'/gesture-disaster-system/'
})
