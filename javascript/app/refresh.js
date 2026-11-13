function startAutoRefresh() {
    stopAutoRefresh();
    autoRefreshTimer = setInterval(autoRefreshTick, AUTO_REFRESH_INTERVAL);
}

function stopAutoRefresh() {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
}

// в активной вкладке сначала отправляем очередь, потом обновляем каталог на следующем проходе
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

let manualRefreshPending = false;

// пока идет ручное обновление, повторное нажатие ничего не запускает
async function manualRefresh() {
    if (!currentUser || manualRefreshPending) return;
    if (isLoading) {
        showToast('Каталог уже оновлюється');
        return;
    }
    const user = currentUser;
    const button = document.getElementById('catalogRefreshBtn');
    manualRefreshPending = true;
    if (button) {
        button.disabled = true;
        button.textContent = 'Оновлюємо…';
    }
    try {
        const outcome = await loadGoodsData({silent: true, manual: true});
        if (currentUser !== user) return;
        if (outcome === 'updated') {
            showToast('Каталог оновлено');
            if (readQueue().length) {
                retryAttempt = 0;
                await syncOfflineMeters({manual: true});
            }
        } else if (outcome === 'busy') {
            showToast('Каталог уже оновлюється');
        } else {
            showToast(catalogRefreshMessage(outcome), true);
        }
    } catch (err) {
        showToast('Не вдалося оновити дані', true);
    } finally {
        manualRefreshPending = false;
        if (button) {
            button.disabled = false;
            button.textContent = document.getElementById('offlineCatalogActivity')?.textContent && !isLoading ? 'Повторити оновлення' : 'Оновити каталог';
        }
    }
}
