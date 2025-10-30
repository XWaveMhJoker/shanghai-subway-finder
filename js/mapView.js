/**
 * 地图视图管理
 * 负责地图初始化、标记显示和路线绘制
 */

class MapView {
    constructor(containerId) {
        this.containerId = containerId;
        this.map = null;
        this.markers = [];
        this.polylines = [];
        this.infoWindow = null;
    }

    /**
     * 初始化地图
     */
    init() {
        if (!window.AMap) {
            Logger.error('高德地图 API 未加载');
            return false;
        }

        try {
            this.map = new AMap.Map(this.containerId, {
                zoom: CONFIG.MAP_CONFIG.zoom,
                center: CONFIG.MAP_CONFIG.center,
                mapStyle: CONFIG.MAP_CONFIG.mapStyle,
                viewMode: '2D'
            });

            // 异步加载并添加控件
            AMap.plugin(['AMap.ToolBar', 'AMap.Scale'], () => {
                // 添加工具栏
                this.map.addControl(new AMap.ToolBar({
                    position: 'RB'
                }));

                // 添加比例尺
                this.map.addControl(new AMap.Scale({
                    position: 'LB'
                }));

                Logger.log('地图控件加载完成');
            });

            // 初始化信息窗口
            this.infoWindow = new AMap.InfoWindow({
                offset: new AMap.Pixel(0, -30)
            });

            Logger.log('地图初始化成功');
            return true;
        } catch (error) {
            Logger.error('地图初始化失败:', error);
            return false;
        }
    }

    /**
     * 清除所有标记和路线
     */
    clearAll() {
        // 清除标记
        this.markers.forEach(marker => {
            this.map.remove(marker);
        });
        this.markers = [];

        // 清除路线
        this.polylines.forEach(polyline => {
            this.map.remove(polyline);
        });
        this.polylines = [];

        // 关闭信息窗口
        if (this.infoWindow) {
            this.infoWindow.close();
        }
    }

    /**
     * 显示搜索结果
     * @param {Object} result - 查找结果对象
     */
    displaySearchResult(result) {
        this.clearAll();

        // 标记起点
        this.addMarker(
            result.startLocation,
            '起点',
            '#52c41a',
            'A'
        );

        // 标记终点
        this.addMarker(
            result.endLocation,
            '终点',
            '#ff4d4f',
            'B'
        );

        // 标记推荐站点
        result.recommendations.forEach((station, index) => {
            const formatted = stationFinder.formatResultForDisplay(station, index);
            this.addStationMarker(station, formatted);
        });

        // 自动调整视野以包含所有点
        this.fitToView();
    }

    /**
     * 添加普通标记
     */
    addMarker(location, title, color, label) {
        const marker = new AMap.Marker({
            position: [location.lng, location.lat],
            title: title,
            label: {
                content: `<div style="background: ${color}; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;">${label}</div>`,
                offset: new AMap.Pixel(0, -40)
            },
            icon: new AMap.Icon({
                size: new AMap.Size(32, 32),
                image: this.createMarkerIcon(color),
                imageSize: new AMap.Size(32, 32)
            })
        });

        marker.on('click', () => {
            this.showInfoWindow(marker, title, location.formattedAddress || location.address);
        });

        this.map.add(marker);
        this.markers.push(marker);

        return marker;
    }

    /**
     * 添加地铁站标记
     */
    addStationMarker(station, formatted) {
        const color = formatted.isBest ? '#1890ff' : '#8c8c8c';
        const label = formatted.rank.toString();

        const marker = new AMap.Marker({
            position: [station.lng, station.lat],
            title: station.name,
            label: {
                content: `<div style="background: ${color}; color: white; padding: 4px 8px; border-radius: 50%; font-weight: bold; width: 24px; height: 24px; text-align: center; line-height: 24px;">${label}</div>`,
                offset: new AMap.Pixel(0, -40)
            },
            icon: new AMap.Icon({
                size: new AMap.Size(36, 36),
                image: this.createStationIcon(color, formatted.isBest),
                imageSize: new AMap.Size(36, 36)
            })
        });

        // 点击显示详细信息
        marker.on('click', () => {
            this.showStationInfo(marker, formatted);
        });

        this.map.add(marker);
        this.markers.push(marker);

        return marker;
    }

    /**
     * 显示地铁站详细信息
     */
    showStationInfo(marker, stationData) {
        // 确保 infoWindow 已初始化
        if (!this.infoWindow) {
            this.infoWindow = new AMap.InfoWindow({
                offset: new AMap.Pixel(0, -30)
            });
        }

        const content = `
            <div style="padding: 12px; min-width: 200px;">
                <h3 style="margin: 0 0 10px 0; color: #1890ff; font-size: 16px;">
                    ${stationData.isBest ? '🏆 ' : ''}${stationData.stationName}
                </h3>
                <div style="color: #666; font-size: 13px; line-height: 1.6;">
                    <p style="margin: 5px 0;">
                        <strong>到起点：</strong> ${stationData.timeFromStart}
                    </p>
                    <p style="margin: 5px 0;">
                        <strong>到终点：</strong> ${stationData.timeToEnd}
                    </p>
                    <p style="margin: 5px 0;">
                        <strong>总时间：</strong> ${stationData.totalTime}
                    </p>
                    <p style="margin: 5px 0;">
                        <strong>平衡度：</strong> ${stationData.balanceScore}%
                    </p>
                </div>
            </div>
        `;

        this.infoWindow.setContent(content);
        this.infoWindow.open(this.map, marker.getPosition());
    }

    /**
     * 显示简单信息窗口
     */
    showInfoWindow(marker, title, content) {
        // 确保 infoWindow 已初始化
        if (!this.infoWindow) {
            this.infoWindow = new AMap.InfoWindow({
                offset: new AMap.Pixel(0, -30)
            });
        }

        const html = `
            <div style="padding: 12px;">
                <h3 style="margin: 0 0 8px 0; font-size: 14px;">${title}</h3>
                <p style="margin: 0; color: #666; font-size: 12px;">${content}</p>
            </div>
        `;

        this.infoWindow.setContent(html);
        this.infoWindow.open(this.map, marker.getPosition());
    }

    /**
     * 绘制路线（从起点到站点，从站点到终点）
     */
    drawRoutes(startLocation, endLocation, station) {
        // 绘制起点到站点
        const path1 = [
            [startLocation.lng, startLocation.lat],
            [station.lng, station.lat]
        ];

        const polyline1 = new AMap.Polyline({
            path: path1,
            strokeColor: '#52c41a',
            strokeWeight: 4,
            strokeOpacity: 0.8,
            strokeStyle: 'solid'
        });

        // 绘制站点到终点
        const path2 = [
            [station.lng, station.lat],
            [endLocation.lng, endLocation.lat]
        ];

        const polyline2 = new AMap.Polyline({
            path: path2,
            strokeColor: '#1890ff',
            strokeWeight: 4,
            strokeOpacity: 0.8,
            strokeStyle: 'solid'
        });

        this.map.add([polyline1, polyline2]);
        this.polylines.push(polyline1, polyline2);
    }

    /**
     * 高亮显示特定站点
     */
    highlightStation(station, startLocation, endLocation) {
        // 清除之前的路线
        this.polylines.forEach(polyline => {
            this.map.remove(polyline);
        });
        this.polylines = [];

        // 绘制新路线
        this.drawRoutes(startLocation, endLocation, station);

        // 调整视野
        this.map.setFitView(null, false, [100, 100, 100, 100]);
    }

    /**
     * 自动调整视野以包含所有标记
     */
    fitToView() {
        if (this.markers.length > 0) {
            this.map.setFitView(null, false, [50, 50, 50, 50]);
        }
    }

    /**
     * 创建标记图标（SVG）
     */
    createMarkerIcon(color) {
        const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
                <circle cx="16" cy="16" r="12" fill="${color}" stroke="white" stroke-width="2"/>
            </svg>
        `;
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    /**
     * 创建地铁站图标（SVG）
     */
    createStationIcon(color, isBest) {
        const size = isBest ? 36 : 32;
        const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
                <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 2}" fill="${color}" stroke="white" stroke-width="3"/>
                ${isBest ? `<circle cx="${size/2}" cy="${size/2}" r="${size/2 - 6}" fill="none" stroke="white" stroke-width="2"/>` : ''}
            </svg>
        `;
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    /**
     * 定位到指定位置
     */
    centerTo(lng, lat, zoom = 15) {
        this.map.setCenter([lng, lat]);
        this.map.setZoom(zoom);
    }

    /**
     * 获取地图实例
     */
    getMap() {
        return this.map;
    }
}

// 创建全局实例
let mapView = null;

// 地图加载完成后初始化
if (typeof window !== 'undefined') {
    window.addEventListener('load', () => {
        // 延迟初始化，确保 AMap 已加载
        setTimeout(() => {
            mapView = new MapView('mapView');
            if (mapView.init()) {
                Logger.log('地图视图初始化完成');
            }
        }, 500);
    });
}
