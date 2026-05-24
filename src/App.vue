<template>
  <div id="app">
    <GestureScene ref="sceneRef" />
    <GestureCapture :viewer="viewer" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import GestureScene from './components/GestureScene.vue'
import GestureCapture from './components/GestureCapture.vue'

const sceneRef = ref(null)
const viewer = ref(null)

onMounted(() => {
  // 延迟获取 viewer，确保子组件已初始化
  setTimeout(() => {
    viewer.value = sceneRef.value?.getViewer()
    console.log('viewer obtained:', viewer.value)
  }, 300)
})
</script>

<style>
/* 确保 #app 全屏且无额外样式干扰 */
#app {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  position: relative;
}
</style>