// Keep grid background animation in sync across page navigations
(function () {
    const DURATION = 20000; // must match CSS animation duration (8s)
    const DISTANCE = 200;  // must match CSS animation distance (200px)

    if (!sessionStorage.getItem('bgStart')) {
        sessionStorage.setItem('bgStart', Date.now());
    }

    const elapsed = Date.now() - Number(sessionStorage.getItem('bgStart'));
    const offset = ((elapsed % DURATION) / DURATION) * DISTANCE;

    document.documentElement.style.setProperty('--grid-offset', offset + 'px');
})();
