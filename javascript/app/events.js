// ============================================================
// javascript/app/events.js
//
// назначение
// единая точка подписки на события интерфейса и сети.
//
// ответственность
// - подключить поиск, карточки товаров, индикатор связи
// - нижняя панель настроек
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

// при переходе показываем выбранный экран и обновляем нижнюю навигацию
function selectWorkspacePage(pageId) {
    const pages = document.querySelectorAll('.catalog-nav button[aria-controls]');
    for (const button of pages) {
        const id = button.getAttribute('aria-controls');
        const selected = id === pageId;
        document.getElementById(id).hidden = !selected;
        if (selected) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
    }
    updateBackToTop();
}

function openCatalogPage(focusSearch = false) {
    selectWorkspacePage('catalogPage');
    if (focusSearch) document.getElementById('goodsSearch').focus();
}

function initEventListeners() {
    initGoodsSearch();
    initQuantityKeyboard();
    initShipmentPage();
    document.getElementById('catalogBtn').addEventListener('click', () => {
        if (!shipmentSending && !shipmentReviewPending) openCatalogPage();
    });
    document.getElementById('mainAddBtn').addEventListener('click', openShipmentPage);
    document.getElementById('invoiceHistoryBtn').addEventListener('click', openInvoiceHistory);
    document.getElementById('shipmentSendBtn')?.addEventListener('click', submitShipment);

    const results = document.getElementById('resultsContainer');
    if (results) {
        results.addEventListener('click', event => {
            if (event.target.closest('[data-action="more"]')) showMoreGoods();
        });
    }

    const statusBox = document.getElementById('connectionStatus');
    if (statusBox) statusBox.addEventListener('click', manualRefresh);
    document.getElementById('catalogRefreshBtn')?.addEventListener('click', manualRefresh);

    // реакция на смену состояния сети
    window.addEventListener('online', handleOnlineStatus);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') autoRefreshTick();
    });
    window.addEventListener('offline', () => setConnectionStatus(false));

    // клавиатурная навигация: escape, слэш, ctrl k, r, tab-trap
    // без этого фокуса и горячих клавиш не будет
    document.addEventListener('keydown', onKeyDown);

    // свайп-закрытие модалок на тач устройствах
    // без этого модалки не закрываются свайпом
    initModalDrag();

    // настройки открываются отдельной нижней панелью
    initSettingsPanel();

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
    if (currentUser) loadGoodsData({ silent: true, manual: true });
}
let _settingsFocus = null;
// подключает открытие панели и закрытие по фону или кнопке
function initSettingsPanel() {
    const overlay = document.getElementById('settingsMenu');
    document.getElementById('settingsBtn')?.addEventListener('click', openSettingsPanel);
    document.getElementById('settingsClose')?.addEventListener('click', closeSettingsPanel);
    overlay?.addEventListener('click', event => { if (event.target === overlay) closeSettingsPanel(); });
}
// открывает настройки и переводит фокус внутрь панели
function openSettingsPanel() {
    if (!currentUser) return;
    _settingsFocus = document.activeElement;
    const overlay = document.getElementById('settingsMenu');
    overlay.classList.add('active');
    document.getElementById('settingsBtn')?.setAttribute('aria-expanded', 'true');
    setTimeout(() => {
        if (overlay.classList.contains('active')) document.getElementById('settingsClose')?.focus();
    }, 80);
}
// закрывает панель и возвращает фокус на кнопку настроек
function closeSettingsPanel() {
    document.getElementById('settingsMenu')?.classList.remove('active');
    document.getElementById('settingsBtn')?.setAttribute('aria-expanded', 'false');
    const button = document.getElementById('settingsBtn');
    if (_settingsFocus && document.contains(_settingsFocus)) _settingsFocus.focus();
    else button?.focus();
    _settingsFocus = null;
}
