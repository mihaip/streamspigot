import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import {defineConfig} from "eslint/config";
import svelte from "eslint-plugin-svelte";
import globals from "globals";
import ts from "typescript-eslint";
import svelteConfig from "./svelte.config.js";

export default defineConfig([
    js.configs.recommended,
    ...ts.configs.recommended,
    ...svelte.configs["flat/recommended"],
    prettier,
    ...svelte.configs["flat/prettier"],
    {
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
            },
        },
        rules: {
            "no-constant-condition": "off",
        },
    },
    {
        files: ["**/*.svelte", "**/*.svelte.js", "**/*.svelte.ts"],
        languageOptions: {
            parserOptions: {
                projectService: true,
                extraFileExtensions: [".svelte"],
                parser: ts.parser,
                svelteConfig,
            },
        },
        rules: {
            "svelte/no-at-html-tags": "off",
        },
    },
    {
        ignores: [
            "build/",
            ".svelte-kit/",
            "package/",
            ".cloudflare/",
            ".wrangler/",
        ],
    },
]);
