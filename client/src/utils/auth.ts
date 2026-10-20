export interface AdminSession {
  token: string;
  expiresAt: number;
  durationHours: number;
  loggedInAt: number;
}

const SESSION_KEY = 'luky_admin_session';
const LEGACY_AUTH_KEY = 'luky_admin_auth';

export function getStoredSession(): AdminSession | null {
  try {
    // Limpa chave legada caso ainda exista
    if (localStorage.getItem(LEGACY_AUTH_KEY)) {
      localStorage.removeItem(LEGACY_AUTH_KEY);
    }

    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    const session: AdminSession = JSON.parse(raw);
    if (!session || !session.expiresAt) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }

    // Se expirou, descarta imediatamente
    if (Date.now() >= session.expiresAt) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }

    return session;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function saveSession(session: AdminSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch (err) {
    console.error('Erro ao salvar sessão admin:', err);
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(LEGACY_AUTH_KEY);
  } catch (err) {
    console.error('Erro ao limpar sessão admin:', err);
  }
}

export function formatRemainingTime(expiresAt: number): string {
  const diffMs = expiresAt - Date.now();
  if (diffMs <= 0) return 'Expirada';

  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  }
  if (minutes > 0) {
    return `${minutes}min`;
  }
  return 'menos de 1min';
}

export function isExpiringSoon(expiresAt: number, thresholdMinutes = 20): boolean {
  const diffMs = expiresAt - Date.now();
  return diffMs > 0 && diffMs <= thresholdMinutes * 60 * 1000;
}
