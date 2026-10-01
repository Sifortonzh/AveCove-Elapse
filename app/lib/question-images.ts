import type { QuizImage } from "./question-parser";

export function questionImageSource(image: QuizImage): string {
  for (const value of [image.dataUrl, image.url, image.src]) {
    if (typeof value !== "string") continue;
    const source = value.trim();
    if (/^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[A-Za-z0-9+/=\s]+$/i.test(source)
      || /^https?:\/\/[^\s]+$/i.test(source)
      || /^\/(?!\/)[^\s]+$/.test(source)) return source;
  }
  return "";
}

export function normalizeQuestionImages(...groups: unknown[]): QuizImage[] {
  const images: QuizImage[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    for (const raw of group) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const image = raw as QuizImage;
      const source = questionImageSource(image);
      if (!source || seen.has(source)) continue;
      seen.add(source);
      images.push({
        ...image,
        alt: typeof image.alt === "string" ? image.alt : undefined,
        name: typeof image.name === "string" ? image.name : undefined,
        caption: typeof image.caption === "string" ? image.caption : undefined,
      });
    }
  }
  return images;
}
