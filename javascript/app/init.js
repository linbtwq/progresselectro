// ============================================================
// javascript/app/init.js
//
// назначение
// точка входа приложения.
//
// ответственность
// - повесить инициализацию на domcontentloaded
// - зарегистрировать service worker
// - инициализировать тему и слушатели
// - запустить приложение если пользователь уже авторизован
//
// почему startapp здесь а не в auth.js
// в auth.js startApp вызывался из domcontentloaded раньше,
// чем init.js успевал повесить обработчики из initEventListeners.
// в итоге loadGoodsData стартовала до того, как были готовы клики,
// клавиатура и свайпы.
// теперь auth.js только показывает или скрывает форму входа,
// а сам старт приложения запускается здесь после initEventListeners.
//
// зависимости
// - auth.js дает currentUser
// - app/load.js дает loadGoodsData
// - core/queue.js дает initQueueStorage
// - app/sync.js дает syncOfflineMeters
// - app/refresh.js дает startAutoRefresh
// - app/events.js дает initEventListeners
// - ui/theme.js дает initTheme
// - version.js дает APP_VERSION
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    initServiceWorker();
    initTheme();
    initEventListeners();
    showVersion();

    // если пользователь уже авторизован - стартуем приложение
    // делаем это после initEventListeners,
    // чтобы все обработчики (клики, клавиатура, свайпы) уже стояли
    if (typeof currentUser !== 'undefined' && currentUser) {
        startApp();
    }
});

async function startApp() {
    await initQueueStorage();
    loadGoodsData();
    if (navigator.onLine) syncOfflineMeters();
    startAutoRefresh();

    // на десктопе сразу фокусируем поиск
    if (window.matchMedia('(pointer: fine)').matches) {
        setTimeout(() => {
            const input = document.getElementById('goodsSearch');
            if (input) input.focus();
        }, 250);
    }
}

function initServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(err => console.error('помилка sw:', err));
    }
}

function showVersion() {
    const el = document.getElementById('appVersion');
    if (el && typeof APP_VERSION !== 'undefined') el.textContent = 'v' + APP_VERSION;
}