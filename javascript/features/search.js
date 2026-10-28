const SEARCH_MIN_QUERY = 1;
let _searchTimer = null;
let _searchSeq = 0;
let _searchAbort = null;

const GOODS_PAGE_LIMIT = 60;

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
        if (results.length >= GOODS_PAGE_LIMIT * 4) break; // Ограничитель
    }
    return results;
}

async function remoteSearchGoods(query, signal) {
    const u = currentUser ? encodeURIComponent(currentUser.id) : '';
    const url = `${apiBase}/goods?u=${u}&q=${encodeURIComponent(query)}&t=${Date.now()}`;
    const res = await fetchWithTimeout(url, { method: 'GET', cache: 'no-store', signal }, APP_CONFIG.loadTimeoutMs);
    if (!res.ok) throw new Error('Помилка мережі');
    const data = await res.json();
    return Array.isArray(data.items) ? data.items : (Array.isArray(data) ? data : []);
}

function handleGoodsSearchInput(e) {
    const query = (e.target.value || '').trim();
    const clearBtn = document.getElementById('searchClear');
    if (clearBtn) clearBtn.hidden = !query;

    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => runGoodsSearch(query), 200); // 200мс дебаунс
}

async function runGoodsSearch(query) {
    const seq = ++_searchSeq;
    if (_searchAbort) _searchAbort.abort();

    const searchContainer = document.getElementById('searchContainer');
    const resultsContainer = document.getElementById('resultsContainer');
    if (!searchContainer || !resultsContainer) return;

    if (!query) {
        searchContainer.classList.remove('top');
        searchContainer.classList.add('center');
        resultsContainer.classList.remove('active');
        resultsContainer.innerHTML = '';
        return;
    }

    searchContainer.classList.remove('center');
    searchContainer.classList.add('top');
    resultsContainer.classList.add('active');

    if (/^\d{8,}$/.test(query)) {
        searchGoodsByBarcode(query);
        return;
    }

    if (goodsData.length) {
        const local = localSearchGoods(query);
        if (seq === _searchSeq) renderGoodsResults(local, query, false);
        return;
    }

    _searchAbort = new AbortController();
    resultsContainer.innerHTML = `<div class="goods-loading"><div class="skeleton skeleton-text"></div></div>`;
    try {
        const items = await remoteSearchGoods(query, _searchAbort.signal);
        if (seq !== _searchSeq) return;
        renderGoodsResults(items, query, true);
    } catch (err) {
        if (err.name === 'AbortError') return;
        if (seq !== _searchSeq) return;
        resultsContainer.innerHTML = emptyStateHtml('Помилка пошуку', '36px 20px', 'alert');
    }
}

async function searchGoodsByBarcode(barcode) {
    const clean = String(barcode || '').replace(/\s+/g, '');
    if (!clean) return;

    const input = document.getElementById('goodsSearch');
    if (input) {
        input.value = '';
        const cb = document.getElementById('searchClear');
        if (cb) cb.hidden = true;
    }

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
        const res = await fetchWithTimeout(url, { method: 'GET', cache: 'no-store' }, APP_CONFIG.loadTimeoutMs);
        if (!res.ok) throw new Error('Помилка мережі');
        const data = await res.json();
        const items = Array.isArray(data.items) ? data.items : (Array.isArray(data) ? data : []);

        if (!items.length) {
            resultsContainer.innerHTML = emptyStateHtml(`Товар зі штрихкодом ${clean} не знайдено`, '36px 20px', 'search');
            showToast(`Не знайдено: ${clean}`, true);
            return;
        }
        renderGoodsResults(items, '', true);
        showToast(`Знайдено: ${items[0].name || 'товар'}`, false);
    } catch (err) {
        if (resultsContainer) resultsContainer.innerHTML = emptyStateHtml('Помилка пошуку', '36px 20px', 'alert');
        showToast('Помилка пошуку за штрихкодом', true);
    }
}

function renderGoodsResults(items, query, fromServer) {
    const container = document.getElementById('resultsContainer');
    if (!container) return;

    if (!items.length) {
        container.innerHTML = emptyStateHtml(
            query ? `За запитом «${query}» нічого не знайдено` : 'Товар не знайдено',
            '36px 20px', 'search'
        );
        return;
    }

    const shown = items.slice(0, GOODS_PAGE_LIMIT);
    const remaining = items.length - shown.length;

    let html = shown.map((it, i) => goodsCardHtml(it, i)).join('');

    if (remaining > 0) {
        html += `
            <div class="show-more-wrap">
                <div class="show-more-progress">${shown.length} із ${items.length}</div>
                <button class="action-btn btn-secondary" data-action="more">Показати ще</button>
            </div>
        `;
    }

    container.innerHTML = html;
    container.dataset.renderKey = `q:${query}:${fromServer ? 'srv' : 'loc'}`;
    container.scrollTop = 0;
    if (typeof updateBackToTop === 'function') updateBackToTop();
}

function initGoodsSearch() {
    const input = document.getElementById('goodsSearch');
    const clearBtn = document.getElementById('searchClear');
    const numericBtn = document.getElementById('numericToggle');
    const scanBtn = document.getElementById('scanBtn');

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
}