<template>
  <div ref="cesiumContainer" class="scene-container"></div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import * as Cesium from 'cesium'

const cesiumContainer = ref(null)
let viewer = null

const BEIJING_LNG = 116.397428
const BEIJING_LAT = 39.90923
const VIEW_HEIGHT = 5000

onMounted(async () => {
  const container = cesiumContainer.value
  if (!container) return

  // 创建 Viewer（先使用椭球地形确保地球显示）
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
    backgroundColor: new Cesium.Color(0.1, 0.2, 0.4, 1.0),
    // 关键：初始使用椭球地形，确保地球能正常显示
    terrainProvider: new Cesium.EllipsoidTerrainProvider()
  })

  // 移除默认影像图层
  viewer.imageryLayers.removeAll()

  // ========== 添加高德影像底图 ==========
  const gaodeImagery = new Cesium.UrlTemplateImageryProvider({
    url: 'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
    subdomains: ['1', '2', '3', '4'],
    maximumLevel: 18,
    credit: '高德地图'
  })
  viewer.imageryLayers.addImageryProvider(gaodeImagery)

  // 高德标注层
  const gaodeLabel = new Cesium.UrlTemplateImageryProvider({
    url: 'https://webst0{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}',
    subdomains: ['1', '2', '3', '4'],
    maximumLevel: 18,
    credit: '高德标注'
  })
  viewer.imageryLayers.addImageryProvider(gaodeLabel)

  // ========== 异步加载地形（不阻塞地球显示）==========
  await loadTerrainAsync()

  // ========== 设置相机视角 ==========
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(BEIJING_LNG, BEIJING_LAT, VIEW_HEIGHT),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-30),
      roll: 0
    }
  })

  // ========== 添加红色测试方块 ==========
  const redBox = viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(BEIJING_LNG, BEIJING_LAT, 200),
    box: {
      dimensions: new Cesium.Cartesian3(400, 400, 400),
      material: Cesium.Color.RED.withAlpha(0.8),
    },
    name: '测试方块'
  })
  console.log('红色方块已添加:', redBox)

  // 显示帧率
  viewer.scene.debugShowFramesPerSecond = true
  console.log('三维场景初始化完成')
})

// 异步加载地形（带完整错误处理）
async function loadTerrainAsync() {
  if (!viewer) return

  try {
    // 使用 fromUrl 异步创建地形提供者（Cesium 1.104+ 推荐）
    const terrainProvider = await Cesium.CesiumTerrainProvider.fromUrl(
        "https://www.supermapol.com/realspace/services/3D-ZF_normal/rest/realspace/datas/srtm_54_07@zhufeng",
        {
          requestWaterMask: true,
          requestVertexNormals: true
        }
    )

    // 监听地形错误事件（关键：防止加载失败后地球消失）
    terrainProvider.errorEvent.addEventListener((error) => {
      console.warn('地形服务错误，降级到椭球地形:', error)
      viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider()
    })

    // 成功加载后切换地形
    viewer.terrainProvider = terrainProvider
    console.log('SuperMap 地形加载成功')

  } catch (error) {
    console.error('地形服务加载失败，保持使用椭球地形:', error)
    // 保持默认椭球地形，不阻塞场景
  }
}

onBeforeUnmount(() => {
  if (viewer) {
    viewer.destroy()
    viewer = null
  }
})
</script>

<style scoped>
.scene-container {
  width: 100%;
  height: 100vh;
  overflow: hidden;
  position: absolute;
  top: 0;
  left: 0;
}
</style>