<template>
  <div class="gesture-container">
    <video ref="videoRef" autoplay muted playsinline class="gesture-video" :class="{ hidden: !showVideo }"></video>
    <canvas ref="canvasRef" class="draw-canvas"></canvas>

    <!-- 控制面板  -->
    <div class="control-panel">
      <!-- 摄像头 -->
      <div class="button-group">
        <span class="group-label">📷 摄像头</span>
        <button @click="startCamera" :disabled="cameraEnabled">打开</button>
        <button @click="stopCamera" :disabled="!cameraEnabled">关闭</button>
        <button @click="toggleVideo" :disabled="!cameraEnabled">{{ showVideo ? '隐藏视频' : '显示视频' }}</button>
      </div>

      <!-- 绘图工具 -->
      <div class="button-group">
        <span class="group-label">✏️ 绘图</span>
        <button @click="setTool('browse')" :class="{ active: currentTool === 'browse' }">🔍 浏览</button>
        <button @click="setTool('line')" :class="{ active: currentTool === 'line' }">✏️ 线</button>
        <button @click="setTool('circle')" :class="{ active: currentTool === 'circle' }">⭕ 圆</button>
        <button @click="setTool('place')" :class="{ active: currentTool === 'place' }">📍 点</button>
        <button @click="clearAllDrawings">🗑️ 清空</button>
      </div>

      <!-- 灾害分析 -->
      <div class="button-group">
        <span class="group-label">⚠️ 分析</span>
        <button @click="calculatePathWithSelection" :disabled="!viewerReady" :class="{ active: activeAnalysis === 'path' }">🗺️ 路径规划</button>
        <button @click="openFloodDialog" :disabled="!viewerReady" :class="{ active: activeAnalysis === 'flood' }">🌊 洪水模拟</button>
        <button @click="openImpactPanel" :disabled="!viewerReady" :class="{ active: activeAnalysis === 'impact' }">📊 影响评估</button>
      </div>

      <!-- 数据与截图 -->
      <div class="button-group">
        <span class="group-label">📁 工具</span>
        <button @click="exportGeoJSON">💾 导出GeoJSON</button>
        <button @click="importGeoJSON">📂 导入GeoJSON</button>
        <button @click="screenshot">📸 截图</button>
      </div>
    </div>

    <!-- 参数面板 -->
    <div class="params-panel">
      <h4> 手势参数</h4>
      <div class="param-row"><label>捏合阈值</label><input type="range" min="20" max="80" step="1" v-model.number="pinchDistanceThresh" /></div>
      <div class="param-row"><label>平滑因子</label><input type="range" min="0" max="0.95" step="0.01" v-model.number="smoothFactor" /></div>
      <div class="param-row"><label>拖尾长度</label><input type="range" min="5" max="40" step="1" v-model.number="trailMaxLen" /></div>
      <div class="param-row"><label>手势水位调节</label><span>{{ gestureWaterLevelEnabled ? '启用' : '未启用' }}</span></div>
      <div class="param-row"><label>当前水位(m)</label><span>{{ floodParams.waterLevel.toFixed(1) }}</span></div>
    </div>

    <!-- 路径规划结果面板 -->
    <div v-if="pathResult" class="path-result-panel">
      <div class="path-result-header">
        <span>路径规划结果</span>
        <button @click="pathResult = null" class="close-btn">✕</button>
      </div>
      <div class="path-result-content">
        <div>距离：{{ pathResult.distance }} 米</div>
        <div>徒步时间：{{ pathResult.timeStr }}</div>
        <div v-if="pathResult.safety" :class="pathResult.safety.includes('✅') ? 'safe' : 'unsafe'">
          {{ pathResult.safety }}
        </div>
      </div>
    </div>

    <!-- 洪水参数设置弹窗 -->
    <el-dialog v-model="floodDialogVisible" title="洪水模拟参数" width="420px" :modal="true" :append-to-body="true" @close="onFloodDialogClose">
      <el-form :model="floodParams" label-width="160px">
        <el-form-item label="相对平均地面水深(m)">
          <el-input-number v-model="floodParams.waterLevel" :min="0" :max="30" :step="0.5" />
        </el-form-item>
        <el-form-item label="水位上涨速率(m/h)">
          <el-input-number v-model="floodParams.riseRate" :min="0" :max="10" :step="0.2" />
        </el-form-item>
        <el-form-item label="危险水深(m)">
          <el-input-number v-model="floodParams.dangerDepth" :min="0.1" :max="5" :step="0.1" />
        </el-form-item>
        <el-form-item label="模拟区域">
          <el-radio-group v-model="floodParams.region">
            <el-radio label="currentView">当前视野</el-radio>
            <el-radio label="full">全局范围</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="采样间距(米)">
          <el-input-number v-model="sampleStepMeters" :min="10" :max="50" :step="5" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="floodDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="runFloodSimulation">开始模拟</el-button>
      </template>
    </el-dialog>

    <!-- 影响评估侧边栏 -->
    <el-drawer v-model="impactDrawerVisible" title="洪水影响评估报告" direction="rtl" size="480px" :append-to-body="true" @close="onImpactDrawerClose">
      <div v-if="impactData" class="impact-content">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="淹没面积">{{ impactData.area }} km²</el-descriptions-item>
          <el-descriptions-item label="最大水深">{{ impactData.maxDepth }} m</el-descriptions-item>
          <el-descriptions-item label="平均水深">{{ impactData.avgDepth }} m</el-descriptions-item>
          <el-descriptions-item label="受影响建筑数量">{{ impactData.buildingCount }}</el-descriptions-item>
          <el-descriptions-item label="估计受影响人口">{{ impactData.population }} 人</el-descriptions-item>
          <el-descriptions-item label="淹没道路长度">{{ impactData.roadLength || '未统计' }} km</el-descriptions-item>
          <el-descriptions-item label="采样点数">{{ impactData.sampleCount }}</el-descriptions-item>
          <el-descriptions-item label="被淹采样点数">{{ impactData.floodedPointsCount }}</el-descriptions-item>
          <el-descriptions-item label="区域平均地面高程">{{ impactData.meanGroundElev }} m</el-descriptions-item>
          <el-descriptions-item label="绝对水位高程">{{ impactData.absoluteWaterLevel }} m</el-descriptions-item>
          <el-descriptions-item v-if="impactData.evacuationTime" label="预计徒步撤离时间">
            {{ impactData.evacuationTime }}
          </el-descriptions-item>
          <el-descriptions-item v-if="impactData.floodArrivalTime" label="洪水到达危险水深时间">
            {{ impactData.floodArrivalTime }}
          </el-descriptions-item>
          <el-descriptions-item v-if="impactData.safetyAdvice" label="安全撤离建议" :span="1">
  <span :style="{ color: impactData.safetyAdvice.includes('✅') ? '#90EE90' : '#FFA07A' }">
    {{ impactData.safetyAdvice }}
  </span>
          </el-descriptions-item>
          <el-descriptions-item label="模拟时间">{{ impactData.timestamp }}</el-descriptions-item>
        </el-descriptions>
        <el-divider />
        <p class="disclaimer">注：基于无源淹没模型，水深依据真实地形DEM计算，仅供参考。</p>
      </div>
      <div v-else class="empty-placeholder">
        <el-empty description="暂无评估数据，请先执行洪水模拟" />
      </div>
    </el-drawer>

    <!-- 隐藏的文件上传控件 -->
    <input type="file" ref="geoJSONFileInput" style="display:none" accept=".geojson" @change="handleGeoJSONImport" />
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import * as handpose from '@tensorflow-models/handpose'
import '@tensorflow/tfjs-backend-webgl'
import { ElMessage, ElLoading } from 'element-plus'
import { config } from '../config/gis-platform'
import * as turf from '@turf/turf'

const Cesium = window.Cesium

//  DOM 元素
const videoRef = ref(null)
const canvasRef = ref(null)
let mouseHandler = null
let mouseControlsInitialized = false
let mediaStream = null
let handModel = null
let frameCount = 0
const cameraEnabled = ref(false)
const showVideo = ref(true)

let mouseDrawing = false

//  手势状态
const fingerTip = ref({ x: 0, y: 0 })
const isPinching = ref(false)
let pinchStableCount = 0, pinchReleaseCount = 0
const pinchDistanceThresh = ref(40)
const pinchStable = 3, pinchReleaseStable = 5
let smoothX = null, smoothY = null
const smoothFactor = ref(0.4)
let trailPoints = []
const trailMaxLen = ref(20)

//  绘图
const currentTool = ref('browse')
const lineColor = '#00ffff', lineWidth = 4, circleColor = '#ffaa00'
let currentLinePoints = [], circlePoints = []
let cesiumEntities = []

//  洪水模拟相关
const floodDialogVisible = ref(false)
const floodParams = ref({ waterLevel: 5, region: 'currentView', riseRate: 1, dangerDepth: 0.5 })
let floodPolygonEntity = null
let floodPointCloudEntities = []      // 淹没点云实体
const sampleStepMeters = ref(20)      // 采样间距
const impactDrawerVisible = ref(false)
const impactData = ref(null)
let lastCircleGeometry = null // { centerLon, centerLat, radiusMeters }

//  路径规划
let currentPathEntity = null
let selectingStartPoint = false
let selectingEndPoint = false
let pendingStartPoint = null
let pendingEndPoint = null

//  全局 viewer 就绪
const viewerReady = ref(false)

//  功能变量
let animationInterval = null
let animationEntity = null
let roadFeatures = []       // 道路GeoJSON
let roadEntities = []       // 可视化的道路
// 供 GestureScene 加载道路
window.loadRoads = function(features) {
  roadFeatures = features || []
  roadEntities.forEach(e => window.viewer?.entities.remove(e))
  roadEntities = []
  if (!window.viewer) return
  features.forEach(feature => {
    const coords = feature.geometry.coordinates
    const positions = coords.map(coord => Cesium.Cartesian3.fromDegrees(coord[0], coord[1]))
    const entity = window.viewer.entities.add({
      polyline: { positions, width: 2, material: Cesium.Color.GRAY, clampToGround: true }
    })
    roadEntities.push(entity)
  })
  console.log(`道路数据已加载，共 ${features.length} 条道路`)
}

// 手势滑动相关
let lastPalmY = null
let palmStableTimer = null
const gestureWaterLevelEnabled = ref(true)

// 路径规划结果
const pathResult = ref(null)

// 分析按钮选中效果
const activeAnalysis = ref(null) // 'path', 'flood', 'impact'

//  辅助函数
function setCameraRotateEnabled(enabled) {
  if (!window.viewer) return
  const controller = window.viewer.scene.screenSpaceCameraController
  controller.enableRotate = enabled
  controller.enableTilt = enabled
}

function screenToWorld(x, y) {
  if (!window.viewer) return null
  const ray = window.viewer.camera.getPickRay(new Cesium.Cartesian2(x, y))
  if (!ray) return null
  let pos = window.viewer.scene.globe?.pick(ray, window.viewer.scene)
  if (!pos) pos = window.viewer.camera.pickEllipsoid(ray)
  if (pos) {
    const carto = Cesium.Cartographic.fromCartesian(pos)
    return { lon: Cesium.Math.toDegrees(carto.longitude), lat: Cesium.Math.toDegrees(carto.latitude), height: carto.height }
  }
  return null
}

function smoothCoordinate(rawX, rawY) {
  if (smoothX === null) { smoothX = rawX; smoothY = rawY }
  const f = smoothFactor.value
  smoothX += (rawX - smoothX) * f
  smoothY += (rawY - smoothY) * f
  return { x: Math.round(smoothX), y: Math.round(smoothY) }
}

function addTrailPoint(x, y) {
  trailPoints.push({ x, y })
  while (trailPoints.length > trailMaxLen.value) trailPoints.shift()
}
function clearTrail() { trailPoints = [] }

let canvasCtx = null
function ensureCanvasContext() {
  if (!canvasCtx && canvasRef.value) {
    canvasCtx = canvasRef.value.getContext('2d')
  }
  return canvasCtx
}

function redrawCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = ensureCanvasContext()
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  trailPoints.forEach((p, i) => {
    const a = (i + 1) / trailPoints.length
    ctx.beginPath()
    ctx.arc(p.x, p.y, 6 * a, 0, 2 * Math.PI)
    ctx.fillStyle = `rgba(255,200,0,${a * 0.7})`
    ctx.fill()
  })

  if (currentTool.value === 'line' && currentLinePoints.length > 1) {
    ctx.beginPath()
    ctx.lineWidth = lineWidth
    ctx.strokeStyle = lineColor
    ctx.moveTo(currentLinePoints[0].x, currentLinePoints[0].y)
    currentLinePoints.forEach(p => ctx.lineTo(p.x, p.y))
    ctx.stroke()
  }
  if (currentTool.value === 'circle' && circlePoints.length > 1) {
    ctx.beginPath()
    ctx.setLineDash([5,5])
    ctx.strokeStyle = circleColor
    ctx.moveTo(circlePoints[0].x, circlePoints[0].y)
    circlePoints.forEach(p => ctx.lineTo(p.x, p.y))
    ctx.stroke()
    ctx.setLineDash([])
  }
  ctx.beginPath()
  ctx.arc(fingerTip.value.x, fingerTip.value.y, 10, 0, 2 * Math.PI)
  ctx.fillStyle = 'rgba(0,255,0,0.5)'
  ctx.fill()
}

function finishLine() {
  if (!window.viewer) return
  if (currentLinePoints.length < 2) {
    currentLinePoints = []
    return
  }
  const positions = []
  for (let p of currentLinePoints) {
    const w = screenToWorld(p.x, p.y)
    if (w) positions.push(Cesium.Cartesian3.fromDegrees(w.lon, w.lat, w.height + 1))
  }
  if (positions.length >= 2) {
    const entity = window.viewer.entities.add({
      polyline: { positions, width: lineWidth, material: Cesium.Color.fromCssColorString(lineColor), clampToGround: true }
    })
    cesiumEntities.push(entity)
  }
  currentLinePoints = []
}

function finishCircle() {
  if (!window.viewer) return
  if (circlePoints.length < 5) {
    circlePoints = []
    return
  }
  let sx = 0, sy = 0
  circlePoints.forEach(p => { sx += p.x; sy += p.y })
  const cx = sx / circlePoints.length, cy = sy / circlePoints.length
  let sumR = 0
  circlePoints.forEach(p => sumR += Math.hypot(p.x - cx, p.y - cy))
  const rPx = sumR / circlePoints.length
  if (rPx < 15 || rPx > 300) {
    circlePoints = []
    return
  }
  const cw = screenToWorld(cx, cy)
  const ew = screenToWorld(cx + rPx, cy)
  if (!cw || !ew) {
    circlePoints = []
    return
  }
  const center = Cesium.Cartesian3.fromDegrees(cw.lon, cw.lat)
  const edge = Cesium.Cartesian3.fromDegrees(ew.lon, ew.lat)
  const radius = Cesium.Cartesian3.distance(center, edge)
  if (radius < 5 || radius > 5000) {
    circlePoints = []
    return
  }

  lastCircleGeometry = {
    centerLon: cw.lon,
    centerLat: cw.lat,
    radiusMeters: radius
  }
  console.log('已保存绘制的圆用于洪水模拟', lastCircleGeometry)

  const entity = window.viewer.entities.add({
    position: center,
    ellipse: {
      semiMinorAxis: radius, semiMajorAxis: radius,
      material: Cesium.Color.fromCssColorString(circleColor).withAlpha(0.3),
      outline: true, outlineColor: Cesium.Color.fromCssColorString(circleColor)
    }
  })
  cesiumEntities.push(entity)
  circlePoints = []
}

// 绘制点
function addPointMarker(lon, lat, label, color) {
  if (!window.viewer) return
  const pointColor = color === Cesium.Color.GREEN ? Cesium.Color.GREEN : Cesium.Color.RED
  const entity = window.viewer.entities.add({
    name: label,
    position: Cesium.Cartesian3.fromDegrees(lon, lat, 5), // 抬高
    point: {
      pixelSize: 12,
      color: pointColor,
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    },
    label: {
      text: label,
      font: '18px sans-serif',
      fillColor: pointColor,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -20),
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    }
  })
  cesiumEntities.push(entity)
}

// 普通点
function placePoint(x, y) {
  if (!window.viewer) return
  if (selectingStartPoint || selectingEndPoint) {
    const w = screenToWorld(x, y)
    if (!w) return
    if (selectingStartPoint) {
      pendingStartPoint = { x: w.lon, y: w.lat }
      addPointMarker(w.lon, w.lat, '起点', Cesium.Color.GREEN)
      selectingStartPoint = false
      selectingEndPoint = true
      ElMessage.info('起点已选，请点击选择终点')
    } else if (selectingEndPoint) {
      pendingEndPoint = { x: w.lon, y: w.lat }
      addPointMarker(w.lon, w.lat, '终点', Cesium.Color.RED)
      selectingEndPoint = false
      setCameraRotateEnabled(true)
      ElMessage.success('起点和终点已选，正在规划路径...')
      calculatePath(pendingStartPoint, pendingEndPoint)
    }
    return
  }

  // 普通标记点
  const w = screenToWorld(x, y)
  if (!w) return
  const entity = window.viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(w.lon, w.lat, w.height + 5),
    point: {
      pixelSize: 8,
      color: Cesium.Color.RED,
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 1,
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    }
  })
  cesiumEntities.push(entity)
}

function clearFloodVisualization() {
  if (floodPolygonEntity && window.viewer) {
    window.viewer.entities.remove(floodPolygonEntity)
    floodPolygonEntity = null
  }
  floodPointCloudEntities.forEach(entity => {
    if (window.viewer) window.viewer.entities.remove(entity)
  })
  floodPointCloudEntities = []
}

function clearAllDrawings() {
  if (!window.viewer) return
  cesiumEntities.forEach(e => window.viewer.entities.remove(e))
  cesiumEntities = []
  if (currentPathEntity) {
    window.viewer.entities.remove(currentPathEntity)
    currentPathEntity = null
  }
  if (animationInterval) {
    clearInterval(animationInterval)
    animationInterval = null
  }
  if (animationEntity) {
    window.viewer.entities.remove(animationEntity)
    animationEntity = null
  }
  clearFloodVisualization()
  currentLinePoints = []
  circlePoints = []
  clearTrail()
  redrawCanvas()
  if (selectingStartPoint || selectingEndPoint) {
    selectingStartPoint = false
    selectingEndPoint = false
    setCameraRotateEnabled(true)
    activeAnalysis.value = null  // 取消路径规划高亮
  }
  lastCircleGeometry = null
  pathResult.value = null
  // 如果弹窗或侧边栏打开，也需要重置高亮，但通常这里只是清空绘图，不关闭弹窗，可以不重置
}

//  DEM 淹没分析函数
function generateGridPoints(centerLon, centerLat, radiusMeters, stepMeters) {
  const points = []
  const latDegPerMeter = 1 / 111320
  const lonDegPerMeter = 1 / (111320 * Math.cos(centerLat * Math.PI / 180))
  const radiusDeg = radiusMeters * latDegPerMeter
  const stepDeg = stepMeters * latDegPerMeter

  const minLat = centerLat - radiusDeg
  const maxLat = centerLat + radiusDeg
  const minLon = centerLon - radiusDeg / Math.cos(centerLat * Math.PI / 180)
  const maxLon = centerLon + radiusDeg / Math.cos(centerLat * Math.PI / 180)

  for (let lat = minLat; lat <= maxLat; lat += stepDeg) {
    for (let lon = minLon; lon <= maxLon; lon += stepDeg) {
      const dx = (lon - centerLon) * Math.cos(centerLat * Math.PI / 180)
      const dy = (lat - centerLat)
      const distDeg = Math.hypot(dx, dy)
      if (distDeg * 111320 <= radiusMeters) {
        points.push({ lon, lat })
      }
    }
  }
  return points
}

function buildConvexHull(floodedPoints) {
  if (floodedPoints.length < 3) return null
  try {
    const points = floodedPoints.map(p => turf.point([p.lon, p.lat]))
    const fc = turf.featureCollection(points)
    const convex = turf.convex(fc)
    if (convex && convex.geometry && convex.geometry.coordinates.length > 0) {
      let coords = convex.geometry.coordinates[0]
      if (coords[0][0] !== coords[coords.length-1][0] ||
          coords[0][1] !== coords[coords.length-1][1]) {
        coords.push(coords[0])
      }
      return coords
    }
  } catch (e) {
    console.warn('凸包构建失败:', e)
  }
  return null
}

function addFloodPointCloud(floodedPoints, maxPoints = 1500) {
  if (!window.viewer) return
  let pointsToShow = floodedPoints
  if (floodedPoints.length > maxPoints) {
    const step = Math.ceil(floodedPoints.length / maxPoints)
    pointsToShow = floodedPoints.filter((_, idx) => idx % step === 0)
  }
  pointsToShow.forEach(point => {
    const entity = window.viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(point.lon, point.lat, 0.5),
      point: {
        pixelSize: 4,
        color: Cesium.Color.RED.withAlpha(0.6),
        outlineColor: Cesium.Color.YELLOW,
        outlineWidth: 1
      }
    })
    floodPointCloudEntities.push(entity)
  })
  console.log(`已添加 ${pointsToShow.length} 个淹没点云（原始${floodedPoints.length}个）`)
}

async function countBuildingsFlooded(absoluteWaterLevel) {
  if (!window.viewer) return 0
  const buildings = []
  const entities = window.viewer.entities.values
  for (let entity of entities) {
    if (entity.name === 'building' && entity.position) {
      const carto = Cesium.Cartographic.fromCartesian(entity.position._value)
      buildings.push({
        entity,
        lon: Cesium.Math.toDegrees(carto.longitude),
        lat: Cesium.Math.toDegrees(carto.latitude)
      })
    }
  }
  if (buildings.length === 0) return 0

  const cartographics = buildings.map(b => Cesium.Cartographic.fromDegrees(b.lon, b.lat))
  const terrainProvider = window.viewer.terrainProvider
  if (!terrainProvider.ready) await terrainProvider.readyPromise
  const elevations = await Cesium.sampleTerrainMostDetailed(terrainProvider, cartographics)

  let floodedCount = 0
  buildings.forEach((b, idx) => {
    const groundElev = elevations[idx].height
    if (groundElev < absoluteWaterLevel) floodedCount++
  })
  return floodedCount
}

async function runFloodSimulation() {
  if (!window.viewer) {
    ElMessage.error('三维场景未就绪')
    return
  }
  if (!lastCircleGeometry) {
    ElMessage.warning('请先使用“圆”工具绘制分析区域')
    return
  }
  floodDialogVisible.value = false

  const area = Math.PI * lastCircleGeometry.radiusMeters * lastCircleGeometry.radiusMeters
  let step = sampleStepMeters.value
  const estimatedPoints = area / (step * step)
  if (estimatedPoints > 3000) step = Math.ceil(Math.sqrt(area / 2000))
  if (step < 10) step = 10
  if (step > 50) step = 50

  const loading = ElLoading.service({
    fullscreen: true,
    text: `正在生成采样网格（步长${step}米）并获取地形高程...`
  })

  try {
    const { centerLon, centerLat, radiusMeters } = lastCircleGeometry
    const waterLevelInput = floodParams.value.waterLevel
    const riseRate = floodParams.value.riseRate
    const dangerDepth = floodParams.value.dangerDepth

    const samplePoints = generateGridPoints(centerLon, centerLat, radiusMeters, step)
    if (samplePoints.length === 0) throw new Error('未生成有效采样点')
    console.log(`生成采样点数量: ${samplePoints.length}`)

    const cartographics = samplePoints.map(p => Cesium.Cartographic.fromDegrees(p.lon, p.lat))
    const terrainProvider = window.viewer.terrainProvider
    if (!terrainProvider.ready) await terrainProvider.readyPromise
    const elevations = await Cesium.sampleTerrainMostDetailed(terrainProvider, cartographics)

    let sumElev = 0
    for (let i = 0; i < elevations.length; i++) {
      sumElev += elevations[i].height
    }
    const meanGroundElev = sumElev / elevations.length
    const absoluteWaterLevel = meanGroundElev + waterLevelInput

    // 计算洪水到达危险水深的时间
    let floodArrivalSeconds = null
    let floodArrivalTimeStr = null
    if (riseRate > 0) {
      const timeToDangerHours = dangerDepth / riseRate
      floodArrivalSeconds = timeToDangerHours * 3600
      floodArrivalTimeStr = formatTime(floodArrivalSeconds)
    }

    // 与路径规划结果对比安全撤离
    let safetyMessage = null
    if (pathResult.value && pathResult.value.totalSeconds !== undefined && floodArrivalSeconds !== null) {
      const evacSeconds = pathResult.value.totalSeconds
      if (evacSeconds < floodArrivalSeconds) {
        safetyMessage = `✅ 可以安全撤离（徒步 ${pathResult.value.timeStr} < 洪水到达危险水深时间 ${floodArrivalTimeStr}）`
      } else {
        safetyMessage = `❌ 无法安全撤离（徒步 ${pathResult.value.timeStr} ≥ 洪水到达危险水深时间 ${floodArrivalTimeStr}）`
      }
    } else if (pathResult.value && pathResult.value.totalSeconds !== undefined) {
      safetyMessage = `⚠️ 未设置洪水上涨速率，无法判断`
    } else {
      safetyMessage = `⚠️ 请先进行路径规划`
    }
    // 更新到右上角面板中显示
    if (pathResult.value) {
      pathResult.value.safety = safetyMessage
    }

    let floodedCount = 0
    let totalDepth = 0
    let maxDepth = 0
    const floodedPoints = []

    for (let i = 0; i < elevations.length; i++) {
      const elev = elevations[i].height
      if (elev < absoluteWaterLevel) {
        floodedCount++
        const depth = absoluteWaterLevel - elev
        totalDepth += depth
        if (depth > maxDepth) maxDepth = depth
        floodedPoints.push({
          lon: samplePoints[i].lon,
          lat: samplePoints[i].lat,
          depth: depth
        })
      }
    }

    if (floodedCount === 0) {
      ElMessage.warning('当前水位未造成任何区域淹没')
      loading.close()
      return
    }

    const circleAreaM2 = Math.PI * radiusMeters * radiusMeters
    const floodRatio = floodedCount / elevations.length
    const floodedAreaM2 = circleAreaM2 * floodRatio
    const floodedAreaKm2 = floodedAreaM2 / 1e6
    const avgDepth = totalDepth / floodedCount

    const buildingCount = await countBuildingsFlooded(absoluteWaterLevel)
    const population = Math.floor(buildingCount * 4.5)

    let floodPolygonCoords = null
    let floodedRoadLength = 0

    if (floodedPoints.length >= 3) {
      floodPolygonCoords = buildConvexHull(floodedPoints)
    }
    if (!floodPolygonCoords) {
      const numPoints = 64
      floodPolygonCoords = []
      for (let i = 0; i <= numPoints; i++) {
        const angle = i * Math.PI * 2 / numPoints
        const lon = centerLon + (radiusMeters / 111320) * Math.cos(angle)
        const lat = centerLat + (radiusMeters / 111320) * Math.sin(angle)
        floodPolygonCoords.push([lon, lat])
      }
      floodPolygonCoords.push(floodPolygonCoords[0])
    }

    if (roadFeatures.length > 0) {
      try {
        const floodPolygon = turf.polygon([floodPolygonCoords])
        roadFeatures.forEach(feature => {
          try {
            const roadLine = turf.lineString(feature.geometry.coordinates)
            const intersect = turf.lineIntersect(roadLine, floodPolygon)
            if (intersect.features.length > 0) {
              const lineLength = turf.length(roadLine, { units: 'kilometers' })
              const ratio = Math.min(1, intersect.features.length / roadLine.geometry.coordinates.length)
              floodedRoadLength += lineLength * ratio
            }
          } catch (e) { console.warn(e) }
        })
      } catch (e) {
        console.warn('道路统计失败', e)
      }
    }

    // 影响评估数据（包含撤离时间与安全建议）
    impactData.value = {
      area: floodedAreaKm2.toFixed(2),
      maxDepth: maxDepth.toFixed(1),
      avgDepth: avgDepth.toFixed(1),
      buildingCount: buildingCount,
      population: population,
      roadLength: floodedRoadLength.toFixed(2),
      timestamp: new Date().toLocaleString(),
      sampleCount: elevations.length,
      floodedPointsCount: floodedCount,
      meanGroundElev: meanGroundElev.toFixed(1),
      absoluteWaterLevel: absoluteWaterLevel.toFixed(1),
      evacuationTime: pathResult.value?.timeStr || null,
      floodArrivalTime: floodArrivalTimeStr,
      safetyAdvice: safetyMessage
    }
    impactDrawerVisible.value = true

    clearFloodVisualization()
    const positions = floodPolygonCoords.map(coord => Cesium.Cartesian3.fromDegrees(coord[0], coord[1], 0))
    floodPolygonEntity = window.viewer.entities.add({
      name: '实际淹没区域',
      polygon: {
        hierarchy: positions,
        material: Cesium.Color.BLUE.withAlpha(0.5),
        outline: true,
        outlineColor: Cesium.Color.DEEPSKYBLUE,
        height: absoluteWaterLevel,
        extrudedHeight: undefined
      }
    })
    if (floodedPoints.length > 0) {
      addFloodPointCloud(floodedPoints, 1000)
    }

    ElMessage.success(`淹没分析完成：实际淹没面积 ${floodedAreaKm2.toFixed(2)} km²，最大水深 ${maxDepth.toFixed(1)} m`)
    if (safetyMessage && !safetyMessage.includes('请先')) {
      ElMessage.info(safetyMessage)
    }
  } catch (err) {
    console.error('洪水模拟失败:', err)
    ElMessage.error(`洪水模拟失败: ${err.message}`)
  } finally {
    loading.close()
  }
}

function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  let str = ''
  if (hours > 0) str += `${hours}小时`
  if (minutes > 0) str += `${minutes}分钟`
  if (secs > 0 && hours === 0) str += `${secs}秒`
  if (str === '') str = '小于1秒'
  return str
}

function openFloodDialog() {
  floodDialogVisible.value = true
  activeAnalysis.value = 'flood'  // 高亮洪水模拟按钮
}

function onFloodDialogClose() {
  activeAnalysis.value = null  // 取消高亮
}

function openImpactPanel() {
  if (!impactData.value) {
    ElMessage.info('暂无评估数据，请先执行洪水模拟')
    return
  }
  impactDrawerVisible.value = true
  activeAnalysis.value = 'impact'  // 高亮影响评估按钮
}

function onImpactDrawerClose() {
  activeAnalysis.value = null  // 取消高亮
}

//  路径规划
async function calculatePath(start, end) {
  if (!window.viewer) {
    ElMessage.error('三维场景未就绪')
    return
  }
  const baseUrl = config.getNetworkUrl()
  if (!baseUrl) {
    ElMessage.error('未配置交通网络分析服务地址')
    return
  }

  const loading = ElLoading.service({ fullscreen: true, text: '正在规划路径...' })
  try {
    const requestParams = {
      nodes: [
        { x: start.x, y: start.y },
        { x: end.x, y: end.y }
      ],
      hasLeastEdgeCount: false,
      parameter: {
        weightFieldName: "SmLength",
        resultSetting: {
          returnEdgeFeatures: true,
          returnEdgeGeometry: true,
          returnNodeFeatures: false,
          returnPathGuides: false
        }
      }
    }

    const query = new URLSearchParams({
      nodes: JSON.stringify(requestParams.nodes),
      hasLeastEdgeCount: requestParams.hasLeastEdgeCount,
      parameter: JSON.stringify(requestParams.parameter)
    }).toString()

    const url = `${baseUrl}/path.json?${query}`
    console.log('请求URL:', url)

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const result = await response.json()
    if (!result?.pathList?.length) {
      ElMessage.warning('未找到路径，请确保起终点在路网内且连通')
      return
    }

    const path = result.pathList[0]
    const totalLength = path.weight || path.totalLength

    // 提取路径点（经纬度）
    let routePoints = []
    if (path.edgeFeatures && path.edgeFeatures.length) {
      for (let edge of path.edgeFeatures) {
        if (edge.geometry && edge.geometry.points && edge.geometry.points.length) {
          const pts = edge.geometry.points.map(p => ({ lon: p.x, lat: p.y }))
          if (routePoints.length > 0) {
            const last = routePoints[routePoints.length - 1]
            const first = pts[0]
            const dist = Math.hypot(last.lon - first.lon, last.lat - first.lat)
            if (dist < 1e-9) pts.shift()
          }
          routePoints.push(...pts)
        }
      }
    } else if (path.route && path.route.points) {
      routePoints = path.route.points.map(p => ({ lon: p.x, lat: p.y }))
    } else if (path.routeGeometry && path.routeGeometry.points) {
      routePoints = path.routeGeometry.points.map(p => ({ lon: p.x, lat: p.y }))
    }

    if (routePoints.length < 2) {
      throw new Error('无法解析路径几何点')
    }

    // 计算徒步时间（速度 5 km/h）
    const walkingSpeedKmh = 5
    let totalTimeSeconds = (totalLength / 1000) / walkingSpeedKmh * 3600
    const timeStr = formatTime(totalTimeSeconds)

    // 存储结果到右上角面板
    pathResult.value = {
      distance: totalLength ? totalLength.toFixed(2) : null,
      timeStr: timeStr,
      totalSeconds: totalTimeSeconds,
      safety: null   // 待洪水模拟后更新
    }
    ElMessage.success('路径规划完成')

    // 地形采样与绘制路径
    const terrainProvider = window.viewer.terrainProvider
    if (!terrainProvider.ready) {
      await terrainProvider.readyPromise
    }

    const cartographics = routePoints.map(p => Cesium.Cartographic.fromDegrees(p.lon, p.lat))
    const sampledPositions = await Cesium.sampleTerrainMostDetailed(terrainProvider, cartographics)

    const cesiumPositions = sampledPositions.map((carto) => {
      return Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height + 2.0)
    })

    if (currentPathEntity) window.viewer.entities.remove(currentPathEntity)
    currentPathEntity = window.viewer.entities.add({
      name: '规划路径（最短路径）',
      polyline: {
        positions: cesiumPositions,
        width: 6,
        material: Cesium.Color.YELLOW,
        clampToGround: false,
        outline: true,
        outlineColor: Cesium.Color.BLACK
      }
    })

    window.viewer.zoomTo(currentPathEntity)

    // 粒子动画
    if (animationInterval) clearInterval(animationInterval)
    if (animationEntity) window.viewer.entities.remove(animationEntity)

    let stepIdx = 0
    animationEntity = window.viewer.entities.add({
      position: cesiumPositions[0],
      point: {
        pixelSize: 12,
        color: Cesium.Color.RED,
        outlineColor: Cesium.Color.YELLOW,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    })

    animationInterval = setInterval(() => {
      if (!window.viewer) return
      stepIdx = (stepIdx + 1) % cesiumPositions.length
      animationEntity.position = cesiumPositions[stepIdx]
    }, 300)

    console.log(`粒子动画已启动，路径点数量：${cesiumPositions.length}`)
    // 规划完成后关闭选点模式，取消高亮
    selectingStartPoint = false
    selectingEndPoint = false
    activeAnalysis.value = null
  } catch (err) {
    console.error(err)
    ElMessage.error(`路径规划失败: ${err.message}`)
  } finally {
    loading.close()
  }
}

function calculatePathWithSelection() {
  if (!window.viewer) return
  if (selectingStartPoint || selectingEndPoint) {
    selectingStartPoint = false
    selectingEndPoint = false
    setCameraRotateEnabled(true)
    ElMessage.info('已取消选点')
    activeAnalysis.value = null
    return
  }
  setCameraRotateEnabled(false)
  selectingStartPoint = true
  activeAnalysis.value = 'path'  // 高亮路径规划按钮
  ElMessage.info('请在三维场景中点击选择起点')
}

// 截图、GeoJSON 导入导出
function screenshot() {
  if (!window.viewer) {
    ElMessage.error('三维场景未就绪')
    return
  }
  const canvas = window.viewer.scene.canvas
  const dataURL = canvas.toDataURL('image/png')
  const link = document.createElement('a')
  link.href = dataURL
  link.download = `screenshot_${new Date().toISOString()}.png`
  link.click()
  ElMessage.success('截图已保存')
}

function exportGeoJSON() {
  const features = []
  cesiumEntities.forEach(entity => {
    if (entity.polyline) {
      const positions = entity.polyline.positions._value
      const coords = positions.map(cart => {
        const carto = Cesium.Cartographic.fromCartesian(cart)
        return [Cesium.Math.toDegrees(carto.longitude), Cesium.Math.toDegrees(carto.latitude), carto.height]
      })
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords },
        properties: { type: "line", color: lineColor, width: lineWidth }
      })
    } else if (entity.ellipse) {
      const centerCart = entity.position._value
      const center = Cesium.Cartographic.fromCartesian(centerCart)
      const radius = entity.ellipse.semiMajorAxis._value
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [Cesium.Math.toDegrees(center.longitude), Cesium.Math.toDegrees(center.latitude)] },
        properties: { type: "circle", radius: radius, color: circleColor }
      })
    } else if (entity.point) {
      const posCart = entity.position._value
      const pos = Cesium.Cartographic.fromCartesian(posCart)
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [Cesium.Math.toDegrees(pos.longitude), Cesium.Math.toDegrees(pos.latitude)] },
        properties: { type: "point", color: "#ff4444" }
      })
    }
  })
  const geoJSON = { type: "FeatureCollection", features }
  const blob = new Blob([JSON.stringify(geoJSON, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'drawings.geojson'
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success("导出 GeoJSON 成功")
}

function importGeoJSON() {
  const fileInput = document.querySelector('input[type="file"]')
  if (fileInput) fileInput.click()
}

function handleGeoJSONImport(event) {
  const file = event.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const geoJSON = JSON.parse(e.target.result)
      if (!geoJSON.features) throw new Error("无效的 GeoJSON")
      clearAllDrawings()
      geoJSON.features.forEach(feature => {
        const geom = feature.geometry
        const props = feature.properties
        if (geom.type === "LineString") {
          const positions = geom.coordinates.map(coord => Cesium.Cartesian3.fromDegrees(coord[0], coord[1], coord[2] || 0))
          if (positions.length >= 2) {
            const entity = window.viewer.entities.add({
              polyline: { positions, width: props.width || 4, material: Cesium.Color.fromCssColorString(props.color || '#00ffff'), clampToGround: true }
            })
            cesiumEntities.push(entity)
          }
        } else if (geom.type === "Point" && props.type === "circle") {
          const center = Cesium.Cartesian3.fromDegrees(geom.coordinates[0], geom.coordinates[1])
          const entity = window.viewer.entities.add({
            position: center,
            ellipse: {
              semiMinorAxis: props.radius, semiMajorAxis: props.radius,
              material: Cesium.Color.fromCssColorString(props.color || '#ffaa00').withAlpha(0.3),
              outline: true, outlineColor: Cesium.Color.fromCssColorString(props.color || '#ffaa00')
            }
          })
          cesiumEntities.push(entity)
        } else if (geom.type === "Point" && props.type === "point") {
          const pos = Cesium.Cartesian3.fromDegrees(geom.coordinates[0], geom.coordinates[1], 5)
          const entity = window.viewer.entities.add({
            position: pos,
            point: {
              pixelSize: 8,
              color: Cesium.Color.RED,
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 1
            }
          })
          cesiumEntities.push(entity)
        }
      })
      ElMessage.success(`导入成功，共 ${geoJSON.features.length} 个要素`)
    } catch (err) {
      console.error(err)
      ElMessage.error("解析 GeoJSON 失败")
    }
    event.target.value = ''
  }
  reader.readAsText(file)
}

// 手势识别与摄像头
async function initHandModel() { handModel = await handpose.load() }

function detectFiveFingerPinch(landmarks) {
  const tips = [4,8,12,16,20].map(i => landmarks[i])
  let cx = 0, cy = 0
  tips.forEach(p => { cx += p.x; cy += p.y })
  cx /= 5; cy /= 5
  let dist = 0
  tips.forEach(p => dist += Math.hypot(p.x - cx, p.y - cy))
  return dist / 5 < pinchDistanceThresh.value
}

let lastMoveX = 0, lastMoveY = 0
function onPinchStart() {
  if (!window.viewer) return
  if (currentTool.value === 'browse') return
  const pos = fingerTip.value
  lastMoveX = pos.x; lastMoveY = pos.y
  if (currentTool.value === 'line') currentLinePoints = [{ x: pos.x, y: pos.y }]
  else if (currentTool.value === 'circle') circlePoints = [{ x: pos.x, y: pos.y }]
  else if (currentTool.value === 'place') placePoint(pos.x, pos.y)
}
function onPinchingMove(x, y) {
  if (!window.viewer) return
  if (currentTool.value === 'browse') return
  if (currentTool.value === 'line') currentLinePoints.push({ x, y })
  else if (currentTool.value === 'circle') circlePoints.push({ x, y })
}
function onPinchEnd() {
  if (!window.viewer) return
  if (currentTool.value === 'browse') return
  if (currentTool.value === 'line') finishLine()
  if (currentTool.value === 'circle') finishCircle()
  currentLinePoints = []
  circlePoints = []
}

function updatePinchState(landmarks) {
  const now = detectFiveFingerPinch(landmarks)
  if (now) {
    pinchStableCount++; pinchReleaseCount = 0
    if (pinchStableCount >= pinchStable && !isPinching.value) {
      isPinching.value = true
      onPinchStart()
    }
  } else {
    pinchReleaseCount++; pinchStableCount = 0
    if (pinchReleaseCount >= pinchReleaseStable && isPinching.value) {
      isPinching.value = false
      onPinchEnd()
    }
  }
}

function detectHandAndControl() {
  if (!handModel || !videoRef.value || !videoRef.value.videoWidth) {
    requestAnimationFrame(detectHandAndControl)
    return
  }
  const video = videoRef.value, canvas = canvasRef.value
  const w = canvas.width, h = canvas.height
  handModel.estimateHands(video).then(hands => {
    if (hands?.length) {
      const lm = hands[0].landmarks
      const vw = video.videoWidth, vh = video.videoHeight
      const rawX = lm[8][0] * w / vw, rawY = lm[8][1] * h / vh
      const smooth = smoothCoordinate(rawX, rawY)
      fingerTip.value = smooth
      addTrailPoint(smooth.x, smooth.y)
      const canvasLm = lm.map(p => ({ x: p[0] * w / vw, y: p[1] * h / vh }))
      updatePinchState(canvasLm)

      if (gestureWaterLevelEnabled.value) {
        const wrist = lm[0]
        const indexBase = lm[5]
        const palmY = (wrist[1] + indexBase[1]) / 2
        if (lastPalmY !== null && Math.abs(palmY - lastPalmY) > 15) {
          const delta = lastPalmY - palmY
          let newWaterLevel = floodParams.value.waterLevel + delta * 0.1
          newWaterLevel = Math.min(30, Math.max(0, newWaterLevel))
          if (newWaterLevel !== floodParams.value.waterLevel) {
            floodParams.value.waterLevel = newWaterLevel
            ElMessage.info(`水位已调节至 ${newWaterLevel.toFixed(1)} 米`)
            if (palmStableTimer) clearTimeout(palmStableTimer)
            palmStableTimer = setTimeout(() => {}, 200)
          }
        }
        lastPalmY = palmY
      }

      if (isPinching.value) {
        const dx = Math.abs(smooth.x - lastMoveX), dy = Math.abs(smooth.y - lastMoveY)
        if ((dx > 5 || dy > 5) && frameCount % 3 === 0) {
          onPinchingMove(smooth.x, smooth.y)
          lastMoveX = smooth.x; lastMoveY = smooth.y
        }
      }
    } else {
      if (currentLinePoints.length > 1) finishLine()
      if (circlePoints.length > 0) finishCircle()
      if (isPinching.value) {
        isPinching.value = false
        onPinchEnd()
      }
      lastPalmY = null
    }
    redrawCanvas()
    frameCount++
    requestAnimationFrame(detectHandAndControl)
  }).catch(e => { console.warn(e); requestAnimationFrame(detectHandAndControl) })
}

async function startCamera() {
  if (cameraEnabled.value) return
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true })
    mediaStream = stream
    videoRef.value.srcObject = stream
    await videoRef.value.play()
    cameraEnabled.value = true
    showVideo.value = true
  } catch (err) {
    console.error('摄像头打开失败:', err)
    cameraEnabled.value = false
  }
}
function stopCamera() {
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop())
    mediaStream = null
    videoRef.value.srcObject = null
    cameraEnabled.value = false
    showVideo.value = false
  }
}
function toggleVideo() {
  if (!cameraEnabled.value) return
  showVideo.value = !showVideo.value
}

function setTool(tool) {
  currentTool.value = tool
  currentLinePoints = []
  circlePoints = []
  mouseDrawing = false
  clearTrail()
  redrawCanvas()
  if (selectingStartPoint || selectingEndPoint) {
    selectingStartPoint = false
    selectingEndPoint = false
    ElMessage.info('已取消路径点选择')
    activeAnalysis.value = null
  }
  if (window.viewer) {
    setCameraRotateEnabled(tool === 'browse')
  }
}

// 鼠标操作
function initMouseControls() {
  if (!window.viewer) return
  if (mouseControlsInitialized) return
  if (mouseHandler) { mouseHandler.destroy(); mouseHandler = null }
  mouseHandler = new Cesium.ScreenSpaceEventHandler(window.viewer.scene.canvas)

  mouseHandler.setInputAction((movement) => {
    const pos = movement.endPosition
    fingerTip.value = { x: pos.x, y: pos.y }
    redrawCanvas()
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)

  mouseHandler.setInputAction((clickEvent) => {
    const pos = clickEvent.position
    if (selectingStartPoint || selectingEndPoint) {
      placePoint(pos.x, pos.y)
      return
    }
    if (currentTool.value === 'browse') return
    if (currentTool.value === 'line') {
      mouseDrawing = true
      currentLinePoints = [{ x: pos.x, y: pos.y }]
    } else if (currentTool.value === 'circle') {
      mouseDrawing = true
      circlePoints = [{ x: pos.x, y: pos.y }]
    } else if (currentTool.value === 'place') {
      placePoint(pos.x, pos.y)
    }
    redrawCanvas()
  }, Cesium.ScreenSpaceEventType.LEFT_DOWN)

  mouseHandler.setInputAction((movement) => {
    if (mouseDrawing) {
      const x = movement.endPosition.x, y = movement.endPosition.y
      if (currentTool.value === 'line') currentLinePoints.push({ x, y })
      else if (currentTool.value === 'circle') circlePoints.push({ x, y })
      redrawCanvas()
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)

  mouseHandler.setInputAction(() => {
    if (mouseDrawing) {
      if (currentTool.value === 'line') finishLine()
      if (currentTool.value === 'circle') finishCircle()
      currentLinePoints = []
      circlePoints = []
      mouseDrawing = false
      redrawCanvas()
    }
  }, Cesium.ScreenSpaceEventType.LEFT_UP)

  mouseControlsInitialized = true
}

let rafId = null
function startCanvasLoop() {
  function loop() {
    redrawCanvas()
    rafId = requestAnimationFrame(loop)
  }
  rafId = requestAnimationFrame(loop)
}

defineExpose({
  simulateFlood: runFloodSimulation,
  calculatePath,
  openImpactPanel
})

// 生命周期
onMounted(async () => {
  await nextTick()
  const canvas = canvasRef.value
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    redrawCanvas()
  })
  await initHandModel()
  requestAnimationFrame(detectHandAndControl)
  startCanvasLoop()

  const checkViewer = setInterval(() => {
    if (window.viewer) {
      clearInterval(checkViewer)
      initMouseControls()
      setCameraRotateEnabled(currentTool.value !== 'browse')
      viewerReady.value = true
    }
  }, 100)
})

onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId)
  if (mediaStream) mediaStream.getTracks().forEach(t => t.stop())
  if (mouseHandler) { mouseHandler.destroy(); mouseHandler = null }
  clearFloodVisualization()
  if (currentPathEntity && window.viewer) window.viewer.entities.remove(currentPathEntity)
  if (animationInterval) clearInterval(animationInterval)
  if (animationEntity && window.viewer) window.viewer.entities.remove(animationEntity)
  roadEntities.forEach(e => window.viewer?.entities.remove(e))
})
</script>

<style scoped>
.gesture-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 10;
}
.draw-canvas {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 20;
  pointer-events: none;
}
.gesture-video {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 320px;
  height: 240px;
  border: 2px solid #0f0;
  border-radius: 8px;
  background: #222;
  z-index: 100;
  transform: scaleX(-1);
  pointer-events: auto;
}
.gesture-video.hidden { display: none; }

.control-panel, .params-panel {
  pointer-events: auto;
  position: fixed;
  background: rgba(0,0,0,0.7);
  color: white;
  padding: 10px 15px;
  border-radius: 8px;
  z-index: 101;
  font-size: 14px;
  backdrop-filter: blur(4px);
}
.control-panel {
  top: 20px;
  left: 20px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.params-panel {
  bottom: 20px;
  left: 20px;
  width: 260px;
}
.param-row {
  display: flex;
  justify-content: space-between;
  margin: 6px 0;
}
button {
  margin: 0 4px;
  padding: 6px 12px;
  background: #2c3e66;
  border: none;
  border-radius: 6px;
  color: white;
  cursor: pointer;
}
button:disabled { opacity: 0.5; cursor: not-allowed; }
button.active { background: #ff8800; }
video { transform: scaleX(-1); }
.impact-content { padding: 16px; }
.empty-placeholder { padding: 40px; text-align: center; }
.disclaimer { font-size: 12px; color: #909399; }

.control-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: rgba(0,0,0,0.7);
  padding: 12px 15px;
  border-radius: 8px;
  backdrop-filter: blur(4px);
  pointer-events: auto;
  top: 20px;
  left: 20px;
  position: fixed;
  z-index: 101;
  font-size: 14px;
  max-width: 280px;
}

.button-group {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  border-top: 1px solid rgba(255,255,255,0.2);
  padding-top: 8px;
}

.button-group:first-child {
  border-top: none;
  padding-top: 0;
}

.group-label {
  font-size: 12px;
  color: #aaa;
  margin-right: 8px;
  width: 100%;
  margin-bottom: 4px;
}

.button-group button {
  margin: 0;
  padding: 4px 10px;
  font-size: 12px;
}

/* 路径规划结果面板 */
.path-result-panel {
  position: fixed;
  top: 20px;
  right: 20px;
  background: rgba(0,0,0,0.8);
  color: white;
  padding: 10px 15px;
  border-radius: 8px;
  backdrop-filter: blur(4px);
  z-index: 102;
  font-size: 14px;
  min-width: 200px;
  pointer-events: auto;
  font-family: sans-serif;
}
.path-result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-weight: bold;
  border-bottom: 1px solid rgba(255,255,255,0.3);
  padding-bottom: 4px;
}
.close-btn {
  background: none;
  border: none;
  color: white;
  cursor: pointer;
  font-size: 16px;
  padding: 0 4px;
}
.close-btn:hover {
  color: #ff8888;
}
.path-result-content div {
  margin: 4px 0;
}
.safe {
  color: #90EE90;
}
.unsafe {
  color: #FFA07A;
}
</style>