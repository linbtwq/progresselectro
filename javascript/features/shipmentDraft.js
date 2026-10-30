// возвращает отдельный ключ черновика для каждого пользователя
function shipmentDraftKey() { return currentUser ? 'shipmentDraft:' + currentUser.id : null; }

// сохраняет только подтвержденные количества и идентификатор повторной отправки
function saveShipmentDraft() {
    const key = shipmentDraftKey();
    if (!key || shipmentLoading) return;
    const items = shipmentItems.filter(item => item.qty > 0).map(item => ({code:item.code, qty:item.qty}));
    try {
        if (items.length) localStorage.setItem(key, JSON.stringify({items, requestId:shipmentRequestId, at:Date.now()}));
        else localStorage.removeItem(key);
    } catch (e) { showToast('Не вдалося зберегти чернетку на пристрої', true); }
}

// восстанавливает черновик по актуальным остаткам и предупреждает об изменениях
function restoreShipmentDraft() {
    const key = shipmentDraftKey();
    const saved = key ? readJsonSafe(key, null) : null;
    if (!saved || !Array.isArray(saved.items)) return;
    let changed = 0, restored = 0;
    for (const selected of saved.items) {
        const item = shipmentItems.find(item => String(item.code) === String(selected.code));
        const qty = Math.max(0, Math.floor(Number(selected.qty) || 0));
        if (!item) { changed++; continue; }
        item.qty = Math.min(qty, item.maxQty);
        if (item.qty !== qty) changed++;
        if (item.qty) restored++;
    }
    if (typeof saved.requestId === 'string' && saved.requestId && !changed) shipmentRequestId = saved.requestId;
    if (changed) showToast('Чернетку відновлено. Залишки змінилися: перевірте кількості.', true);
    else if (restored) showToast('Чернетку відновлено');
}

// удаляет черновик после подтвержденного создания документа
function clearShipmentDraft(key = shipmentDraftKey()) {
    try { if (key) localStorage.removeItem(key); } catch (e) {}
}

// собирает результат из полей ответа сервиса, не выдумывая номер документа
function shipmentResultDetails(response, items, conductError) {
    const details = [`Надіслано позицій: ${items.length}`];
    const total = items.reduce((sum, item) => sum + item.qty * item.price, 0);
    const serverSum = response?.sum;
    details.push(`Сума документа: ${fmt(serverSum != null && Number.isFinite(Number(serverSum)) ? Number(serverSum) : total)} ₴`);
    if (response?.doc_number) details.push(`Накладна № ${response.doc_number}`);
    else details.push('Сервер підтвердив документ без номера');
    if (response?.doc_date) details.push(`Дата: ${response.doc_date}`);
    if (conductError) details.push(`Причина: ${conductError}`);
    return details;
}
