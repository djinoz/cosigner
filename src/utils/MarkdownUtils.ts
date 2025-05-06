import { marked } from 'marked';

/**
 * Utility functions for handling markdown content
 */
class MarkdownUtils {
  /**
   * Convert markdown to HTML
   * @param markdown The markdown content
   * @returns The HTML content
   */
  async convertToHtml(markdown: string): Promise<string> {
    // Handle both synchronous and asynchronous marked implementations
    const result = marked.parse(markdown);
    return result instanceof Promise ? await result : result;
  }

  /**
   * Extract title from markdown content
   * @param markdown The markdown content
   * @returns The title or null if not found
   */
  extractTitle(markdown: string): string | null {
    // Look for the first heading
    const match = markdown.match(/^#\s+(.+)$/m);
    return match ? match[1].trim() : null;
  }

  /**
   * Sanitize markdown content
   * @param markdown The markdown content
   * @returns The sanitized markdown
   */
  sanitize(markdown: string): string {
    // For a real implementation, you would use a proper sanitizer
    // For this prototype, we'll just do some basic sanitization
    return markdown
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  }

  /**
   * Get a preview of the markdown content
   * @param markdown The markdown content
   * @param maxLength Maximum length of the preview
   * @returns The preview
   */
  getPreview(markdown: string, maxLength: number = 150): string {
    // Remove headings and other markdown syntax
    const plainText = markdown
      .replace(/#+\s+(.+)$/gm, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_~`]/g, '')
      .replace(/\n\n+/g, ' ')
      .trim();
    
    if (plainText.length <= maxLength) {
      return plainText;
    }
    
    return plainText.substring(0, maxLength) + '...';
  }
}

// Create a singleton instance
const markdownUtils = new MarkdownUtils();

export default markdownUtils;
