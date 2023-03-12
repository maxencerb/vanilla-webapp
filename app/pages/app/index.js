import { appRouter } from "../../index.js";

/**
 * @type {number}
 */
let listener;

function paramChanged() {
    const link = document.querySelector('#link');
    link.innerHTML = appRouter.params.id;
}

export function mounted() {
    paramChanged();
    listener = appRouter.on('paramsChanged', paramChanged);
}

export function unmount() {
    appRouter.off('paramsChanged', listener);
}