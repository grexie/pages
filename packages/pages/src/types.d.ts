declare module 'es-main';
declare module 'mime/Mime.js' {
  export default class Mime {
    constructor(...mimetypes: TypeMap[]);

    getType(path: string): string | null;
    getExtension(mimetype: string): string | null;
    define(mimetypes: TypeMap, force?: boolean): void;
  }
}
declare module 'mime/types/standard.js' {
  export interface TypeMap {
    [key: string]: string[];
  }

  const mimetypes: TypeMap;
  export default mimetypes;
}
