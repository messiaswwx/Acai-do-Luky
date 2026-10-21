/**
 * Utilitários de Higienização e Validação de Segurança (Input Sanitization)
 * Previne injeções XSS, SQLi e dados maliciosos no cliente e servidor.
 */

// Remove tags HTML, scripts e caracteres potencialmente perigosos
export function sanitizeText(input: string | undefined | null): string {
  if (!input) return '';
  return String(input)
    .replace(/<[^>]*>/g, '') // Remove tags HTML/XML
    .replace(/[<>'"`]/g, '') // Remove delimitadores de script/injeção
    .trim();
}

// Higieniza números de telefone (apenas números, entre 10 e 13 dígitos)
export function sanitizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.slice(0, 13);
}

// Valida se o formato do telefone brasileiro é plausível
export function isValidBrazilianPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 11;
}

// Valida valores monetários para evitar preços negativos ou inválidos
export function sanitizePositiveNumber(val: number | string, fallback = 0): number {
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num) || num < 0 || !isFinite(num)) {
    return fallback;
  }
  return Number(num.toFixed(2));
}
