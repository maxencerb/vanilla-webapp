import { Router } from "./router";

class RouterState {
    
    /**
     * @type {Router}
     */
    router;

    test() {
        this.subscribe((newValue) => {
            console.log(newValue);
        })
    }
}