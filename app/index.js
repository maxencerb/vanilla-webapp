import { Router, Route, NotFoundRoute } from "./dependencies/router.js";

export const appRouter = new Router({
    routes: [
        new Route('/', 'home'),
        new Route('/:id', 'app'),
        new NotFoundRoute()
    ],
    wrapper: document.querySelector('#app')
});

export function init() {
    appRouter.init();
}