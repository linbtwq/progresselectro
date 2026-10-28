if (typeof APP_CONFIG === 'undefined') {
    throw new Error('Не знайдено config.js — підключіть його в index.html перед core/state.js')
}

const apiBase = String(APP_CONFIG.apiBase).replace(/\/+$/, '')
const LOCK_MODE = APP_CONFIG.lockMode
const LOCK_HOURS = APP_CONFIG.lockHours
const AUTO_LOGOUT_AFTER_SUBMIT = APP_CONFIG.autoLogoutAfterSubmit

// Данные товаров
let goodsData = [];
let goodsIndexBuilt = false;
const goodsByCode = new Map();
const goodsByBarcode = new Map();

// Состояние загрузки и синхронизации
let lastLoadedAt = 0
let isLoading = false
let reloadQueued = false
let isSyncing = false
let retryTimer = null
let retryAttempt = 0
let lastSyncError = ''
let connectionOnline = null

// Ревизии и кеши
let _dataRevision = 0
let _lockRevision = 0

// Таймеры и ключи интерфейса
let toastTimer = null
let statusTimer = null
let _lastStatusKey = ''
let autoRefreshTimer = null

// интервал автообновления (раз в минуту)
const AUTO_REFRESH_INTERVAL = 60 * 1000;

window.addEventListener('unhandledrejection', (e) => {
    console.warn('[unhandled]', e.reason)
})