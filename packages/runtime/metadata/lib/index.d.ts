import { Metadata, MetadataContext } from './Metadata.js';
export declare const wrapMetadata: (metadata: (() => any) | any) => (context: MetadataContext, parent?: Metadata) => Metadata;
