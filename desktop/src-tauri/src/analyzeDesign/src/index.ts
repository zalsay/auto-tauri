import * as fs from 'fs';

interface ElementInfo {
  type: string;
  text: string;
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: npx ts-node src/index.ts <html_file> [output_file]');
    process.exit(1);
  }

  const htmlPath = args[0];
  const outputPath = args[1] || htmlPath.replace(/\.html$/, '.md');

  try {
    convertHtmlToMd(htmlPath, outputPath);
    console.log(`Converted ${htmlPath} to ${outputPath}`);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

function convertHtmlToMd(htmlPath: string, outputPath: string): void {
  const htmlContent = fs.readFileSync(htmlPath, 'utf-8');

  let markdown = '';
  const title = extractTitle(htmlContent);

  markdown += `# ${title}\n\n`;
  markdown += `> 页面类型：学生端原型页面（Axure导出）\n\n`;

  const elements = extractElements(htmlContent);
  const texts = elements.filter(e => isMeaningfulText(e.text));

  markdown += `## 📋 页面内容概览\n\n`;
  markdown += `| 序号 | 元素类型 | 显示文本 |\n`;
  markdown += `|------|---------|----------|\n`;

  let index = 1;
  for (const elem of texts.slice(0, 50)) {
    const type = cleanTypeName(elem.type);
    const text = cleanText(elem.text);
    markdown += `| ${index++} | ${type} | ${text} |\n`;
  }

  const uniqueTexts = [...new Set(texts.map(e => cleanText(e.text)))].filter(t => t.length > 1);

  markdown += `\n## 🎯 核心功能入口\n\n`;
  const buttons = uniqueTexts.filter(t =>
    t.includes('签到') || t.includes('拍照') || t.includes('知道了') || t.includes('查看') || t === '取消'
  );
  for (const btn of buttons) {
    markdown += `- ${btn}\n`;
  }

  markdown += `\n## 📝 文本内容\n\n`;
  const paragraphs = uniqueTexts.filter(t =>
    t.length > 3 && !t.includes('签到') && !t.includes('时间段') && !t.includes('images')
  );
  for (const p of paragraphs) {
    markdown += `- ${p}\n`;
  }

  markdown += `\n## ⏰ 时间信息\n\n`;
  const times = uniqueTexts.filter(t => t.includes(':') && t.length < 20);
  for (const t of times) {
    markdown += `- ${t}\n`;
  }

  markdown += `\n## 📊 元素统计\n\n`;
  markdown += `| 类型 | 数量 |\n`;
  markdown += `|------|------|\n`;

  const typeCount: Record<string, number> = {};
  for (const elem of elements) {
    const t = cleanTypeName(elem.type);
    typeCount[t] = (typeCount[t] || 0) + 1;
  }

  for (const [type, count] of Object.entries(typeCount).sort((a, b) => b[1] - a[1])) {
    markdown += `| ${type} | ${count} |\n`;
  }

  markdown += `\n## 💡 状态提示\n\n`;
  const statuses = uniqueTexts.filter(t =>
    t.includes('成功') || t.includes('未') || t.includes('请') || t.includes('要求') || t.includes('✅') || t.includes('❌')
  );
  for (const s of statuses) {
    markdown += `- ${s}\n`;
  }

  markdown += `\n---\n`;
  markdown += `*文档由自动转换工具生成*\n`;

  fs.writeFileSync(outputPath, markdown);
}

function extractTitle(html: string): string {
  const match = html.match(/<title>([^<]+)<\/title>/);
  return match ? match[1].trim() : '学生端原型页面';
}

function extractElements(html: string): ElementInfo[] {
  const elements: ElementInfo[] = [];

  const commentRegex = /<td class="line-content"[^>]*>\s*<span class="html-comment">&lt;!--\s*(.*?)\s*--&gt;<\/span>\s*<\/td>/g;
  const contentRegex = /<td class="line-content"[^>]*>([\s\S]*?)<\/td>/g;

  let commentMatch;
  while ((commentMatch = commentRegex.exec(html)) !== null) {
    const comment = commentMatch[1].trim();
    const commentEnd = commentMatch.index + commentMatch[0].length;

    let textMatch;
    let foundText = '';

    while ((textMatch = contentRegex.exec(html)) !== null) {
      if (textMatch.index > commentEnd) {
        const content = textMatch[1];
        const text = extractText(content);
        if (text.trim() && text.trim().length < 80) {
          foundText = text.trim();
          break;
        }
      }
    }

    if (foundText) {
      elements.push({ type: comment, text: foundText });
    }
  }

  return elements;
}

function cleanTypeName(type: string): string {
  return type
    .replace(/Unnamed\s*\(/g, '')
    .replace(/\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanText(text: string): string {
  return text
    .replace(/images\/.*?\.(svg|png|jpg|gif|jpeg)["\s]*/gi, '')
    .replace(/alt="[^"]*"/g, '')
    .replace(/"/g, '')
    .replace(/'/g, '')
    .replace(/>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isMeaningfulText(text: string): boolean {
  const cleaned = cleanText(text);
  if (cleaned.length === 0) return false;
  if (cleaned.includes('images/')) return false;
  if (cleaned.includes('alt=')) return false;
  if (cleaned === '/' || cleaned === '-') return false;
  return true;
}

function extractText(content: string): string {
  let text = content;
  text = text.replace(/<span[^>]*>/g, '').replace(/<\/span>/g, '');
  text = text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/<br\s*\/?>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

main();
