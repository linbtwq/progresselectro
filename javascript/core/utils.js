// ============================================================
// javascript/core/utils.js
//
// назначение
// этот файл содержит чистые вспомогательные функции.
//
// ответственность
// форматирование чисел, экранирование разметки,
// нормализация кодов и безопасное чтение json.
//
// важное про чистоту
// ни одна функция здесь не зависит от состояния приложения.
// они не знают про точки, заказы, пользователя и сеть.
// благодаря этому их можно вызывать откуда угодно
// и в любом порядке загрузки.
//
// зависимости
// нет. этот файл подключается раньше всех остальных в core.
// ============================================================


// ============================================================
// блок 1. форматирование чисел
// ============================================================

// формат чисел для украинской локали
// создаем один раз и переиспользуем
const _nf = new Intl.NumberFormat('uk-UA')

// кеш уже отформатированных строк
// чтобы не гонять NumberFormat на каждом рендере
const _fmtCache = new Map()

// форматирует число в строку с разделителями тысяч
// например 12345 превращает в 12 345
// если число не конечное возвращает строку 0
const fmt = (num) => {
    const n = Number(num)
    if (!Number.isFinite(n)) return '0'

    const key = String(n)
    let v = _fmtCache.get(key)
    if (v === undefined) {
        v = _nf.format(n)
        // если кеш разросся чистим целиком
        // это быстрее чем удалять по одному элементу
        if (_fmtCache.size > 5000) _fmtCache.clear()
        _fmtCache.set(key, v)
    }
    return v
}


// ============================================================
// блок 2. защита разметки
// ============================================================

// символы которые нужно экранировать перед вставкой в разметку
const _escRe = /[&<>"']/g

// карта замен
const _escMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

// защищает разметку от специальных символов в данных сервиса
// обязательно применять ко всем данным которые приходят от 1с
// и попадают в html через шаблонные строки
const escapeHtml = (v) => String(v ?? '').replace(_escRe, c => _escMap[c])


// ============================================================
// блок 3. нормализация кодов
// ============================================================

// убирает ведущие нули из строки кода
// нужно чтобы код 007 совпадал с кодом 7
const stripZeros = (v) => String(v ?? '').trim().replace(/^0+/, '')

// убирает все пробелы и ведущие нули
// используется для нормализации кода машины
const normalizeCode = (v) => String(v ?? '').replace(/\s+/g, '').replace(/^0+/, '')


// ============================================================
// блок 4. разбор ответов сервиса
// ============================================================

// распознает пустую ошибку сервиса
// иногда 1с возвращает пробелы или слеши вместо пустой строки
// такие ответы нужно считать успешными
function isBlankServerError(value) {
    if (value == null) return true
    return String(value).replace(/[\s\/]+/g, '').length === 0
}


// ============================================================
// блок 5. безопасное чтение из localStorage
// ============================================================

// читает сохраненные данные и возвращает запасное значение при ошибке
// используется очередью и любыми местами где json может быть битым
function readJsonSafe(key, fallback) {
    try {
        const raw = localStorage.getItem(key)
        if (!raw) return fallback
        const v = JSON.parse(raw)
        return v == null ? fallback : v
    } catch (e) {
        return fallback
    }
}
// форматирует денежные значения с двумя знаками, не меняя отображение количества
const _moneyFormat = new Intl.NumberFormat('uk-UA', {minimumFractionDigits:2, maximumFractionDigits:2});
function money(value) { const number=Number(value); return _moneyFormat.format(Number.isFinite(number)?number:0); }

// выделяет точное совпадение и экранирует все части названия товара
function highlightText(value, query = '') {
    const text = String(value ?? '');
    const needle = String(query).trim().slice(0,100).toLocaleLowerCase('uk-UA');
    if (!needle) return escapeHtml(text);
    const lower = text.toLocaleLowerCase('uk-UA');
    let result = '', start = 0, found;
    while ((found = lower.indexOf(needle, start)) !== -1) {
        result += escapeHtml(text.slice(start, found)) + '<mark>' + escapeHtml(text.slice(found, found + needle.length)) + '</mark>';
        start = found + needle.length;
    }
    return result + escapeHtml(text.slice(start));
}

// читает местное время сервиса без зависимости от часового пояса устройства
function invoiceDateParts(value) {
    if (typeof value === 'string') {
        const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
        if (match) {
            const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
            const date = new Date(Date.UTC(year,month-1,day));
            if (date.getUTCFullYear()!==year || date.getUTCMonth()!==month-1 || date.getUTCDate()!==day || hour>23 || minute>59 || (second || 0)>59) return null;
            return {year,month,day,hour,minute};
        }
    }
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat('uk-UA',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
    return Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
}

// показывает сегодня, вчера или полную дату по киевскому календарю
function formatInvoiceDate(value, fallback, now = Date.now()) {
    const date = (value ? invoiceDateParts(value) : null) || (fallback != null ? invoiceDateParts(fallback) : null);
    const today = invoiceDateParts(now);
    if (!date || !today) return 'Дата не вказана';
    const calendar = d => Date.UTC(d.year,d.month-1,d.day);
    const age = (calendar(today)-calendar(date))/86400000;
    const pad = number => String(number).padStart(2,'0');
    const label = age===0 ? 'Сьогодні' : age===1 ? 'Вчора' : pad(date.day)+'.'+pad(date.month)+'.'+date.year;
    return label + ', ' + pad(date.hour)+':'+pad(date.minute);
}
