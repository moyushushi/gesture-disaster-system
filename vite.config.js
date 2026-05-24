import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig(({ mode }) => {
   console.log(`当前构建模式: ${mode}`)
   return {
  plugins: [vue()],
     resolve: {
       alias: {
         '@': path.resolve(__dirname, './src')
       }
     },
  server: {
    port: 5173,
    open: true
  },
  build: {
    outDir: 'docs',
    emptyOutDir: true,
    assetsDir: 'static',
  },
  base: '/gesture-disaster-system/'
}
})