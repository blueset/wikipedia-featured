import * as cheerio from "cheerio";
import smartquotes from "smartquotes";

/**
 * Apply smartquotes to text nodes in HTML using cheerio.
 * @param {string} html - The HTML string to process
 * @returns {string} - The processed HTML with smart quotes
 */
export function smartquotesHtml(html) {
  if (!html) return html;
  
  const $ = cheerio.load(html, { xmlMode: false, decodeEntities: false });
  
  function processNode(node) {
    if (node.type === "text") {
      node.data = smartquotes.string(node.data);
    } else if (node.children) {
      node.children.forEach(processNode);
    }
  }
  
  // Process all nodes in the body
  $("body").contents().each((_, node) => {
    processNode(node);
  });
  
  return $("body").html() || html;
}

/**
 * Apply smartquotes to a plain text string.
 * @param {string} text - The text string to process
 * @returns {string} - The processed text with smart quotes
 */
export function smartquotesText(text) {
  if (!text) return text;
  return smartquotes.string(text);
}
