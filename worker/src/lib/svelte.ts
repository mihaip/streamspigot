/* eslint-disable @typescript-eslint/no-explicit-any */

// TODO: find a way to type this
export function renderToHtml(
    componentClass: any,
    props: {[key: string]: any}
): {html: string; css: string} {
    const {html, css} = componentClass.render(props) as SvelteRenderOutput;
    return {html, css: css.code};
}

type SvelteRenderOutput = {
    html: string;
    css: {code: string; map: string | null};
    head: string;
};
