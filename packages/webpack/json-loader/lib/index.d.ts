/// <reference types="node" resolution-mode="require"/>
import { LoaderContext } from 'webpack';
export interface JSONLoaderOptions {
    transform: (doc: any) => any;
}
export default function JSONLoader(this: LoaderContext<JSONLoaderOptions>, content: Buffer, inputSourceMap: any): Promise<void>;
