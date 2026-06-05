项目简介
gesture-disaster-system 是一个基于手势识别与三维地理信息系统的灾害应急辅助决策平台。用户通过摄像头做出特定手势（如捏合、画线/圆），即可在三维场景中实时标绘、路径规划、洪水模拟与影响评估，为防灾减灾提供直观、高效的可视化工具。

核心场景：洪水淹没分析、应急路径规划、灾情标绘、救援指挥模拟

交互创新：手势代替鼠标，实现无接触式GIS操作

GIS能力：支持SuperMap iServer / GeoScene，提供地形服务、网络分析、空间分析

功能特性
手势控制
五指捏合 → 开始绘制/放置

捏合移动 → 连续绘制（线、圆）

松开 → 完成图元并添加到三维场景

可选手势滑动调节洪水水位

🗺️ GIS标绘
线工具：手势绘制折线，自动贴地

圆工具：手势绘制圆形区域（用于洪水分析）

点工具：手势放置标记点（起点/终点/兴趣点）

浏览模式：手势暂停绘图，恢复相机旋转/缩放

🌊 灾害模拟
洪水模拟：基于绘制圆区域 + 地形采样，计算淹没面积、水深

影响评估：自动统计淹没建筑数量、人口、道路淹没长度

动态粒子动画：路径规划后展示移动粒子效果

🛣️ 路径规划
手势/按钮选择起点、终点

调用SuperMap网络分析服务，返回大圆航线示意

自动计算距离并展示路径

📂 数据交互
导出标绘图元为 GeoJSON

导入GeoJSON并还原至三维场景

一键截图保存场景

🏗️ 技术特性
低延迟手势推理（HandPose + WebGL）

Cesium地形采样（基于真实地形）

支持SuperMap / GeoScene双平台切换

🛠️ 技术栈
类别	技术
前端框架	Vue 3 + Vite + Pinia
UI组件库	Element Plus
三维GIS引擎	Cesium + SuperMap iClient3D WebGL / GeoScene
手势识别	TensorFlow.js HandPose + MediaPipe Hands
空间分析	Turf.js
构建工具	Vite
开发语言	JavaScript (ES2020)
🚀 快速开始
环境要求
Node.js ≥ 18.0.0

npm 或 yarn

现代浏览器（Chrome/Edge，需支持WebRTC及WebGL）

安装步骤
bash
# 1. 克隆仓库
git clone https://github.com/moyushushi/gesture-disaster-system.git
cd gesture-disaster-system

# 2. 安装依赖
npm install

# 3. 配置环境变量（见下方“配置说明”）
cp .env.example .env
# 编辑 .env 文件

# 4. 启动开发服务器
npm run dev
访问 http://localhost:5173/gesture-disaster-system/ 即可。

配置说明
项目支持 SuperMap 和 GeoScene 两种GIS平台，默认使用SuperMap。你需要先发布相应的GIS服务，并在 .env 文件中配置服务地址。

1. 环境变量 (.env)
   ini
# GIS平台类型：supermap 或 geoscene
VITE_GIS_PLATFORM=supermap

# SuperMap iServer 服务地址（根据实际发布情况修改）
VITE_SUPERMAP_BASE_MAP=http://localhost:8090/iserver/services/ditu/rest/realspace/datas/hz_s2a@ditu
VITE_SUPERMAP_TERRAIN=http://localhost:8090/iserver/services/gesture_terrain/rest/realspace/datas/ASTGTM_N30E119X@DataSource
VITE_SUPERMAP_FLOOD=http://localhost:8090/iserver/services/spatialanalyst3d-sampling/restjsr/spatialanalyst3d/datasets/Buildings/flood
VITE_SUPERMAP_NETWORK=http://localhost:8090/iserver/services/transportationAnalyst-daolu/rest/networkanalyst/daolu_Network@daolu
VITE_SUPERMAP_SPATIAL_ANALYSIS=http://localhost:8090/iserver/services/spatialAnalysis-WorkSpace1/restjsr/spatialanalyst
提示：gis-platform.js 中内置了以上URL映射，你也可以直接修改该文件内的 urls 对象。

2. 所需SuperMap iServer服务
三维场景底图：带地形/影像的服务

地形数据服务：用于洪水采样（CesiumTerrainProvider）

交通网络分析服务：路径规划（/path.json 接口）

空间分析服务：可选，用于栅格统计

如果没有部署完整服务，部分功能（地形、网络分析）会降级，但手势标绘基础功能仍可使用。

📱 使用指南
界面布局
左侧控制面板：摄像头、工具切换（浏览/线/圆/点）、路径规划、洪水模拟、影响评估、导入/导出、截图

底部参数面板：调整手势阈值（捏合距离、平滑因子、拖尾长度）

右下角视频窗口：实时显示手势（镜像显示）

基本操作流程
开启摄像头
点击“📷 打开摄像头”，授权浏览器使用摄像头。

选择工具

浏览：正常旋转/缩放三维场景

线 / 圆 / 点：通过五指捏合手势在场景中绘制

捏合开始绘制，移动手指绘制轨迹，松开完成

也可直接使用鼠标左键拖拽绘制（无需手势）

路径规划

点击“🗺️ 路径规划”按钮 → 进入选点模式

用手势或鼠标依次点击起点和终点

自动计算并显示黄色弧线（示意路径）及红色粒子动画

洪水模拟

先用 圆工具 绘制一个圆形区域（代表分析范围）

点击“🌊 洪水模拟” → 设置水深（米）→ 开始模拟

程序会采样圆内地形，计算淹没面积、平均水深，并在三维中绘制半透明蓝色淹没区

点击“📊 影响评估”查看详细报告（含道路淹没长度）

导入/导出

点击“💾 导出GeoJSON”保存当前所有标绘图元

点击“📂 导入GeoJSON”恢复之前保存的标绘

截图
点击“📸 截图”保存当前三维视图为PNG图片。

提示：洪水模拟依赖 Cesium地形服务 和 绘制圆工具，必须先绘制圆再模拟。

📁 项目结构
text
gesture-disaster-system/
├── public/                     # 静态资源（道路数据等）
├── src/
│   ├── components/
│   │   ├── GestureScene.vue    # Cesium三维场景组件
│   │   └── GestureCapture.vue  # 手势识别 + 标绘控制组件
│   ├── config/
│   │   └── gis-platform.js     # GIS平台与服务地址配置
│   ├── App.vue                 # 主组件
│   ├── main.js                 # 入口文件
│   └── style.css               # 全局样式
├── .env.example                # 环境变量模板
├── index.html                  # HTML模板
├── package.json
├── vite.config.js              # Vite配置（含base路径）
└── README.md
🤝 贡献指南
欢迎任何形式的贡献（Issue、PR、文档改进）。

提交 Pull Request
Fork 本仓库

创建特性分支：git checkout -b feature/your-feature

提交代码：git commit -m 'feat: add something'

推送分支：git push origin feature/your-feature

提交 Pull Request

开发规范
代码风格：ESLint（推荐使用Vue官方规则）

提交信息：遵循 Conventional Commits
