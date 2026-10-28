function initEventListeners() {
    initGoodsSearch();

    const results = document.getElementById('resultsContainer');
    if (results) {
        results.addEventListener('click', handleGoodsCardClick);
    }

    const statusBox = document.getElementById('connectionStatus');
    if (statusBox) statusBox.addEventListener('click', manualRefresh);

    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', () => setConnectionStatus(false));
    
    // document.addEventListener('keydown', onKeyDown); // Фокус-хуки из старого проекта
    // initModalDrag(); // Если модалки нужны

    scheduleStatusLoop();
    initBackToTop();
    renderStatus();
    scheduleSyncRetry();
    initClearCacheButton();
}

function scheduleStatusLoop() {
    if (statusTimer) clearInterval(statusTimer);
    statusTimer = setInterval(() => {
        if (document.visibilityState === 'visible' && currentUser) renderStatus();
    }, 15000);
}

function handleOnlineStatus() {
    retryAttempt = 0;
    syncOfflineMeters();
    if (currentUser) loadGoodsData({ silent: true });
}

function initSearchClear() { /* Уже встроено в initGoodsSearch */ }