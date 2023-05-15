import { Plugin } from 'unified';
export interface RemarkPagesOptions {
    /**
     * If specified, the YAML data is exported using this name. Otherwise, each
     * object key will be used as an export name.
     */
    name?: string;
}
/**
 * A remark plugin to expose frontmatter data as getStaticProps.
 *
 * @param options - Optional options to configure the output.
 * @returns A unified transformer.
 */
export declare const remarkPages: Plugin<[RemarkPagesOptions?]>;
