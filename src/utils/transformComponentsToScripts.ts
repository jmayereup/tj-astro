import { PUBLIC_SUBMISSION_URL } from '../lib/env.ts';
import { renderContentAsHtml } from './serialization.ts';


const TAG_NORMALIZATION_MAP: Record<string, string> = {
  'grammar-hearts': 'tj-grammar-hearts',
  'lbl-reader': 'tj-reader',
  'speed-review': 'tj-speed-review',
  'quiz-element': 'tj-quiz-element',
  'progressive-test': 'tj-test',
  'test-element': 'tj-test',
  'info-gap': 'tj-info-gap',
  'chapter-book': 'tj-chapter-book',
  'listening': 'tj-listening',
  'pronunciation': 'tj-pronunciation',
};

/**
 * Transforms Ghost/PocketBase HTML content by moving raw JSON/Markdown data from web component tags
 * into a child `<script>` tag. This improves compatibility with Astro View Transitions
 * and avoids parsing issues.
 * 
 * Automatically inserts or updates submission-url on each custom element (<tj-*>).
 * Also injects a structured HTML fallback for SEO and slow networks.
 * Normalizes legacy tag names (e.g. <grammar-hearts>) to canonical tags (e.g. <tj-grammar-hearts>).
 * 
 * Example:
 * <grammar-hearts>{"topic": "test"}</grammar-hearts>
 * becomes:
 * <tj-grammar-hearts submission-url="...">
 *   <script type="application/json">{"topic": "test"}</script>
 * </tj-grammar-hearts>
 * <div class="tj-fallback">...rendered JSON...</div>
 */
export function transformComponentsToScripts(
  html: string, 
  submissionUrl: string = PUBLIC_SUBMISSION_URL
): string {
  if (!html) return '';

  // Matches custom element tags (tj-* or legacy tags like grammar-hearts, lbl-reader, speed-review, quiz-element)
  const componentTagPattern = '(?:tj-[a-z-]+|grammar-hearts|lbl-reader|speed-review|quiz-element|progressive-test|test-element|info-gap|chapter-book|listening|pronunciation)';
  const componentRegex = new RegExp(`<(${componentTagPattern})([^>]*)>([\\s\\S]*?)<\\/\\1>`, 'gi');

  return html.replace(componentRegex, (match, tagName, attrs, content) => {
    const lowerTag = tagName.toLowerCase();
    const targetTag = TAG_NORMALIZATION_MAP[lowerTag] || tagName;

    // Replace existing submission-url attribute or append if missing (only if submissionUrl is provided)
    let newAttrs = attrs;
    if (submissionUrl) {
      const subUrlRegex = /submission-url\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i;
      if (subUrlRegex.test(newAttrs)) {
        newAttrs = newAttrs.replace(
          new RegExp(subUrlRegex, 'gi'),
          `submission-url="${submissionUrl}"`
        );
      } else {
        newAttrs = `${newAttrs} submission-url="${submissionUrl}"`;
      }
    }

    // If it already has a script tag, update tag name/attributes and return
    if (content.includes('<script')) {
      return `<${targetTag}${newAttrs}>${content}</${targetTag}>`;
    }

    const trimmedContent = content.trim();
    if (!trimmedContent) {
      return `<${targetTag}${newAttrs}>${content}</${targetTag}>`;
    }

    // Determine script type based on component (tj-quiz-element / quiz-element uses markdown-like text)
    const isMarkdown = targetTag === 'tj-quiz-element' || lowerTag === 'tj-quiz-element' || lowerTag === 'quiz-element';
    const scriptType = isMarkdown ? 'text/markdown' : 'application/json';

    // Generate fallback HTML if it's JSON
    let fallbackHtml = '';
    if (!isMarkdown) {
      try {
        const jsonData = JSON.parse(trimmedContent);
        const rendered = renderContentAsHtml(jsonData);
        if (rendered) {
          fallbackHtml = `\n<div class="tj-fallback p-4 border border-slate-100 rounded-xl my-4 bg-slate-50/30">\n${rendered}\n</div>`;
        }
      } catch (e) {
        console.warn(`Failed to parse JSON for ${tagName} fallback:`, e);
      }
    }

    // Reconstruct the tag with the nested script and place fallback AFTER it
    return `<${targetTag}${newAttrs}>\n<script type="${scriptType}">\n${trimmedContent}\n</script>\n</${targetTag}>${fallbackHtml}`;
  });
}

