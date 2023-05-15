export interface MetadataContext {
    filename: string;
}
export interface Metadata {
    [k: string | symbol | number]: any;
}
export declare class Metadata {
    constructor(object: any, parent?: Metadata, root?: Metadata, path?: (string | symbol | number)[]);
    static getContext(metadata: Metadata): any;
    static setContext(metadata: Metadata, context: MetadataContext): void;
}
