import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default defineConfig(({ mode }) => {
    console.log(`当前构建模式: ${mode}`)
    return {
        plugins: [
            vue(),
            viteStaticCopy({
                targets: [
                    {

                        src: 'node_modules/@supermap/iclient3d-webgl/Cesium/**/*',
                        dest: 'cesium'
                    }
                ]
            })
        ],
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