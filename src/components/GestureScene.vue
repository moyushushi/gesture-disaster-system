<template>
  <div ref="cesiumContainer" class="scene-container">
    <div v-if="loadError" class="error-overlay"> {{ loadError }}</div>
    <div v-if="loading" class="loading-overlay"> 加载三维场景中...</div>
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

function addTestBuildings() {
  if (!viewer) return
  const centerLon = 119.72
  const centerLat = 30.23
  const radius = 0.008
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

async function loadRoads() {
  try {
    const response = await fetch('src/data/result_clip.json')
    if (response.ok) {
      const geojson = await response.json()
      if (geojson.features && geojson.features.length) {
        if (window.loadRoads) {
          window.loadRoads(geojson.features)
          console.log(`道路数据加载成功，共 ${geojson.features.length} 条道路`)
        }
      }
    } else {
      console.warn('道路数据文件不存在，道路淹没统计将不可用')
    }
  } catch (e) {
    console.warn('道路数据加载失败', e)
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
// 创建 Viewer,设置 preserveDrawingBuffer: true 以截图
  try {
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
      contextOptions: {
        webgl: {
          preserveDrawingBuffer: true,  // 关键：允许截图
          alpha: true
        }
      }
    })

    // 移除默认底图
    viewer.imageryLayers.removeAll()

    // 加载高德影像底图
    const gaodeImagery = new Cesium.UrlTemplateImageryProvider({
      url: 'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
      subdomains: ['1', '2', '3', '4'],
      maximumLevel: 18,
      credit: '高德地图'
    })
    viewer.imageryLayers.addImageryProvider(gaodeImagery);

    if (config.getSuperMapBaseMapUrl()) {
      try {
        const localImagery = new Cesium.SuperMapImageryProvider({
          url: config.getSuperMapBaseMapUrl()
        });
        const localLayer = viewer.imageryLayers.addImageryProvider(localImagery);
        localLayer.brightness = 1.8;   // 亮度提升
        localLayer.contrast = 1.3;     // 对比度提升
        localLayer.gamma = 0.9;
        // localLayer.alpha = 0.8;
        console.log('本地影像服务已叠加至高德底图之上');
      } catch (error) {
        console.error('本地影像服务加载失败', error);
      }
    }

    // 相机视角
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(119.72, 30.23, 1000),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-30),
        roll: 0,
      },
    })
    viewer.scene.globe.enableLighting = true

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

    // 地形服务
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
        console.log(' 地形服务加载中...')
      } catch (err) {
        console.warn(' 地形初始化失败，使用默认地形:', err)
        viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider()
      }
    }

    addTestBuildings()
    loading.value = false
    console.log('三维场景初始化成功')

    loadRoads()
    window.viewer = viewer

    onBeforeUnmount(() => {
      window.removeEventListener('resize', handleResize)
      if (viewer) {
        viewer.destroy()
        viewer = null
        window.viewer = null
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