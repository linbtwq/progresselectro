// ============================================================
// app/load.js — завантаження та кешування номенклатури
// ============================================================

async function loadGoodsData({ silent = false } = {}) {
    if (isLoading) { reloadQueued = true; return; }
    isLoading = true;
    showTopProgress();

    // спочатку віддаємо кеш
    if (!goodsData.length) {
        try {
            const cached = await localDB.load('cachedGoods');
            if (Array.isArray(cached) && cached.length) {
                goodsData = cached;
                goodsIndexBuilt = false;
                _dataRevision++;
                buildGoodsIndex();
                // показати всі? або нічого — вирішуємо: показуємо порожнє
            }
        } catch (e) { console.warn('cache load', e); }
    }

    try {
        const u = currentUser ? encodeURIComponent(currentUser.id) : '';
        // ⚠️ ТУТ МОЖЛИВО ТРЕБА ІНШИЙ ЕНДПОІНТ — див. питання в кінці
        const res = await fetchWithTimeout(
            `${apiBase}/goods?u=${u}&all=1&t=${Date.now()}`,
            { method: 'GET', cache: 'no-store' },
            APP_CONFIG.loadTimeoutMs * 3
        );
        if (!res.ok) throw new Error('Помилка мережі');

        const data = await res.json();
        const items = Array.isArray(data) ? data : (Array.isArray(data.items) ? data.items : []);
        if (!items.length) throw new Error('Порожня відповідь 1С');

        goodsData = items.map(normalizeGoods);
        goodsIndexBuilt = false;
        _dataRevision++;
        buildGoodsIndex();

        try { await localDB.save('cachedGoods', goodsData); } catch (e) {}
        setConnectionStatus(true);
        lastLoadedAt = Date.now();
    } catch (err) {
        setConnectionStatus(false);
        if (!silent && !goodsData.length) {
            showToast('Немає зв\'язку і немає збережених товарів', true);
        } else if (!silent) {
            showToast('Офлайн. Показані збережені товари');
        }
    } finally {
        isLoading = false;
        hideTopProgress();
        renderStatus();
        if (reloadQueued) { reloadQueued = false; loadGoodsData({ silent: true }); }
    }
}

function normalizeGoods(raw) {
    return {
        id: String(raw.id ?? raw.Code ?? ''),
        code: String(raw.code ?? raw.Code ?? ''),
        name: String(raw.name ?? raw.Name ?? ''),
        price: Number(raw.price ?? raw.Price ?? 0) || 0,
        stock: raw.stock != null ? Number(raw.stock) : (raw.Quantity != null ? Number(raw.Quantity) : null),
        barcode: String(raw.barcode ?? raw.Barcode ?? raw.Штрихкод ?? '').trim()
    };
}