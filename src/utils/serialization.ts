/**
 * Formats a key for display.
 */
export function formatKey(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

/**
 * Recursively renders a JSON object as structured HTML for SEO and slow network fallbacks.
 */
export function renderContentAsHtml(obj: any, depth = 0): string {
  if (obj === null || obj === undefined) return '';
  
  // Handle primitives
  if (typeof obj !== 'object') {
    const val = String(obj);
    if (!val) return '';
    // Special handling for long text
    if (val.length > 100 || val.includes('\n')) {
      return `<p class="text-slate-700 leading-relaxed mb-4 whitespace-pre-wrap">${val}</p>`;
    }
    return `<span class="text-slate-600">${val}</span>`;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '';
    const items = obj.map(item => `<li class="mb-2">${renderContentAsHtml(item, depth + 1)}</li>`).join('');
    return `<ul class="list-disc list-outside pl-5 mb-4 text-slate-700">${items}</ul>`;
  }

  // Handle objects

  let html = '';
  const entries = Object.entries(obj);
  
  for (const [key, value] of entries) {
    if (!value || (typeof value === 'object' && Object.keys(value).length === 0)) continue;
    
    // Skip specific technical keys
    if (['id', 'uuid', 'type', 'created', 'updated', 'token', 'access'].includes(key.toLowerCase())) continue;

    const formattedKey = formatKey(key);
    const renderedValue = renderContentAsHtml(value, depth + 1);
    
    if (!renderedValue) continue;

    if (depth === 0) {
      // Top level keys as sections
      html += `<section class="mb-8 border-b border-slate-100 pb-4">
        <h2 class="text-xl font-bold text-slate-800 mb-3">${formattedKey}</h2>
        ${renderedValue}
      </section>`;
    } else {
      // Nested keys
      if (typeof value !== 'object' || Array.isArray(value)) {
        html += `<div class="mb-2"><strong class="text-slate-800 font-semibold">${formattedKey}:</strong> ${renderedValue}</div>`;
      } else {
        html += `<div class="mb-4">
          <h3 class="text-lg font-semibold text-slate-700 mb-2">${formattedKey}</h3>
          <div class="ml-4 border-l-2 border-slate-50 pl-4">${renderedValue}</div>
        </div>`;
      }
    }
  }
  
  return html;
}
