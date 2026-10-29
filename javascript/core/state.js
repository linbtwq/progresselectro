// ============================================================
// javascript/core/state.js
//
// назначение
// общие переменные состояния приложения.
//
// ответственность
// - данные товаров и индексы для быстрого поиска
// - флаги загрузки, синхронизации, соединения
// - ревизии данных и блокировок (для инвалидации кешей)
// - таймеры интерфейса и автообновления
//
// зависимости
// - config.js должен быть подключён раньше
//   иначе бросаем ошибку
// ============================================================

if (typeof APP_CONFIG === 'undefined') {
    throw new Error('Не знайдено config.js — підключіть його в index.html перед core/state.js')
}

const apiBase = String(APP_CONFIG.apiBase).replace(/\/+$/, '')
const LOCK_MODE = APP_CONFIG.lockMode
const LOCK_HOURS = APP_CONFIG.lockHours
const AUTO_LOGOUT_AFTER_SUBMIT = APP_CONFIG.autoLogoutAfterSubmit

// данные товаров
let goodsData = [];
let goodsIndexBuilt = false;
const goodsByCode = new Map();
const goodsByBarcode = new Map();

// состояние загрузки и синхронизации
let lastLoadedAt = 0
let isLoading = false
let reloadQueued = false
let isSyncing = false
let retryTimer = null
let retryAttempt = 0
let lastSyncError = ''
let connectionOnline = null

// ревизии для инвалидации кешей
// _dataRevision меняется при обновлении справочника,
// _lockRevision при изменении блокировок точек
let _dataRevision = 0
let _lockRevision = 0

// таймеры и ключи интерфейса
let toastTimer = null
let statusTimer = null
let _lastStatusKey = ''
let autoRefreshTimer = null

// интервал автообновления (раз в минуту)
const AUTO_REFRESH_INTERVAL = 60 * 1000;

// ловим необработанные ошибки промисов чтобы не падало молча
window.addEventListener('unhandledrejection', (e) => {
    console.warn('[unhandled]', e.reason)
})