/// <reference types="node" resolution-mode="require"/>
import { LoaderContext } from 'webpack';
export default function MetadataLoader(this: LoaderContext<void>, content: Buffer, inputSourceMap: any): Promise<void>;
