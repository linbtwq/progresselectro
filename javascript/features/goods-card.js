// ============================================================
// javascript/features/goods-card.js
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
                    <span class="price-label">ЦІНА</span>
                    <span class="price-val">${fmt(price)} ₴</span>
                </div>
            </div>

            <div class="goods-meta">
                ${code ? `<span class="goods-code">${code}</span>` : ''}
                ${barcode ? `<span class="goods-barcode">${escapeHtml(barcode)}</span>` : ''}
                ${stockHtml}
            </div>

            <div class="goods-actions" style="grid-template-columns: 1fr;">
                <button class="action-btn btn-primary" data-action="catalog" data-id="${id}">
                    Каталог
                </button>
            </div>
        </div>
    `;
}

function handleGoodsCardClick(event) {
    const btn = event.target.closest('[data-action]');
    if (!btn) return;

    const { action, id } = btn.dataset;
    const item = findGoodsById(id);
    if (!item) return;

    if (action === 'catalog') {
        // Открываем боковую панель с каталогом (drawer)
        if (typeof openDrawer === 'function') {
            openDrawer();
        } else {
            showToast('Каталог');
        }
    }
}

function findGoodsById(id) {
    if (!id) return null;
    buildGoodsIndex();
    return goodsByCode.get(String(id)) || goodsData.find(g => String(g.id) === String(id)) || null;
}   