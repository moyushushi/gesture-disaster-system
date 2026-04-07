# Gesture Disaster System - AI Agent Guidelines

## Project Overview
This is a Vue 3 + Vite application for disaster simulation with gesture-based interaction using 3D GIS mapping. It integrates SuperMap (Cesium-based) for 3D visualization, TensorFlow.js for hand pose detection, and Element Plus for UI components.

## Architecture
- **Frontend Framework**: Vue 3 with `<script setup>` syntax (see `src/App.vue`)
- **Build Tool**: Vite, configured to output to `docs/` directory with base path `/gesture-disaster-system/` (see `vite.config.js`)
- **3D Engine**: Cesium.js loaded globally in `docs/index.html`, with SuperMap Vue plugin for integration
- **State Management**: Pinia (imported but not yet used in components)
- **Gesture Recognition**: TensorFlow hand pose detection for interactive controls
- **UI Library**: Element Plus with global import in `src/main.js`

## Key Directories & Files
- `src/components/`: Vue components (e.g., `HelloWorld.vue` - placeholder component)
- `docs/`: Build output directory containing the deployed app and Cesium assets
- `public/Cesium/`: Static Cesium library files
- `vite.config.js`: Build config with Three.js alias and custom asset handling

## Development Workflows
- **Start Dev Server**: `npm run dev` (Vite dev server)
- **Build for Production**: `npm run build` (outputs to `docs/`)
- **Preview Build**: `npm run preview` (serves from `docs/`)
- **Deployment**: Built files in `docs/` are served from `/gesture-disaster-system/` base path

## Coding Patterns & Conventions
- Use Vue 3 Composition API with `<script setup>` for all components
- Import Element Plus components directly (no tree-shaking configured)
- Load Cesium.js globally before Vue app mounts (critical for 3D rendering)
- Alias 'three' to 'three/build/three.module.js' for ES module compatibility
- Include `.cur` files as assets in build

## Integration Points
- **SuperMap/Cesium**: Initialize 3D scenes using SuperMapVue plugin; access Cesium API via global `Cesium` object
- **Hand Pose Detection**: Use `@tensorflow-models/hand-pose-detection` for gesture input; requires camera access
- **3D Rendering**: Combine Three.js (aliased) with Cesium for advanced 3D features if needed

## Dependencies
- Core: `vue@^3.5.30`, `vite@^8.0.1`
- GIS: `@supermap/vue-iclient3d-webgl@^1.0.9`
- AI/Gesture: `@tensorflow-models/hand-pose-detection@^2.0.1`, `@tensorflow/tfjs-core@^4.22.0`
- UI: `element-plus@^2.13.6`, `pinia@^3.0.4`
- 3D: `three@^0.183.2`

## Common Pitfalls
- Ensure Cesium.js is loaded before Vue app initialization
- Build outputs to `docs/` not `dist` - update deployment configs accordingly
- Base path `/gesture-disaster-system/` required for asset loading in production</content>
<parameter name="filePath">D:\ProgramData\Javaprect\gesture-disaster-system\AGENTS.md
