declare module "word-extractor" {
  type ExtractedDocument = {
    getBody(options?: { filterUnicode?: boolean }): string;
    getFootnotes(options?: { filterUnicode?: boolean }): string;
    getEndnotes(options?: { filterUnicode?: boolean }): string;
    getTextboxes(options?: { filterUnicode?: boolean; includeHeadersAndFooters?: boolean; includeBody?: boolean }): string;
  };

  export default class WordExtractor {
    extract(source: Buffer | string): Promise<ExtractedDocument>;
  }
}
