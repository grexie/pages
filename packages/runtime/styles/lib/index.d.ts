export type Class = string | Record<string, any> | null | undefined;
export type StyleUnuseFunction = () => void;
export type StyleUseFunction = () => boolean;
export type StyleFunction = ((...classList: Class[]) => string) & {
    hash: string;
    css: string;
    use: StyleUseFunction;
    resolve: (cls: string) => string;
    var: (name: string) => string;
    styleSheet: StyleSheet;
};
export declare class StyleSheet {
    readonly hash: string;
    readonly css: string;
    readonly locals: Record<string, string>;
    readonly variables: Record<string, string>;
    constructor(hash: string, css: string, locals: Record<string, string>, variables: Record<string, string>);
    use(): boolean;
    resolve(cls: string): string;
    classes(...classList: Class[]): string;
    var(name: string): string;
}
export declare const wrapStyles: (hash: string, css: string, locals?: Record<string, string>, variables?: Record<string, string>) => StyleFunction;
