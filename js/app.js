/**
 * 主应用逻辑
 * 整合所有模块，处理用户交互
 */

class SubwayFinderApp {
    constructor() {
        this.currentResult = null;
        this.searchHistory = [];
        this.init();
    }

    /**
     * 初始化应用
     */
    async init() {
        // 检查配置
        if (!checkConfig()) {
            this.showError('请先配置高德地图 API Key，详见控制台提示');
            return;
        }

        try {
            // 等待高德地图服务初始化
            Logger.log('正在初始化高德地图服务...');
            await gaodeAPI.ensureServicesReady();
            Logger.log('高德地图服务初始化完成');
        } catch (error) {
            Logger.error('高德地图服务初始化失败:', error);
            this.showError('地图服务初始化失败，请刷新页面重试');
            return;
        }

        // 加载搜索历史
        this.loadSearchHistory();

        // 绑定事件
        this.bindEvents();

        Logger.log('应用初始化完成');
    }

    /**
     * 绑定事件监听
     */
    bindEvents() {
        // 表单提交
        const searchForm = document.getElementById('searchForm');
        if (searchForm) {
            searchForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleSearch();
            });
        }

        // 示例地址快速填充（可选）
        this.addExampleLinks();
    }

    /**
     * 处理搜索
     */
    async handleSearch() {
        const startInput = document.getElementById('startPoint');
        const endInput = document.getElementById('endPoint');

        const startAddress = startInput.value.trim();
        const endAddress = endInput.value.trim();

        if (!startAddress || !endAddress) {
            this.showError('请输入起点和终点');
            return;
        }

        if (startAddress === endAddress) {
            this.showError('起点和终点不能相同');
            return;
        }

        // 显示加载状态
        this.setLoading(true);
        this.hideError();
        this.hideResults();

        try {
            Logger.log('开始搜索:', startAddress, '->', endAddress);

            // 调用核心算法
            const result = await stationFinder.findMiddleStations(
                startAddress,
                endAddress
            );

            this.currentResult = result;

            // 保存到搜索历史
            this.saveToHistory(startAddress, endAddress);

            // 显示结果
            this.displayResults(result);

            // 在地图上显示
            if (mapView) {
                mapView.displaySearchResult(result);
            }

            Logger.log('搜索完成:', result);

        } catch (error) {
            Logger.error('搜索失败:', error);
            this.showError(error.message || '搜索失败，请检查地址是否正确');
        } finally {
            this.setLoading(false);
        }
    }

    /**
     * 显示搜索结果
     */
    displayResults(result) {
        const resultsSection = document.getElementById('resultsSection');
        const resultsList = document.getElementById('resultsList');

        if (!resultsSection || !resultsList) return;

        // 清空之前的结果
        resultsList.innerHTML = '';

        // 生成结果卡片
        result.recommendations.forEach((station, index) => {
            const formatted = stationFinder.formatResultForDisplay(station, index);
            const card = this.createResultCard(formatted, result);
            resultsList.appendChild(card);
        });

        // 显示结果区域
        resultsSection.style.display = 'block';

        // 滚动到结果
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    /**
     * 创建结果卡片
     */
    createResultCard(stationData, fullResult) {
        const card = document.createElement('div');
        card.className = `result-card ${stationData.isBest ? 'best' : ''}`;

        card.innerHTML = `
            ${stationData.isBest ? '<span class="badge">推荐</span>' : ''}
            <div class="station-name">${stationData.stationName}</div>

            <div class="time-info">
                <span class="time-label">从起点出发：</span>
                <span class="time-value">${stationData.timeFromStart}</span>
            </div>

            <div class="time-info">
                <span class="time-label">从终点出发：</span>
                <span class="time-value">${stationData.timeToEnd}</span>
            </div>

            <div class="total-time">
                <strong>最长等待：</strong> ${stationData.maxTime} &nbsp;|&nbsp;
                <strong>时间差：</strong> ${stationData.timeDiff} &nbsp;|&nbsp;
                <strong>平衡度：</strong> ${stationData.balanceScore}%
            </div>
        `;

        // 点击卡片高亮显示在地图上
        card.addEventListener('click', () => {
            if (mapView && fullResult) {
                mapView.highlightStation(
                    stationData.location,
                    fullResult.startLocation,
                    fullResult.endLocation
                );

                // 滚动到地图
                document.getElementById('mapView').scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
            }

            // 视觉反馈
            document.querySelectorAll('.result-card').forEach(c => {
                c.style.transform = '';
            });
            card.style.transform = 'scale(1.02)';
        });

        return card;
    }

    /**
     * 设置加载状态
     */
    setLoading(isLoading) {
        const searchBtn = document.getElementById('searchBtn');
        const btnText = searchBtn.querySelector('.btn-text');
        const btnLoading = searchBtn.querySelector('.btn-loading');

        if (isLoading) {
            searchBtn.disabled = true;
            btnText.style.display = 'none';
            btnLoading.style.display = 'inline';
        } else {
            searchBtn.disabled = false;
            btnText.style.display = 'inline';
            btnLoading.style.display = 'none';
        }
    }

    /**
     * 显示错误信息
     */
    showError(message) {
        const errorDiv = document.getElementById('errorMessage');
        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';

            // 自动隐藏
            setTimeout(() => {
                this.hideError();
            }, 5000);
        }
    }

    /**
     * 隐藏错误信息
     */
    hideError() {
        const errorDiv = document.getElementById('errorMessage');
        if (errorDiv) {
            errorDiv.style.display = 'none';
        }
    }

    /**
     * 隐藏结果
     */
    hideResults() {
        const resultsSection = document.getElementById('resultsSection');
        if (resultsSection) {
            resultsSection.style.display = 'none';
        }
    }

    /**
     * 保存搜索历史
     */
    saveToHistory(start, end) {
        const historyItem = {
            start,
            end,
            timestamp: Date.now()
        };

        // 去重：如果已存在相同的搜索，移除旧的
        this.searchHistory = this.searchHistory.filter(
            item => !(item.start === start && item.end === end)
        );

        // 添加到开头
        this.searchHistory.unshift(historyItem);

        // 限制数量
        if (this.searchHistory.length > CONFIG.MAX_HISTORY) {
            this.searchHistory = this.searchHistory.slice(0, CONFIG.MAX_HISTORY);
        }

        // 保存到 localStorage
        try {
            localStorage.setItem(
                CONFIG.STORAGE_KEYS.SEARCH_HISTORY,
                JSON.stringify(this.searchHistory)
            );
            this.updateHistoryDisplay();
        } catch (error) {
            Logger.error('保存搜索历史失败:', error);
        }
    }

    /**
     * 加载搜索历史
     */
    loadSearchHistory() {
        try {
            const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.SEARCH_HISTORY);
            if (saved) {
                this.searchHistory = JSON.parse(saved);
                this.updateHistoryDisplay();
            }
        } catch (error) {
            Logger.error('加载搜索历史失败:', error);
            this.searchHistory = [];
        }
    }

    /**
     * 更新历史记录显示
     */
    updateHistoryDisplay() {
        const historySection = document.getElementById('searchHistory');
        const historyList = document.getElementById('historyList');

        if (!historySection || !historyList) return;

        if (this.searchHistory.length === 0) {
            historySection.style.display = 'none';
            return;
        }

        historySection.style.display = 'block';
        historyList.innerHTML = '';

        this.searchHistory.forEach(item => {
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            historyItem.textContent = `${item.start} → ${item.end}`;

            historyItem.addEventListener('click', () => {
                document.getElementById('startPoint').value = item.start;
                document.getElementById('endPoint').value = item.end;
            });

            historyList.appendChild(historyItem);
        });
    }

    /**
     * 添加示例链接（可选功能）
     */
    addExampleLinks() {
        // 可以在页面上添加一些示例地址，方便用户测试
        const examples = [
            { start: '浦东嘉里城', end: '前滩太古里' },
            { start: '人民广场', end: '陆家嘴' },
            { start: '虹桥火车站', end: '上海火车站' }
        ];

        // 这里可以动态创建示例按钮
        // 实现留给用户自定义
    }
}

// 页面加载完成后启动应用
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        Logger.log('页面加载完成，启动应用...');

        // 延迟启动，确保所有依赖都已加载
        setTimeout(() => {
            window.app = new SubwayFinderApp();
        }, 100);
    });
}
