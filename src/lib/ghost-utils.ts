import ghostPostsData from '../data/ghost-posts.json';

/**
 * Returns all Ghost posts from the frozen snapshot (src/data/ghost-posts.json).
 *
 * The Ghost API is no longer called at build time. Ghost content is considered
 * frozen — all new content is published via PocketBase.
 *
 * The `options` parameter is accepted for backwards compatibility:
 *   - `options.filter` — supports "tag:<slug>" syntax to filter by tag slug.
 *   - `options.include` — ignored (tags are already embedded in the snapshot).
 *   - All other options — ignored.
 */
export async function getAllPosts(options: any = {}): Promise<any[]> {
  let posts: any[] = ghostPostsData as any[];

  // Apply tag filter if provided (e.g. { filter: "tag:english" })
  const filter: string | undefined = options.filter;
  if (filter) {
    const tagMatch = filter.match(/^tag:(.+)$/);
    if (tagMatch) {
      const tagSlug = tagMatch[1];
      posts = posts.filter((p: any) =>
        p.tags?.some((t: any) => t.slug === tagSlug)
      );
    }
  }

  return posts;
}

/**
 * Stub kept for API compatibility — Ghost pages are not used in this project.
 */
export async function getAllPages(_options: any = {}): Promise<any[]> {
  return [];
}
