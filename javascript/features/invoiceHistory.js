// возвращает ключ локальной истории для выбранного пользователя
function invoiceHistoryKey(user = currentUser) { return user ? 'invoiceHistory:' + user.id : null; }

// читает последние сто подтвержденных сервером документов текущего пользователя
function readInvoiceHistory(user = currentUser) {
    const key = invoiceHistoryKey(user);
    const saved = key ? readJsonSafe(key, []) : [];
    return Array.isArray(saved) ? saved.filter(item => item && typeof item.requestId === 'string' && Array.isArray(item.items)).slice(0, 100) : [];
}

// сохраняет подтвержденный результат и объединяет повторный ответ по идентификатору запроса
function saveInvoiceHistory(user, payload, response, conductError) {
    const key = invoiceHistoryKey(user);
    if (!key) return;
    const list = readInvoiceHistory(user);
    const previous = list.find(item => item.requestId === payload.request_id);
    const number = String(response?.doc_number || previous?.number || '');
    const serverSum = response?.sum;
    const calculated = payload.items.reduce((sum, item) => sum + item.qty * item.price, 0);
    // повторный ответ сервиса содержит пустой номер и нулевую сумму: сохраняем уже известные данные
    const total = previous && !response?.doc_number ? previous.total
        : serverSum != null && Number.isFinite(Number(serverSum)) ? Number(serverSum) : calculated;
    const record = { requestId:payload.request_id, number, date:String(response?.doc_date || previous?.date || ''),
        savedAt:previous?.savedAt || Date.now(), total, error:String(conductError || previous?.error || ''),
        items:payload.items.map(item => ({code:item.code, name:item.name, qty:item.qty, price:item.price})) };
    try { localStorage.setItem(key, JSON.stringify([record, ...list.filter(item => item.requestId !== record.requestId)].slice(0, 100))); }
    catch (e) { showToast('Документ створено, але історію не вдалося зберегти на пристрої', true); }
}

// создает окно истории и подключает открытие из меню настроек
function initInvoiceHistory() {
    const overlay = document.createElement('div');
    overlay.id = 'invoiceHistoryOverlay'; overlay.className = 'modal-overlay invoice-history';
    overlay.innerHTML = `<section class="modal-box" role="dialog" aria-modal="true" aria-labelledby="invoiceHistoryTitle">
        <header class="modal-header"><div><h3 id="invoiceHistoryTitle">Історія накладних</h3><p class="history-note">На цьому пристрої · останні 100 документів</p></div><button type="button" class="modal-close" aria-label="Закрити історію">✕</button></header>
        <div class="modal-body" id="invoiceHistoryBody"></div></section>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.modal-close').addEventListener('click', closeInvoiceHistory);
    overlay.addEventListener('click', event => { if (event.target === overlay) closeInvoiceHistory(); });
    document.getElementById('invoiceHistoryBtn')?.addEventListener('click', openInvoiceHistory);
}

// показывает номер, сумму, статус проведения и раскрываемый состав каждой накладной
function openInvoiceHistory() {
    if (!currentUser) return;
    rememberFocus();
    document.getElementById('settingsMenu')?.classList.remove('active');
    const list = readInvoiceHistory();
    const body = document.getElementById('invoiceHistoryBody');
    body.innerHTML = list.length ? list.map(record => `<article class="invoice-card">
        <div class="invoice-heading"><strong>${record.number ? '№ ' + escapeHtml(record.number) : 'Документ без номера'}</strong><b>${fmt(record.total)} ₴</b></div>
        <p class="history-note">${escapeHtml(record.date || new Date(record.savedAt).toLocaleString('uk-UA'))}</p>
        <span class="invoice-status ${record.error ? 'warning' : ''}">${record.error ? 'Створено · не проведено' : record.number ? 'Проведено' : 'Підтверджено сервером'}</span>
        ${record.error ? `<p class="invoice-error">${escapeHtml(record.error)}</p>` : ''}
        <details><summary>Надісланий склад · ${record.items.length} поз.</summary><ul>${record.items.map(item => `<li><span>${escapeHtml(item.name)}<small>${escapeHtml(item.code)}</small></span><b>${fmt(item.qty)} × ${fmt(item.price)} ₴</b></li>`).join('')}</ul></details>
    </article>`).join('') : emptyStateHtml('Тут з’являться накладні, створені з цього пристрою', '24px 12px', 'box');
    const overlay = document.getElementById('invoiceHistoryOverlay');
    overlay.classList.add('active'); autofocusModal(overlay);
}

// закрывает историю и возвращает фокус на предыдущий элемент
function closeInvoiceHistory() {
    document.getElementById('invoiceHistoryOverlay')?.classList.remove('active');
    restoreFocus();
}

// формирует проверочный список из снимка позиций перед отправкой
function shipmentReviewDetails(items) {
    return items.map(item => `${item.name} · ${fmt(item.qty)} × ${fmt(item.price)} ₴ = ${fmt(item.qty * item.price)} ₴`);
}
