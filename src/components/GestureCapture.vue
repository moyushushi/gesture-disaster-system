<template>
  <div class="gesture-container">
    <video ref="videoRef" autoplay muted playsinline class="gesture-video" :class="{ hidden: !showVideo }"></video>
    <canvas ref="canvasRef" class="draw-canvas"></canvas>

    <div class="control-panel">
      <button @click="startCamera" :disabled="cameraEnabled">📷 打开摄像头</button>
      <button @click="stopCamera" :disabled="!cameraEnabled">📷 关闭摄像头</button>
      <button @click="toggleVideo" :disabled="!cameraEnabled">{{ showVideo ? '隐藏视频' : '显示视频' }}</button>
      <button @click="setTool('line')" :class="{ active: currentTool === 'line' }">✏️ 线</button>
      <button @click="setTool('circle')" :class="{ active: currentTool === 'circle' }">⭕ 圆</button>
      <button @click="setTool('place')" :class="{ active: currentTool === 'place' }">📍 点</button>
      <button @click="setTool('browse')" :class="{ active: currentTool === 'browse' }">🔍 浏览</button>
      <button @click="clearAllDrawings">🗑️ 清空</button>

      <button @click="openFloodDialog" :disabled="!props.viewer">🌊 洪水模拟</button>
      <button @click="calculatePathWithSelection" :disabled="!props.viewer">🗺️ 路径规划</button>
      <button @click="openImpactPanel" :disabled="!props.viewer">📊 影响评估</button>
    </div>

    <div class="params-panel">
      <h4>✋ 手势参数</h4>
      <div class="param-row"><label>捏合阈值</label><input type="range" min="20" max="80" step="1" v-model.number="pinchDistanceThresh" /></div>
      <div class="param-row"><label>平滑因子</label><input type="range" min="0" max="0.95" step="0.01" v-model.number="smoothFactor" /></div>
      <div class="param-row"><label>拖尾长度</label><input type="range" min="5" max="40" step="1" v-model.number="trailMaxLen" /></div>
    </div>

    <!-- 洪水参数设置弹窗 -->
    <el-dialog v-model="floodDialogVisible" title="洪水模拟参数" width="400px" :modal="true" :append-to-body="true">
      <el-form :model="floodParams" label-width="100px">
        <el-form-item label="水位(米)">
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

    <!-- 影响评估侧边栏 -->
    <el-drawer v-model="impactDrawerVisible" title="洪水影响评估报告" direction="rtl" size="450px" :append-to-body="true">
      <div v-if="impactData" class="impact-content">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="淹没面积">{{ impactData.area }} km²</el-descriptions-item>
          <el-descriptions-item label="最大水深">{{ impactData.maxDepth }} m</el-descriptions-item>
          <el-descriptions-item label="平均水深">{{ impactData.avgDepth }} m</el-descriptions-item>
          <el-descriptions-item label="受影响建筑数量">{{ impactData.buildingCount }}</el-descriptions-item>
          <el-descriptions-item label="估计受影响人口">{{ impactData.population }} 人</el-descriptions-item>
          <el-descriptions-item label="模拟时间">{{ impactData.timestamp }}</el-descriptions-item>
        </el-descriptions>
        <el-divider />
        <p class="disclaimer">注：结果为模拟估算，仅供参考。实际需结合精细地形和建筑物数据。</p>
      </div>
      <div v-else class="empty-placeholder">
        <el-empty description="暂无评估数据，请先执行洪水模拟" />
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import * as handpose from '@tensorflow-models/handpose'
import '@tensorflow/tfjs-backend-webgl'
import { ElMessage, ElLoading } from 'element-plus'
import { config } from '../config/gis-platform'

const Cesium = window.Cesium
const props = defineProps({ viewer: { type: Object, default: null } })

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
const cesiumEntities = ref([])

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

// ===================== 辅助函数 =====================
function screenToWorld(x, y) {
  if (!props.viewer) return null
  const ray = props.viewer.camera.getPickRay(new Cesium.Cartesian2(x, y))
  if (!ray) return null
  let pos = props.viewer.scene.globe?.pick(ray, props.viewer.scene)
  if (!pos) pos = props.viewer.camera.pickEllipsoid(ray)
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

  // 绘制拖尾点
  trailPoints.forEach((p, i) => {
    const a = (i + 1) / trailPoints.length
    ctx.beginPath()
    ctx.arc(p.x, p.y, 6 * a, 0, 2 * Math.PI)
    ctx.fillStyle = `rgba(255,200,0,${a * 0.7})`
    ctx.fill()
  })

  // 绘制当前正在画的线（临时）
  if (currentTool.value === 'line' && currentLinePoints.length > 1) {
    ctx.beginPath()
    ctx.lineWidth = lineWidth
    ctx.strokeStyle = lineColor
    ctx.moveTo(currentLinePoints[0].x, currentLinePoints[0].y)
    currentLinePoints.forEach(p => ctx.lineTo(p.x, p.y))
    ctx.stroke()
  }
  // 绘制当前正在画的圆（临时虚线）
  if (currentTool.value === 'circle' && circlePoints.length > 1) {
    ctx.beginPath()
    ctx.setLineDash([5,5])
    ctx.strokeStyle = circleColor
    ctx.moveTo(circlePoints[0].x, circlePoints[0].y)
    circlePoints.forEach(p => ctx.lineTo(p.x, p.y))
    ctx.stroke()
    ctx.setLineDash([])
  }
  // 绘制光标跟随圆点
  ctx.beginPath()
  ctx.arc(fingerTip.value.x, fingerTip.value.y, 10, 0, 2 * Math.PI)
  ctx.fillStyle = 'rgba(0,255,0,0.5)'
  ctx.fill()
}

// 将临时线转为 Cesium 实体
function finishLine() {
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
    const entity = props.viewer.entities.add({
      polyline: { positions, width: lineWidth, material: Cesium.Color.fromCssColorString(lineColor), clampToGround: true }
    })
    cesiumEntities.value.push(entity)
  }
  currentLinePoints = []
}

function finishCircle() {
  if (circlePoints.length < 5) {
    circlePoints = []
    return
  }
  // 计算圆心和半径（像素坐标）
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
  const entity = props.viewer.entities.add({
    position: center,
    ellipse: {
      semiMinorAxis: radius, semiMajorAxis: radius,
      material: Cesium.Color.fromCssColorString(circleColor).withAlpha(0.3),
      outline: true, outlineColor: Cesium.Color.fromCssColorString(circleColor)
    }
  })
  cesiumEntities.value.push(entity)
  circlePoints = []
}

function placePoint(x, y) {
  // 处理路径规划选点模式
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
      ElMessage.success('起点和终点已选，正在规划路径...')
      calculatePath(pendingStartPoint, pendingEndPoint)
    }
    return
  }

  // 普通放置点
  const w = screenToWorld(x, y)
  if (!w) return
  const entity = props.viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(w.lon, w.lat, w.height + 2),
    billboard: {
      image: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23ff4444"%3E%3Cpath d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/%3E%3C/svg%3E',
      width: 32, height: 32, verticalOrigin: Cesium.VerticalOrigin.BOTTOM
    }
  })
  cesiumEntities.value.push(entity)
}

function addPointMarker(lon, lat, label, color) {
  const fillColor = color === Cesium.Color.GREEN ? '%2300ff00' : '%23ff0000'
  const entity = props.viewer.entities.add({
    name: label,
    position: Cesium.Cartesian3.fromDegrees(lon, lat, 5),
    billboard: {
      image: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='${fillColor}'%3E%3Cpath d='M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z'/%3E%3C/svg%3E`,
      width: 32, height: 32, verticalOrigin: Cesium.VerticalOrigin.BOTTOM
    },
    label: {
      text: label,
      font: '16px sans-serif',
      fillColor: color,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.TOP,
      pixelOffset: new Cesium.Cartesian2(0, -20)
    }
  })
  cesiumEntities.value.push(entity)
}

function clearAllDrawings() {
  cesiumEntities.value.forEach(e => props.viewer.entities.remove(e))
  cesiumEntities.value = []
  if (currentPathEntity) {
    props.viewer.entities.remove(currentPathEntity)
    currentPathEntity = null
  }
  currentLinePoints = []
  circlePoints = []
  clearTrail()
  redrawCanvas()
  selectingStartPoint = false
  selectingEndPoint = false
  pendingStartPoint = null
  pendingEndPoint = null
}

// ===================== 路径规划 =====================
async function calculatePath(start, end) {
  if (!props.viewer) {
    ElMessage.error('三维场景未就绪')
    return
  }
  const baseUrl = config.getNetworkUrl()
  if (!baseUrl) {
    ElMessage.error('未配置交通网络分析服务地址，请检查 gis-platform.js')
    return
  }

  const loading = ElLoading.service({ fullscreen: true, text: '正在规划路径...' })
  try {
    const requestBody = {
      nodes: [
        { x: start.x, y: start.y },
        { x: end.x, y: end.y }
      ],
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

    const response = await fetch(`${baseUrl}/bestpath`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const result = await response.json()
    if (!result?.pathList?.length) {
      ElMessage.warning('未找到路径')
      return
    }
    const path = result.pathList[0]
    const routePoints = extractRoutePoints(path)
    if (!routePoints || routePoints.length < 2) throw new Error('无有效几何')
    const cesiumPositions = routePoints.map(p => Cesium.Cartesian3.fromDegrees(p.x, p.y, (p.z || 0) + 0.5))
    if (currentPathEntity) props.viewer.entities.remove(currentPathEntity)
    currentPathEntity = props.viewer.entities.add({
      name: '规划路径',
      polyline: {
        positions: cesiumPositions,
        width: 6,
        material: Cesium.Color.YELLOW,
        clampToGround: true,
        outline: true,
        outlineColor: Cesium.Color.BLACK
      }
    })
    props.viewer.zoomTo(currentPathEntity)
    const length = path.pathLength || path.totalLength
    ElMessage.success(length ? `路径规划完成，距离约 ${length.toFixed(2)} 米` : '路径规划完成')
  } catch (err) {
    console.error(err)
    ElMessage.error(`路径规划失败: ${err.message}`)
  } finally {
    loading.close()
  }
}

function extractRoutePoints(path) {
  let points = null
  if (path.routeGeometry?.points) points = path.routeGeometry.points
  else if (path.edgeFeatures?.length) {
    points = []
    for (let edge of path.edgeFeatures) {
      if (edge.geometry?.points) points.push(...edge.geometry.points)
    }
  } else if (path.points) points = path.points
  if (!points?.length) return null
  return points.map(p => ({ x: p.x, y: p.y, z: p.z || 0 }))
}

function calculatePathWithSelection() {
  if (!props.viewer) return
  if (selectingStartPoint || selectingEndPoint) {
    selectingStartPoint = false
    selectingEndPoint = false
    ElMessage.info('已取消选点')
    return
  }
  selectingStartPoint = true
  ElMessage.info('请在三维场景中点击选择起点')
}

// ===================== 洪水模拟（模拟） =====================
function openFloodDialog() {
  floodDialogVisible.value = true
}
function clearFloodPolygon() {
  if (floodPolygonEntity) {
    props.viewer.entities.remove(floodPolygonEntity)
    floodPolygonEntity = null
  }
}
async function runFloodSimulation() {
  if (!props.viewer) {
    ElMessage.error('三维场景未就绪')
    return
  }
  floodDialogVisible.value = false
  const loading = ElLoading.service({ fullscreen: true, text: '正在计算洪水淹没范围...' })
  try {
    // 获取范围（当前视野或全局）
    let bounds = null
    if (floodParams.value.region === 'currentView') {
      const rect = props.viewer.camera.computeViewRectangle()
      if (rect) {
        bounds = {
          west: Cesium.Math.toDegrees(rect.west),
          south: Cesium.Math.toDegrees(rect.south),
          east: Cesium.Math.toDegrees(rect.east),
          north: Cesium.Math.toDegrees(rect.north)
        }
      } else {
        bounds = { west: 119.5, south: 30.0, east: 120.0, north: 30.5 }
      }
    } else {
      bounds = { west: 119.0, south: 29.8, east: 120.5, north: 30.8 }
    }
    // 模拟多边形（临安区中心椭圆）
    const centerLon = 119.72, centerLat = 30.23
    const radius = 0.05 * (floodParams.value.waterLevel / 5)
    const points = []
    for (let i = 0; i <= 36; i++) {
      const angle = i * Math.PI * 2 / 36
      const lon = centerLon + radius * Math.cos(angle) * 1.2
      const lat = centerLat + radius * Math.sin(angle) * 0.8
      points.push([lon, lat])
    }
    clearFloodPolygon()
    const positions = points.map(p => Cesium.Cartesian3.fromDegrees(p[0], p[1], 0))
    positions.push(positions[0])
    floodPolygonEntity = props.viewer.entities.add({
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
    // 估算影响
    const areaKm2 = approximateArea(points)
    const maxDepth = floodParams.value.waterLevel + Math.random() * 2
    const avgDepth = floodParams.value.waterLevel * 0.8 + Math.random()
    const buildingCount = Math.floor(areaKm2 * 15)
    const population = Math.floor(buildingCount * 4.5)
    impactData.value = {
      area: areaKm2.toFixed(2),
      maxDepth: maxDepth.toFixed(1),
      avgDepth: avgDepth.toFixed(1),
      buildingCount,
      population,
      timestamp: new Date().toLocaleString()
    }
    impactDrawerVisible.value = true
    ElMessage.success(`洪水模拟完成，淹没面积约 ${areaKm2.toFixed(2)} km²`)
  } catch (err) {
    console.error(err)
    ElMessage.error('洪水模拟失败')
  } finally {
    loading.close()
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
  const widthKm = (maxLon - minLon) * 111.32 * Math.cos((minLat+maxLat)/2 * Math.PI/180)
  const heightKm = (maxLat - minLat) * 110.574
  return widthKm * heightKm
}
function openImpactPanel() {
  if (!impactData.value) {
    ElMessage.info('暂无评估数据，请先执行洪水模拟')
    return
  }
  impactDrawerVisible.value = true
}

// ===================== 手势识别 =====================
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
  if (currentTool.value === 'browse') return
  const pos = fingerTip.value
  lastMoveX = pos.x; lastMoveY = pos.y
  if (currentTool.value === 'line') currentLinePoints = [{ x: pos.x, y: pos.y }]
  else if (currentTool.value === 'circle') circlePoints = [{ x: pos.x, y: pos.y }]
  else if (currentTool.value === 'place') placePoint(pos.x, pos.y)
}
function onPinchingMove(x, y) {
  if (currentTool.value === 'browse') return
  if (currentTool.value === 'line') currentLinePoints.push({ x, y })
  else if (currentTool.value === 'circle') circlePoints.push({ x, y })
}
function onPinchEnd() {
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
}

// ===================== 鼠标操作（核心修复） =====================
function initMouseControls() {
  if (!props.viewer) {
    console.warn('initMouseControls: viewer 为空')
    return
  }
  if (mouseControlsInitialized) return
  console.log('初始化鼠标控制')

  if (mouseHandler) {
    mouseHandler.destroy()
    mouseHandler = null
  }

  mouseHandler = new Cesium.ScreenSpaceEventHandler(props.viewer.scene.canvas)

  // 鼠标移动：更新指尖位置并重绘
  mouseHandler.setInputAction((movement) => {
    const pos = movement.endPosition
    fingerTip.value = { x: pos.x, y: pos.y }
    redrawCanvas()
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)

  // 左键按下：开始绘制或放置点
  mouseHandler.setInputAction((clickEvent) => {
    if (currentTool.value === 'browse') return
    const pos = clickEvent.position
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

  // 鼠标移动时（如果正在绘制）添加点
  mouseHandler.setInputAction((movement) => {
    if (mouseDrawing) {
      const x = movement.endPosition.x
      const y = movement.endPosition.y
      if (currentTool.value === 'line') currentLinePoints.push({ x, y })
      else if (currentTool.value === 'circle') circlePoints.push({ x, y })
      redrawCanvas()
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)

  // 左键弹起：结束绘制
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

// 独立画布刷新循环（保证光标跟随）
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
  startCanvasLoop() // 启动独立重绘循环

  if (props.viewer) initMouseControls()
  watch(() => props.viewer, (v) => {
    if (v && !mouseControlsInitialized) initMouseControls()
  }, { immediate: true })
})

onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId)
  if (mediaStream) mediaStream.getTracks().forEach(t => t.stop())
  if (mouseHandler) {
    mouseHandler.destroy()
    mouseHandler = null
  }
  if (floodPolygonEntity && props.viewer) props.viewer.entities.remove(floodPolygonEntity)
  if (currentPathEntity && props.viewer) props.viewer.entities.remove(currentPathEntity)
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
</style>