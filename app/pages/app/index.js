import { appRouter } from "../../index.js";

function paramChanged() {
    const link = document.querySelector('#link');
    link.innerHTML = appRouter.params.id;
}

export function mounted() {
    paramChanged();
    const listener = appRouter.on('paramsChanged', paramChanged);
    return () => {
        appRouter.off('paramsChanged', listener);
    }
}