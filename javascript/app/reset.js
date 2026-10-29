// ============================================================
// javascript/app/reset.js
//
// назначение
// сброс состояния приложения при выходе из системы.
//
// ответственность
// - обнулить данные товаров и индексы
// - остановить таймеры
// - очистить визуальные следы прошлого пользователя
//
// зависимости
// - core/state.js дает флаги, таймеры, _lastStatusKey
// - features/search.js дает _searchTimer
// - ui/status.js дает renderStatus
// - ui/backToTop.js дает updateBackToTop
// - app/refresh.js дает stopAutoRefresh
// ============================================================

function resetAppState() {
    goodsData = [];
    goodsByCode.clear();
    goodsByBarcode.clear();
    goodsIndexBuilt = false;
    _dataRevision++;
    lastLoadedAt = 0;
    isLoading = false;
    reloadQueued = false;
    isSyncing = false;
    retryAttempt = 0;
    lastSyncError = '';
    connectionOnline = null;

    _lastStatusKey = '';

    // в search.js таймер называется _searchTimer (с подчеркиванием)
    // cancelAnimationFrame(renderFrame) убран
    clearTimeout(_searchTimer);
    clearTimeout(retryTimer);
    clearTimeout(toastTimer);

    if (statusTimer) { clearInterval(statusTimer); statusTimer = null; }
    stopAutoRefresh();

    const results = document.getElementById('resultsContainer');
    if (results) {
        results.innerHTML = '';
        results.scrollTop = 0;
        results.classList.remove('active');
        delete results.dataset.renderKey;
    }
    updateBackToTop();

    const searchContainer = document.getElementById('searchContainer');
    if (searchContainer) {
        searchContainer.classList.remove('top');
        searchContainer.classList.add('center');
    }

    const searchInput = document.getElementById('goodsSearch');
    if (searchInput) searchInput.value = '';

    renderStatus();
}