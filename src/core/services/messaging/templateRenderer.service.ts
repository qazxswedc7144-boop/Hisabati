export interface RenderResult {
  renderedText: string;
  usedVariables: string[];
  missingVariables: string[];
  isValid: boolean;
}

export class TemplateRendererService {
  /**
   * Extract all variable tags from a template string (e.g. {customerName}, {{amount}})
   */
  extractVariables(template: string): string[] {
    const regex = /\{{1,2}\s*([a-zA-Z0-9_]+)\s*\}{1,2}/g;
    const vars = new Set<string>();
    let match;
    while ((match = regex.exec(template)) !== null) {
      if (match[1]) {
        vars.add(match[1]);
      }
    }
    return Array.from(vars);
  }

  /**
   * Format variable value according to its expected type
   */
  formatValue(key: string, value: string | number | undefined | null): string {
    if (value === undefined || value === null || value === '') {
      return '';
    }

    // Number formatting for amounts and balances
    if (typeof value === 'number') {
      return new Intl.NumberFormat('ar-YE', {
        maximumFractionDigits: 2,
      }).format(value);
    }

    return String(value).trim();
  }

  /**
   * Safely render a template with provided variables
   */
  render(
    template: string,
    variables: Record<string, string | number | undefined | null>,
    options?: { strict?: boolean; defaultPlaceholder?: string }
  ): RenderResult {
    const requiredVars = this.extractVariables(template);
    const missingVariables: string[] = [];
    const usedVariables: string[] = [];

    const defaultPlaceholder = options?.defaultPlaceholder ?? '';
    const strict = options?.strict ?? false;

    let rendered = template;

    for (const varName of requiredVars) {
      const rawValue = variables[varName];
      if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') {
        missingVariables.push(varName);
        if (strict) {
          throw new Error(`المتغير المطلوب {${varName}} غير متوفر في بيانات الرسالة`);
        }
      } else {
        usedVariables.push(varName);
      }

      const formattedVal = this.formatValue(varName, rawValue) || defaultPlaceholder;
      // Match {varName} and {{varName}}
      const regex = new RegExp(`\\{{1,2}\\s*${varName}\\s*\\}{1,2}`, 'g');
      rendered = rendered.replace(regex, formattedVal);
    }

    // Clean up trailing and double blank lines
    rendered = rendered
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n')
      .trim();

    return {
      renderedText: rendered,
      usedVariables,
      missingVariables,
      isValid: missingVariables.length === 0,
    };
  }

  /**
   * Validate whether a template has all required variables filled
   */
  validate(template: string, variables: Record<string, string | number | undefined | null>): {
    valid: boolean;
    missing: string[];
  } {
    const required = this.extractVariables(template);
    const missing = required.filter((key) => {
      const v = variables[key];
      return v === undefined || v === null || String(v).trim() === '';
    });
    return {
      valid: missing.length === 0,
      missing,
    };
  }
}

export const templateRenderer = new TemplateRendererService();
