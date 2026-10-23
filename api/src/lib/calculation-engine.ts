// Calculation Engine — wraps math.js for Computed Fields (Doc 05, Doc 14 §2)
import { evaluate, compile } from 'mathjs';

// Cache compiled expressions for performance
const compiledCache = new Map<string, ReturnType<typeof compile>>();

/**
 * Evaluate a formula expression with given variable values.
 * Supports unit-tagged numbers (e.g. "100 KES + 50 KES").
 *
 * @param expression - Math.js expression string (e.g. "tuition + activities - discount")
 * @param variables - Map of variable names to numeric values
 * @param unit - Optional unit label (e.g. "KES") applied to result
 */
export function evaluateFormula(
  expression: string,
  variables: Record<string, number>,
  unit?: string
): { value: number; unit?: string; error?: string } {
  try {
    let compiled = compiledCache.get(expression);
    if (!compiled) {
      compiled = compile(expression);
      compiledCache.set(expression, compiled);
    }

    const scope = { ...variables };
    const result = compiled.evaluate(scope);

    // Handle unit results
    if (unit) {
      return { value: Number(result), unit };
    }

    // If result has units (from mathjs), extract the numeric value
    if (typeof result === 'object' && result !== null && 'value' in result) {
      return { value: Number(result.value), unit: String(result.units) || unit };
    }

    return { value: Number(result), unit };
  } catch (err: any) {
    return { value: 0, error: err.message };
  }
}

/**
 * Validate that a formula expression is syntactically correct.
 */
export function validateFormula(expression: string): { valid: boolean; error?: string } {
  try {
    compile(expression);
    return { valid: true };
  } catch (err: any) {
    return { valid: false, error: err.message };
  }
}

/**
 * Extract variable names from a formula expression.
 * Used to know which field values need to be fetched for evaluation.
 */
export function extractFormulaVariables(expression: string): string[] {
  try {
    const node = compile(expression);
    const symbols = new Set<string>();
    node.traverse((n: any) => {
      if (n.isSymbolNode && !['pi', 'e', 'i', 'Infinity', 'NaN'].includes(n.name)) {
        symbols.add(n.name);
      }
    });
    return Array.from(symbols);
  } catch {
    return [];
  }
}

/**
 * Calculate a rollup (aggregation over related records).
 * @param values - Array of numeric values from related records
 * @param operation - 'sum' | 'avg' | 'count' | 'min' | 'max' | 'first' | 'last'
 */
export function calculateRollup(
  values: number[],
  operation: string
): number {
  if (values.length === 0) return 0;

  switch (operation) {
    case 'sum':
      return values.reduce((a, b) => a + b, 0);
    case 'avg':
    case 'average':
      return values.reduce((a, b) => a + b, 0) / values.length;
    case 'count':
      return values.length;
    case 'min':
      return Math.min(...values);
    case 'max':
      return Math.max(...values);
    case 'first':
      return values[0];
    case 'last':
      return values[values.length - 1];
    default:
      return 0;
  }
}
