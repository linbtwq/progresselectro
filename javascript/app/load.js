// ============================================================
// app/load.js — завантаження та кешування номенклатури
// ============================================================

let _goodsLoadSeq = 0;
let _goodsLoadAbort = null;
function cancelGoodsLoad() {
    ++_goodsLoadSeq;
    _goodsLoadAbort?.abort();
    _goodsLoadAbort = null;
}

async function loadGoodsData({ silent = false } = {}) {
    if (!currentUser) return;
    if (isLoading) { reloadQueued = true; return; }
    const seq = ++_goodsLoadSeq;
    const user = currentUser;
    const active = () => seq === _goodsLoadSeq && currentUser === user;
    _goodsLoadAbort = new AbortController();
    isLoading = true;
    showTopProgress();

    // спочатку віддаємо кеш
    if (!goodsData.length) {
        try {
            const cached = await localDB.load('cachedGoods:' + user.id);
            if (!active()) return;
            if (Array.isArray(cached) && cached.length) {
                goodsData = cached.map(normalizeGoods).filter(item => item.type !== 'folder');
                goodsIndexBuilt = false;
                _dataRevision++;
                buildGoodsIndex();
                // показати всі? або нічого — вирішуємо: показуємо порожнє
            }
        } catch (e) { console.warn('cache load', e); }
    }

    try {
        if (!active()) return;
        const u = currentUser ? encodeURIComponent(currentUser.id) : '';
        // без поискового запроса сервис возвращает корень, а не весь справочник
        const res = await fetchWithTimeout(
            `${apiBase}/goods?u=${u}&t=${Date.now()}`,
            { method: 'GET', cache: 'no-store', signal: _goodsLoadAbort.signal },
            APP_CONFIG.loadTimeoutMs * 3
        );
        if (!res.ok) throw new Error('Помилка мережі');

        const data = await res.json();
        if (!active()) return;
        const items = Array.isArray(data) ? data : (Array.isArray(data.items) ? data.items : []);
        if (!items.length) throw new Error('Порожня відповідь 1С');

        // корневой ответ не полный: сохраняем товары из предыдущих поисков
        const merged = new Map(goodsData.map(item => [item.id || item.code, item]));
        for (const item of items.map(normalizeGoods).filter(item => item.type !== 'folder')) merged.set(item.id || item.code, item);
        goodsData = Array.from(merged.values());
        goodsIndexBuilt = false;
        _dataRevision++;
        buildGoodsIndex();

        try { await localDB.save('cachedGoods:' + user.id, goodsData); } catch (e) {}
        if (!active()) return;
        setConnectionStatus(true);
        lastLoadedAt = Date.now();
    } catch (err) {
        if (!active()) return;
        setConnectionStatus(false);
        if (!silent && !goodsData.length) {
            showToast('Немає зв\'язку і немає збережених товарів', true);
        } else if (!silent) {
            showToast('Офлайн. Показані збережені товари');
        }
    } finally {
        if (!active()) return;
        isLoading = false;
        hideTopProgress();
        renderStatus();
        if (reloadQueued) { reloadQueued = false; loadGoodsData({ silent: true }); }
    }
}

// приводит ответы справочника и поиска к единому виду, сохраняя признак группы
function normalizeGoods(raw) {
    return {
        type: raw.type === 'folder' ? 'folder' : 'item',
        id: String(raw.id ?? raw.Code ?? ''),
        code: String(raw.code ?? raw.Code ?? ''),
        name: String(raw.name ?? raw.Name ?? ''),
        price: Number(raw.price ?? raw.Price ?? 0) || 0,
        stock: raw.stock != null ? Number(raw.stock) : (raw.Quantity != null ? Number(raw.Quantity) : null),
        barcode: String(raw.barcode ?? raw.Barcode ?? raw.Штрихкод ?? '').trim()
    };
}