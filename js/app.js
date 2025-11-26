/**
 * 主应用逻辑
 * 整合所有模块，处理用户交互
 */

class SubwayFinderApp {
    constructor() {
        this.currentResult = null;
        this.searchHistory = [];
        this.autoCompleteControllers = {
            startPoint: null,
            endPoint: null
        };  // 存储自动补全控制器
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

        // 初始化自动补全功能
        this.initAutoComplete('startPoint', 'startPointDropdown');
        this.initAutoComplete('endPoint', 'endPointDropdown');

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

    /**
     * 初始化输入框的自动补全功能
     * @param {string} inputId - 输入框ID
     * @param {string} dropdownId - 下拉框ID
     */
    initAutoComplete(inputId, dropdownId) {
        const input = document.getElementById(inputId);
        const dropdown = document.getElementById(dropdownId);

        if (!input || !dropdown) {
            Logger.error(`自动补全初始化失败: ${inputId} 或 ${dropdownId} 不存在`);
            return;
        }

        // 获取下拉框内部元素
        const loadingEl = dropdown.querySelector('.autocomplete-loading');
        const listEl = dropdown.querySelector('.autocomplete-list');
        const emptyEl = dropdown.querySelector('.autocomplete-empty');

        // 创建控制器对象
        const controller = {
            input: input,
            dropdown: dropdown,
            loadingEl: loadingEl,
            listEl: listEl,
            emptyEl: emptyEl,
            debounceTimer: null,
            currentIndex: -1,  // 键盘选中索引
            suggestions: []     // 当前建议列表
        };

        this.autoCompleteControllers[inputId] = controller;

        // 1. 输入事件：防抖后触发搜索
        input.addEventListener('input', (e) => {
            this.handleAutoCompleteInput(controller, e.target.value);
        });

        // 2. 获得焦点：如果有内容，重新显示建议
        input.addEventListener('focus', () => {
            if (input.value.trim() && controller.suggestions.length > 0) {
                this.showDropdown(controller);
            }
        });

        // 3. 失去焦点：延迟隐藏（给点击事件时间）
        input.addEventListener('blur', () => {
            setTimeout(() => {
                this.hideDropdown(controller);
            }, 200);
        });

        // 4. 键盘导航
        input.addEventListener('keydown', (e) => {
            this.handleAutoCompleteKeyboard(controller, e);
        });

        // 5. 点击外部关闭
        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target) && e.target !== input) {
                this.hideDropdown(controller);
            }
        });

        Logger.log(`✅ 自动补全初始化完成: ${inputId}`);
    }

    /**
     * 处理输入事件（防抖）
     */
    handleAutoCompleteInput(controller, value) {
        // 清除之前的定时器
        if (controller.debounceTimer) {
            clearTimeout(controller.debounceTimer);
        }

        // 重置键盘选中索引
        controller.currentIndex = -1;

        const keyword = value.trim();

        // 输入为空，隐藏下拉框
        if (!keyword) {
            this.hideDropdown(controller);
            return;
        }

        // 显示加载状态
        this.showLoading(controller);

        // 防抖：300ms后执行搜索
        controller.debounceTimer = setTimeout(async () => {
            try {
                const suggestions = await gaodeAPI.getSuggestions(keyword);
                controller.suggestions = suggestions;

                if (suggestions.length > 0) {
                    this.renderSuggestions(controller, suggestions);
                } else {
                    this.showEmpty(controller);
                }
            } catch (error) {
                Logger.error('自动补全搜索失败:', error);
                this.hideDropdown(controller);
            }
        }, 300);  // 300ms防抖
    }

    /**
     * 渲染建议列表
     */
    renderSuggestions(controller, suggestions) {
        controller.listEl.innerHTML = '';

        suggestions.forEach((suggestion, index) => {
            const item = document.createElement('div');
            item.className = 'autocomplete-item';
            item.dataset.index = index;

            item.innerHTML = `
                <div class="autocomplete-item-name">${this.highlightKeyword(suggestion.name, controller.input.value)}</div>
                <div class="autocomplete-item-address">${suggestion.address}</div>
            `;

            // 鼠标点击选择
            item.addEventListener('click', () => {
                this.selectSuggestion(controller, suggestion);
            });

            // 鼠标悬停更新索引
            item.addEventListener('mouseenter', () => {
                this.setActiveItem(controller, index);
            });

            controller.listEl.appendChild(item);
        });

        // 显示结果
        controller.loadingEl.style.display = 'none';
        controller.emptyEl.style.display = 'none';
        controller.listEl.style.display = 'block';
        controller.dropdown.style.display = 'block';
    }

    /**
     * 高亮关键词
     */
    highlightKeyword(text, keyword) {
        if (!keyword) return text;

        const regex = new RegExp(`(${keyword})`, 'gi');
        return text.replace(regex, '<strong style="color: var(--primary-color);">$1</strong>');
    }

    /**
     * 显示加载状态
     */
    showLoading(controller) {
        controller.loadingEl.style.display = 'block';
        controller.listEl.style.display = 'none';
        controller.emptyEl.style.display = 'none';
        controller.dropdown.style.display = 'block';
    }

    /**
     * 显示空状态
     */
    showEmpty(controller) {
        controller.loadingEl.style.display = 'none';
        controller.listEl.style.display = 'none';
        controller.emptyEl.style.display = 'block';
        controller.dropdown.style.display = 'block';
    }

    /**
     * 显示下拉框
     */
    showDropdown(controller) {
        controller.dropdown.style.display = 'block';
    }

    /**
     * 隐藏下拉框
     */
    hideDropdown(controller) {
        controller.dropdown.style.display = 'none';
        controller.currentIndex = -1;
    }

    /**
     * 选择建议项
     */
    selectSuggestion(controller, suggestion) {
        controller.input.value = suggestion.name;
        this.hideDropdown(controller);

        // 存储选中的位置信息（可选，用于后续优化）
        controller.input.dataset.selectedLocation = JSON.stringify(suggestion.location);

        Logger.log('选中地点:', suggestion);
    }

    /**
     * 键盘导航处理
     */
    handleAutoCompleteKeyboard(controller, event) {
        const { dropdown, suggestions } = controller;

        // 下拉框未显示，不处理
        if (dropdown.style.display === 'none') {
            return;
        }

        switch (event.key) {
            case 'ArrowDown':
                // 向下
                event.preventDefault();
                controller.currentIndex = Math.min(
                    controller.currentIndex + 1,
                    suggestions.length - 1
                );
                this.setActiveItem(controller, controller.currentIndex);
                break;

            case 'ArrowUp':
                // 向上
                event.preventDefault();
                controller.currentIndex = Math.max(controller.currentIndex - 1, 0);
                this.setActiveItem(controller, controller.currentIndex);
                break;

            case 'Enter':
                // 回车选择
                event.preventDefault();
                if (controller.currentIndex >= 0 && controller.currentIndex < suggestions.length) {
                    this.selectSuggestion(controller, suggestions[controller.currentIndex]);
                }
                break;

            case 'Escape':
                // ESC关闭
                event.preventDefault();
                this.hideDropdown(controller);
                break;
        }
    }

    /**
     * 设置当前激活项
     */
    setActiveItem(controller, index) {
        controller.currentIndex = index;

        // 移除所有激活状态
        const items = controller.listEl.querySelectorAll('.autocomplete-item');
        items.forEach((item, idx) => {
            if (idx === index) {
                item.classList.add('active');
                // 滚动到可见区域
                item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else {
                item.classList.remove('active');
            }
        });
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
