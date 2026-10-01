/**
 * Copies text; falls back to selecting it, because the Clipboard API only works on HTTPS
 * (phones testing over plain-HTTP LAN addresses don't have it).
 */
export async function copyText(
  text: string,
  fallbackInput: HTMLInputElement | null,
): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  if (!fallbackInput) return false;
  fallbackInput.focus();
  fallbackInput.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  }
}
