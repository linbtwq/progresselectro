// возвращает ключ локальной истории для выбранного пользователя
function invoiceHistoryKey(user = currentUser) { return user ? 'invoiceHistory:' + user.id : null; }

// читает последние сто подтвержденных сервером документов текущего пользователя
function readInvoiceHistory(user = currentUser) {
    const key = invoiceHistoryKey(user);
    const saved = key ? readJsonSafe(key, []) : [];
    return Array.isArray(saved) ? saved.filter(item => item && typeof item.requestId === 'string' && Array.isArray(item.items)).slice(0, 100) : [];
}

// сохраняет подтвержденный результат и объединяет повторный ответ по идентификатору запроса
// сохраняем ответ 1с в истории сотрудника на этом устройстве
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
    const record = { requestId:payload.request_id, number, documentType:response?.document_type || previous?.documentType,
        date:String(response?.doc_date || previous?.date || ''),
        organization:String(response?.organization || previous?.organization || ''),
        store:String(response?.store || previous?.store || ''),
        savedAt:previous?.savedAt || Date.now(), total, error:String(conductError || previous?.error || ''),
        items:payload.items.map(item => ({code:item.code, name:item.name, qty:item.qty, price:item.price, variant:item.variant})) };
    try { localStorage.setItem(key, JSON.stringify([record, ...list.filter(item => item.requestId !== record.requestId)].slice(0, 100))); }
    catch (e) { showToast('Документ створено, але історію не вдалося зберегти на пристрої', true); }
}

function openInvoiceHistory() {
    if (!currentUser || shipmentSending || shipmentReviewPending) return;
    const list = readInvoiceHistory();
    const body = document.getElementById('invoiceHistoryBody');
    body.innerHTML = list.length ? list.map(record => `<article class="invoice-card">
        <div class="invoice-heading"><strong>${record.number ? (record.documentType === 'customer_order' ? 'Замовлення № ' : 'Накладна № ') + escapeHtml(record.number) : 'Документ без номера'}</strong><b>${money(record.total)} ₴</b></div>
        <p class="history-note">${escapeHtml(formatInvoiceDate(record.date, record.savedAt))}</p>
        ${record.organization ? `<p class="history-note">${escapeHtml([record.organization, record.store].filter(Boolean).join(' · '))}</p>` : ''}
        <span class="invoice-status ${record.error ? 'warning' : ''}">${record.error ? 'Потребує перевірки' : record.documentType === 'customer_order' ? 'Створено' : record.number ? 'Проведено' : 'Підтверджено сервером'}</span>
        ${record.error ? `<p class="invoice-error">${escapeHtml(record.error)}</p>` : ''}
        <details><summary>Надісланий склад · ${record.items.length} поз.</summary><ul>${record.items.map(item => `<li><span>${escapeHtml([item.name, item.variant].filter(Boolean).join(" · "))}<small>${escapeHtml(item.code)}</small></span><b>${fmt(item.qty)} × ${money(item.price)} ₴</b></li>`).join('')}</ul></details>
    </article>`).join('') : emptyStateHtml('Тут з’являться документи, створені з цього пристрою', '24px 12px', 'history');
    selectWorkspacePage('invoiceHistoryPage');
}

// формирует проверочный список из снимка позиций перед отправкой
function shipmentReviewDetails(items) {
    return items.map(item => `${item.name} · ${fmt(item.qty)} × ${money(item.price)} ₴ = ${money(item.qty * item.price)} ₴`);
}

// передает визуальному результату только подтвержденные сервером поля документа
function shipmentDocumentResult(response, items, error) {
    const serverTotal = response?.sum;
    return {number:String(response?.doc_number || ''), documentType:response?.document_type, date:String(response?.doc_date || ''), count:items.length,
        total:serverTotal != null && Number.isFinite(Number(serverTotal)) ? Number(serverTotal) : items.reduce((sum,item)=>sum+item.qty*item.price,0),
        error:String(error || '')};
}
