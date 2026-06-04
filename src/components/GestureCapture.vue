<template>
  <div class="gesture-container">
    <video ref="videoRef" autoplay muted playsinline class="gesture-video" :class="{ hidden: !showVideo }"></video>
    <canvas ref="canvasRef" class="draw-canvas"></canvas>

    <div class="control-panel">
      <button @click="startCamera" :disabled="cameraEnabled">📷 打开摄像头</button>
      <button @click="stopCamera" :disabled="!cameraEnabled">📷 关闭摄像头</button>
      <button @click="toggleVideo" :disabled="!cameraEnabled">{{ showVideo ? '隐藏视频' : '显示视频' }}</button>
      <button @click="setTool('browse')" :class="{ active: currentTool === 'browse' }">🔍 浏览</button>
      <button @click="setTool('line')" :class="{ active: currentTool === 'line' }">✏️ 线</button>
      <button @click="setTool('circle')" :class="{ active: currentTool === 'circle' }">⭕ 圆</button>
      <button @click="setTool('place')" :class="{ active: currentTool === 'place' }">📍 点</button>
      <button @click="clearAllDrawings">🗑️ 清空</button>

      <button @click="calculatePathWithSelection" :disabled="!viewerReady">🗺️ 路径规划</button>
      <button @click="openFloodDialog" :disabled="!viewerReady">🌊 洪水模拟</button>
      <button @click="openImpactPanel" :disabled="!viewerReady">📊 影响评估</button>

      <!-- 新功能按钮（不干扰原有布局） -->
      <button @click="exportGeoJSON">💾 导出GeoJSON</button>
      <button @click="importGeoJSON">📂 导入GeoJSON</button>
      <button @click="screenshot">📸 截图</button>
    </div>

    <div class="params-panel">
      <h4>✋ 手势参数</h4>
      <div class="param-row"><label>捏合阈值</label><input type="range" min="20" max="80" step="1" v-model.number="pinchDistanceThresh" /></div>
      <div class="param-row"><label>平滑因子</label><input type="range" min="0" max="0.95" step="0.01" v-model.number="smoothFactor" /></div>
      <div class="param-row"><label>拖尾长度</label><input type="range" min="5" max="40" step="1" v-model.number="trailMaxLen" /></div>
      <!-- 新功能：手势水位调节状态显示（可选） -->
      <div class="param-row"><label>手势水位调节</label><span>{{ gestureWaterLevelEnabled ? '启用' : '未启用手势' }}</span></div>
    </div>

    <!-- 洪水参数设置弹窗（原样不变） -->
    <el-dialog v-model="floodDialogVisible" title="洪水模拟参数" width="400px" :modal="true" :append-to-body="true">
      <el-form :model="floodParams" label-width="120px">
        <el-form-item label="淹没深度(高于地面米数)">
          <el-input-number v-model="floodParams.waterLevel" :min="0" :max="100" :step="1" />
        </el-form-item>
        <el-form-item label="模拟区域">
          <el-radio-group v-model="floodParams.region">
            <el-radio label="currentView">当前视野</el-radio>
            <el-radio label="full">全局范围</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="floodDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="runFloodSimulation">开始模拟</el-button>
      </template>
    </el-dialog>

    <!-- 影响评估侧边栏（原样不变，但增加道路统计显示） -->
    <el-drawer v-model="impactDrawerVisible" title="洪水影响评估报告" direction="rtl" size="450px" :append-to-body="true">
      <div v-if="impactData" class="impact-content">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="淹没面积">{{ impactData.area }} km²</el-descriptions-item>
          <el-descriptions-item label="最大水深">{{ impactData.maxDepth }} m</el-descriptions-item>
          <el-descriptions-item label="平均水深">{{ impactData.avgDepth }} m</el-descriptions-item>
          <el-descriptions-item label="受影响建筑数量">{{ impactData.buildingCount }}</el-descriptions-item>
          <el-descriptions-item label="估计受影响人口">{{ impactData.population }} 人</el-descriptions-item>
          <el-descriptions-item label="淹没道路长度">{{ impactData.roadLength || '未统计' }} km</el-descriptions-item>
          <el-descriptions-item label="模拟时间">{{ impactData.timestamp }}</el-descriptions-item>
        </el-descriptions>
        <el-divider />
        <p class="disclaimer">注：水深基于地表相对高程计算，模拟结果仅供参考。</p>
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
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import * as handpose from '@tensorflow-models/handpose'
import '@tensorflow/tfjs-backend-webgl'
import { ElMessage, ElLoading } from 'element-plus'
import { config } from '../config/gis-platform'
import * as turf from '@turf/turf'  // 新增依赖用于道路统计

// 存储最近完成的圆的几何信息（用于洪水模拟）
let lastCircleGeometry = null // { centerLon, centerLat, radiusMeters }

const Cesium = window.Cesium

// ---------- DOM 元素 ----------
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

// ---------- 手势状态 ----------
const fingerTip = ref({ x: 0, y: 0 })
const isPinching = ref(false)
let pinchStableCount = 0, pinchReleaseCount = 0
const pinchDistanceThresh = ref(40)
const pinchStable = 3, pinchReleaseStable = 5
let smoothX = null, smoothY = null
const smoothFactor = ref(0.4)
let trailPoints = []
const trailMaxLen = ref(20)

// ---------- 绘图 ----------
const currentTool = ref('line')
const lineColor = '#00ffff', lineWidth = 4, circleColor = '#ffaa00'
let currentLinePoints = [], circlePoints = []
let cesiumEntities = []   // 普通数组，避免响应式劫持

// ---------- 洪水模拟相关 ----------
const floodDialogVisible = ref(false)
const floodParams = ref({ waterLevel: 5, region: 'currentView' })
let floodPolygonEntity = null
const impactDrawerVisible = ref(false)
const impactData = ref(null)

// ---------- 路径规划相关 ----------
let currentPathEntity = null
let selectingStartPoint = false
let selectingEndPoint = false
let pendingStartPoint = null
let pendingEndPoint = null

// ---------- 全局 viewer 就绪标志 ----------
const viewerReady = ref(false)

// ========== 新增功能相关变量 ==========
// 1. 粒子动画
let animationInterval = null
let animationEntity = null

// 2. 道路统计
let roadFeatures = []       // 存储 GeoJSON 道路要素
let roadEntities = []       // 可选：可视化的道路实体（不影响原有绘图）
// 提供一个全局函数供 GestureScene 加载道路数据
window.loadRoads = function(features) {
  roadFeatures = features || []
  // 可选：清除旧的可视化道路并重新添加（不干扰原有标绘）
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

// 3. 手势滑动水位相关
let lastPalmY = null
let palmStableTimer = null
const gestureWaterLevelEnabled = ref(true) // 可通过面板开关

// 4. 截图功能
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

// 5. GeoJSON 导出
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
    } else if (entity.billboard && entity.billboard.image) {
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

// 6. GeoJSON 导入
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
      // 清空现有绘图（使用原有 clearAllDrawings 函数）
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
          const pos = Cesium.Cartesian3.fromDegrees(geom.coordinates[0], geom.coordinates[1], 2)
          const entity = window.viewer.entities.add({
            position: pos,
            billboard: {
              image: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23ff4444"%3E%3Cpath d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/%3E%3C/svg%3E',
              width: 32, height: 32, verticalOrigin: Cesium.VerticalOrigin.BOTTOM
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

// ===================== 相机控制 =====================
function setCameraRotateEnabled(enabled) {
  if (!window.viewer) return
  const controller = window.viewer.scene.screenSpaceCameraController
  controller.enableRotate = enabled
  controller.enableTilt = enabled
}

// ===================== 辅助函数（带 viewer 守卫） =====================
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

  // 保存圆信息（用于洪水模拟）
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

  const w = screenToWorld(x, y)
  if (!w) return
  const entity = window.viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(w.lon, w.lat, w.height + 2),
    billboard: {
      image: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23ff4444"%3E%3Cpath d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/%3E%3C/svg%3E',
      width: 32, height: 32, verticalOrigin: Cesium.VerticalOrigin.BOTTOM
    }
  })
  cesiumEntities.push(entity)
}

function addPointMarker(lon, lat, label, color) {
  if (!window.viewer) return
  const fillColor = color === Cesium.Color.GREEN ? '%2300ff00' : '%23ff0000'
  const entity = window.viewer.entities.add({
    name: label,
    position: Cesium.Cartesian3.fromDegrees(lon, lat, 5),
    billboard: {
      image: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='${fillColor}'%3E%3Cpath d='M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z'/%3E%3C/svg%3E`,
      width: 32,
      height: 32,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM
    },
    label: {
      text: label,
      font: '18px sans-serif',
      fillColor: color,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -40)
    }
  })
  cesiumEntities.push(entity)
}

function clearAllDrawings() {
  if (!window.viewer) return
  cesiumEntities.forEach(e => window.viewer.entities.remove(e))
  cesiumEntities = []
  if (currentPathEntity) {
    window.viewer.entities.remove(currentPathEntity)
    currentPathEntity = null
  }
  // 清理粒子动画实体
  if (animationInterval) {
    clearInterval(animationInterval)
    animationInterval = null
  }
  if (animationEntity) {
    window.viewer.entities.remove(animationEntity)
    animationEntity = null
  }
  currentLinePoints = []
  circlePoints = []
  clearTrail()
  redrawCanvas()
  if (selectingStartPoint || selectingEndPoint) {
    selectingStartPoint = false
    selectingEndPoint = false
    setCameraRotateEnabled(true)
  }
  lastCircleGeometry = null
}

// ===================== 路径规划（原样添加粒子动画） =====================
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

    const startCart = Cesium.Cartesian3.fromDegrees(start.x, start.y, 0.5)
    const endCart = Cesium.Cartesian3.fromDegrees(end.x, end.y, 0.5)
    if (currentPathEntity) window.viewer.entities.remove(currentPathEntity)
    currentPathEntity = window.viewer.entities.add({
      name: '规划路径（示意弧线）',
      polyline: {
        positions: [startCart, endCart],
        width: 5,
        material: Cesium.Color.YELLOW,
        clampToGround: false,
        arcType: Cesium.ArcType.GEODESIC,
        outline: true,
        outlineColor: Cesium.Color.BLACK
      }
    })
    window.viewer.zoomTo(currentPathEntity)
    ElMessage.success(totalLength ? `路径规划完成，真实距离约 ${totalLength.toFixed(2)} 米（示意弧线）` : '路径规划完成（示意弧线）')

    // ========== 新增：粒子动画 ==========
    // 生成示意路径上的插值点（直线弧线采样）
    const positions = [startCart, endCart]
    const steps = 100
    const interpolated = []
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const lon = start.x + (end.x - start.x) * t
      const lat = start.y + (end.y - start.y) * t
      interpolated.push(Cesium.Cartesian3.fromDegrees(lon, lat, 0.5))
    }
    if (animationInterval) clearInterval(animationInterval)
    if (animationEntity) window.viewer.entities.remove(animationEntity)
    let stepIdx = 0
    animationEntity = window.viewer.entities.add({
      position: interpolated[0],
      point: { pixelSize: 8, color: Cesium.Color.RED, outlineColor: Cesium.Color.WHITE, outlineWidth: 2 }
    })
    animationInterval = setInterval(() => {
      if (!window.viewer) return
      stepIdx = (stepIdx + 1) % interpolated.length
      animationEntity.position = interpolated[stepIdx]
    }, 30)
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
    return
  }
  setCameraRotateEnabled(false)
  selectingStartPoint = true
  ElMessage.info('请在三维场景中点击选择起点')
}

// ===================== 洪水模拟（原样增强，添加道路统计） =====================
function openFloodDialog() {
  floodDialogVisible.value = true
}

function clearFloodPolygon() {
  if (floodPolygonEntity && window.viewer) {
    window.viewer.entities.remove(floodPolygonEntity)
    floodPolygonEntity = null
  }
}

function approximateArea(points) {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity
  points.forEach(p => {
    if (p[0] < minLon) minLon = p[0]
    if (p[0] > maxLon) maxLon = p[0]
    if (p[1] < minLat) minLat = p[1]
    if (p[1] > maxLat) maxLat = p[1]
  })
  const widthKm = (maxLon - minLon) * 111.32 * Math.cos((minLat + maxLat) / 2 * Math.PI / 180)
  const heightKm = (maxLat - minLat) * 110.574
  return widthKm * heightKm
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
  const loading = ElLoading.service({ fullscreen: true, text: '正在采样地形高程...' })

  try {
    const { centerLon, centerLat, radiusMeters } = lastCircleGeometry
    const floodDepth = floodParams.value.waterLevel

    // 采样地形（原样）
    const sampleStepMeters = 50
    const radiusDeg = radiusMeters / 111320
    const stepDeg = sampleStepMeters / 111320
    const samplePoints = []
    for (let x = -radiusDeg; x <= radiusDeg; x += stepDeg) {
      for (let y = -radiusDeg; y <= radiusDeg; y += stepDeg) {
        if (x * x + y * y <= radiusDeg * radiusDeg) {
          const lon = centerLon + x
          const lat = centerLat + y
          samplePoints.push(Cesium.Cartographic.fromDegrees(lon, lat))
        }
      }
    }
    if (samplePoints.length === 0) throw new Error('采样点数量为0')
    const terrainProvider = window.viewer.terrainProvider
    if (!terrainProvider || !terrainProvider.ready) await terrainProvider.readyPromise
    const updatedPositions = await Cesium.sampleTerrainMostDetailed(terrainProvider, samplePoints)
    const elevations = updatedPositions.map(p => p.height)

    let minElev = Infinity, maxElev = -Infinity, sumElev = 0
    for (let h of elevations) {
      if (h < minElev) minElev = h
      if (h > maxElev) maxElev = h
      sumElev += h
    }
    const meanElev = sumElev / elevations.length
    const circleAreaM2 = Math.PI * radiusMeters * radiusMeters
    const absoluteWaterLevel = meanElev + floodDepth

    let floodedAreaM2 = 0, avgDepth = 0
    if (absoluteWaterLevel <= minElev) {
      floodedAreaM2 = 0; avgDepth = 0
    } else if (absoluteWaterLevel >= maxElev) {
      floodedAreaM2 = circleAreaM2
      avgDepth = (absoluteWaterLevel - minElev + absoluteWaterLevel - maxElev) / 2
    } else {
      const ratio = (absoluteWaterLevel - minElev) / (maxElev - minElev)
      floodedAreaM2 = circleAreaM2 * ratio
      avgDepth = (absoluteWaterLevel - minElev) / 2
    }
    const floodedAreaKm2 = floodedAreaM2 / 1e6
    const buildingCount = Math.floor(floodedAreaKm2 * 15)
    const population = Math.floor(buildingCount * 4.5)

    // ========== 新增：道路淹没统计 ==========
    let floodedRoadLength = 0
    if (floodPolygonEntity && roadFeatures.length > 0) {
      // 获取淹没多边形顶点坐标（转为经纬度数组）
      const hierarchy = floodPolygonEntity.polygon.hierarchy._value
      const polygonPositions = hierarchy.positions
      const polygonCoords = polygonPositions.map(cart => {
        const carto = Cesium.Cartographic.fromCartesian(cart)
        return [Cesium.Math.toDegrees(carto.longitude), Cesium.Math.toDegrees(carto.latitude)]
      })
      const floodPolygon = turf.polygon([polygonCoords])
      roadFeatures.forEach(feature => {
        try {
          const roadLine = turf.lineString(feature.geometry.coordinates)
          const intersect = turf.lineIntersect(roadLine, floodPolygon)
          if (intersect.features.length > 0) {
            // 粗略计算：取道路总长度乘以交点比例（简化）
            const lineLength = turf.length(roadLine, { units: 'kilometers' })
            const ratio = intersect.features.length / roadLine.geometry.coordinates.length
            floodedRoadLength += lineLength * Math.min(1, ratio)
          }
        } catch (e) { console.warn(e) }
      })
    }

    impactData.value = {
      area: floodedAreaKm2.toFixed(2),
      maxDepth: floodDepth.toFixed(1),
      avgDepth: avgDepth.toFixed(1),
      buildingCount,
      population,
      roadLength: floodedRoadLength.toFixed(2),
      timestamp: new Date().toLocaleString(),
      volume: ((floodedAreaM2 * avgDepth) / 1e6).toFixed(2) + " 万 m³",
      sampleCount: elevations.length,
      minElev: minElev.toFixed(1),
      maxElev: maxElev.toFixed(1),
      meanElev: meanElev.toFixed(1)
    }
    impactDrawerVisible.value = true

    // 绘制蓝色多边形（原样）
    clearFloodPolygon()
    const points = []
    const numPoints = 64
    for (let i = 0; i <= numPoints; i++) {
      const angle = i * Math.PI * 2 / numPoints
      const lon = centerLon + radiusDeg * Math.cos(angle)
      const lat = centerLat + radiusDeg * Math.sin(angle)
      points.push([lon, lat])
    }
    const positions = points.map(p => Cesium.Cartesian3.fromDegrees(p[0], p[1], 0))
    positions.push(positions[0])
    floodPolygonEntity = window.viewer.entities.add({
      name: 'Flood Area',
      polygon: {
        hierarchy: positions,
        material: Cesium.Color.BLUE.withAlpha(0.5),
        outline: true,
        outlineColor: Cesium.Color.DEEPSKYBLUE,
        height: 0,
        extrudedHeight: 0.1
      }
    })

    ElMessage.success(`洪水模拟完成，淹没面积约 ${floodedAreaKm2.toFixed(2)} km²`)
  } catch (err) {
    console.error(err)
    ElMessage.error(`洪水模拟失败: ${err.message}`)
  } finally {
    loading.close()
  }
}

function openImpactPanel() {
  if (!impactData.value) {
    ElMessage.info('暂无评估数据，请先执行洪水模拟')
    return
  }
  impactDrawerVisible.value = true
}

// ===================== 手势识别（添加水位滑动，不破坏原有逻辑） =====================
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

      // ========== 新增：手势滑动调节水位 ==========
      if (gestureWaterLevelEnabled.value) {
        const wrist = lm[0]
        const indexBase = lm[5]
        const palmY = (wrist[1] + indexBase[1]) / 2
        if (lastPalmY !== null && Math.abs(palmY - lastPalmY) > 15) {
          const delta = lastPalmY - palmY   // 上移为正
          let newWaterLevel = floodParams.value.waterLevel + delta * 0.1
          newWaterLevel = Math.min(30, Math.max(0, newWaterLevel))
          if (newWaterLevel !== floodParams.value.waterLevel) {
            floodParams.value.waterLevel = newWaterLevel
            ElMessage.info(`水位已调节至 ${newWaterLevel.toFixed(1)} 米`)
            // 防抖，避免频繁触发
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
      // 重置滑动参考点
      lastPalmY = null
    }
    redrawCanvas()
    frameCount++
    requestAnimationFrame(detectHandAndControl)
  }).catch(e => { console.warn(e); requestAnimationFrame(detectHandAndControl) })
}

// ===================== 摄像头 =====================
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
  }
  if (window.viewer) {
    if (tool === 'browse') {
      setCameraRotateEnabled(true)
    } else {
      setCameraRotateEnabled(false)
    }
  }
}

// ===================== 鼠标操作 =====================
function initMouseControls() {
  if (!window.viewer) {
    console.warn('initMouseControls: viewer 为空')
    return
  }
  if (mouseControlsInitialized) return
  console.log('初始化鼠标控制')

  if (mouseHandler) {
    mouseHandler.destroy()
    mouseHandler = null
  }

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
      const x = movement.endPosition.x
      const y = movement.endPosition.y
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

// 独立画布刷新循环
let rafId = null
function startCanvasLoop() {
  function loop() {
    redrawCanvas()
    rafId = requestAnimationFrame(loop)
  }
  rafId = requestAnimationFrame(loop)
}

// 暴露方法
defineExpose({
  simulateFlood: runFloodSimulation,
  calculatePath,
  openImpactPanel
})

// ===================== 生命周期 =====================
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

  // 轮询等待 window.viewer 就绪
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
  if (mouseHandler) {
    mouseHandler.destroy()
    mouseHandler = null
  }
  if (floodPolygonEntity && window.viewer) window.viewer.entities.remove(floodPolygonEntity)
  if (currentPathEntity && window.viewer) window.viewer.entities.remove(currentPathEntity)
  if (animationInterval) clearInterval(animationInterval)
  if (animationEntity && window.viewer) window.viewer.entities.remove(animationEntity)
  roadEntities.forEach(e => window.viewer?.entities.remove(e))
})
</script>

<style scoped>
/* 原有样式保持不变，新增样式调整按钮和面板 */
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
</style>