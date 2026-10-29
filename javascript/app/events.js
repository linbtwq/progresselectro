// ============================================================
// javascript/app/events.js
//
// назначение
// единая точка подписки на события интерфейса и сети.
//
// ответственность
// - подключить поиск, карточки товаров, индикатор связи
// - выпадающее меню настроек
// - клавиатурная навигация через onKeyDown из focus.js
// - свайп-закрытие модалок через initModalDrag
// - циклическое обновление статуса
// - реакция на online/offline
//
// зависимости
// - features/search.js дает initGoodsSearch
// - features/goods-card.js дает handleGoodsCardClick
// - ui/focus.js дает onKeyDown
// - ui/modalDrag.js дает initModalDrag
// - ui/status.js дает renderStatus, setConnectionStatus
// - ui/backToTop.js дает initBackToTop
// - app/refresh.js дает manualRefresh
// - app/sync.js дает syncOfflineMeters, scheduleSyncRetry
// - app/clearCache.js дает initClearCacheButton
// - app/load.js дает loadGoodsData
// ============================================================

function initEventListeners() {
    initGoodsSearch();

    const results = document.getElementById('resultsContainer');
    if (results) {
        results.addEventListener('click', handleGoodsCardClick);
    }

    const statusBox = document.getElementById('connectionStatus');
    if (statusBox) statusBox.addEventListener('click', manualRefresh);

    // реакция на смену состояния сети
    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', () => setConnectionStatus(false));

    // клавиатурная навигация: escape, слэш, ctrl k, r, tab-trap
    // без этого фокуса и горячих клавиш не будет
    document.addEventListener('keydown', onKeyDown);

    // свайп-закрытие модалок на тач устройствах
    // без этого модалки не закрываются свайпом
    initModalDrag();

    // выпадающее меню настроек
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsMenu = document.getElementById('settingsMenu');
    if (settingsBtn && settingsMenu) {
        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            settingsMenu.classList.toggle('active');
        });
        // закрываем меню при клике вне его
        document.addEventListener('click', (e) => {
            if (!settingsMenu.contains(e.target) && e.target !== settingsBtn) {
                settingsMenu.classList.remove('active');
            }
        });
    }

    scheduleStatusLoop();
    initBackToTop();
    renderStatus();
    scheduleSyncRetry();
    initClearCacheButton();
}

// ============================================================
// циклическое обновление индикатора статуса
// раз в пятнадцать секунд, только когда вкладка активна
// ============================================================

function scheduleStatusLoop() {
    if (statusTimer) clearInterval(statusTimer);
    statusTimer = setInterval(() => {
        if (document.visibilityState === 'visible' && currentUser) renderStatus();
    }, 15000);
}

// ============================================================
// реакция на появление сети
// сбрасываем счетчик попыток, шлем очередь, перезагружаем справочник
// ============================================================

function handleOnlineStatus() {
    retryAttempt = 0;
    syncOfflineMeters();
    if (currentUser) loadGoodsData({ silent: true });
}