const _RAW_API_BASE_DEFAULT = 'https://api.coffeemeters.pp.ua/siteapinew/hs/siteapi';

function resolveApiBase() {
    try {
        const override = localStorage.getItem('apiBaseOverride');
        if (override && /^https?:\/\/.+/i.test(override)) {
            return override.replace(/\/+$/, '');
        }
    } catch (e) {}
    return _RAW_API_BASE_DEFAULT;
}

const _RAW_API_BASE = resolveApiBase();

const APP_CONFIG = {
    apiBase: _RAW_API_BASE,
    apiVersion: '1.0',
    loadTimeoutMs: 15000, // Увеличил таймаут, так как 10к товаров могут долго идти
    sendTimeoutMs: 20000,
    syncRetrySeconds: 30,
    lockMode: 'endOfDay',
    lockHours: 12,
    autoLogoutAfterSubmit: false,
    pageSize: 60, // Показываем по 60 карточек
    refreshAfterMinutes: 5
};
if (!APP_CONFIG.apiVersion) APP_CONFIG.apiVersion = '1.0';