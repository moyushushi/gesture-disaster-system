// src/config/gis-platform.js
const platform = import.meta.env.VITE_GIS_PLATFORM || 'supermap'

const urls = {
    supermap: {
        // 底图服务（请替换为你自己发布的地图服务地址）
        baseMap: 'http://localhost:8090/iserver/services/ditu/rest/realspace/datas/hz_s2a@ditu',
        terrain: 'http://localhost:8090/iserver/services/gesture_terrain/rest/realspace/datas/ASTGTM_N30E119X@DataSource',
        flood: 'http://localhost:8090/iserver/services/spatialanalyst3d-sampling/restjsr/spatialanalyst3d/datasets/Buildings/flood',
        network: 'http://localhost:8090/iserver/services/transportationAnalyst-daolu/rest/networkanalyst'
    },
    geoscene: {
        terrain: null,
        flood: null,
        network: 'http://localhost:6080/arcgis/rest/services/MyNetwork/NetworkServer'
    }
}

export const config = {
    platform,
    getSuperMapBaseMapUrl() {
        return urls[platform]?.baseMap || null
    },
    getTerrainUrl() {
        return urls[platform]?.terrain || null
    },
    getFloodUrl() {
        return urls[platform]?.flood || null
    },
    getNetworkUrl() {
        return urls[platform]?.network || null
    },
    isSuperMap: () => platform === 'supermap',
    isGeoScene: () => platform === 'geoscene'
}