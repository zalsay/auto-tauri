import { Page } from 'playwright';
import { z } from 'zod';

interface PageElement {
  role: string;
  text: string;
  placeholder?: string;
  type?: string;
  description: string;
  selector?: string;
}

interface OptimizedPrompt {
  originalPrompt: string;
  optimizedPrompt: string;
  pageElements: PageElement[];
  strategy: string;
}

const PAGE_ANALYSIS_PROMPT = `
Analyze the current webpage structure. Based on the user's goal, identify:
1. Interactive elements (buttons, inputs, links)
2. Key content areas
3. Potential obstacles (popups, login walls, iframes)

User Goal: {goal}

Return a JSON object with:
- elements: Array of {role, text, placeholder, type, description}
- obstacles: Array of potential issues
- strategy: Recommended approach in 1-2 sentences
`;

const PROMPT_OPTIMIZATION_SYSTEM_PROMPT = `
You are an expert at converting vague user intentions into precise, actionable browser automation instructions.

## Rules:
1. Use short, imperative sentences (verb + object + context)
2. Be extremely specific about which element to interact with
3. Include visual/positional context ("blue button in the header")
4. Avoid pronouns - name the exact element
5. Break complex tasks into sequential steps if needed

## Examples:

### Bad → Good
Bad: "find the product and buy it"
Good: "scroll down to find the 'Wireless Headphones' product card with $99.99 price, click the white 'Add to Cart' button on the right side of the product image"

Bad: "login to my account"
Good: "click the 'Sign In' link in the top right corner, wait for the login form to load, type 'user@example.com' into the email input field (the first input with placeholder 'Email address'), type the password into the password field, click the 'Sign In' button"

Bad: "search for something"
Good: "click on the search input box (the long rectangular input with placeholder 'Search products...'), type 'mechanical keyboard', click the magnifying glass icon button on the right side of the search bar"

## Output Format:
Return a JSON object with:
- optimizedPrompt: The detailed instruction string
- reasoning: Brief explanation of the strategy (1-2 sentences)
`;

export class PageAnalyzer {
  constructor(private page: Page) {}

  async analyzeAndOptimize(userGoal: string): Promise<OptimizedPrompt> {
    await this.page.waitForLoadState('domcontentloaded');
    await this.page.waitForTimeout(1000);

    const elements = await this.extractPageElements();
    const pageContext = await this.capturePageContext();

    const optimizedPrompt = await this.generateOptimizedPrompt(
      userGoal,
      elements,
      pageContext
    );

    return {
      originalPrompt: userGoal,
      optimizedPrompt,
      pageElements: elements,
      strategy: pageContext.strategy,
    };
  }

  private async extractPageElements(): Promise<PageElement[]> {
    const elements: PageElement[] = [];

    const selectors = [
      { selector: 'button', role: 'button' },
      { selector: 'input', role: 'input' },
      { selector: 'a', role: 'link' },
      { selector: '[role="button"]', role: 'button' },
      { selector: '[role="link"]', role: 'link' },
      { selector: '[role="textbox"]', role: 'textbox' },
      { selector: 'textarea', role: 'textbox' },
      { selector: 'select', role: 'select' },
    ];

    for (const { selector, role } of selectors) {
      const count = await this.page.locator(selector).count();
      if (count > 0 && count < 20) {
        for (let i = 0; i < Math.min(count, 10); i++) {
          const loc = this.page.locator(selector).nth(i);
          try {
            const text = await loc.textContent().catch(() => '');
            const placeholder = await loc.getAttribute('placeholder').catch(() => '');
            const type = await loc.getAttribute('type').catch(() => '');
            const ariaLabel = await loc.getAttribute('aria-label').catch(() => '');
            const title = await loc.getAttribute('title').catch(() => '');

            const visibleText = (text || ariaLabel || title || placeholder || '').trim();
            if (visibleText.length > 0 && visibleText.length < 100) {
              elements.push({
                role,
                text: visibleText,
                placeholder: placeholder || undefined,
                type: type || undefined,
                description: this.describeElement(role, visibleText, placeholder || undefined, type || undefined),
              });
            }
          } catch (e) {
            continue;
          }
        }
      }
    }

    return elements.slice(0, 15);
  }

  private describeElement(role: string, text: string, placeholder?: string, type?: string): string {
    const parts: string[] = [];
    parts.push(`${role}`);
    if (text) parts.push(`with text "${text}"`);
    if (placeholder) parts.push(`placeholder "${placeholder}"`);
    if (type && type !== 'submit' && type !== 'button') parts.push(`type="${type}"`);
    return parts.join(' ');
  }

  private async capturePageContext(): Promise<{ title: string; url: string; strategy: string }> {
    const title = await this.page.title();
    const url = this.page.url();

    let strategy = '';
    if (url.includes('login') || url.includes('signin')) {
      strategy = 'Login detected - focus on credentials fields and submit button';
    } else if (url.includes('checkout') || url.includes('cart')) {
      strategy = 'E-commerce flow - focus on payment/shipping forms';
    } else if (url.includes('search')) {
      strategy = 'Search page - look for search input and results';
    } else {
      strategy = 'General page - identify main content and navigation';
    }

    return { title, url, strategy };
  }

  private async generateOptimizedPrompt(
    userGoal: string,
    elements: PageElement[],
    pageContext: { title: string; url: string; strategy: string }
  ): Promise<string> {
    const elementsContext = elements
      .map((el, i) => `[${i}] ${el.description}`)
      .join('\n');

    const fullPrompt = `${PROMPT_OPTIMIZATION_SYSTEM_PROMPT}

## Current Page Context:
- Title: ${pageContext.title}
- URL: ${pageContext.url}
- Strategy: ${pageContext.strategy}

## Identified Interactive Elements:
${elementsContext}

## User's Original Goal:
"${userGoal}"

## Your Task:
Convert the user's goal into a precise, step-by-step instruction that references specific elements from the identified list.

Output JSON:
{
  "optimizedPrompt": "your detailed instruction here",
  "reasoning": "brief explanation"
}`;

    try {
      const response = await this.callLLM(fullPrompt);
      const parsed = JSON.parse(response);
      return parsed.optimizedPrompt || parsed.optimized || userGoal;
    } catch (e) {
      console.error('[PageAnalyzer] Failed to optimize prompt:', e);
      return userGoal;
    }
  }

  private async callLLM(prompt: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY;
    if (!apiKey) {
      console.error('[PageAnalyzer] No API key available');
      return JSON.stringify({ optimizedPrompt: prompt, reasoning: 'No LLM available' });
    }

    const baseURL = process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
    const model = process.env.LLM_MODEL || 'gpt-4o';

    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
  }
}

export async function analyzeAndOptimize(
  page: Page,
  userPrompt: string
): Promise<{
  optimizedPrompt: string;
  elements: PageElement[];
  strategy: string;
}> {
  const analyzer = new PageAnalyzer(page);
  const result = await analyzer.analyzeAndOptimize(userPrompt);
  return {
    optimizedPrompt: result.optimizedPrompt,
    elements: result.pageElements,
    strategy: result.strategy,
  };
}
