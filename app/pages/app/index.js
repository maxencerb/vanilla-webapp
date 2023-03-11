import { appRouter } from "../../index.js";

function paramChanged() {
    const link = document.querySelector('#link');
    link.innerHTML = appRouter.params.id;
}

export function mounted() {
    paramChanged();
    appRouter.on('paramsChanged', paramChanged);
}

export function unmount() {
    appRouter.off('paramsChanged', paramChanged);
}