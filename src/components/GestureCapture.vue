<template>
  <div class="gesture-container">
    <video
        ref="videoRef"
        autoplay
        playsinline
        class="gesture-video"
        :class="{ hidden: !showVideo }"
    ></video>

    <canvas ref="canvasRef" class="draw-canvas"></canvas>

    <div class="info-panel">
      <p>摄像头状态: {{ cameraStatus }}</p>
      <p>模型状态: {{ modelStatus }}</p>
      <p>指尖坐标: {{ fingerTip }}</p>
      <p>当前工具: {{ currentTool }}</p>
      <p>捏合状态: {{ isPinching ? '✅ 捏合中' : '❌ 未捏合' }}</p>
      <div>
        <button @click="setTool('line')" :class="{ active: currentTool === 'line' }">画线</button>
        <button @click="setTool('circle')" :class="{ active: currentTool === 'circle' }">画圆</button>
        <button @click="setTool('place')" :class="{ active: currentTool === 'place' }">放置</button>
        <button @click="clearCanvas">清除</button>
        <button @click="toggleVideo">{{ showVideo ? '隐藏' : '显示' }}视频</button>
        <button @click="startCamera" :disabled="cameraEnabled">打开摄像头</button>
        <button @click="stopCamera" :disabled="!cameraEnabled">关闭摄像头</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import * as handpose from '@tensorflow-models/handpose'
import * as tf from '@tensorflow/tfjs-core'
import '@tensorflow/tfjs-backend-webgl'

// 拖尾轨迹
let trailPoints = []
const TRAIL_MAX_LEN = 15

// 摄像头
const videoRef = ref(null)
const cameraStatus = ref('未初始化')
const showVideo = ref(true)
const cameraEnabled = ref(false)
let mediaStream = null

// 手势模型
let handModel = null
let animationId = null
const fingerTip = ref({ x: 0, y: 0 })
const modelStatus = ref('未加载')

// 捏合检测
let lastDist = 0
let pinchStableCount = 0
let pinchReleaseCount = 0
const isPinching = ref(false)
const PINCH_THRESH = 40
const PINCH_STABLE = 2
const PINCH_RELEASE_STABLE = 3

// 坐标平滑
let smoothX = null
let smoothY = null
const SMOOTH_FACTOR = 0.25

// 移动限制（关键：解决移动太频繁）
let lastMoveX = 0
let lastMoveY = 0
const MOVE_MIN_DISTANCE = 4
const DRAW_INTERVAL = 3
let frameCount = 0

function smoothCoordinate(rawX, rawY) {
  if (smoothX === null) {
    smoothX = rawX
    smoothY = rawY
  }
  smoothX += (rawX - smoothX) * SMOOTH_FACTOR
  smoothY += (rawY - smoothY) * SMOOTH_FACTOR
  return { x: smoothX, y: smoothY }
}

// 画布
const canvasRef = ref(null)
let ctx = null
let canvasWidth = 0
let canvasHeight = 0

let lines = []
let circles = []
let placements = []
let currentLinePoints = []
let circlePoints = []

const currentTool = ref('line')
const lineColor = '#ff6600'
const lineWidth = 5
const circleColor = '#00aaff'

// 拖尾
const addTrailPoint = (x, y) => {
  trailPoints.push({ x, y })
  if (trailPoints.length > TRAIL_MAX_LEN) trailPoints.shift()
}
const clearTrail = () => { trailPoints = [] }

// 摄像头
const startCamera = async () => {
  if (cameraEnabled.value) return
  cameraStatus.value = '请求权限...'
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: 640, height: 480 }
    })
    mediaStream = stream
    videoRef.value.srcObject = stream
    videoRef.value.onloadedmetadata = () => {
      videoRef.value.play().catch(() => {})
      cameraStatus.value = '已开启'
      cameraEnabled.value = true
      startDrawLoop() // 启动绘制循环
    }
  } catch (err) {
    cameraStatus.value = '失败'
  }
}

const stopCamera = () => {
  mediaStream?.getTracks().forEach(t => t.stop())
  mediaStream = null
  videoRef.value.srcObject = null
  cameraStatus.value = '已关闭'
  cameraEnabled.value = false
  // 不停止绘制循环！只停止手势检测
}

const toggleVideo = () => {
  showVideo.value = !showVideo.value
}

// 捏合检测
function detectPinch(thumb, index) {
  const dx = index.x - thumb.x
  const dy = index.y - thumb.y
  const dist = Math.hypot(dx, dy)

  if (dist < PINCH_THRESH) {
    pinchStableCount++
    pinchReleaseCount = 0
    if (pinchStableCount >= PINCH_STABLE) return true
  } else {
    pinchReleaseCount++
    pinchStableCount = 0
    if (pinchReleaseCount >= PINCH_RELEASE_STABLE) return false
  }
  return isPinching.value
}

// 模型加载
const loadHandModel = async () => {
  modelStatus.value = '加载中...'
  await tf.setBackend('webgl')
  try {
    handModel = await handpose.load()
    modelStatus.value = '已就绪'
  } catch (e) {
    modelStatus.value = '加载失败'
  }
}

// 手势检测（只在摄像头开启时运行）
const detectHand = async () => {
  if (!handModel || !cameraEnabled.value) return
  try {
    const res = await handModel.estimateHands(videoRef.value)
    if (res.length > 0) {
      const lm = res[0].landmarks
      const thumb = lm[4]
      const index = lm[8]

      const vw = videoRef.value.videoWidth || 640
      const vh = videoRef.value.videoHeight || 480
      let ix = index[0] * canvasWidth / vw
      let iy = index[1] * canvasHeight / vh
      let tx = thumb[0] * canvasWidth / vw
      let ty = thumb[1] * canvasHeight / vh

      const pos = smoothCoordinate(ix, iy)
      fingerTip.value = pos

      const pinching = detectPinch({ x: tx, y: ty }, pos)
      if (pinching !== isPinching.value) {
        isPinching.value = pinching
        if (pinching) onPinchStart(pos.x, pos.y)
        else onPinchEnd()
      }

      if (isPinching.value) {
        const dx = Math.abs(pos.x - lastMoveX)
        const dy = Math.abs(pos.y - lastMoveY)
        const enoughDist = dx > MOVE_MIN_DISTANCE || dy > MOVE_MIN_DISTANCE
        const enoughFrame = frameCount % DRAW_INTERVAL === 0

        if (enoughDist && enoughFrame) {
          onPinchingMove(pos.x, pos.y)
          lastMoveX = pos.x
          lastMoveY = pos.y
        }
      }
      addTrailPoint(pos.x, pos.y)
    } else {
      if (currentLinePoints.length > 1) finishLine()
      if (circlePoints.length > 0) {
        tryFitCircle()
        circlePoints = []
      }
    }
  } catch (e) {}
}

// 全局独立绘制循环（永远运行，不受摄像头影响）
const startDrawLoop = () => {
  if (animationId) return
  const loop = () => {
    frameCount++
    detectHand() // 只做手势检测，不影响绘制
    redrawCanvas() // 独立刷新画面
    animationId = requestAnimationFrame(loop)
  }
  loop()
}

// 手势行为
function onPinchStart(x, y) {
  lastMoveX = x
  lastMoveY = y
  if (currentTool.value === 'line') currentLinePoints = [{ x, y }]
  if (currentTool.value === 'circle') circlePoints = [{ x, y }]
  if (currentTool.value === 'place') placements.push({ x, y })
}

function onPinchingMove(x, y) {
  if (currentTool.value === 'line') currentLinePoints.push({ x, y })
  if (currentTool.value === 'circle') circlePoints.push({ x, y })
}

function onPinchEnd() {
  if (currentTool.value === 'line') finishLine()
  if (currentTool.value === 'circle') {
    tryFitCircle()
    circlePoints = []
  }
}

// 画线完成
function finishLine() {
  if (currentLinePoints.length > 1) {
    lines.push({ points: [...currentLinePoints] })
  }
  currentLinePoints = []
}

// 圆拟合
function tryFitCircle() {
  if (circlePoints.length < 5) return
  let sumX = 0, sumY = 0
  circlePoints.forEach(p => { sumX += p.x; sumY += p.y })
  const cx = sumX / circlePoints.length
  const cy = sumY / circlePoints.length
  let sumR = 0
  circlePoints.forEach(p => {
    sumR += Math.hypot(p.x - cx, p.y - cy)
  })
  const r = sumR / circlePoints.length
  if (r > 8 && r < 400) {
    circles.push({ x: cx, y: cy, radius: r })
  }
}

// 画布绘制
function initCanvas() {
  const c = canvasRef.value
  c.width = window.innerWidth
  c.height = window.innerHeight
  canvasWidth = c.width
  canvasHeight = c.height
  ctx = c.getContext('2d')
}

function redrawCanvas() {
  if (!ctx) return
  ctx.clearRect(0, 0, canvasWidth, canvasHeight)

  // 已画线条
  lines.forEach(line => {
    ctx.beginPath()
    ctx.lineWidth = lineWidth
    ctx.lineCap = 'round'
    ctx.strokeStyle = lineColor
    ctx.moveTo(line.points[0].x, line.points[0].y)
    line.points.forEach(p => ctx.lineTo(p.x, p.y))
    ctx.stroke()
  })

  // 当前线条（实时）
  if (currentLinePoints.length > 1) {
    ctx.beginPath()
    ctx.lineWidth = lineWidth
    ctx.strokeStyle = lineColor
    ctx.lineCap = 'round'
    ctx.moveTo(currentLinePoints[0].x, currentLinePoints[0].y)
    currentLinePoints.forEach(p => ctx.lineTo(p.x, p.y))
    ctx.stroke()
  }

  // 圆
  circles.forEach(c => {
    ctx.beginPath()
    ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2)
    ctx.strokeStyle = circleColor
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.fillStyle = 'rgba(0,170,255,0.15)'
    ctx.fill()
  })

  // 实时圆轨迹
  if (circlePoints.length > 1) {
    ctx.beginPath()
    ctx.setLineDash([5,5])
    ctx.lineWidth = 2
    ctx.strokeStyle = circleColor
    ctx.moveTo(circlePoints[0].x, circlePoints[0].y)
    circlePoints.forEach(p => ctx.lineTo(p.x, p.y))
    ctx.stroke()
    ctx.setLineDash([])
  }

  // 放置点
  placements.forEach(p => {
    ctx.beginPath()
    ctx.arc(p.x, p.y, 9, 0, Math.PI * 2)
    ctx.fillStyle = '#ff4444'
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = '16px Arial'
    ctx.fillText('📍', p.x - 10, p.y - 14)
  })

  // 拖尾
  if (cameraEnabled.value) {
    trailPoints.forEach((p, i) => {
      const a = (i + 1) / trailPoints.length
      ctx.beginPath()
      ctx.arc(p.x, p.y, 6 * a, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(255,200,0,${a * 0.7})`
      ctx.fill()
    })
  }
}

// 工具 & 清空
const setTool = (t) => {
  currentTool.value = t
  currentLinePoints = []
  circlePoints = []
  clearTrail()
  redrawCanvas() // 强制刷新
}

const clearCanvas = () => {
  lines = []
  circles = []
  placements = []
  currentLinePoints = []
  circlePoints = []
  clearTrail()
  redrawCanvas() // 强制刷新
}

// 适配窗口
const resize = () => {
  initCanvas()
}

onMounted(async () => {
  await nextTick()
  initCanvas()
  window.addEventListener('resize', resize)
  startDrawLoop() // 启动独立绘制循环
  await startCamera()
  await loadHandModel()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(animationId)
  stopCamera()
  window.removeEventListener('resize', resize)
})
</script>

<style scoped>
.gesture-container {
  width: 100vw;
  height: 100vh;
  background: #111;
  position: relative;
  overflow: hidden;
}

.draw-canvas {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 10;
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
}

.gesture-video.hidden {
  display: none;
}

.info-panel {
  position: fixed;
  top: 20px;
  left: 20px;
  background: rgba(0,0,0,0.8);
  color: #0f0;
  padding: 14px;
  border-radius: 10px;
  z-index: 101;
  font-family: monospace;
  font-size: 13px;
}

button {
  margin: 4px;
  padding: 6px 10px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
}
button.active {
  background: #0f0;
  color: #000;
  font-weight: bold;
}
button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>