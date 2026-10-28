document.addEventListener('DOMContentLoaded', () => {
    initServiceWorker();
    initTheme();
    initEventListeners();
    showVersion();
});

async function startApp() {
    await initQueueStorage();
    loadGoodsData();
    if (navigator.onLine) syncOfflineMeters();
    startAutoRefresh();

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