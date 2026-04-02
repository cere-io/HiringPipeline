import type { NotionComment } from './client';

export interface ParsedEvaluation {
  author: string;
  verdict: 'positive' | 'negative' | 'neutral';
  reasoning: string;
  strengths: string[];
  risks: string[];
  score: number | null;
  action: string | null;
  rawText: string;
}

const VERDICT_POSITIVE = /\b(looks?\s+good|strong|yes|proceed|book|advance|move\s+forward|approve|thumbs\s+up|recommend)\b/i;
const VERDICT_NEGATIVE = /\b(pass|reject|no|weak|decline|not\s+a\s+fit|skip|drop)\b/i;

const SCORE_PATTERN = /\bscore\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:\/\s*10)?/i;
const ALT_SCORE_PATTERN = /\b(\d+(?:\.\d+)?)\s*\/\s*10\b/;

const FIELD_PATTERNS: Record<string, RegExp> = {
  verdict: /(?:^|\n)\s*\*{0,2}verdict\*{0,2}\s*[:=]\s*(.+?)(?:\n|$)/i,
  why: /(?:^|\n)\s*\*{0,2}why\*{0,2}\s*[:=]\s*([\s\S]+?)(?:\n\s*\*{0,2}(?:strength|risk|score|verdict|action)|$)/i,
  strength: /(?:^|\n)\s*\*{0,2}strengths?\*{0,2}\s*[:=]\s*([\s\S]+?)(?:\n\s*\*{0,2}(?:risk|score|verdict|action|why)|$)/i,
  risk: /(?:^|\n)\s*\*{0,2}risks?\*{0,2}\s*[:=]\s*([\s\S]+?)(?:\n\s*\*{0,2}(?:strength|score|verdict|action|why)|$)/i,
  action: /(?:^|\n)\s*@\w+\s+(.+?)(?:\n|$)/i,
};

function extractField(text: string, field: keyof typeof FIELD_PATTERNS): string {
  const match = text.match(FIELD_PATTERNS[field]);
  return match ? match[1].trim() : '';
}

function splitReasons(text: string): string[] {
  if (!text) return [];
  return text
    .split(/[+,;]|\band\b/)
    .map(s => s.trim())
    .filter(s => s.length > 3);
}

function detectVerdict(text: string, verdictField: string): 'positive' | 'negative' | 'neutral' {
  const check = verdictField || text;
  if (VERDICT_POSITIVE.test(check)) return 'positive';
  if (VERDICT_NEGATIVE.test(check)) return 'negative';
  return 'neutral';
}

function extractScore(text: string): number | null {
  const explicit = text.match(SCORE_PATTERN);
  if (explicit) {
    const n = parseFloat(explicit[1]);
    return n >= 0 && n <= 10 ? n : null;
  }
  const alt = text.match(ALT_SCORE_PATTERN);
  if (alt) {
    const n = parseFloat(alt[1]);
    return n >= 0 && n <= 10 ? n : null;
  }
  return null;
}

export function parseEvaluatorComment(comment: NotionComment): ParsedEvaluation {
  const { text, author } = comment;

  const verdictField = extractField(text, 'verdict');
  const why = extractField(text, 'why');
  const strengthField = extractField(text, 'strength');
  const riskField = extractField(text, 'risk');
  const actionField = extractField(text, 'action');
  const score = extractScore(text);

  const verdict = detectVerdict(text, verdictField);

  const reasoning = why || verdictField || text.slice(0, 200);
  const strengths = splitReasons(strengthField);
  const risks = splitReasons(riskField);

  return {
    author,
    verdict,
    reasoning,
    strengths,
    risks,
    score,
    action: actionField || null,
    rawText: text,
  };
}

export function parseAllComments(comments: NotionComment[]): ParsedEvaluation[] {
  return comments
    .map(c => parseEvaluatorComment(c))
    .filter(e => e.score != null || e.strengths.length > 0 || e.risks.length > 0 || e.verdict !== 'neutral');
}

export function bestEvaluation(evaluations: ParsedEvaluation[]): ParsedEvaluation | null {
  if (evaluations.length === 0) return null;
  const withScore = evaluations.filter(e => e.score != null);
  if (withScore.length > 0) return withScore[withScore.length - 1];
  return evaluations[evaluations.length - 1];
}
