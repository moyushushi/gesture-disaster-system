<template>
  <div ref="cesiumContainer" class="scene-container">
    <div v-if="loadError" class="error-overlay">❌ {{ loadError }}</div>
    <div v-if="loading" class="loading-overlay">🌍 加载三维场景中...</div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { config } from '../config/gis-platform'

const Cesium = window.Cesium
const cesiumContainer = ref(null)
const loadError = ref('')
const loading = ref(true)
let viewer = null

const getViewer = () => viewer
defineExpose({ getViewer })

// 替换 addTestBuildings 函数
function addTestBuildings() {
  if (!viewer) return
  // 临安区中心附近坐标
  const centerLon = 119.72
  const centerLat = 30.23
  const radius = 0.008   // 约 800 米
  const heights = [20, 35, 50, 28, 42, 33, 55, 18, 27, 44, 38, 22]
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2
    const lon = centerLon + radius * Math.cos(angle)
    const lat = centerLat + radius * Math.sin(angle)
    const height = heights[i % heights.length]
    viewer.entities.add({
      name: 'building',
      position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
      box: {
        dimensions: new Cesium.Cartesian3(15, 15, height),
        material: Cesium.Color.BLUE.withAlpha(0.8),
        outline: true,
        outlineColor: Cesium.Color.WHITE,
      },
      properties: {
        baseHeight: 0,
        topHeight: height,
      }
    })
  }
}
onMounted(() => {
  const container = cesiumContainer.value
  if (!container) {
    loadError.value = '容器元素未找到'
    loading.value = false
    return
  }
  if (!window.Cesium) {
    loadError.value = 'Cesium 库加载失败，请检查网络'
    loading.value = false
    return
  }

  try {
    // 1. 创建 Viewer
    viewer = new Cesium.Viewer(container, {
      animation: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      vrButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: false,
      navigationHelpButton: false,
      shadows: true,
      terrainProvider: new Cesium.EllipsoidTerrainProvider(),
      // backgroundColor: new Cesium.Color(0.1, 0.2, 0.4, 1.0)  // 取消注释可恢复星空
    })

    // 移除默认 Bing 底图
    viewer.imageryLayers.removeAll()

    // ===== 2. 仅加载高德影像底图（无标注）=====
    const gaodeImagery = new Cesium.UrlTemplateImageryProvider({
      url: 'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
      subdomains: ['1', '2', '3', '4'],
      maximumLevel: 18,
      credit: '高德地图'
    })
    viewer.imageryLayers.addImageryProvider(gaodeImagery)
    // 不添加任何标注层

    // ===== 3. 相机视角（临安区）=====
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(119.72, 30.23, 500),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-30),
        roll: 0,
      },
    })
    viewer.scene.globe.enableLighting = true

    // 强制调整 canvas 尺寸
    requestAnimationFrame(() => {
      setTimeout(() => {
        viewer.resize()
        const canvas = viewer.canvas
        if (canvas) {
          canvas.style.width = '100%'
          canvas.style.height = '100%'
        }
        viewer.resize()
        console.log('Cesium canvas 尺寸已强制调整')
      }, 100)
    })

    const handleResize = () => {
      if (viewer) viewer.resize()
    }
    window.addEventListener('resize', handleResize)

    // ===== 4. 地形服务 =====
    if (config.isSuperMap() && config.getTerrainUrl()) {
      try {
        const terrainUrl = config.getTerrainUrl()
        console.log('地形服务地址:', terrainUrl)

        const terrainProvider = new Cesium.CesiumTerrainProvider({
          url: terrainUrl,
          isSct: true,
          requestVertexNormals: true,
          requestWaterMask: false,
        })

        terrainProvider.errorEvent.addEventListener((err) => {
          console.warn('地形服务加载失败，使用默认地形:', err)
          viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider()
        })

        viewer.terrainProvider = terrainProvider
        console.log('✅ 地形服务加载中...')
      } catch (err) {
        console.warn('❌ 地形初始化失败，使用默认地形:', err)
        viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider()
      }
    }

    addTestBuildings()
    loading.value = false
    console.log('三维场景初始化成功')

    onBeforeUnmount(() => {
      window.removeEventListener('resize', handleResize)
      if (viewer) {
        viewer.destroy()
        viewer = null
      }
    })

  } catch (err) {
    console.error(err)
    loadError.value = `初始化失败: ${err.message}`
    loading.value = false
  }
})
</script>

<style scoped>
.scene-container {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
  min-width: 100vw;
  min-height: 100vh;
}
.scene-container :deep(.cesium-widget) {
  width: 100% !important;
  height: 100% !important;
}
.scene-container :deep(canvas) {
  width: 100% !important;
  height: 100% !important;
}
.error-overlay, .loading-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0,0,0,0.8);
  color: #fff;
  padding: 20px;
  border-radius: 8px;
  z-index: 10;
  text-align: center;
}
</style>