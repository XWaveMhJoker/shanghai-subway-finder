/**
 * 高德地图 API 封装
 * 使用高德 JavaScript API 的插件服务，避免跨域问题
 */

class GaodeAPI {
    constructor() {
        this.city = CONFIG.CITY;
        this.geocoder = null;
        this.transfer = null;
        this.placeSearch = null;
        this.initServices();
    }

    /**
     * 初始化高德地图服务
     */
    async initServices() {
        if (!window.AMap) {
            throw new Error('高德地图API未加载');
        }

        Logger.log('开始初始化高德地图插件...');

        return new Promise((resolve, reject) => {
            AMap.plugin([
                'AMap.Geocoder',
                'AMap.Transfer',
                'AMap.PlaceSearch'
            ], () => {
                try {
                    Logger.log('插件加载完成，创建服务实例...');

                    this.geocoder = new AMap.Geocoder({
                        city: this.city,
                        radius: 1000,
                        extensions: 'all'
                    });
                    Logger.log('Geocoder 创建成功');

                    this.transfer = new AMap.Transfer({
                        city: this.city,
                        policy: AMap.TransferPolicy.LEAST_TIME
                    });
                    Logger.log('Transfer 创建成功');

                    this.placeSearch = new AMap.PlaceSearch({
                        city: this.city,
                        pageSize: 20,
                        pageIndex: 1
                    });
                    Logger.log('PlaceSearch 创建成功');

                    Logger.log('✓ 高德地图服务初始化完成');
                    resolve();
                } catch (error) {
                    Logger.error('创建服务实例失败:', error);
                    reject(error);
                }
            });
        });
    }

    /**
     * 确保服务已初始化
     */
    async ensureServicesReady() {
        if (!this.geocoder || !this.transfer || !this.placeSearch) {
            await this.initServices();
        }
    }

    /**
     * 地理编码：将地址转换为经纬度坐标
     * 使用 Geocoder 主方案 + PlaceSearch 备用方案
     * @param {string} address - 地址字符串
     * @returns {Promise<{lng: number, lat: number, formattedAddress: string}>}
     */
    async geocode(address) {
        await this.ensureServicesReady();

        Logger.log(`🔍 开始地理编码: ${address}`);
        Logger.log('Geocoder 实例:', this.geocoder);

        // 先尝试 Geocoder
        try {
            return await this.geocodeWithGeocoder(address);
        } catch (error) {
            Logger.warn(`⚠️  Geocoder 失败: ${error.message}，尝试使用 PlaceSearch...`);

            // 如果 Geocoder 失败，使用 PlaceSearch 作为备用方案
            try {
                return await this.geocodeWithPlaceSearch(address);
            } catch (error2) {
                Logger.error(`❌ PlaceSearch 也失败: ${error2.message}`);
                throw new Error(`地址解析失败: ${address}。请检查: 1) 是否配置了安全密钥 2) 地址是否正确`);
            }
        }
    }

    /**
     * 使用 Geocoder 进行地理编码
     */
    async geocodeWithGeocoder(address) {
        return new Promise((resolve, reject) => {
            // 添加超时处理
            const timeout = setTimeout(() => {
                Logger.error('⏱️  Geocoder 超时（10秒无响应）');
                reject(new Error(`Geocoder超时。可能原因：未配置安全密钥或API配额不足`));
            }, 10000);

            this.geocoder.getLocation(address, (status, result) => {
                clearTimeout(timeout);

                Logger.log(`Geocoder 回调 - status: ${status}`, result);

                if (status === 'complete' && result.geocodes && result.geocodes.length > 0) {
                    const geocode = result.geocodes[0];
                    const location = geocode.location;

                    const locationData = {
                        lng: location.lng,
                        lat: location.lat,
                        formattedAddress: geocode.formattedAddress,
                        province: geocode.province,
                        city: geocode.city,
                        district: geocode.district
                    };

                    Logger.log(`✅ Geocoder 成功: ${address} ->`, locationData);
                    resolve(locationData);
                } else {
                    let errorMsg = `Geocoder失败: status=${status}`;
                    if (status === 'no_data') {
                        errorMsg = '未找到该地址';
                    } else if (result && result.info) {
                        errorMsg = result.info;
                    }

                    Logger.error('❌ Geocoder 错误:', errorMsg, result);
                    reject(new Error(errorMsg));
                }
            });
        });
    }

    /**
     * 使用 PlaceSearch 进行地理编码（备用方案）
     */
    async geocodeWithPlaceSearch(address) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('PlaceSearch超时'));
            }, 10000);

            Logger.log(`🔎 使用 PlaceSearch 搜索: ${address}`);

            this.placeSearch.search(address, (status, result) => {
                clearTimeout(timeout);

                Logger.log(`PlaceSearch 回调 - status: ${status}`, result);

                if (status === 'complete' && result.poiList && result.poiList.pois && result.poiList.pois.length > 0) {
                    const poi = result.poiList.pois[0];
                    const location = poi.location;

                    const locationData = {
                        lng: location.lng,
                        lat: location.lat,
                        formattedAddress: poi.name + ' ' + (poi.address || ''),
                        province: poi.pname || '',
                        city: poi.cityname || this.city,
                        district: poi.adname || ''
                    };

                    Logger.log(`✅ PlaceSearch 成功: ${address} ->`, locationData);
                    resolve(locationData);
                } else if (status === 'no_data') {
                    reject(new Error('未找到该地点'));
                } else {
                    reject(new Error(`PlaceSearch失败: status=${status}`));
                }
            });
        });
    }

    /**
     * 公交路线规划（地铁优先）
     * @param {Object} origin - 起点坐标 {lng, lat}
     * @param {Object} destination - 终点坐标 {lng, lat}
     * @returns {Promise<Object>} 路线信息
     */
    async getTransitRoute(origin, destination) {
        await this.ensureServicesReady();

        Logger.log(`🚇 开始查询路线: [${origin.lng}, ${origin.lat}] -> [${destination.lng}, ${destination.lat}]`);

        return new Promise((resolve, reject) => {
            // 添加超时处理
            const timeout = setTimeout(() => {
                Logger.error('⏱️  路线查询超时（15秒无响应）');
                reject(new Error('路线查询超时。可能原因：未配置安全密钥或API配额不足'));
            }, 15000);

            const startLngLat = new AMap.LngLat(origin.lng, origin.lat);
            const endLngLat = new AMap.LngLat(destination.lng, destination.lat);

            Logger.log('调用 Transfer.search...', { start: startLngLat, end: endLngLat });

            this.transfer.search(startLngLat, endLngLat, (status, result) => {
                clearTimeout(timeout);

                Logger.log(`Transfer 回调 - status: ${status}`, result);

                if (status === 'complete' && result.plans && result.plans.length > 0) {
                    Logger.log(`✅ 找到 ${result.plans.length} 个路线方案`);

                    const plan = result.plans[0];  // 取第一条推荐路线
                    Logger.log('选择第一个方案:', plan);

                    // 提取地铁站信息
                    const subwayStations = new Set();
                    const segments = [];

                    plan.segments.forEach((segment, idx) => {
                        Logger.log(`处理segment ${idx}:`, segment.transit_mode, segment);

                        // 步行段
                        if (segment.transit_mode === 'WALK') {
                            // 安全访问 walking 属性
                            const walking = segment.walking || {};
                            segments.push({
                                type: 'walking',
                                distance: parseInt(walking.distance || 0),
                                duration: parseInt(walking.time || segment.time || 0)
                            });
                        }
                        // 公交/地铁段
                        else if (segment.transit) {
                            const lines = segment.transit.lines;
                            if (lines && lines.length > 0) {
                                lines.forEach(line => {
                                    Logger.log(`处理line: ${line.name}`, line);

                                    // 检查是否为地铁
                                    if (this.isSubwayLine(line.name || '')) {
                                        // 提取途径站点
                                        if (line.via_stops && line.via_stops.length > 0) {
                                            line.via_stops.forEach(stop => {
                                                if (stop && stop.name) {
                                                    subwayStations.add(stop.name);
                                                }
                                            });
                                        }

                                        // 添加起始站和终点站
                                        if (line.departure_stop && line.departure_stop.name) {
                                            subwayStations.add(line.departure_stop.name);
                                        }
                                        if (line.arrival_stop && line.arrival_stop.name) {
                                            subwayStations.add(line.arrival_stop.name);
                                        }

                                        segments.push({
                                            type: 'subway',
                                            lineName: line.name || '',
                                            startStation: (line.departure_stop && line.departure_stop.name) || '',
                                            endStation: (line.arrival_stop && line.arrival_stop.name) || '',
                                            duration: parseInt(line.time || 0),
                                            distance: parseInt(line.distance || 0)
                                        });
                                    }
                                });
                            }
                        }
                    });

                    Logger.log(`✅ 提取到 ${subwayStations.size} 个地铁站:`, Array.from(subwayStations));

                    const routeData = {
                        duration: parseInt(plan.time) || 0,  // 时长（秒）
                        walking_distance: parseInt(plan.walking_distance) || 0,  // 步行距离（米）
                        distance: parseInt(plan.distance) || 0,  // 总距离（米）
                        cost: parseFloat(plan.cost) || 0,  // 价格
                        segments: {
                            segments: segments,
                            allSubwayStations: Array.from(subwayStations)
                        }
                    };

                    Logger.log('✅ 路线查询成功:', routeData);
                    resolve(routeData);
                } else {
                    Logger.error('❌ 路线查询失败:', status, result);
                    reject(new Error(`无法获取路线信息 (status: ${status})`));
                }
            });
        });
    }

    /**
     * 判断是否为地铁线路
     */
    isSubwayLine(lineName) {
        return lineName.includes('号线') ||
               lineName.includes('地铁') ||
               lineName.match(/\d+线/);
    }

    /**
     * 搜索附近的地铁站
     * @param {Object} location - 中心点坐标 {lng, lat}
     * @param {number} radius - 搜索半径（米）
     * @returns {Promise<Array>} 地铁站列表
     */
    async searchNearbySubwayStations(location, radius = 3000) {
        await this.ensureServicesReady();

        return new Promise((resolve, reject) => {
            this.placeSearch.searchNearBy('地铁站', [location.lng, location.lat], radius, (status, result) => {
                if (status === 'complete' && result.poiList && result.poiList.pois) {
                    const stations = result.poiList.pois.map(poi => {
                        const loc = poi.location;
                        return {
                            name: poi.name,
                            address: poi.address || '',
                            lng: loc.lng,
                            lat: loc.lat,
                            distance: parseInt(poi.distance) || 0
                        };
                    });

                    Logger.log(`找到 ${stations.length} 个地铁站`);
                    resolve(stations);
                } else if (status === 'no_data') {
                    Logger.warn('附近没有找到地铁站');
                    resolve([]);
                } else {
                    Logger.error('搜索地铁站失败:', status, result);
                    resolve([]);
                }
            });
        });
    }

    /**
     * 批量计算从某点到多个地铁站的通勤时间
     * @param {Object} origin - 起点
     * @param {Array} stations - 地铁站数组
     * @returns {Promise<Array>} 包含时间信息的地铁站数组
     */
    async batchCalculateTransitTime(origin, stations) {
        const results = [];

        // 分批处理，避免请求过多
        const batchSize = 5;
        for (let i = 0; i < stations.length; i += batchSize) {
            const batch = stations.slice(i, i + batchSize);
            const promises = batch.map(async station => {
                try {
                    const route = await this.getTransitRoute(origin, station);
                    return {
                        ...station,
                        duration: route.duration,
                        distance: route.distance,
                        walkingDistance: route.walking_distance
                    };
                } catch (error) {
                    Logger.error(`计算到 ${station.name} 的时间失败:`, error);
                    return {
                        ...station,
                        duration: Infinity,
                        distance: Infinity,
                        error: true
                    };
                }
            });

            const batchResults = await Promise.all(promises);
            results.push(...batchResults);

            // 添加小延迟避免API限流
            if (i + batchSize < stations.length) {
                await this.delay(200);
            }
        }

        return results.filter(r => !r.error && r.duration !== Infinity);
    }

    /**
     * 延迟函数
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 格式化时间（秒 -> 分钟）
     */
    static formatDuration(seconds) {
        const minutes = Math.round(seconds / 60);
        if (minutes < 60) {
            return `${minutes}分钟`;
        }
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours}小时${mins}分钟`;
    }

    /**
     * 格式化距离（米 -> 公里）
     */
    static formatDistance(meters) {
        if (meters < 1000) {
            return `${meters}米`;
        }
        return `${(meters / 1000).toFixed(1)}公里`;
    }
}

// 创建全局实例
const gaodeAPI = new GaodeAPI();
