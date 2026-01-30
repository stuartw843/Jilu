// HTML to Markdown conversion utilities

// Check if HTML content is truly empty (ignoring empty tags)
export function isHtmlEmpty(html: string): boolean {
  if (!html || html.trim() === "") {
    return true;
  }
  
  // Create a temporary div to extract text content
  const temp = document.createElement("div");
  temp.innerHTML = html;
  
  // Get the text content (strips all HTML tags)
  const textContent = temp.textContent || temp.innerText || "";
  
  // Check if there's any actual text after trimming
  return textContent.trim() === "";
}

// Convert HTML to markdown (simple conversion for WYSIWYG content)
export function htmlToMarkdown(html: string): string {
  if (!html || html.trim() === "") {
    return "";
  }

  // Create a temporary div to parse HTML
  const temp = document.createElement("div");
  temp.innerHTML = html;

  // Simple conversion rules
  let markdown = temp.innerHTML;

  // Convert headers
  markdown = markdown.replace(/<h1>(.*?)<\/h1>/gi, "# $1\n\n");
  markdown = markdown.replace(/<h2>(.*?)<\/h2>/gi, "## $1\n\n");
  markdown = markdown.replace(/<h3>(.*?)<\/h3>/gi, "### $1\n\n");

  // Convert bold and italic
  markdown = markdown.replace(/<strong>(.*?)<\/strong>/gi, "**$1**");
  markdown = markdown.replace(/<b>(.*?)<\/b>/gi, "**$1**");
  markdown = markdown.replace(/<em>(.*?)<\/em>/gi, "*$1*");
  markdown = markdown.replace(/<i>(.*?)<\/i>/gi, "*$1*");

  // Convert code
  markdown = markdown.replace(/<code>(.*?)<\/code>/gi, "`$1`");

  // Convert lists
  markdown = markdown.replace(/<ul>(.*?)<\/ul>/gis, (_match, content) => {
    const items = content.match(/<li>(.*?)<\/li>/gi) || [];
    return items.map((item: string) => "- " + item.replace(/<\/?li>/gi, "").trim()).join("\n") + "\n\n";
  });

  markdown = markdown.replace(/<ol>(.*?)<\/ol>/gis, (_match, content) => {
    const items = content.match(/<li>(.*?)<\/li>/gi) || [];
    return items.map((item: string, i: number) => `${i + 1}. ` + item.replace(/<\/?li>/gi, "").trim()).join("\n") + "\n\n";
  });

  // Convert blockquotes
  markdown = markdown.replace(/<blockquote>(.*?)<\/blockquote>/gis, "> $1\n\n");

  // Convert paragraphs
  markdown = markdown.replace(/<p>(.*?)<\/p>/gi, "$1\n\n");

  // Convert line breaks
  markdown = markdown.replace(/<br\s*\/?>/gi, "\n");

  // Remove remaining HTML tags
  markdown = markdown.replace(/<[^>]*>/g, "");

  // Decode HTML entities
  const textArea = document.createElement("textarea");
  textArea.innerHTML = markdown;
  markdown = textArea.value;

  // Clean up excessive newlines
  markdown = markdown.replace(/\n{3,}/g, "\n\n");

  return markdown.trim();
}
