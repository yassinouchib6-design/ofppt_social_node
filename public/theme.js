(function () {
    const themeToggle = document.querySelector('[data-theme-toggle]');
    const savedTheme = localStorage.getItem('ofppt-theme');

    function applyTheme(theme) {
        const isDark = theme === 'dark';

        document.body.classList.toggle('dark-mode', isDark);

        if (themeToggle) {
            themeToggle.textContent = isDark ? '\u2600\uFE0F' : '\uD83C\uDF19';
            themeToggle.setAttribute('aria-label', isDark ? 'Activer le mode clair' : 'Activer le mode sombre');
        }
    }

    applyTheme(savedTheme === 'dark' ? 'dark' : 'light');

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const nextTheme = document.body.classList.contains('dark-mode') ? 'light' : 'dark';

            localStorage.setItem('ofppt-theme', nextTheme);
            applyTheme(nextTheme);
        });
    }
})();
