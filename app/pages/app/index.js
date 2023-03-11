import { appRouter } from "../../index.js";

const link = document.querySelector('#link');

function paramChanged() {
    link.innerHTML = appRouter.params.id;
}

export function mounted() {
    paramChanged();
    appRouter.on('paramsChanged', paramChanged);
}

export function unmount() {
    appRouter.off('paramsChanged', paramChanged);
}