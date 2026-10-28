function goodsCardHtml(item, idx) {
    const code = escapeHtml(item.code || '—');
    const name = escapeHtml(item.name || '—');
    const price = Number(item.price) || 0;
    const stock = item.stock != null ? Number(item.stock) : null;
    const barcode = String(item.barcode || '').trim();
    const id = escapeHtml(item.id || item.code || '');

    const stockClass = stock == null ? '' : (stock > 0 ? 'stock-ok' : 'stock-zero');
    const stockText = stock == null ? '—' : fmt(stock);

    return `
        <div class="goods-card" style="--i:${idx}" data-rendered="1" data-id="${id}" data-code="${code}">
            <div class="goods-head">
                <div class="goods-title">${name}</div>
                <span class="goods-code">${code}</span>
            </div>

            <div class="goods-meta">
                <div class="goods-field">
                    <label>Ціна</label>
                    <span class="price">${fmt(price)} ₴</span>
                </div>
                <div class="goods-field">
                    <label>Залишок</label>
                    <span class="${stockClass}">${stockText}</span>
                </div>
                ${barcode ? `
                    <div class="goods-field">
                        <label>Штрихкод</label>
                        <span class="barcode">${escapeHtml(barcode)}</span>
                    </div>
                ` : ''}
            </div>

            <div class="goods-actions">
                <button class="action-btn btn-outline" data-action="action1" data-id="${id}">Дія 1</button>
                <button class="action-btn btn-primary" data-action="action2" data-id="${id}">Дія 2</button>
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

    if (action === 'action1') {
        showToast(`Дія 1: ${item.name || id}`);
        // TODO: тут будет логика
    } else if (action === 'action2') {
        showToast(`Дія 2: ${item.name || id}`);
        // TODO: тут будет логика
    }
}

function findGoodsById(id) {
    if (!id) return null;
    buildGoodsIndex();
    return goodsByCode.get(String(id)) || goodsData.find(g => String(g.id) === String(id)) || null;
}