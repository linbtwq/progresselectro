// ============================================================
// javascript/ui/theme.js
//
// назначение
// этот файл отвечает за темную тему.
//
// ответственность
// - восстановить выбор темы из localstorage
// - переключить тему по кнопке
// - обновить иконку и подпись кнопки
// - снять boot-класс, который предотвращает fouc
// - обновить meta[name=theme-color] под текущую тему
//
// зависимости
// нет. работает только с dom и localstorage
// ============================================================


// ============================================================
// блок 1. инициализация темы
//
// вызывается один раз при запуске приложения.
// если тема темная, сразу ставим класс на body.
// убираем boot-класс с html, который до этого
// предотвращал мигание светлой темы.
// ============================================================

function initTheme() {
    let isDarkMode = localStorage.getItem('darkMode') === 'true'
    if (isDarkMode) document.body.classList.add('dark-theme')

    // убираем класс, который предотвращал fouc при загрузке
    document.documentElement.classList.remove('dark-theme-boot')

    updateThemeColor(isDarkMode)

    const themeBtn = document.getElementById('themeToggle')
    const themeIcon = document.getElementById('themeIcon')
    if (!themeBtn || !themeIcon) return

    // обновляет значок и подпись в соответствии с выбранной темой
    const setThemeIcon = (isDark) => {
        const path = isDark
            ? '<path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/>'
            : '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>'

        themeBtn.setAttribute('aria-label', isDark ? 'увімкнути світлу тему' : 'увімкнути темну тему')
        
        // меняем только внутренность иконки, чтобы не затереть текст рядом
        themeIcon.innerHTML = `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`
    }

    setThemeIcon(isDarkMode)

    themeBtn.addEventListener('click', () => {
        document.body.classList.toggle('dark-theme')
        const isDark = document.body.classList.contains('dark-theme')
        localStorage.setItem('darkMode', isDark)
        setThemeIcon(isDark)
        updateThemeColor(isDark)
    })
}


// ============================================================
// блок 2. обновление theme-color meta
//
// на android влияет на цвет системного статус-бара.
// значение должно совпадать с фоном текущей темы,
// иначе панель будет выбиваться из интерфейса.
// ============================================================

function updateThemeColor(isDark) {
    try {
        let meta = document.querySelector('meta[name="theme-color"]')
        if (!meta) {
            meta = document.createElement('meta')
            meta.name = 'theme-color'
            document.head.appendChild(meta)
        }
        // темная тема: #121212, светлая тема: #e3181d
        meta.content = isDark ? '#121212' : '#E3181D'
    } catch (e) {}
}

// ============================================================
// блок 3. управление размером шрифта (a / a+ / a++)
// ============================================================

function initFontScale() {
    const btn = document.getElementById('fontScaleBtn');
    const valSpan = document.getElementById('fontScaleValue');
    if (!btn || !valSpan) return;

    // доступные размеры базового шрифта (в пикселях)
    // по умолчанию браузер использует 16px. 
    // 19px - крупный, 22px - очень крупный.
    const sizes = ['16px', '19px', '22px'];
    const labels = ['a', 'a+', 'a++'];

    // восстанавливаем сохраненный размер
    let current = localStorage.getItem('fontScale') || '16px';
    let idx = sizes.indexOf(current);
    if (idx === -1) idx = 0; // если в кеше мусор, ставим стандартный

    // функция применения
    const apply = (size, index) => {
        document.documentElement.style.fontSize = size;
        // меняем только текст внутри span, а не всю кнопку
        valSpan.textContent = labels[index];
    };

    // применяем при загрузке
    apply(sizes[idx], idx);

    // по клику переключаем по кругу: 16 -> 19 -> 22 -> 16
    btn.addEventListener('click', () => {
        idx = (idx + 1) % sizes.length;
        const newSize = sizes[idx];
        
        localStorage.setItem('fontScale', newSize);
        apply(newSize, idx);
    });
}

// вызываем инициализацию при загрузке страницы
document.addEventListener('DOMContentLoaded', initFontScale);