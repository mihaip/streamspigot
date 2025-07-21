import type {
    SvelteComponent,
    Component,
    ComponentProps,
    ComponentType,
} from "svelte";
import {render} from "svelte/server";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function renderToHtml<
    Comp extends SvelteComponent<any> | Component<any>,
    Props extends ComponentProps<Comp> = ComponentProps<Comp>,
>(
    component: Comp extends SvelteComponent<any> ? ComponentType<Comp> : Comp,
    props: Props
): string {
    const {body} = render(component, {props});
    return body;
}
