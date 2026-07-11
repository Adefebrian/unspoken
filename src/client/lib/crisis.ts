// Detects language that suggests self-harm / suicidal crisis, so we can gently
// surface real help. We never block the post (reaching out matters); we add
// support on top. Tuned to catch clear phrases in English + Indonesian while
// avoiding most false positives.
const PATTERNS: RegExp[] = [
  /\bkill(ing)?\s+(myself|my ?self)\b/i,
  /\b(want|wanna|going)\s+to\s+die\b/i,
  /\bwanna\s+die\b/i,
  /\bend\s+(my|it)\s+(life|all)\b/i,
  /\btake\s+my\s+(own\s+)?life\b/i,
  /\b(no|nothing)\s+(reason|point)\s+(to|in)\s+(live|living|life)\b/i,
  /\bbetter\s+off\s+dead\b/i,
  /\bdon'?t\s+want\s+to\s+(be\s+here|live|exist)\b/i,
  /\bsuicid(e|al)\b/i,
  /\bself[\s-]?harm\b/i,
  /\b(hurt|cut(ting)?|harm)\s+(myself|my ?self)\b/i,
  /\bcan'?t\s+(go\s+on|do\s+this\s+anymore|take\s+it\s+anymore)\b/i,
  /\boverdos(e|ing)\b/i,
  // Indonesian
  /\bbunuh\s+diri\b/i,
  /\b(mau|ingin|pengen|pengin|kepengen)\s+mati\b/i,
  /\b(gak|ga|nggak|tidak|tak)\s+(mau|ingin|pengen)\s+hidup\b/i,
  /\b(akhiri|mengakhiri)\s+hidup\b/i,
  /\blebih\s+baik\s+mati\b/i,
  /\b(menyakiti|melukai)\s+diri\b/i,
  /\b(capek|lelah|cape)\s+hidup\b/i,
  /\b(gak|ga|nggak|tidak)\s+(sanggup|kuat)\s+(hidup|lagi)\b/i,
];

export function isCrisis(text: string): boolean {
  return PATTERNS.some((re) => re.test(text));
}

// Store: shown after a crisis-flagged submit.
type Listener = () => void;
const listeners = new Set<Listener>();
export function showCrisis(): void {
  for (const listen of listeners) listen();
}
export function subscribeCrisis(listen: Listener): () => void {
  listeners.add(listen);
  return () => listeners.delete(listen);
}
