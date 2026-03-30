import { createApp } from 'vue'
import App from './App.vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import SuperMapVue from '@supermap/vue-iclient3d-webgl'

const app = createApp(App)
app.use(ElementPlus)
app.use(SuperMapVue)
app.mount('#app')