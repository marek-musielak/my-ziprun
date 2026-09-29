// Drobne narzędzia do tekstu, wspólne dla aplikacji i edytora planów.
// Bez DOM i bez zależności, więc da się ich użyć wszędzie, także w testach.

const ENCJE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * Zamienia tekst na bezpieczny kawałek HTML. Nazwy planów przychodzą teraz
 * także z linków, a więc od kogokolwiek — wstawione wprost do innerHTML
 * mogłyby przemycić na stronę własny kod.
 */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (z) => ENCJE[z]);

/** Polska odmiana: 1 trening, 2-4 treningi, 5+ treningów. */
export function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (n === 1) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
