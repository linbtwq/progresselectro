// ============================================================
// javascript/features/goods-card.js
// ============================================================

// строит карточку с единой иерархией названия, цены и остатков
function goodsCardHtml(item, idx, query = '') {
    const code = escapeHtml(item.code || '');
    const name = highlightText(item.name || '—', query);
    const price = Number(item.price) || 0;
    const stock = item.stock != null ? Number(item.stock) : null;
    const barcode = String(item.barcode || '').trim();
    const id = escapeHtml(item.id || item.code || '');

    let stockHtml = '';
    // остатки показываются без неподтвержденных единиц измерения или порога малого запаса
    if (stock !== null && Number.isFinite(stock)) {
        const state = stock > 0 ? 'ok' : stock < 0 ? 'warning' : 'zero';
        const label = stock > 0 ? 'В наявності: ' + fmt(stock) : stock < 0 ? 'Недостача: ' + fmt(Math.abs(stock)) : 'Немає в наявності';
        stockHtml = `<div class="goods-stock ${state}">${label}</div>`;
    }

    return `
        <div class="goods-card" data-rendered="1" data-id="${id}" data-code="${code}">
            <div class="goods-head">
                <div class="goods-title">${name}</div>
                <div class="goods-price-block">
                    <span class="price-label">Ціна</span>
                    <span class="price-val">${money(price)} ₴</span>
                </div>
            </div>

            <div class="goods-meta">
                ${code ? `<span class="goods-code">${code}</span>` : ''}
                ${barcode ? `<details class="barcode-details"><summary>Штрихкод</summary><span class="goods-barcode">${escapeHtml(barcode)}</span></details>` : ''}
                ${stockHtml}
            </div>

        </div>
    `;
}
