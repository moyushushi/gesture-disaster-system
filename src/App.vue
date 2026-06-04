<template>
  <div id="app">
    <GestureScene ref="sceneRef" />
    <GestureCapture />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import GestureScene from './components/GestureScene.vue'
import GestureCapture from './components/GestureCapture.vue'

const sceneRef = ref(null)

onMounted(() => {
  setTimeout(() => {
    if (sceneRef.value) {
      window.viewer = sceneRef.value.getViewer()
      console.log('viewer 已挂载到 window.viewer')
    }
  }, 300)
})
</script>

<style>
#app {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  position: relative;
}
</style>