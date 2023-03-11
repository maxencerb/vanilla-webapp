/**
 * @fileoverview This file is the entry point for the application.
 * It is responsible for initializing the router and the application.
 * 
 * @author Maxence Raballand
 * @version 1.0
 */
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