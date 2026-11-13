// ============================================================
// app/load.js — завантаження та кешування номенклатури
// ============================================================

let _goodsLoadSeq = 0;
let _goodsLoadAbort = null;
// отменяем запрос и сбрасываем номер загрузки, чтобы старый ответ не попал в новую сессию
function cancelGoodsLoad() {
    ++_goodsLoadSeq;
    _goodsLoadAbort?.abort();
    _goodsLoadAbort = null;
}

let catalogSavedAt = 0;
const CATALOG_REFRESH_INTERVAL = 60 * 60000;

function renderCatalogStatus(text) {
    const status = document.getElementById('offlineCatalogStatus');
    if (status) status.textContent = text;
}

function catalogRefreshMessage(outcome) {
    if (outcome?.kind === 'http') {
        const page = outcome.cursor ? 'після коду ' + outcome.cursor : 'перша порція';
        return 'Помилка сервера · HTTP ' + outcome.status + ' · ' + page;
    }
    if (outcome === 'catalog-schema') return 'Несумісний формат каталогу. Перевірте версію модуля 1С.';
    if (outcome === 'timeout') return '1С не відповіла вчасно.';
    if (outcome === 'failed') return 'Не вдалося прочитати або зберегти каталог.';
    return '1С недоступна. Перевірте Wi-Fi магазину й доступ до локальної мережі.';
}

function renderCatalogActivity(text, retry = false) {
    const activity = document.getElementById('offlineCatalogActivity');
    if (activity) activity.textContent = text;
    const button = document.getElementById('catalogRefreshBtn');
    if (button && !button.disabled) button.textContent = retry ? 'Повторити оновлення' : 'Оновити каталог';
}

// один каталог на пользователя обновляет только одна вкладка
async function loadGoodsData({silent = false, manual = false} = {}) {
    if (navigator.locks && currentUser) {
        return navigator.locks.request('catalog:' + currentUser.id, {ifAvailable:true}, lock =>
            lock ? syncGoodsData({silent, manual}) : 'busy');
    }
    return syncGoodsData({silent, manual});
}

async function syncGoodsData(options) {
    if (!currentUser || isLoading) return isLoading ? 'busy' : undefined;
    const user = currentUser;
    const outcome = await downloadGoodsData(options);
    if (currentUser !== user || !outcome || outcome === 'busy') return outcome;
    if (outcome === 'updated') renderCatalogActivity('');
    else renderCatalogActivity(catalogRefreshMessage(outcome), true);
    return outcome;
}

async function downloadGoodsData({silent, manual}) {
    if (!currentUser) return;
    if (isLoading) return 'busy';
    if (catalogSavedAt && !manual && Date.now() - catalogSavedAt < CATALOG_REFRESH_INTERVAL) return;
    const user = currentUser;
    const seq = ++_goodsLoadSeq;
    const controller = new AbortController();
    _goodsLoadAbort = controller;
    const active = () => seq === _goodsLoadSeq && currentUser === user;
    const key = 'catalog:v1:' + user.id;
    let serverResponded = false;
    isLoading = true;
    try {
        // сначала показываем сохраненный каталог
        const stored = await localDB.load(key).catch(() => null);
        if (!active()) return;
        if (stored?.savedAt > catalogSavedAt && Array.isArray(stored.items)) {
            const first = !catalogSavedAt;
            applyCatalog(stored);
            if (first) refreshInitialCatalogSearch();
        } else if (!catalogSavedAt && !goodsData.length) {
            const cached = await localDB.load('cachedGoods:' + user.id).catch(() => null);
            if (!active()) return;
            if (!goodsData.length && Array.isArray(cached)) {
                goodsData = cached.map(normalizeGoods).filter(item => item.type !== 'folder');
                goodsIndexBuilt = false;
            }
        }
        if (!navigator.onLine) {
            if (!catalogSavedAt) renderCatalogStatus('Повний каталог ще не збережено. Підключіться до мережі магазину');
            return 'offline';
        }
        // старая версия сервиса отдает все товары, с ней обновляем полный каталог по кнопке
        if (!manual && catalogSavedAt && (!stored?.pageInfo?.length || Date.now() - catalogSavedAt < CATALOG_REFRESH_INTERVAL)) return;
        // продолжаем незавершенную загрузку, если с ее начала прошло меньше суток
        const checkpoint = await localDB.load(key + ':pending').catch(() => null);
        if (!active()) return;
        const resume = checkpoint?.startedAt > catalogSavedAt && Date.now() - checkpoint.startedAt < 86400000;
        const startedAt = resume ? checkpoint.startedAt : Date.now();
        let cursor = resume ? checkpoint.cursor : '';
        let pageCount = resume ? checkpoint.pageCount : 0;
        const pages = [];
        const pageInfo = resume ? (checkpoint.pageInfo || []).slice() : [];
        const savedPages = new Map((stored?.pageInfo || []).map(info => [info.cursor, info]));
        for (let index = 0; index < pageCount; index++) {
            const page = await localDB.load(key + ':page:' + index);
            if (!active()) return;
            if (!Array.isArray(page)) {
                await localDB.save(key + ':pending', null);
                throw new Error('Не вдалося відновити завантаження каталогу');
            }
            pages.push(page);
        }
        const seen = new Set(pages.flatMap(page => page.map(item => item.id)));
        const base = apiBase + '/goods?offline=1&fingerprints=1&u=' + encodeURIComponent(user.id);
        let offset = pages.reduce((total, page) => total + page.length, 0);
        do {
            renderCatalogActivity('Оновлюємо каталог… · ' + fmt(seen.size) + ' товарів');
            const previous = savedPages.get(cursor);
            const fingerprint = previous ? '&fingerprint=' + encodeURIComponent(previous.fingerprint) : '';
            const response = await fetchCatalogPage(base + '&cursor=' + encodeURIComponent(cursor) + fingerprint, controller.signal);
            if (!active()) return;
            serverResponded = true;
            if (!response.ok) return {kind:'http', status:response.status, cursor};
            const page = response.page;
            if (page?.schema !== 1) return 'catalog-schema';
            const reuse = page.unchanged === true && previous && previous.fingerprint === page.fingerprint;
            const rows = reuse ? stored.items.slice(previous.offset, previous.offset + previous.count) : page.items;
            if (!Array.isArray(rows) || typeof page.next_cursor !== 'string' ||
                (page.next_cursor && (!rows.length || !/^\d+$/.test(page.next_cursor) || (cursor && Number(page.next_cursor) <= Number(cursor))))) {
                throw new Error('1С не повернула сторінку офлайн-каталогу');
            }
            const items = reuse ? rows : rows.map(raw => {
                if (!raw || typeof raw.id !== 'string' || typeof raw.code !== 'string' ||
                    typeof raw.name !== 'string' || !Array.isArray(raw.barcodes) || !Array.isArray(raw.stock_locations)) {
                    throw new Error('Пошкоджена позиція офлайн-каталогу');
                }
                return normalizeGoods(raw);
            });
            for (const item of items) {
                if (!item.id || !item.code || item.type !== 'item' || seen.has(item.id)) {
                    await localDB.save(key + ':pending', null);
                    throw new Error('Некоректні дані офлайн-каталогу');
                }
                seen.add(item.id);
            }
            pages.push(items);
            if (typeof page.fingerprint === 'string' && page.fingerprint) {
                pageInfo.push({cursor, fingerprint:page.fingerprint, offset, count:items.length});
            }
            offset += items.length;
            cursor = page.next_cursor;
            if (cursor) {
                // сначала сохраняем порцию, потом курсор для следующей попытки
                await localDB.save(key + ':page:' + pageCount++, items);
                if (!active()) return;
                await localDB.save(key + ':pending', {cursor, pageCount, startedAt, pageInfo});
            }
        } while (cursor && active());
        if (!active()) return;
        // заменяем рабочий каталог только после получения всех порций
        const saved = {items: pages.flat(), savedAt: Date.now(), pageInfo};
        await localDB.commitCatalog(key, saved);
        if (!active()) return;
        applyCatalog(saved);
        lastLoadedAt = saved.savedAt;
        setConnectionStatus(true);
        refreshInitialCatalogSearch();
        return 'updated';
    } catch (error) {
        if (!active()) return;
        if (!serverResponded && error.name === 'AbortError') {
            setConnectionStatus(false);
            return 'timeout';
        }
        if (!serverResponded && error instanceof TypeError) {
            setConnectionStatus(false);
            return 'network';
        }
        if (!catalogSavedAt) renderCatalogStatus('Підключіться до мережі магазину й натисніть «Оновити дані»');
        if (!silent && !manual && !catalogSavedAt) showToast('Не вдалося завантажити повний каталог', true);
        return 'failed';
    } finally {
        if (active()) {
            isLoading = false;
            if (serverResponded) setConnectionStatus(true);
            else renderStatus();
        }
    }
}

async function fetchCatalogPage(url, signal) {
    const timeout = new AbortController();
    const abort = () => timeout.abort();
    signal.addEventListener('abort', abort, {once:true});
    if (signal.aborted) abort();
    const timer = setTimeout(abort, APP_CONFIG.loadTimeoutMs);
    try {
        const response = await fetchFrom1C(url, {cache:'no-store', signal:timeout.signal});
        if (!response.ok) return {ok:false, status:response.status};
        try {
            return {ok:true, page:await response.json()};
        } catch (error) {
            if (error.name === 'AbortError') throw error;
            return {ok:true, page:null};
        }
    } finally {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
    }
}

function applyCatalog(saved) {
    goodsData = saved.items;
    goodsIndexBuilt = false;
    catalogSavedAt = saved.savedAt;
    lastLoadedAt = saved.savedAt;
    _dataRevision++;
    renderCatalogStatus('Каталог доступний офлайн · ' + new Date(saved.savedAt).toLocaleString('uk-UA', {dateStyle:'short', timeStyle:'short'}));
}

function refreshInitialCatalogSearch() {
    const query = document.getElementById('goodsSearch')?.value?.trim();
    if (query) runGoodsSearch(query);
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
        barcode: String(raw.barcode ?? raw.Barcode ?? raw.Штрихкод ?? raw.barcodes?.[0] ?? '').trim(),
        barcodes: Array.isArray(raw.barcodes) ? raw.barcodes.map(String) : [],
        stockLocations: Array.isArray(raw.stock_locations ?? raw.stockLocations) ? (raw.stock_locations ?? raw.stockLocations) : null
    };
}
