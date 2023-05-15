/// <reference types="node" resolution-mode="require"/>
import { LoaderContext } from 'webpack';
export default function StyleLoader(this: LoaderContext<void>, content: Buffer, inputSourceMap: any): Promise<void>;
export declare const parseVariables: (css: string, resourcePath: string) => Record<string, string>;
