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

    isAtTop = false;
    _lastStatusKey = '';

    clearTimeout(searchTimer);
    cancelAnimationFrame(renderFrame);
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