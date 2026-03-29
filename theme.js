// Apply theme from localStorage immediately (also done inline in <head>, this is a fallback)
(function () {
    var saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
})();

// Position the header gradient right below the header
document.addEventListener('DOMContentLoaded', function () {
    var header = document.getElementById('header');
    var grad = document.querySelector('.safari-grad-top');
    if (!header || !grad) return;

    function sync() {
        grad.style.top = (header.offsetHeight - 1) + 'px';
    }
    sync();
    window.addEventListener('resize', sync);
});

document.addEventListener('DOMContentLoaded', function () {
    // Mark the active nav link for the current page
    var path = window.location.pathname;
    document.querySelectorAll('#nav a').forEach(function (a) {
        var href = a.getAttribute('href');
        if (!href) return;
        var norm = '/' + href.replace(/^\.\.\//, '');
        var exact = (path === norm) || (path === norm.replace(/\/$/, ''));
        var section = norm.endsWith('/') && path.startsWith(norm) && !path.includes('.html');
        if (exact || section) a.classList.add('active');
    });
});

document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;

    var moonSVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    var sunSVG  = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';

    function updateButton(theme) {
        btn.innerHTML = theme === 'dark' ? moonSVG : sunSVG;
        btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    }

    updateButton(document.documentElement.getAttribute('data-theme') || 'dark');

    btn.addEventListener('click', function () {
        var current = document.documentElement.getAttribute('data-theme') || 'dark';
        var next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
        updateButton(next);
        var m = document.querySelector('meta[name="theme-color"]');
        if (m) m.content = next === 'dark' ? '#111111' : '#F5F5F0';

    });
});
