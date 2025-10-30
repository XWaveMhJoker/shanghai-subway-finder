/**
 * 应用配置文件
 *
 * 使用前请先：
 * 1. 前往高德开放平台注册账号：https://lbs.amap.com/
 * 2. 创建应用并获取 Web 服务 API Key
 * 3. 将下方的 YOUR_AMAP_KEY 替换为你的实际 API Key
 * 4. 同时也需要在 index.html 中替换 API Key
 */

const CONFIG = {
    // 高德地图 API Key（请替换为你自己的）
    AMAP_KEY: '7e0d01b418a11905e4a464be699007f8',

    // 高德地图 Web 服务 API 基础URL
    AMAP_API_BASE: 'https://restapi.amap.com/v3',

    // 城市设置
    CITY: '上海',
    CITY_CODE: '310000',

    // 地图初始化配置
    MAP_CONFIG: {
        zoom: 12,           // 初始缩放级别
        center: [121.473701, 31.230416],  // 上海市中心坐标
        mapStyle: 'amap://styles/normal'   // 地图样式
    },

    // 算法配置
    ALGORITHM: {
        // 时间平衡权重（0-1之间，越大越注重时间平衡）
        // 0.3 = 更注重最短最长时间
        // 0.5 = 平衡考虑
        // 0.7 = 更注重时间公平性
        BALANCE_WEIGHT: 0.3,

        // 最多返回的推荐站点数
        MAX_RESULTS: 5,

        // 搜索半径（米）- 减少搜索半径以减少候选站点
        SEARCH_RADIUS: 3000,  // 从 5000 减少到 3000

        // 最大候选站点数 - 减少候选站点以避免 QPS 限制
        MAX_CANDIDATES: 10  // 从 30 减少到 10
    },

    // 本地存储键名
    STORAGE_KEYS: {
        SEARCH_HISTORY: 'subway_finder_history',
        FAVORITES: 'subway_finder_favorites'
    },

    // API 超时时间（毫秒）
    API_TIMEOUT: 10000,

    // 最大搜索历史记录数
    MAX_HISTORY: 10,

    // 调试模式
    DEBUG: true
};

// 日志工具
const Logger = {
    log: function(...args) {
        if (CONFIG.DEBUG) {
            console.log('[SubwayFinder]', ...args);
        }
    },
    error: function(...args) {
        if (CONFIG.DEBUG) {
            console.error('[SubwayFinder Error]', ...args);
        }
    },
    warn: function(...args) {
        if (CONFIG.DEBUG) {
            console.warn('[SubwayFinder Warning]', ...args);
        }
    }
};

// 检查配置是否正确
function checkConfig() {
    if (CONFIG.AMAP_KEY === 'YOUR_AMAP_KEY') {
        Logger.warn('⚠️  请先配置高德地图 API Key！');
        Logger.warn('1. 前往 https://lbs.amap.com/ 注册账号');
        Logger.warn('2. 创建应用获取 Web 服务 API Key');
        Logger.warn('3. 在 config.js 中替换 YOUR_AMAP_KEY');
        Logger.warn('4. 同时在 index.html 中也要替换 API Key');
        return false;
    }
    return true;
}

// 导出配置（如果使用模块化）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CONFIG, Logger, checkConfig };
}
