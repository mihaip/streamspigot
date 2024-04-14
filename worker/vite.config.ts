import {sveltekit} from "@sveltejs/kit/vite";
import {defineConfig} from "vite";

export default defineConfig({
    server: {
        host: true,
        port: 3413,
    },
    preview: {
        host: true,
        port: 4413,
    },
    plugins: [sveltekit()],
});
