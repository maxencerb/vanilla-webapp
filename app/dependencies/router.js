/**
 * 
 * @typedef {Object} Twitter
 * @property {string} [card]
 * @property {string} [domain]
 * @property {string} [url]
 * @property {string} [title]
 * @property {string} [description]
 * @property {string} [image]
 * 
 * @typedef {Object} OpenGraph
 * @property {string} [url]
 * @property {string} [type]
 * @property {string} [title]
 * @property {string} [description]
 * @property {string} [image]
 * 
 * @typedef {Object} RouteMeta
 * @property {OpenGraph} [og]
 * @property {Twitter} [twitter]
 * @property {string} [title]
 * @property {string} [description]
 * 
 * @typedef {Object} RouterOptions
 * @property {Routes[]} routes
 * @property {HTMLElement} wrapper
 * @property {string} [base]
 * @property {RouteMeta | "fromTemplate"} [defaultMeta]
 * 
 * 
 * @typedef {"routeChanged" | "initialized" | "unmounted" | "paramsChanged"} RouterEvents
 * @typedef {(newValue: Router) => void} RouterEventListenner
 * @typedef {{[key in RouterEvents]: Map<number, RouterEventListenner> | undefined}} RouterEventListenners
 * 
 * @typedef {"paramsChanged" | "scriptLoaded"} RouteEvents
 * @typedef {(newValue: Route) => void} RouteEventListenner
 * @typedef {{[key in RouteEvents]: Map<number, RouteEventListenner> | undefined}} RouteEventListenners
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

const META = {
    description: 'name',
    og: {
        description: 'property',
        image: 'property',
        title: 'property',
        type: 'property',
        url: 'property'
    },
    twitter: {
        card: 'name',
        description: 'name',
        image: 'name',
        title: 'name',
        url: 'property',
        domain: 'property'
    },
}

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
     * @type {Router | undefined}
     */
    router;

    /**
     * @type {number}
     * @private
     */
    _currentListenerId = 0;

    /**
     * @type {number}
     * @private
     */
    _paramsListenerId;

    /**
     * 
     * @param {string | 404} path the router path
     * @param {string} view link to the html file
     * @param {RouteMeta} [meta] meta data for the route
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
     * @param {boolean} [changeParams]
     * 
     * @returns {boolean}
     */
    match(path, changeParams = false) {
        if (this.path === 404) return false;
        if (this.path.length !== path.length) return false;
        const params = {};
        const result = this.path.every((part, index) => {
            if (part.startsWith(':')) {
                params[part.slice(1)] = path[index];
                return true;
            }
            return part === path[index];
        })
        if (changeParams) {
            this.params = params;
            this.emit("paramsChanged")
        }
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

    onParamsChanged() {
        this.router.refreshMeta();
    }

    mounted() {
        this._paramsListenerId = this.on('paramsChanged', this.onParamsChanged.bind(this));
        if (this._script) this.fetchScript().then(module => this.runIfExist(module.mounted));
    }

    async unmount() {
        this.off('paramsChanged', this._paramsListenerId);
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
     * 
     * @returns {number} id of the listener
     */
    on(event, callback) {
        if (!this._eventListenners[event]) {
            this._eventListenners[event] = new Map();
        }
        const id = this._currentListenerId++;
        this._eventListenners[event].set(id, callback);
        return id;
    }

    // TODO: fix params changed event not firing

    /**
     * 
     * @param {RouteEvents} event
     * @param {number} id callback id
     * 
     * @returns {boolean} true if the callback was removed
     */
    off(event, id) {
        if (!this._eventListenners[event]) return;
        return this._eventListenners[event].delete(id);
    }

    /**
     * 
     * @param {RouteEvents} event
     */
    emit(event) {
        if (!this._eventListenners[event]) return;
        this._eventListenners[event]?.forEach(listener => {
            try {
                listener(this);
            } catch (error) {
                console.error(error);
            }
        });
    }

    /**
     * 
     * @param {Router | undefined} router 
     */
    setRouter(router) {
        this.router = router;
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
 *    new Route('/', 'home'),
 *    new Route('/:id', 'app'),
 *    new NotFoundRoute()
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
     * @type {RouteMeta}
     */
    defaultMeta;

    /**
     * @type {Map<string, number>}
     */
    _eventListenerIds = new Map();

    /**
     * @type {number}
     */
    _currentListenerId = 0;

    /**
     * @type {RouteMeta}
     */
    get meta() {
        return {
            ...this.defaultMeta,
            ...this.currentRoute?.meta,
            og: {
                ...this.defaultMeta?.og,
                ...this.currentRoute?.meta?.og
            },
            twitter: {
                ...this.defaultMeta?.twitter,
                ...this.currentRoute?.meta?.twitter
            }
        }
    }

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
        if (options.defaultMeta === "fromTemplate") {
            this.defaultMeta = this.getMetaAttributesFromTemplate();
        } else {
            this.defaultMeta = options.defaultMeta || {};
        }
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

    /**
     * @private
     * @param {MouseEvent} event 
     */
    onDocumentClick(event) {
        if (event.target?.tagName === 'A') {
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
        window.addEventListener('popstate', this.handleLocation.bind(this));
        document.addEventListener('click', this.onDocumentClick.bind(this));
        for (const route of this.routes) {
            const id = route.on('paramsChanged', this.onParamsChanged.bind(this));
            route.setRouter(this);
            this._eventListenerIds.set(route.path, id);
        }
        this.isInitialized = true;
        this.emit("initialized");
        this.handleLocation();
    }

    /**
     * Unmount router
     */
    unmount() {
        window.removeEventListener('popstate', this.handleLocation.bind(this));
        document.removeEventListener('click', this.onDocumentClick.bind(this));
        for (const route of this.routes) {
            route.off('paramsChanged', this._eventListenerIds.get(route.path));
            route.setRouter(undefined);
            this._eventListenerIds.delete(route.path);
        }
        this.isInitialized = false;
        this.emit("unmounted");
    }


    /**
     * @private
     * @param {Event} [event]
     */
    route(event) {
        event = event || window.event;
        event?.preventDefault();
        window.history.pushState({}, '', event.target.href);
        this.handleLocation();
    }

    /**
     * Use this method to handle location changes in your scripts
     * 
     * @param {string} path - path to navigate to
     */
    navigate(path) {
        window.history.pushState({}, '', path);
        this.handleLocation();
    }

    /**
     * 
     * @param {string} path 
     * @param {boolean} routeChange 
     * @returns {Route}
     */
    findRoute(path, routeChange = false) {
        const pathArray = path.split('/').filter(Boolean);
        return this.routes.find(route => route.match(pathArray, routeChange)) || this.notFoundRoute;
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
            this.eventListeners[event]?.forEach(callback => {
                try {
                    callback(this);
                } catch (error) {
                    console.error(error);
                }
            });
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
        const id = this._currentListenerId++;
        this.eventListeners[event].set(id, callback);
        return id;
    }

    /**
     * 
     * @param {RouterEvents} event
     * @param {number} id callback id
     * @returns
     */
    off(event, id) {
        if (!this.eventListeners[event]) return;
        return this.eventListeners[event].delete(id);
    }


    async handleLocation() {
        const path = window.location.pathname;
        const route = this.findRoute(path, true);
        if (route === this.currentRoute) return;
        await this.currentRoute?.unmount();
        const html = await route.fetchRoute();
        this.wrapper.innerHTML = html;
        this.onDomChanged();
        this.currentRoute = route;
        this.emit("routeChanged");
        route.mounted();
    }

    /**
     * 
     * @param {HTMLHeadElement} head 
     * @param {string} title 
     */
    refreshTitle(head, title) {
        const titleTag = document.querySelector('title');
        if (!titleTag) {
            const newTitleTag = document.createElement('title');
            newTitleTag.innerHTML = title;
            head.appendChild(newTitleTag);
            return;
        }
        if (titleTag.innerHTML === title) return;
        titleTag.innerHTML = title;
    }

    /**
     * 
     * @param {HTMLHeadElement} head 
     * @param {string} name 
     * @param {string} [content] 
     * @param {boolean} [isProperty]
     */
    refreshMetaAttribute(head, name, content, isProperty = false) {
        const key = isProperty ? 'property' : 'name';
        let metaTag = document.querySelector(`meta[${key}=${name}]`);
        if (!metaTag) {
            metaTag = document.createElement('meta');
            metaTag.setAttribute(key, name);
            head.appendChild(metaTag);
        } else if (!content) {
            metaTag.remove();
            return;
        }
        const currentContent = metaTag.getAttribute('content');
        if (currentContent === content) return;
        metaTag.setAttribute('content', content);
        metaTag.setAttribute('data-router', 'true');
    }

    refreshMeta() {
        const meta = this.meta;

        const head = document.querySelector('head');

        this.refreshTitle(head, meta.title);

        // description
        this.refreshMetaAttribute(head, 'description', meta.description);

        // og
        for (const key in meta.og) {
            this.refreshMetaAttribute(head, key, meta.og[key], META.og[key] === 'property');
        }

        // twitter
        for (const key in meta.twitter) {
            this.refreshMetaAttribute(head, key, meta.twitter[key], META.twitter[key] === 'property');
        }
    }

    getMetaAttributesFromTemplate() {
        /**
         * @type {RouteMeta}
         */
        const meta = {};
        meta.title = document.title;
        meta.og = {};
        meta.twitter = {};
        const metaTags = document.querySelectorAll('meta');
        metaTags.forEach(tag => {
            const name = tag.getAttribute('name');
            const property = tag.getAttribute('property');
            const content = tag.getAttribute('content');
            if (name === 'description') {
                meta.description = content;
            } else if (name?.startsWith('twitter:')) {
                meta.twitter[name.replace('twitter:', '')] = content;
            } else if (property?.startsWith('og:')) {
                meta.og[property.replace('og:', '')] = content;
            } else if (property?.startsWith('twitter:')) {
                meta.twitter[property.replace('twitter:', '')] = content;
            }
        });
        return meta;
    }
}

export {
    Router,
    Route, 
    NotFoundRoute
}