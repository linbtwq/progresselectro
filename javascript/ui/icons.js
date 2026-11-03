// ============================================================
// javascript/ui/icons.js
//
// назначение
// этот файл собирает svg-иконки и мелкие куски разметки.
//
// ответственность
// - иконки для кнопок действий на карточке
// - иконка кофемашины
// - определение заглушки от 1с
// - красивое пустое состояние
// - контрол количества с кнопками минус и плюс
//
// зависимости
// - core/utils.js дает escapeHtml
// ============================================================


// ============================================================
// блок 1. иконки действий
//
// каждая иконка это набор путей внутри общего svg.
// ключ это значение data-action на кнопке
// ============================================================

function actionIconMarkup(action) {
    const paths = {
        open: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
        assort: '<path d="m12 3 8.5 4.25L12 11.5 3.5 7.25 12 3Z"/><path d="M3.5 7.25v9.5L12 21l8.5-4.25v-9.5"/><path d="M12 11.5V21"/>',
        pay: '<rect x="3" y="6" width="18" height="15" rx="2"/><path d="M3 9V5a2 2 0 0 1 2-2h14"/><path d="M16 14h5"/><circle cx="16" cy="14" r=".7"/>',
        stock: '<rect x="4" y="4" width="16" height="17" rx="2"/><path d="M9 4.5V3h6v1.5M8 10h8M8 14h8M8 18h5"/>',
        shipment: '<path d="M3 6h11v12H3z"/><path d="M14 10h4l3 3v5h-7z"/><circle cx="7.5" cy="19" r="1.5"/><circle cx="17.5" cy="19" r="1.5"/>',
        recount: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 18 6l2 6M18.4 15A7 7 0 0 1 6 18l-2-6"/>',
        note: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>'
    }

    return `<svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[action] || ''}</svg>`
}

// иконка кофемашины, одна на все места
function machineIconMarkup() {
    return '<svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8h14v9a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V8Z"/><path d="M9 8V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v3"/><path d="M9 13h6"/><path d="M10 16h4"/></svg>'
}


// ============================================================
// блок 2. разбор ответов 1с
// ============================================================

// проверка что 1с вернула заглушку
// это массив из одного элемента с кодом 0
function isStubResponse(data) {
    return Array.isArray(data) && data.length === 1 && String(data[0].Code) === '0'
}


// ============================================================
// блок 3. пустое состояние
//
// используется когда данных нет или сервер вернул заглушку.
// иконка выбирается по имени
// ============================================================

// оформляет пустое состояние с отдельной иллюстрацией и пояснением
function emptyStateHtml(text, padding, icon = 'box') {
    const pad = padding || '36px 20px';
    const pictures = {
        search: '<circle cx="31" cy="30" r="12"/><path d="m40 39 12 12M27 30h8"/>',
        box: '<path d="m16 27 20-10 20 10v23L36 60 16 50V27Zm0 0 20 10 20-10M36 37v23M26 22l20 10"/>',
        history: '<rect x="21" y="14" width="34" height="46" rx="5"/><path d="M30 26h16M30 34h12M30 42h8"/><circle cx="51" cy="52" r="11"/><path d="M51 46v7l4 2"/>',
        alert: '<path d="m36 17 23 39H13l23-39Z"/><path d="M36 30v12m0 7v1"/>',
        offline: '<path d="M17 29a29 29 0 0 1 38 0M24 38a18 18 0 0 1 24 0M31 47a8 8 0 0 1 10 0M36 55h.01M15 14l43 44"/>'
    };
    const titles = {search:'Нічого не знайдено',box:'Поки що порожньо',history:'Історія починається тут',alert:'Не вдалося завантажити',offline:'Немає зв’язку'};
    const kind = pictures[icon] ? icon : 'box';
    return '<div class="empty-state empty-' + kind + '" style="padding:' + pad + '">' +
        '<svg class="empty-illustration" viewBox="0 0 72 72" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle class="empty-halo" cx="36" cy="36" r="34" stroke="none"/>' + pictures[kind] + '</svg>' +
        '<strong class="empty-title">' + titles[kind] + '</strong><span class="empty-text">' + escapeHtml(text) + '</span></div>';
}

// ============================================================
// блок 4. контрол количества
//
// три элемента, минус, поле ввода и плюс.
// обработчики вешаются делегированно в родительском модуле.
// ============================================================

function qtyControlHtml(opts) {
    const o = opts || {}
    const value = Number(o.value) || 0
    const aria = o.aria || 'Кількість'

    return `
        <div class="qty">
            <button type="button" class="qty-btn" data-step="-1" aria-label="Менше">−</button>
            <input type="text" class="qty-input" inputmode="numeric" value="${value}" aria-label="${escapeHtml(aria)}">
            <button type="button" class="qty-btn" data-step="1" aria-label="Більше">+</button>
        </div>
    `
}