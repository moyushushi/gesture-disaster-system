<template>
  <div id="app">
    <GestureScene />
  </div>
</template>

<script setup>
import GestureScene from './components/GestureScene.vue'
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
html, body, #app {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>