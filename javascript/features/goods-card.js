// ============================================================
// javascript/features/goods-card.js
//
// назначение
// карточка товара для списка результатов поиска.
//
// ответственность
// - html карточки товара с ценой, кодом, штрихкодом и остатком
// - обработчик кликов по кнопкам действий
// - поиск товара по id (для обработчика кнопок)
//
// про действия
// кнопки "дія 1" и "дія 2" - заглушки.
// когда появится логика (добавить в заказ, открыть карточку, показать остатки по точкам),
// заменить обработчики в handleGoodsCardClick на реальные вызовы.
//
// зависимости
// - core/utils.js дает escapeHtml и fmt
// - core/state.js дает goodsData, goodsByCode, goodsIndexBuilt
// ============================================================

// ============================================================
// блок 1. html карточки
//
// item - нормализованный товар из load.js
// idx - порядковый номер, для анимации появления
// ============================================================

function goodsCardHtml(item, idx) {
    const code = escapeHtml(item.code || '');
    const name = escapeHtml(item.name || '—');
    const price = Number(item.price) || 0;
    const stock = item.stock != null ? Number(item.stock) : null;
    const barcode = String(item.barcode || '').trim();
    const id = escapeHtml(item.id || item.code || '');

    let stockHtml = '';
    if (stock !== null) {
        const isOk = stock > 0;
        stockHtml = `<div class="goods-stock ${isOk ? 'ok' : 'zero'}">${isOk ? 'Є: ' : 'Немає: '}${fmt(stock)}</div>`;
    }

    return `
        <div class="goods-card" style="--i:${idx}" data-rendered="1" data-id="${id}" data-code="${code}">
            <div class="goods-head">
                <div class="goods-title">${name}</div>
                <div class="goods-price-block">
                    <span class="price-label">Ціна</span>
                    <span class="price-val">${fmt(price)} ₴</span>
                </div>
            </div>

            <div class="goods-meta">
                ${code ? `<span class="goods-code">${code}</span>` : ''}
                ${barcode ? `<span class="goods-barcode">${escapeHtml(barcode)}</span>` : ''}
                ${stockHtml}
            </div>

            <div class="goods-actions">
                <button class="action-btn btn-outline" data-action="action1" data-id="${id}">Дія 1</button>
                <button class="action-btn btn-primary" data-action="action2" data-id="${id}">Дія 2</button>
            </div>
        </div>
    `;
}

// ============================================================
// блок 2. обработчик кликов по карточке
//
// делегирование: ловим клики по кнопкам с data-action
// пока действия - заглушки с тостом,
// заменить на реальные вызовы когда появится логика
// ============================================================

function handleGoodsCardClick(event) {
    const btn = event.target.closest('[data-action]');
    if (!btn) return;

    const { action, id } = btn.dataset;
    const item = findGoodsById(id);
    if (!item) return;

    if (action === 'action1') {
        // TODO: заменить на реальную логику
        // например: добавить в заказ, показать остатки по точкам
        showToast(`Дія 1: ${item.name || id}`);
    } else if (action === 'action2') {
        // TODO: заменить на реальную логику
        // например: открыть карточку товара, списать
        showToast(`Дія 2: ${item.name || id}`);
    }
}

// ============================================================
// блок 3. поиск товара по id
//
// сначала пробуем через индекс (быстро),
// если там нет - линейный поиск по массиву (медленно, но на всякий случай)
// ============================================================

function findGoodsById(id) {
    if (!id) return null;
    buildGoodsIndex();
    return goodsByCode.get(String(id)) || goodsData.find(g => String(g.id) === String(id)) || null;
}