const EMOJI_REGEX =
  /(?:\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\uFE0F|\u200D\p{Extended_Pictographic})*)/gu

const UNICODE_MINUS = '\u2212'
const DASH_RANGE = `\u2013\u2014` // en dash, em dash

const EXPONENT_PHRASE: Record<string, string> = {
  '2': 'squared',
  '3': 'cubed',
}

function exponentPhrase(exp: string): string {
  const trimmed = exp.trim()
  return EXPONENT_PHRASE[trimmed] ?? `to the power of ${trimmed}`
}

function stripEmojis(text: string): string {
  return text.replace(EMOJI_REGEX, '')
}

function stripLatexDelimiters(text: string): string {
  return text
    .replace(/\$\$([^$]+)\$\$/g, ' $1 ')
    .replace(/\$([^$]+)\$/g, ' $1 ')
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1 divided by $2')
    .replace(/\\sqrt\{([^}]+)\}/g, 'square root of $1')
    .replace(/\\left[(\[{|.]/g, ' ')
    .replace(/\\right[)\]}|.]/g, ' ')
    .replace(/\\neq/g, ' not equal to ')
    .replace(/\\ne\b/g, ' not equal to ')
    .replace(/\\leq/g, ' less than or equal to ')
    .replace(/\\geq/g, ' greater than or equal to ')
    .replace(/\\approx/g, ' approximately ')
    .replace(/\\rightarrow/g, ' approaches ')
    .replace(/\\to\b/g, ' approaches ')
    .replace(/\\infty/g, ' infinity ')
    .replace(/\\pi\b/g, ' pi ')
    .replace(/\\times/g, ' times ')
    .replace(/\\cdot/g, ' times ')
    .replace(/\\div/g, ' divided by ')
    .replace(/\\pm/g, ' plus or minus ')
    .replace(/\\(text|mathrm|mathbf|mathit)\{([^}]+)\}/g, '$2')
    .replace(/\\[a-zA-Z]+/g, ' ')
}

/** Em/en dashes are pauses; unicode minus is subtraction. Handle before other math rules. */
function normalizeDashes(text: string): string {
  return text
    .replace(new RegExp(`(\\d+)\\s*[${DASH_RANGE}]\\s*(\\d+)`, 'g'), '$1 to $2')
    .replace(new RegExp(UNICODE_MINUS, 'g'), ' MINUS ')
    .replace(new RegExp(`\\s*[${DASH_RANGE}]\\s*`, 'g'), ', ')
    .replace(new RegExp(`[${DASH_RANGE}]`, 'g'), ', ')
}

function normalizeComparisons(text: string): string {
  return text
    .replace(/≤|<=/g, ' less than or equal to ')
    .replace(/≥|>=/g, ' greater than or equal to ')
    .replace(/≠|!=/g, ' not equal to ')
    .replace(/([A-Za-z0-9)\]])\s*\/=\s*([A-Za-z0-9(\[])/g, '$1 not equal to $2')
    .replace(/≈|~=/g, ' approximately ')
    .replace(/±/g, ' plus or minus ')
    .replace(/∞/g, ' infinity ')
    .replace(/(\S)\s*<\s*(\S)/g, '$1 is less than $2')
    .replace(/(\S)\s*>\s*(\S)/g, '$1 is greater than $2')
    .replace(/(?<![!=<>])=(?!=)/g, ' equals ')
}

function normalizeOperators(text: string): string {
  return text
    .replace(/\s*->\s*/g, ' approaches ')
    .replace(/→/g, ' approaches ')
    .replace(/\s*×\s*/g, ' times ')
    .replace(/\s*÷\s*/g, ' divided by ')
    .replace(/\s*\*\s*/g, ' times ')
    .replace(/\s*\+\s*/g, ' plus ')
    .replace(/\(\s*([^)]+?)\s*\)\s*\/\s*\(\s*([^)]+?)\s*\)/g, '$1 divided by $2')
    .replace(/(\d+)\s*\/\s*(\d+)/g, '$1 divided by $2')
    .replace(/([A-Za-z0-9)\]])\s*\/\s*([A-Za-z0-9(\[])/g, '$1 divided by $2')
}

function normalizeExponents(text: string): string {
  return text
    .replace(/²/g, ' squared')
    .replace(/³/g, ' cubed')
    .replace(/([A-Za-z0-9]+)\^\{([^}]+)\}/g, (_, base: string, exp: string) => {
      const phrase = exponentPhrase(exp)
      return phrase.startsWith('to the') ? `${base} ${phrase}` : `${base} ${phrase}`
    })
    .replace(/([A-Za-z0-9]+)\^(\d+)/g, (_, base: string, exp: string) => {
      const phrase = exponentPhrase(exp)
      return phrase.startsWith('to the') ? `${base} ${phrase}` : `${base} ${phrase}`
    })
}

function normalizeFunctions(text: string): string {
  return text
    .replace(/\b([A-Za-z])\(([^)]+)\)/g, '$1 of $2')
    .replace(/(\d)([A-Za-z])/g, '$1 times $2')
}

function normalizeSubscripts(text: string): string {
  return text.replace(/([A-Za-z])_(\d+|[A-Za-z])/g, '$1 sub $2')
}

function normalizeMinus(text: string): string {
  return text
    .replace(/ MINUS /g, ' minus ')
    .replace(/(?<=[\dA-Za-z)\]])-(?=[\dA-Za-z])/g, ' minus ')
    .replace(/(?<=[\dA-Za-z)\]])-(?=\s)/g, ' minus ')
    .replace(/(?<=\s)-(?=[\dA-Za-z])/g, ' minus ')
    .replace(/(?<=\s)-(?=\s)/g, ' minus ')
    .replace(/(?<=\s)-(?=\d)/g, 'negative ')
    .replace(/^-(?=\d)/, 'negative ')
}

/** Grouping punctuation often causes odd TTS pauses — remove after math rules run. */
function normalizeParentheses(text: string): string {
  return text.replace(/[()[\]{}|]/g, ' ')
}

function normalizePunctuation(text: string): string {
  return text
    .replace(/[;:]/g, ', ')
    .replace(/\.{2,}/g, ', ')
    .replace(/[,，]{2,}/g, ', ')
    .replace(/\s*,\s*(?=[,])/g, ', ')
    .replace(/^\s*,\s*/g, '')
    .replace(/\s*,\s*$/g, '')
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** Converts quiz/math text into phrasing that reads naturally with TTS. */
export function prepareTextForSpeech(text: string): string {
  if (!text.trim()) return ''

  let result = text
  result = stripEmojis(result)
  result = stripLatexDelimiters(result)
  result = normalizeDashes(result)
  result = normalizeComparisons(result)
  result = normalizeExponents(result)
  result = normalizeSubscripts(result)
  result = normalizeFunctions(result)
  result = normalizeOperators(result)
  result = normalizeMinus(result)
  result = normalizeParentheses(result)
  result = normalizePunctuation(result)
  result = collapseWhitespace(result)

  return result
}
