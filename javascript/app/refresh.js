function startAutoRefresh() {
    stopAutoRefresh();
    autoRefreshTimer = setInterval(autoRefreshTick, AUTO_REFRESH_INTERVAL);
}

function stopAutoRefresh() {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
}

async function autoRefreshTick() {
    if (document.visibilityState !== 'visible') return;
    if (isLoading || isSyncing) return;
    if (!currentUser) return;

    if (readQueue().length) {
        retryAttempt = 0;
        await syncOfflineMeters({ quiet: true });
        return;
    }
    await loadGoodsData({ silent: true });
}

async function manualRefresh() {
    if (isLoading) return;
    const box = document.getElementById('connectionStatus');
    if (box) box.classList.add('syncing');
    retryAttempt = 0;
    try {
        if (readQueue().length) await syncOfflineMeters({ manual: true });
        await loadGoodsData({ silent: false });
    } catch (err) {
        showToast('Не вдалося оновити дані', true);
    } finally {
        if (box) setTimeout(() => box.classList.remove('syncing'), 400);
    }
}