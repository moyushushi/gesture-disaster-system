// src/config/gis-platform.js
const platform = import.meta.env.VITE_GIS_PLATFORM || 'supermap'

const urls = {
    supermap: {
        // 底图服务（请替换为你自己发布的地图服务地址）
        baseMap: 'http://localhost:8090/iserver/services/ditu/rest/realspace/datas/hz_s2a@ditu',
        terrain: 'http://localhost:8090/iserver/services/gesture_terrain/rest/realspace/datas/ASTGTM_N30E119X@DataSource',
        flood: 'http://localhost:8090/iserver/services/spatialanalyst3d-sampling/restjsr/spatialanalyst3d/datasets/Buildings/flood',
        network: 'http://localhost:8090/iserver/services/transportationAnalyst-daolu/rest/networkanalyst/daolu_Network@daolu',
        // 新增：空间分析服务根地址（用于栅格统计等）
        spatialAnalysis: 'http://localhost:8090/iserver/services/spatialAnalysis-WorkSpace1/restjsr/spatialanalyst'
    },
    geoscene: {
        terrain: null,
        flood: null,
        network: 'http://localhost:6080/arcgis/rest/services/MyNetwork/NetworkServer',
        spatialAnalysis: null
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
    // 新增：获取空间分析服务根地址
    getSpatialAnalysisUrl() {
        return urls[platform]?.spatialAnalysis || null
    },
    // 便捷方法：获取栅格统计接口完整 URL（带数据集名称）
    getGridStatisticsUrl(datasetName) {
        const base = this.getSpatialAnalysisUrl()
        if (!base) return null
        // 数据集名称示例：ASTGTM_N30E119X@source
        return `${base}/datasets/${datasetName}/gridstatistics/gridbasicstatistics`
    },
    isSuperMap: () => platform === 'supermap',
    isGeoScene: () => platform === 'geoscene'
}