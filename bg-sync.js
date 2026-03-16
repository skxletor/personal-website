// Seed the session start time as early as possible so topo-mesh.js
// fast-forwards to the correct frame on every page navigation.
(function () {
    if (!sessionStorage.getItem('bgStart')) {
        sessionStorage.setItem('bgStart', Date.now());
    }
})();
