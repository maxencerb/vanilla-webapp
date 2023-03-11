/**
 * @typedef {string | undefined} PartialString
 * 
 * @typedef {Object} Twitter
 * @property {PartialString} card
 * @property {PartialString} domain
 * @property {PartialString} url
 * @property {PartialString} title
 * @property {PartialString} description
 * @property {PartialString} image
 * 
 * @typedef {Object} OpenGraph
 * @property {PartialString} url
 * @property {PartialString} type
 * @property {PartialString} title
 * @property {PartialString} description
 * @property {PartialString} image
 * 
 * @typedef {Object} RouteMeta
 * @property {OpenGraph | undefined} og
 * @property {Twitter | undefined} twitter
 * @property {PartialString} title
 * @property {PartialString} description
 * 
 * @typedef {Object} RouterOptions
 * @property {Routes[]} routes
 * @property {HTMLElement} wrapper
 * 
 * @typedef {"routeChanged" | "initialized" | "unmounted" | "paramsChanged"} RouterEvents
 * @typedef {(newValue: Router) => void} RouterEventListenner
 * @typedef {{[key in RouterEvents]: Map<string, RouterEventListenner> | undefined}} RouterEventListenners
 * 
 * @typedef {"paramsChanged" | "scriptLoaded"} RouteEvents
 * @typedef {(newValue: Route) => void} RouteEventListenner
 * @typedef {{[key in RouteEvents]: Map<string, RouteEventListenner> | undefined}} RouteEventListenners
 * 
 */

class RouteInitError extends Error {
    constructor(message) {
        super(message);
        this.name = 'RouteInitError';
    }
}

class RouterInitError extends Error {
    constructor(message) {
        super(message);
        this.name = 'RouterInitError';
    }
}

class RouterRouteError extends Error {
    constructor(message) {
        super(message);
        this.name = 'RouterRouteError';
    }
}

const SCRIPT_REGEX = /<template [\s\S]*?[\s]*?script=["']([\s\S]*?)["']>[\s\S]*?<\/template>/;
const CONTENT_REGEX = /<template[\s\S]*?>([\s\S]*?)<\/template>/;

class Route {

    /**
     * @type {string[] | 404}
     */
    path;

    /**
     * @type {string}
     */
    view;

    /**
     * @type {RouteMeta}
     */
    meta;

    /**
     * @type {string | undefined}
     * @private
     */
    _content;

    /**
     * @type {Record<string, string>}
     */
    params;

    /**
     * @type {Promise<string> | undefined}
     * @private
     */
    _script;

    /**
     * @type {RouteEventListenners}
     * @private
     */
    _eventListenners = {};

    /**
     * 
     * @param {string | 404} path the router path
     * @param {string} view link to the html file
     * @param {RouteMeta | undefined} meta meta data for the route
     */
    constructor(path, view, meta = {}) {
        if (!path) {
            throw new RouteInitError('No path provided');
        }
        if (!view) {
            throw new RouteInitError('No view provided');
        }
        this.path = path === 404 ? 404 : path.split('/').filter(Boolean);
        this.view = view;
        this.meta = meta;
    }

    /**
     * 
     * @param {string} content 
     * @returns content without script
     */
    divideContentAndScript(content) {
        const script = content.match(SCRIPT_REGEX);
        if (script) {
            this._script = script[1];
        }
        const contentMatched = content.match(CONTENT_REGEX);
        return contentMatched ? contentMatched[1] : content;
    }

    async fetchRoute() {
        if (this._content) {
            return this._content;
        }
        const response = await fetch(`/app/pages/${this.view}/index.html`)
            .then(response => response.text())
            .catch(error => {
                throw new RouterRouteError(error);
            });
        if (!response) {
            return 'An error occurred';
        }
        this._content = this.divideContentAndScript(response);
        return this._content;
    }

    /**
     * @param {string[]} path
     * 
     * @returns {boolean}
     */
    match(path) {
        this.params = {};
        if (this.path === 404) return false;
        if (this.path.length !== path.length) return false;
        this.params = {};
        const result = this.path.every((part, index) => {
            if (part.startsWith(':')) {
                this.params[part.slice(1)] = path[index];
                return true;
            }
            return part === path[index];
        })
        this.emit("paramsChanged")
        return result;
    }

    async fetchScript() {
        const result = import(`/app/pages/${this.view}/${this._script}`);
        this.emit("scriptLoaded")
        return result;
    }

    runIfExist(method) {
        if (method) method();
    }

    mounted() {
        if (this._script) this.fetchScript().then(module => this.runIfExist(module.mounted));
    }

    async unmount() {
        if (this._script) await this.fetchScript().then(module => this.runIfExist(module.unmount));
    }

    // TODO: add prefetching
    async prefetch() {
        await this.fetchRoute();
        if (this._script) return this.fetchScript();
    }

    /**
     * 
     * @param {RouteEvents} event
     * @param {RouteEventListenner} callback
     */
    on(event, callback) {
        if (!this._eventListenners[event]) {
            this._eventListenners[event] = new Map();
        }
        this._eventListenners[event].set('' + callback, callback);
    }

    /**
     * 
     * @param {RouteEvents} event
     * @param {RouteEventListenner} callback
     */
    off(event, callback) {
        if (!this._eventListenners[event]) return;
        this._eventListenners[event].delete('' + callback);
    }

    /**
     * 
     * @param {RouteEvents} event
     */
    emit(event) {
        if (!this._eventListenners[event]) return;
        this._eventListenners[event]?.forEach(listener => listener(this));
    }
}

class NotFoundRoute extends Route {

    /**
     * 
     * @param {string} file link to the html file
     * @param {RouteMeta} meta meta data for the route
     */
    constructor(file = '/404.html', meta = { title: '404 - not found' }) {
        super(404, file, meta);
    }
}


/**
 * @example
 * // 404 route is required
 * // Wrapper is required
 * const router = new Router({
 *  routes: [
 *    new Route('/', '/pages/index.html'),
 *    new Route('/app', '/pages/app.html'),
 *    new NotFoundRoute('/pages/404.html')
 *  ],
 *   wrapper: document.querySelector('#app')
 * });
 */
class Router {

    /**
     * @type {Route[]}
     * @private
     */
    routes = [];

    /**
     * @type {HTMLElement}
     * @private
     */
    wrapper;

    /**
     * @type {NotFoundRoute}
     */
    notFoundRoute;

    /**
     * @type {Route | undefined}
     */
    currentRoute;

    /**
     * @type {boolean}
     */
    isInitialized = false;

    /**
     * @type {RouterEventListenners}
     * @private
     */
    eventListeners = {};

    /**
     * @type {Record<string, string>}
     */
    get params() {
        const urlParams = new URLSearchParams(window.location.search);
        const params = {};
        urlParams.forEach((value, key) => {
            params[key] = value;
        });
        if (this.currentRoute?.params) {
            Object.assign(params, this.currentRoute.params);
        }
        return params;
    }

    /**
     * @param {RouterOptions} options - Router options
     */
    constructor(options) {
        if (!options?.routes) {
            throw new RouterInitError('No router provided in options');
        }
        if (!options?.wrapper) {
            throw new RouterInitError('No wrapper provided in options');
        }
        this.routes = options.routes;
        this.wrapper = options.wrapper;
        this.notFoundRoute = this.find404Route(this.routes);
    }

    /**
     * @param {Route[]} routes
     */
    find404Route(routes) {
        const res = routes.find(route => route.path === 404);
        if (!res) {
            throw new RouterInitError('No 404 route provided');
        }
        return res;
    }

    onDocumentClick(event) {
        if (event.target.tagName === 'A') {
            this.route(event);
        }
    }

    onParamsChanged() {
        this.emit("paramsChanged");
    }

    /**
     * Initialize router
     */
    init() {
        this.handleLocation();
        window.addEventListener('popstate', this.handleLocation.bind(this));
        document.addEventListener('click', this.onDocumentClick.bind(this));
        for (const route of this.routes) {
            route.on('paramsChanged', this.onParamsChanged.bind(this));
        }
        this.isInitialized = true;
        this.emit("initialized");
    }

    /**
     * Unmount router
     */
    unmount() {
        window.removeEventListener('popstate', this.handleLocation.bind(this));
        document.removeEventListener('click', this.onDocumentClick.bind(this));
        for (const route of this.routes) {
            route.off('paramsChanged', this.onParamsChanged.bind(this));
        }
        this.isInitialized = false;
        this.emit("unmounted");
    }


    route(event) {
        event = event || window.event;
        event.preventDefault();
        window.history.pushState({}, '', event.target.href);
        this.handleLocation();
    }

    findRoute(path) {
        const pathArray = path.split('/').filter(Boolean);
        return this.routes.find(route => route.match(pathArray)) || this.notFoundRoute;
    }

    onDomChanged() {
        const prefetchLinks = document.querySelectorAll('a[prefetch]');
        prefetchLinks.forEach(link => {
            const url = new URL(link.href);
            const path = url.pathname;
            const route = this.findRoute(path);
            route.prefetch();
        });
    }

    /**
     * 
     * @param {RouterEvents} event
     */
    emit(event) {
        if (this.eventListeners[event]) {
            this.eventListeners[event]?.forEach(callback => callback(this));
        }
    }

    /**
     * 
     * @param {RouterEvents} event 
     * @param {RouterEventListenner} callback 
     * @returns 
     */
    on(event, callback) {
        if (!this.eventListeners[event]) {
            this.eventListeners[event] = new Map();
        }
        this.eventListeners[event].set('' + callback, callback);
    }

    /**
     * 
     * @param {RouterEvents} event
     * @param {RouterEventListenner} callback
     * @returns
     */
    off(event, callback) {
        if (!this.eventListeners[event]) return;
        this.eventListeners[event].delete('' + callback);
    }


    async handleLocation() {
        const path = window.location.pathname;
        const route = this.findRoute(path);
        if (route === this.currentRoute) return;
        await this.currentRoute?.unmount();
        const html = await route.fetchRoute();
        this.wrapper.innerHTML = html;
        this.onDomChanged();
        this.currentRoute = route;
        this.emit("routeChanged");
        route.mounted();
    }
}

export {
    Router,
    Route, 
    NotFoundRoute
}