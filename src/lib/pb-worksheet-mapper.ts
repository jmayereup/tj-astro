import type { RecordModel } from "pocketbase";
import { resolveLocalizedImage } from "../utils/assetResolver";
import { slugify } from "../utils/slugify";
import wordBlasterPlaceholder from "../assets/images/word-blaster-placeholder.png";

/**
 * Maps a raw PocketBase worksheet record into the normalized post shape
 * expected by WorksheetCard and all listing pages.
 */
export async function mapPbRecord(record: RecordModel): Promise<Record<string, any>> {
  let content = record.content;
  if (typeof content === "string") {
    try {
      content = JSON.parse(content);
    } catch (_) {}
  }

  const title = record.title || content?.title || "Untitled";
  let description = record.seo || content?.readingText || "";
  if (!record.seo && description.startsWith(title))
    description = description.substring(title.length).trim();
  description =
    description.substring(0, 120) + (description.length > 120 ? "..." : "");

  let featureImage: any = undefined;

  if (record.image) {
    featureImage = await resolveLocalizedImage('pb', record.id, record.image);
    if (!featureImage) {
      featureImage = `https://files.teacherjake.com/${record.collectionId}/${record.id}/${record.image}`;
    }
  }

  if (!featureImage && record.lessonType === "word-blaster") {
    featureImage = wordBlasterPlaceholder;
  }

  if (!featureImage && record.videoUrl) {
    const regExp =
      /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = record.videoUrl?.match(regExp);
    const ytId = match && match[2].length === 11 ? match[2] : null;
    if (ytId)
      featureImage = `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`;
  }

  const language = (record.language || "english").toLowerCase();
  const level = record.level || "All";

  return {
    type: "pb",
    source: "pocketbase",
    id: record.id,
    slug: `${record.id}-${slugify(title)}`,
    title,
    custom_excerpt: description,
    feature_image: featureImage,
    language,
    level,
    lessonType: record.lessonType,
    published_at: record.created,
    // Tags: level + all content tags + language (WorksheetCard filters these)
    tags: [
      { name: level },
      ...(record.tags || []).map((t: string) => ({ name: t })),
      { name: language },
      ...(record.lessonType === "word-blaster" ? [{ name: "game" }] : []),
    ],
  };
}
