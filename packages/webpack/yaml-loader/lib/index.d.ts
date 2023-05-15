/// <reference types="node" resolution-mode="require"/>
import { LoaderContext } from 'webpack';
export interface YamlLoaderOptions {
    transform: (doc: any) => any;
}
export default function YamlLoader(this: LoaderContext<YamlLoaderOptions>, content: Buffer, inputSourceMap: any): Promise<void>;
