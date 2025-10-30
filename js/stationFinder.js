/**
 * 地铁站查找核心算法
 * 实现智能候选站点提取和最优站点计算
 */

class StationFinder {
    constructor(api) {
        this.api = api;
        this.balanceWeight = CONFIG.ALGORITHM.BALANCE_WEIGHT;
    }

    /**
     * 主入口：查找两个地点之间的最佳中间地铁站
     * @param {string} startAddress - 起点地址
     * @param {string} endAddress - 终点地址
     * @returns {Promise<Object>} 包含最优站点和详细信息
     */
    async findMiddleStations(startAddress, endAddress) {
        try {
            Logger.log('开始查找中间站点...');
            Logger.log('起点:', startAddress);
            Logger.log('终点:', endAddress);

            // 步骤 1: 地理编码，获取起点和终点坐标
            const startLocation = await this.api.geocode(startAddress);
            const endLocation = await this.api.geocode(endAddress);

            Logger.log('起点坐标:', startLocation);
            Logger.log('终点坐标:', endLocation);

            // 步骤 2: 获取从起点到终点的公交路线
            const mainRoute = await this.api.getTransitRoute(startLocation, endLocation);
            Logger.log('主路线信息:', mainRoute);

            // 步骤 3: 提取候选地铁站
            const candidates = await this.extractCandidateStations(
                startLocation,
                endLocation,
                mainRoute
            );

            Logger.log(`找到 ${candidates.length} 个候选站点`);

            if (candidates.length === 0) {
                throw new Error('未找到合适的地铁站候选');
            }

            // 步骤 4: 计算每个候选站到起点和终点的时间
            const stationsWithTime = await this.calculateTravelTimes(
                startLocation,
                endLocation,
                candidates
            );

            Logger.log('已计算所有站点的通勤时间');

            // 步骤 5: 评分并排序
            const rankedStations = this.rankStations(stationsWithTime);

            // 步骤 6: 返回前 N 个最优站点
            const topStations = rankedStations.slice(0, CONFIG.ALGORITHM.MAX_RESULTS);

            return {
                startLocation: {
                    address: startAddress,
                    ...startLocation
                },
                endLocation: {
                    address: endAddress,
                    ...endLocation
                },
                mainRoute,
                recommendations: topStations,
                totalCandidates: candidates.length
            };

        } catch (error) {
            Logger.error('查找中间站点失败:', error);
            throw error;
        }
    }

    /**
     * 提取候选地铁站
     * 策略：从起点到终点路线上的站点 + 中点附近的站点
     */
    async extractCandidateStations(startLocation, endLocation, mainRoute) {
        const candidateSet = new Map();  // 使用 Map 去重

        // 策略 1: 从主路线中提取地铁站
        if (mainRoute.segments && mainRoute.segments.allSubwayStations) {
            mainRoute.segments.allSubwayStations.forEach(stationName => {
                candidateSet.set(stationName, { name: stationName, source: 'route' });
            });
        }

        // 策略 2: 搜索地理中点附近的地铁站
        const midPoint = this.calculateMidpoint(startLocation, endLocation);
        const nearbyStations = await this.api.searchNearbySubwayStations(
            midPoint,
            CONFIG.ALGORITHM.SEARCH_RADIUS
        );

        nearbyStations.forEach(station => {
            if (!candidateSet.has(station.name)) {
                candidateSet.set(station.name, {
                    ...station,
                    source: 'nearby'
                });
            }
        });

        // 策略 3: 搜索起点和终点附近的地铁站
        const startNearby = await this.api.searchNearbySubwayStations(
            startLocation,
            2000
        );
        const endNearby = await this.api.searchNearbySubwayStations(
            endLocation,
            2000
        );

        [...startNearby, ...endNearby].forEach(station => {
            if (!candidateSet.has(station.name)) {
                candidateSet.set(station.name, {
                    ...station,
                    source: 'endpoint'
                });
            }
        });

        // 转换为数组并限制数量
        let candidates = Array.from(candidateSet.values());

        // 如果候选站点太多，优先选择中点附近的
        if (candidates.length > CONFIG.ALGORITHM.MAX_CANDIDATES) {
            candidates = candidates
                .map(station => ({
                    ...station,
                    distanceToMid: this.calculateDistance(station, midPoint)
                }))
                .sort((a, b) => a.distanceToMid - b.distanceToMid)
                .slice(0, CONFIG.ALGORITHM.MAX_CANDIDATES);
        }

        return candidates;
    }

    /**
     * 计算候选站点到起点和终点的通勤时间
     */
    async calculateTravelTimes(startLocation, endLocation, candidates) {
        Logger.log('开始计算通勤时间...');

        const results = [];

        // 减少批量大小并增加延迟，避免触发 QPS 限制
        const batchSize = 2;  // 从 3 减少到 2
        for (let i = 0; i < candidates.length; i += batchSize) {
            const batch = candidates.slice(i, i + batchSize);

            const batchPromises = batch.map(async station => {
                try {
                    // 添加随机延迟，避免请求过于密集
                    await this.api.delay(Math.random() * 200 + 100);

                    // 计算起点到该站的时间
                    const routeFromStart = await this.api.getTransitRoute(
                        startLocation,
                        station
                    );

                    // 添加延迟
                    await this.api.delay(300);

                    // 计算该站到终点的时间
                    const routeToEnd = await this.api.getTransitRoute(
                        station,
                        endLocation
                    );

                    return {
                        ...station,
                        timeFromStart: routeFromStart.duration,
                        timeToEnd: routeToEnd.duration,
                        distanceFromStart: routeFromStart.distance,
                        distanceToEnd: routeToEnd.distance,
                        routeFromStart,
                        routeToEnd
                    };
                } catch (error) {
                    Logger.error(`计算站点 ${station.name} 失败:`, error);
                    return null;
                }
            });

            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults.filter(r => r !== null));

            // 进度日志
            Logger.log(`已处理 ${Math.min(i + batchSize, candidates.length)}/${candidates.length} 个站点`);

            // 批次之间增加延迟，从 300ms 增加到 800ms
            if (i + batchSize < candidates.length) {
                Logger.log('⏳ 等待 800ms 避免频率限制...');
                await this.api.delay(800);
            }
        }

        Logger.log(`✅ 成功计算 ${results.length}/${candidates.length} 个站点`);
        return results;
    }

    /**
     * 对站点进行评分和排序
     * 评分标准：
     * - 主要目标：最小化最长等待时间 max(timeA, timeB)
     * - 次要目标：平衡两边时间 abs(timeA - timeB)
     */
    rankStations(stations) {
        return stations.map(station => {
            const maxTime = Math.max(station.timeFromStart, station.timeToEnd);
            const timeDiff = Math.abs(station.timeFromStart - station.timeToEnd);
            const totalTime = station.timeFromStart + station.timeToEnd;

            // 评分公式：最长时间 + 时间差 × 平衡权重
            const score = maxTime + timeDiff * this.balanceWeight;

            return {
                ...station,
                maxTime,
                timeDiff,
                totalTime,
                score,
                // 计算时间平衡度 (0-100, 100 = 完全平衡)
                balanceScore: 100 - (timeDiff / maxTime) * 100
            };
        })
        .sort((a, b) => a.score - b.score);
    }

    /**
     * 计算两点的地理中点
     */
    calculateMidpoint(loc1, loc2) {
        return {
            lng: (loc1.lng + loc2.lng) / 2,
            lat: (loc1.lat + loc2.lat) / 2
        };
    }

    /**
     * 计算两点之间的直线距离（米）
     * 使用 Haversine 公式
     */
    calculateDistance(loc1, loc2) {
        const R = 6371000; // 地球半径（米）
        const lat1 = loc1.lat * Math.PI / 180;
        const lat2 = loc2.lat * Math.PI / 180;
        const deltaLat = (loc2.lat - loc1.lat) * Math.PI / 180;
        const deltaLng = (loc2.lng - loc1.lng) * Math.PI / 180;

        const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
                  Math.cos(lat1) * Math.cos(lat2) *
                  Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    }

    /**
     * 格式化结果用于展示
     */
    formatResultForDisplay(result, index) {
        return {
            rank: index + 1,
            isBest: index === 0,
            stationName: result.name,
            address: result.address || '',
            timeFromStart: GaodeAPI.formatDuration(result.timeFromStart),
            timeToEnd: GaodeAPI.formatDuration(result.timeToEnd),
            timeFromStartSec: result.timeFromStart,
            timeToEndSec: result.timeToEnd,
            maxTime: GaodeAPI.formatDuration(result.maxTime),
            timeDiff: GaodeAPI.formatDuration(result.timeDiff),
            balanceScore: Math.round(result.balanceScore),
            totalTime: GaodeAPI.formatDuration(result.totalTime),
            location: {
                lng: result.lng,
                lat: result.lat
            }
        };
    }
}

// 创建全局实例
const stationFinder = new StationFinder(gaodeAPI);
