// возвращает ключ истории текущего пользователя, чтобы не смешивать разные аккаунты
function recentSearchKey() { return currentUser ? 'recentSearches:' + currentUser.id : null; }

// читает только корректные строки из сохраненной истории
function readRecentSearches() {
    const key = recentSearchKey();
    const saved = key ? readJsonSafe(key, []) : [];
    return Array.isArray(saved) ? saved.filter(q => typeof q === 'string' && q.trim()).slice(0, 6) : [];
}

// сохраняет успешный запрос и заменяет его короткие промежуточные варианты
function rememberRecentSearch(query) {
    const key = recentSearchKey();
    query = String(query).trim().slice(0, 100);
    if (!key || query.length < 2) return;
    const list = readRecentSearches().filter(q => !query.toLowerCase().startsWith(q.toLowerCase()));
    try { localStorage.setItem(key, JSON.stringify([query, ...list].slice(0, 6))); } catch (e) {}
    renderRecentSearches();
}

// показывает последние запросы на стартовом экране
function renderRecentSearches() {
    const host = document.getElementById('recentSearches');
    if (!host) return;
    const list = readRecentSearches();
    const clock = '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4v6h6M4.5 9A8 8 0 1 1 4 15m8-7v4l3 2"/></svg>';
    const arrow = '<svg class="recent-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg>';
    host.innerHTML = list.length ? '<div class="recent-heading"><h2>Останні пошуки</h2><button type="button" data-clear-recent>Очистити</button></div><div class="recent-list">' + list.map((q, i) => `<button type="button" data-recent-index="${i}">${clock}<span>${escapeHtml(q)}</span>${arrow}</button>`).join('') + '</div>' : '';
}

// создает блок истории и повторяет запрос по нажатию на сохраненную строку
function initRecentSearches() {
    let host = document.getElementById('recentSearches');
    if (host) return;
    host = document.createElement('section'); host.id = 'recentSearches';
    host.className = 'recent-searches'; host.setAttribute('aria-label', 'Останні пошуки');
    document.getElementById('searchContainer')?.appendChild(host);
    host.addEventListener('click', event => {
        if (event.target.closest('[data-clear-recent]')) {
            try { localStorage.removeItem(recentSearchKey()); } catch (e) {}
            renderRecentSearches(); return;
        }
        const button = event.target.closest('[data-recent-index]');
        if (!button) return;
        const query = readRecentSearches()[Number(button.dataset.recentIndex)];
        if (!query) return;
        document.getElementById('goodsSearch').value = query;
        document.getElementById('searchClear').hidden = false;
        runGoodsSearch(query);
    });
    renderRecentSearches();
}
