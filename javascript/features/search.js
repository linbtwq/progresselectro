const SEARCH_MIN_QUERY = 1;
let _searchTimer = null;
let _searchSeq = 0;
let _searchAbort = null;

const GOODS_PAGE_LIMIT = APP_CONFIG.pageSize || 60;
let _goodsResults = [];
let _goodsShown = 0;
let _goodsQuery = '';
let _goodsTruncated = false;
function cancelGoodsSearch() {
    clearTimeout(_searchTimer);
    ++_searchSeq;
    if (_searchAbort) _searchAbort.abort();
    _searchAbort = null;
}
function showMoreGoods() {
    const container = document.getElementById('resultsContainer');
    if (!container || _goodsShown >= _goodsResults.length) return;
    container.querySelector('.show-more-wrap')?.remove();
    const end = Math.min(_goodsShown + GOODS_PAGE_LIMIT, _goodsResults.length);
    container.insertAdjacentHTML('beforeend', _goodsResults.slice(_goodsShown, end).map((item, i) => goodsCardHtml(item, i, _goodsQuery)).join(''));
    _goodsShown = end;
    if (end === _goodsResults.length && !_goodsTruncated) container.insertAdjacentHTML('beforeend', goodsListEndHtml());
    if (end < _goodsResults.length) container.insertAdjacentHTML('beforeend',
        '<div class="show-more-wrap"><div class="show-more-progress">' + end + ' із ' + _goodsResults.length + '</div><button class="action-btn btn-secondary" data-action="more">Показати ще</button></div>');
}

function buildGoodsIndex() {
    if (goodsIndexBuilt) return;
    goodsIndexBuilt = true;
    goodsByCode.clear();
    goodsByBarcode.clear();
    for (const g of goodsData) {
        if (g.code) goodsByCode.set(String(g.code), g);
        if (g.barcode) goodsByBarcode.set(String(g.barcode), g);
    }
}

function localSearchGoods(query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return goodsData.slice();

    const results = [];
    for (let i = 0; i < goodsData.length; i++) {
        const g = goodsData[i];
        const name = (g.name || '').toLowerCase();
        const code = String(g.code || '').toLowerCase();
        const barcode = String(g.barcode || '').toLowerCase();
        
        if (name.includes(q) || code.includes(q) || barcode.includes(q)) {
            results.push(g);
        }
    }
    return results;
}

async function remoteSearchGoods(query, signal) {
    const u = currentUser ? encodeURIComponent(currentUser.id) : '';
    const url = `${apiBase}/goods?u=${u}&q=${encodeURIComponent(query)}&t=${Date.now()}`;
    const res = await fetchWithTimeout(url, { method: 'GET', cache: 'no-store', signal }, APP_CONFIG.loadTimeoutMs);
    if (!res.ok) throw new Error('Пошук: HTTP ' + res.status);
    const data = await res.json();
    if (!Array.isArray(data) && (!data || !Array.isArray(data.items))) throw new Error('Некоректна відповідь пошуку');
    return {items: Array.isArray(data) ? data : data.items, truncated: data.truncated === true};
}

function handleGoodsSearchInput(e) {
    const query = (e.target.value || '').trim();
    const clearBtn = document.getElementById('searchClear');
    if (clearBtn) clearBtn.hidden = !query;

    cancelGoodsSearch();
    _searchTimer = setTimeout(() => runGoodsSearch(query), 200); // 200мс дебаунс
}

async function runGoodsSearch(query) {
    cancelGoodsSearch();
    const seq = _searchSeq;
    _goodsResults = [];
    _goodsShown = 0;

    const appWrapper = document.getElementById('appWrapper');
    const resultsContainer = document.getElementById('resultsContainer');
    
    if (!appWrapper || !resultsContainer) return;

    // Если поле пустое — возвращаем все на место
    if (!query) {
        appWrapper.classList.remove('has-results');
        resultsContainer.innerHTML = '';
        renderRecentSearches();
        return;
    }

    // Включаем компактный режим (прячем иконку)
    appWrapper.classList.add('has-results');

    if (/^\d{8,}$/.test(query)) {
        searchGoodsByBarcode(query);
        return;
    }

    if (!navigator.onLine) {
        if (seq === _searchSeq) renderCachedGoodsSearch(query, 'Немає мережі. Показано лише збережені товари; ціни та залишки можуть бути неактуальними.');
        return;
    }

    _searchAbort = new AbortController();
    resultsContainer.innerHTML = goodsSkeletonHtml();
    let result;
    try {
        result = await remoteSearchGoods(query, _searchAbort.signal);
    } catch (err) {
        if (err.name === 'AbortError') return;
        if (seq !== _searchSeq) return;
        // ошибка сервера или формата ответа не означает отсутствие интернета
        console.warn('[goods search]', err);
        renderCachedGoodsSearch(query, navigator.onLine
            ? 'Не вдалося оновити пошук. Показано лише збережені товари; ціни та залишки можуть бути неактуальними.'
            : 'Немає мережі. Показано лише збережені товари; ціни та залишки можуть бути неактуальними.');
        return;
    }
    if (seq !== _searchSeq) return;
    // ошибки отображения не маскируются под сетевой сбой
    renderGoodsResults(result.items, query, true, result.truncated);
    if (result.truncated) resultsContainer.insertAdjacentHTML('beforeend', '<p class="search-note">Показано перші ' + result.items.length + ' товарів. Уточніть пошук.</p>');
}

async function searchGoodsByBarcode(barcode) {
    cancelGoodsSearch();
    const seq = _searchSeq;
    _searchAbort = new AbortController();
    const clean = String(barcode || '').replace(/\s+/g, '');
    if (!clean) return;

    const input = document.getElementById('goodsSearch');
    const appWrapper = document.getElementById('appWrapper');
    
    if (input) {
        input.value = '';
        const cb = document.getElementById('searchClear');
        if (cb) cb.hidden = true;
    }

    if (appWrapper) appWrapper.classList.add('has-results');

    const resultsContainer = document.getElementById('resultsContainer');
    const searchContainer = document.getElementById('searchContainer');
    if (searchContainer) {
        searchContainer.classList.remove('center');
        searchContainer.classList.add('top');
    }
    if (resultsContainer) resultsContainer.classList.add('active');

    buildGoodsIndex();
    const local = goodsByBarcode.get(clean) || goodsByCode.get(clean);
    if (local) {
        renderGoodsResults([local], '', false);
        showToast(`Знайдено: ${local.name}`, false);
        return;
    }

    if (resultsContainer) resultsContainer.innerHTML = `<div class="goods-loading"><div class="skeleton skeleton-text"></div></div>`;
    try {
        const u = currentUser ? encodeURIComponent(currentUser.id) : '';
        const url = `${apiBase}/goods?u=${u}&barcode=${encodeURIComponent(clean)}&t=${Date.now()}`;
        const res = await fetchWithTimeout(url, { method: 'GET', cache: 'no-store', signal: _searchAbort.signal }, APP_CONFIG.loadTimeoutMs);
        if (!res.ok) throw new Error('Помилка мережі');
        const data = await res.json();
        const items = Array.isArray(data.items) ? data.items : (Array.isArray(data) ? data : []);

        if (seq !== _searchSeq) return;
        if (!items.length) {
            resultsContainer.innerHTML = emptyStateHtml(`Товар зі штрихкодом ${clean} не знайдено`, '36px 20px', 'search');
            showToast(`Не знайдено: ${clean}`, true);
            return;
        }
        renderGoodsResults(items, '', true);
        showToast(`Знайдено: ${items[0].name || 'товар'}`, false);
    } catch (err) {
        if (seq !== _searchSeq || err.name === 'AbortError') return;
        if (resultsContainer) resultsContainer.innerHTML = emptyStateHtml('Помилка пошуку', '36px 20px', 'alert');
        showToast('Помилка пошуку за штрихкодом', true);
    }
}

function renderGoodsResults(items, query, fromServer, truncated = false) {
    _goodsQuery = query || '';
    _goodsTruncated = truncated;
    const container = document.getElementById('resultsContainer');
    if (!container) return;

    _goodsResults = items.map(normalizeGoods).filter(item => item.type !== 'folder');
    if (_goodsResults.length && query) rememberRecentSearch(query);
    if (fromServer && currentUser) {
        // сохраняем найденные товары отдельно от папок для поиска без сети
        const merged = new Map(goodsData.map(item => [item.id || item.code, item]));
        for (const item of _goodsResults) merged.set(item.id || item.code, item);
        goodsData = Array.from(merged.values()); goodsIndexBuilt = false;
        localDB.save('cachedGoods:' + currentUser.id, goodsData).catch(() => {});
    }
    items = _goodsResults;
    _goodsShown = Math.min(GOODS_PAGE_LIMIT, items.length);
    if (!items.length) {
        container.innerHTML = resultCountHtml(0) + emptyStateHtml(
            query ? `Немає збігів для «${query}». Спробуйте іншу назву або код.` : 'Спробуйте іншу назву, код або штрихкод',
            '36px 20px', 'search'
        );
        return;
    }

    const shown = items.slice(0, GOODS_PAGE_LIMIT);
    const remaining = items.length - shown.length;

    let html = resultCountHtml(items.length, truncated) + shown.map((it, i) => goodsCardHtml(it, i, _goodsQuery)).join('');

    if (remaining > 0) {
        html += `
            <div class="show-more-wrap">
                <div class="show-more-progress">${shown.length} із ${items.length}</div>
                <button class="action-btn btn-secondary" data-action="more">Показати ще</button>
            </div>
        `;
    }

    if (!remaining && !truncated) html += goodsListEndHtml();
    container.innerHTML = html;
    container.dataset.renderKey = `q:${query}:${fromServer ? 'srv' : 'loc'}`;
    container.scrollTop = 0;
    if (typeof updateBackToTop === 'function') updateBackToTop();
}

// подключает поиск, историю запросов и действия главного экрана
function initGoodsSearch() {
    initRecentSearches();
    const input = document.getElementById('goodsSearch');
    const clearBtn = document.getElementById('searchClear');
    const numericBtn = document.getElementById('numericToggle');
    const scanBtn = document.getElementById('scanBtn');
    const mainAddBtn = document.getElementById('mainAddBtn');

    if (input) {
        input.addEventListener('input', handleGoodsSearchInput);
        input.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            clearTimeout(_searchTimer);
            const q = input.value.trim();
            if (!q) return;
            if (/^\d{8,}$/.test(q)) searchGoodsByBarcode(q);
            else runGoodsSearch(q);
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (input) input.value = '';
            clearBtn.hidden = true;
            runGoodsSearch('');
            if (window.matchMedia('(pointer: fine)').matches) input?.focus();
        });
    }

    if (numericBtn && input) {
        let isNum = false;
        numericBtn.addEventListener('click', () => {
            isNum = !isNum;
            numericBtn.classList.toggle('active', isNum);
            numericBtn.setAttribute('aria-pressed', isNum ? 'true' : 'false');
            input.setAttribute('inputmode', isNum ? 'numeric' : 'text');
            input.focus();
        });
    }

    if (scanBtn) {
        scanBtn.addEventListener('click', () => {
            if (typeof openBarcodeScanner === 'function') openBarcodeScanner();
        });
    }

        if (mainAddBtn) {
        mainAddBtn.addEventListener('click', () => {
            if (typeof openShipmentModal === 'function') {
                openShipmentModal();
            }
        });
    }
}
// показывает число результатов с правильной формой слова и учетом ограничения сервера
function resultCountHtml(count, truncated = false) {
    const tail = count % 100;
    const word = tail >= 11 && tail <= 14 ? 'товарів' : count % 10 === 1 ? 'товар' : count % 10 >= 2 && count % 10 <= 4 ? 'товари' : 'товарів';
    return '<div class="results-summary" role="status"><span>Знайдено</span><b>' + fmt(count) + (truncated ? '+' : '') + ' ' + word + '</b></div>';
}

// завершает только полностью показанную выдачу, без обещания полноты при ограничении сервера
function goodsListEndHtml() {
    return '<div class="results-end"><span>Усі знайдені товари показано</span></div>';
}

// повторяет геометрию будущих карточек, не выдавая заглушки за реальные данные
function goodsSkeletonHtml(layout = 'goods') {
    const assortment = layout === 'assort';
    const card = '<div class="loading-card" aria-hidden="true"><div class="loading-head"><div class="loading-name"><span class="skeleton loading-line"></span><span class="skeleton loading-line short"></span></div>' +
        (assortment ? '' : '<span class="skeleton loading-price"></span>') + '</div><div class="loading-meta"><span class="skeleton loading-code"></span><span class="skeleton loading-stock"></span></div>' +
        (assortment ? '<div class="loading-meta loading-controls"><span class="skeleton loading-quantity"></span><span class="skeleton loading-price"></span></div>' : '') + '</div>';
    return '<div class="loading-list ' + (assortment ? 'loading-assort' : '') + '" role="status" aria-label="Завантаження товарів"><span class="visually-hidden">Завантаження товарів…</span>' + card.repeat(3) + '</div>';
}

// показывает источник данных внутри выдачи без повторяющихся всплывающих уведомлений
function renderCachedGoodsSearch(query, message) {
    const container = document.getElementById('resultsContainer');
    renderGoodsResults(localSearchGoods(query), query, false, true);
    if (!_goodsResults.length) container.innerHTML = emptyStateHtml('У збережених товарах немає збігів. Повний пошук зараз недоступний.', '36px 20px', 'search');
    container.insertAdjacentHTML('afterbegin', '<p class="search-source-note" role="status">' + escapeHtml(message) + '</p>');
}
