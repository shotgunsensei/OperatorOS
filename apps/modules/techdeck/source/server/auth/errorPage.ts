import type { Request, Response } from "express";

export type FriendlyCopy = { title: string; body: string };

interface Translation {
  pageTitleSuffix: string;
  errorCodeLabel: string;
  backLabel: string;
  fallback: FriendlyCopy;
  codes: Record<string, FriendlyCopy>;
}

const SSO_EN: Translation = {
  pageTitleSuffix: "Tech Deck",
  errorCodeLabel: "Error code",
  backLabel: "Return to OperatorOS",
  fallback: {
    title: "We couldn't complete your sign-in",
    body: "Please return to OperatorOS and try launching Tech Deck again.",
  },
  codes: {
    missing_token: {
      title: "Sign-in link is missing",
      body: "This sign-in link doesn't include the information we need. Please return to OperatorOS and try launching Tech Deck again.",
    },
    bad_request: {
      title: "Sign-in link is malformed",
      body: "We couldn't read your sign-in link. Please return to OperatorOS and try launching Tech Deck again.",
    },
    signature_invalid: {
      title: "Sign-in link couldn't be verified",
      body: "We couldn't verify this sign-in link. Please return to OperatorOS and start a fresh sign-in.",
    },
    issuer_mismatch: {
      title: "Sign-in link is from an unknown source",
      body: "This sign-in link wasn't issued by OperatorOS. Please return to OperatorOS and try again.",
    },
    audience_mismatch: {
      title: "Sign-in link is for a different app",
      body: "This sign-in link wasn't issued for Tech Deck. Please return to OperatorOS and launch Tech Deck from there.",
    },
    env_mismatch: {
      title: "Sign-in link is for a different environment",
      body: "This sign-in link was issued for a different environment. Please return to OperatorOS and try again.",
    },
    expired: {
      title: "Your sign-in link has expired",
      body: "Sign-in links are only valid for a short time. Please return to OperatorOS and start a fresh sign-in.",
    },
    clock_skew: {
      title: "Sign-in link isn't valid yet",
      body: "Your computer's clock may be out of sync. Please check the time on your device, then return to OperatorOS and try again.",
    },
    consume_failed: {
      title: "Sign-in link has already been used",
      body: "Each sign-in link can only be used once. Please return to OperatorOS and start a fresh sign-in.",
    },
    sso_consume_unavailable: {
      title: "We can't reach OperatorOS right now",
      body: "We couldn't reach OperatorOS to complete your sign-in. Please wait a moment, then return to OperatorOS and try again.",
    },
    sso_not_configured: {
      title: "OperatorOS sign-in isn't set up",
      body: "OperatorOS single sign-on isn't configured on this instance of Tech Deck. Please contact your administrator.",
    },
    server_error: {
      title: "Something went wrong on our end",
      body: "We hit an unexpected error completing your sign-in. Please return to OperatorOS and try again.",
    },
    module_access_denied: {
      title: "Access to Tech Deck is managed by OperatorOS",
      body: "Your OperatorOS account doesn't currently have access to Tech Deck. Please return to OperatorOS to enable this module or contact your administrator.",
    },
  },
};

const SSO_ES: Translation = {
  pageTitleSuffix: "Tech Deck",
  errorCodeLabel: "Código de error",
  backLabel: "Volver a OperatorOS",
  fallback: {
    title: "No pudimos completar tu inicio de sesión",
    body: "Vuelve a OperatorOS e intenta abrir Tech Deck de nuevo.",
  },
  codes: {
    missing_token: {
      title: "Falta el enlace de inicio de sesión",
      body: "Este enlace de inicio de sesión no incluye la información que necesitamos. Vuelve a OperatorOS e intenta abrir Tech Deck de nuevo.",
    },
    bad_request: {
      title: "El enlace de inicio de sesión está mal formado",
      body: "No pudimos leer tu enlace de inicio de sesión. Vuelve a OperatorOS e intenta abrir Tech Deck de nuevo.",
    },
    signature_invalid: {
      title: "No se pudo verificar el enlace de inicio de sesión",
      body: "No pudimos verificar este enlace de inicio de sesión. Vuelve a OperatorOS e inicia sesión de nuevo.",
    },
    issuer_mismatch: {
      title: "El enlace de inicio de sesión proviene de una fuente desconocida",
      body: "Este enlace de inicio de sesión no fue emitido por OperatorOS. Vuelve a OperatorOS e inténtalo de nuevo.",
    },
    audience_mismatch: {
      title: "El enlace de inicio de sesión es para otra aplicación",
      body: "Este enlace de inicio de sesión no fue emitido para Tech Deck. Vuelve a OperatorOS y abre Tech Deck desde allí.",
    },
    env_mismatch: {
      title: "El enlace de inicio de sesión es para otro entorno",
      body: "Este enlace de inicio de sesión fue emitido para un entorno diferente. Vuelve a OperatorOS e inténtalo de nuevo.",
    },
    expired: {
      title: "Tu enlace de inicio de sesión ha caducado",
      body: "Los enlaces de inicio de sesión solo son válidos durante un corto periodo. Vuelve a OperatorOS e inicia sesión de nuevo.",
    },
    clock_skew: {
      title: "El enlace de inicio de sesión aún no es válido",
      body: "El reloj de tu equipo puede estar desajustado. Comprueba la hora de tu dispositivo y vuelve a OperatorOS para intentarlo de nuevo.",
    },
    consume_failed: {
      title: "El enlace de inicio de sesión ya se ha usado",
      body: "Cada enlace de inicio de sesión solo puede usarse una vez. Vuelve a OperatorOS e inicia sesión de nuevo.",
    },
    sso_consume_unavailable: {
      title: "No podemos contactar con OperatorOS en este momento",
      body: "No pudimos contactar con OperatorOS para completar tu inicio de sesión. Espera un momento y vuelve a OperatorOS para intentarlo de nuevo.",
    },
    sso_not_configured: {
      title: "El inicio de sesión de OperatorOS no está configurado",
      body: "El inicio de sesión único de OperatorOS no está configurado en esta instancia de Tech Deck. Contacta con tu administrador.",
    },
    server_error: {
      title: "Algo salió mal en nuestro extremo",
      body: "Encontramos un error inesperado al completar tu inicio de sesión. Vuelve a OperatorOS e inténtalo de nuevo.",
    },
    module_access_denied: {
      title: "El acceso a Tech Deck lo gestiona OperatorOS",
      body: "Tu cuenta de OperatorOS no tiene acceso a Tech Deck en este momento. Vuelve a OperatorOS para habilitar este módulo o contacta con tu administrador.",
    },
  },
};

const SSO_FR: Translation = {
  pageTitleSuffix: "Tech Deck",
  errorCodeLabel: "Code d'erreur",
  backLabel: "Retour à OperatorOS",
  fallback: {
    title: "Nous n'avons pas pu finaliser votre connexion",
    body: "Veuillez retourner sur OperatorOS et relancer Tech Deck.",
  },
  codes: {
    missing_token: {
      title: "Le lien de connexion est incomplet",
      body: "Ce lien de connexion ne contient pas les informations nécessaires. Veuillez retourner sur OperatorOS et relancer Tech Deck.",
    },
    bad_request: {
      title: "Le lien de connexion est mal formé",
      body: "Nous n'avons pas pu lire votre lien de connexion. Veuillez retourner sur OperatorOS et relancer Tech Deck.",
    },
    signature_invalid: {
      title: "Le lien de connexion n'a pas pu être vérifié",
      body: "Nous n'avons pas pu vérifier ce lien de connexion. Veuillez retourner sur OperatorOS et lancer une nouvelle connexion.",
    },
    issuer_mismatch: {
      title: "Le lien de connexion provient d'une source inconnue",
      body: "Ce lien de connexion n'a pas été émis par OperatorOS. Veuillez retourner sur OperatorOS et réessayer.",
    },
    audience_mismatch: {
      title: "Le lien de connexion est destiné à une autre application",
      body: "Ce lien de connexion n'a pas été émis pour Tech Deck. Veuillez retourner sur OperatorOS et lancer Tech Deck depuis cette interface.",
    },
    env_mismatch: {
      title: "Le lien de connexion concerne un autre environnement",
      body: "Ce lien de connexion a été émis pour un environnement différent. Veuillez retourner sur OperatorOS et réessayer.",
    },
    expired: {
      title: "Votre lien de connexion a expiré",
      body: "Les liens de connexion ne sont valides que pendant une courte durée. Veuillez retourner sur OperatorOS et lancer une nouvelle connexion.",
    },
    clock_skew: {
      title: "Le lien de connexion n'est pas encore valide",
      body: "L'horloge de votre appareil est peut-être désynchronisée. Vérifiez l'heure de votre appareil, puis retournez sur OperatorOS pour réessayer.",
    },
    consume_failed: {
      title: "Le lien de connexion a déjà été utilisé",
      body: "Chaque lien de connexion ne peut être utilisé qu'une seule fois. Veuillez retourner sur OperatorOS et lancer une nouvelle connexion.",
    },
    sso_consume_unavailable: {
      title: "Nous ne parvenons pas à joindre OperatorOS pour le moment",
      body: "Nous n'avons pas pu contacter OperatorOS pour finaliser votre connexion. Patientez un instant, puis retournez sur OperatorOS pour réessayer.",
    },
    sso_not_configured: {
      title: "La connexion OperatorOS n'est pas configurée",
      body: "L'authentification unique OperatorOS n'est pas configurée sur cette instance de Tech Deck. Veuillez contacter votre administrateur.",
    },
    server_error: {
      title: "Une erreur s'est produite de notre côté",
      body: "Une erreur inattendue est survenue lors de votre connexion. Veuillez retourner sur OperatorOS et réessayer.",
    },
    module_access_denied: {
      title: "L'accès à Tech Deck est géré par OperatorOS",
      body: "Votre compte OperatorOS n'a pas actuellement accès à Tech Deck. Veuillez retourner sur OperatorOS pour activer ce module ou contacter votre administrateur.",
    },
  },
};

const SSO_DE: Translation = {
  pageTitleSuffix: "Tech Deck",
  errorCodeLabel: "Fehlercode",
  backLabel: "Zurück zu OperatorOS",
  fallback: {
    title: "Anmeldung konnte nicht abgeschlossen werden",
    body: "Bitte kehren Sie zu OperatorOS zurück und starten Sie Tech Deck erneut.",
  },
  codes: {
    missing_token: {
      title: "Der Anmeldelink ist unvollständig",
      body: "Diesem Anmeldelink fehlen die erforderlichen Informationen. Bitte kehren Sie zu OperatorOS zurück und starten Sie Tech Deck erneut.",
    },
    bad_request: {
      title: "Der Anmeldelink ist fehlerhaft",
      body: "Ihr Anmeldelink konnte nicht gelesen werden. Bitte kehren Sie zu OperatorOS zurück und starten Sie Tech Deck erneut.",
    },
    signature_invalid: {
      title: "Der Anmeldelink konnte nicht überprüft werden",
      body: "Dieser Anmeldelink konnte nicht verifiziert werden. Bitte kehren Sie zu OperatorOS zurück und starten Sie eine neue Anmeldung.",
    },
    issuer_mismatch: {
      title: "Der Anmeldelink stammt aus einer unbekannten Quelle",
      body: "Dieser Anmeldelink wurde nicht von OperatorOS ausgestellt. Bitte kehren Sie zu OperatorOS zurück und versuchen Sie es erneut.",
    },
    audience_mismatch: {
      title: "Der Anmeldelink ist für eine andere App",
      body: "Dieser Anmeldelink wurde nicht für Tech Deck ausgestellt. Bitte kehren Sie zu OperatorOS zurück und starten Sie Tech Deck von dort aus.",
    },
    env_mismatch: {
      title: "Der Anmeldelink ist für eine andere Umgebung",
      body: "Dieser Anmeldelink wurde für eine andere Umgebung ausgestellt. Bitte kehren Sie zu OperatorOS zurück und versuchen Sie es erneut.",
    },
    expired: {
      title: "Ihr Anmeldelink ist abgelaufen",
      body: "Anmeldelinks sind nur kurze Zeit gültig. Bitte kehren Sie zu OperatorOS zurück und starten Sie eine neue Anmeldung.",
    },
    clock_skew: {
      title: "Der Anmeldelink ist noch nicht gültig",
      body: "Die Uhr Ihres Geräts ist möglicherweise nicht synchron. Bitte überprüfen Sie die Uhrzeit Ihres Geräts und kehren Sie dann zu OperatorOS zurück, um es erneut zu versuchen.",
    },
    consume_failed: {
      title: "Der Anmeldelink wurde bereits verwendet",
      body: "Jeder Anmeldelink kann nur einmal verwendet werden. Bitte kehren Sie zu OperatorOS zurück und starten Sie eine neue Anmeldung.",
    },
    sso_consume_unavailable: {
      title: "OperatorOS ist derzeit nicht erreichbar",
      body: "Wir konnten OperatorOS nicht erreichen, um Ihre Anmeldung abzuschließen. Bitte warten Sie einen Moment und kehren Sie dann zu OperatorOS zurück, um es erneut zu versuchen.",
    },
    sso_not_configured: {
      title: "OperatorOS-Anmeldung ist nicht eingerichtet",
      body: "Die OperatorOS-Single-Sign-On-Funktion ist auf dieser Tech Deck-Instanz nicht konfiguriert. Bitte wenden Sie sich an Ihren Administrator.",
    },
    server_error: {
      title: "Auf unserer Seite ist etwas schiefgelaufen",
      body: "Beim Abschluss Ihrer Anmeldung ist ein unerwarteter Fehler aufgetreten. Bitte kehren Sie zu OperatorOS zurück und versuchen Sie es erneut.",
    },
    module_access_denied: {
      title: "Der Zugriff auf Tech Deck wird von OperatorOS verwaltet",
      body: "Ihr OperatorOS-Konto hat derzeit keinen Zugriff auf Tech Deck. Bitte kehren Sie zu OperatorOS zurück, um dieses Modul zu aktivieren, oder wenden Sie sich an Ihren Administrator.",
    },
  },
};

const SSO_PT: Translation = {
  pageTitleSuffix: "Tech Deck",
  errorCodeLabel: "Código de erro",
  backLabel: "Voltar para o OperatorOS",
  fallback: {
    title: "Não foi possível concluir o seu início de sessão",
    body: "Volte ao OperatorOS e tente abrir o Tech Deck novamente.",
  },
  codes: {
    missing_token: {
      title: "O link de início de sessão está incompleto",
      body: "Este link de início de sessão não inclui as informações necessárias. Volte ao OperatorOS e tente abrir o Tech Deck novamente.",
    },
    bad_request: {
      title: "O link de início de sessão está malformado",
      body: "Não foi possível ler o seu link de início de sessão. Volte ao OperatorOS e tente abrir o Tech Deck novamente.",
    },
    signature_invalid: {
      title: "Não foi possível verificar o link de início de sessão",
      body: "Não conseguimos verificar este link de início de sessão. Volte ao OperatorOS e inicie uma nova sessão.",
    },
    issuer_mismatch: {
      title: "O link de início de sessão vem de uma origem desconhecida",
      body: "Este link de início de sessão não foi emitido pelo OperatorOS. Volte ao OperatorOS e tente novamente.",
    },
    audience_mismatch: {
      title: "O link de início de sessão é para outra aplicação",
      body: "Este link de início de sessão não foi emitido para o Tech Deck. Volte ao OperatorOS e abra o Tech Deck a partir de lá.",
    },
    env_mismatch: {
      title: "O link de início de sessão é para outro ambiente",
      body: "Este link de início de sessão foi emitido para um ambiente diferente. Volte ao OperatorOS e tente novamente.",
    },
    expired: {
      title: "O seu link de início de sessão expirou",
      body: "Os links de início de sessão só são válidos por um curto período. Volte ao OperatorOS e inicie uma nova sessão.",
    },
    clock_skew: {
      title: "O link de início de sessão ainda não é válido",
      body: "O relógio do seu computador pode estar dessincronizado. Verifique a hora no seu dispositivo e volte ao OperatorOS para tentar novamente.",
    },
    consume_failed: {
      title: "O link de início de sessão já foi utilizado",
      body: "Cada link de início de sessão só pode ser utilizado uma vez. Volte ao OperatorOS e inicie uma nova sessão.",
    },
    sso_consume_unavailable: {
      title: "Não conseguimos contactar o OperatorOS neste momento",
      body: "Não conseguimos contactar o OperatorOS para concluir o seu início de sessão. Aguarde um momento e volte ao OperatorOS para tentar novamente.",
    },
    sso_not_configured: {
      title: "O início de sessão do OperatorOS não está configurado",
      body: "O início de sessão único do OperatorOS não está configurado nesta instância do Tech Deck. Contacte o seu administrador.",
    },
    server_error: {
      title: "Algo correu mal do nosso lado",
      body: "Ocorreu um erro inesperado ao concluir o seu início de sessão. Volte ao OperatorOS e tente novamente.",
    },
    module_access_denied: {
      title: "O acesso ao Tech Deck é gerido pelo OperatorOS",
      body: "A sua conta OperatorOS não tem atualmente acesso ao Tech Deck. Volte ao OperatorOS para ativar este módulo ou contacte o seu administrador.",
    },
  },
};

const SSO_TRANSLATIONS: Record<string, Translation> = {
  en: SSO_EN,
  es: SSO_ES,
  fr: SSO_FR,
  de: SSO_DE,
  pt: SSO_PT,
};

const AUTH_EN: Translation = {
  pageTitleSuffix: "Tech Deck",
  errorCodeLabel: "Error code",
  backLabel: "Return to sign in",
  fallback: {
    title: "We couldn't complete your request",
    body: "Please return to the previous page and try again.",
  },
  codes: {
    invalid_input: {
      title: "We couldn't read your sign-in details",
      body: "Some of the information you submitted was missing or in an unexpected format. Please return to the sign-in page and try again.",
    },
    invalid_credentials: {
      title: "Those sign-in details didn't work",
      body: "Your email or password didn't match what we have on file. Please return to the sign-in page and try again.",
    },
    account_locked: {
      title: "Your account is temporarily locked",
      body: "Too many failed sign-in attempts. Please wait about 15 minutes before trying again, or reset your password.",
    },
    rate_limited: {
      title: "Too many attempts",
      body: "You've made too many sign-in attempts in a short time. Please wait a few minutes and try again.",
    },
    csrf_invalid: {
      title: "Your session has expired",
      body: "Your sign-in session expired before you could finish. Please return to the sign-in page and start again.",
    },
    email_exists: {
      title: "That email is already registered",
      body: "An account with this email address already exists. Please sign in instead, or use a different email to register.",
    },
    local_register_disabled: {
      title: "Registration is managed by OperatorOS",
      body: "Direct Tech Deck registration is disabled in production. Please launch Tech Deck from OperatorOS or contact your administrator.",
    },
    local_login_disabled: {
      title: "Sign in from OperatorOS",
      body: "Direct password login is reserved for system administrators in production. Please return to OperatorOS and launch Tech Deck from there.",
    },
    managed_by_operatoros: {
      title: "Continue in OperatorOS",
      body: "Tech Deck identity actions are managed by OperatorOS. Please return to OperatorOS to sign in, manage account security, or request module access.",
    },
    module_access_denied: {
      title: "Access is managed by OperatorOS",
      body: "Your current session no longer has Tech Deck access. Please return to OperatorOS to refresh access or contact your administrator.",
    },
    registration_failed: {
      title: "We couldn't create your account",
      body: "Something went wrong creating your account. Please return to the sign-up page and try again.",
    },
    mfa_session_missing: {
      title: "Your verification session expired",
      body: "We don't have a pending verification for you. Please return to the sign-in page and start again.",
    },
    mfa_code_required: {
      title: "Verification code is required",
      body: "Please return to the verification page and enter the code from your authenticator app.",
    },
    mfa_code_invalid: {
      title: "That verification code didn't work",
      body: "The code you entered didn't match. Please return to the verification page and try again, or use a recovery code.",
    },
    mfa_setup_missing: {
      title: "No setup in progress",
      body: "There's no MFA setup in progress for your account. Please return to account security and start setup again.",
    },
    mfa_disable_failed: {
      title: "We couldn't turn off MFA",
      body: "We weren't able to disable multi-factor authentication. Please return to account security and try again.",
    },
    password_required: {
      title: "Password is required",
      body: "Please return to the form and provide your current password to continue.",
    },
    password_invalid: {
      title: "That password didn't match",
      body: "The password you entered was incorrect. Please return to the form and try again.",
    },
    password_too_short: {
      title: "That password is too short",
      body: "Your new password must be at least 8 characters. Please return to the change-password form and try again.",
    },
    password_change_failed: {
      title: "We couldn't change your password",
      body: "Something went wrong updating your password. Please return to account security and try again.",
    },
    not_authenticated: {
      title: "Please sign in first",
      body: "You need to be signed in to view this page. Please return to the sign-in page to continue.",
    },
    user_not_found: {
      title: "We couldn't find your account",
      body: "Your account record couldn't be located. Please sign in again or contact your administrator.",
    },
    logout_failed: {
      title: "We couldn't sign you out",
      body: "Something went wrong ending your session. Please close your browser to be safe, then sign in again.",
    },
    server_error: {
      title: "Something went wrong on our end",
      body: "We hit an unexpected error. Please return to the sign-in page and try again.",
    },
  },
};

const AUTH_TRANSLATIONS: Record<string, Translation> = {
  en: AUTH_EN,
};

const DEFAULT_LANG = "en";

function operatorOsAuthUrl(): string {
  if (process.env.OPERATOROS_AUTH_URL) return process.env.OPERATOROS_AUTH_URL.replace(/\/$/, "");
  const base = (process.env.OPERATOROS_BASE_URL || "https://operatoros.net").replace(/\/$/, "");
  return `${base}/login`;
}

/**
 * Pick a translation based on (in order):
 *   1. explicit `langOverride` (currently sourced from the `?lang=` query
 *      parameter; future callers may also pass a JWT `lang` claim here)
 *   2. the request's `Accept-Language` header (q-value aware)
 *   3. English fallback
 *
 * Both full tags (`es-MX`) and bare primary subtags (`es`) match the same
 * translation bucket.
 */
export function pickLanguage(
  acceptLanguage: string | undefined,
  langOverride?: string,
  supportedTags: string[] = Object.keys(SSO_TRANSLATIONS),
): string {
  const supported = supportedTags;
  const match = (tag: string | undefined): string | null => {
    if (!tag) return null;
    const lower = tag.toLowerCase();
    if (supported.includes(lower)) return lower;
    const primary = lower.split("-")[0];
    if (supported.includes(primary)) return primary;
    return null;
  };

  const overrideMatch = match(langOverride);
  if (overrideMatch) return overrideMatch;

  if (typeof acceptLanguage === "string" && acceptLanguage.length > 0) {
    const entries = acceptLanguage
      .split(",")
      .map((part) => {
        const [rawTag, ...params] = part.trim().split(";");
        let q = 1;
        for (const p of params) {
          const [k, v] = p.trim().split("=");
          if (k === "q") {
            const parsed = parseFloat(v);
            if (!Number.isNaN(parsed)) q = parsed;
          }
        }
        return { tag: rawTag.trim(), q };
      })
      .filter((e) => e.tag && e.q > 0)
      .sort((a, b) => b.q - a.q);
    for (const e of entries) {
      const m = match(e.tag);
      if (m) return m;
    }
  }

  return DEFAULT_LANG;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function wantsHtml(req: Request): boolean {
  const accept = req.headers.accept;
  if (typeof accept !== "string" || accept.length === 0) return false;
  const best = req.accepts(["application/json", "text/html"]);
  return best === "text/html";
}

type RenderOptions = {
  translation: Translation;
  lang: string;
  backLink?: { href: string; testId?: string };
  testIdPrefix: string;
};

function renderPage(code: string, message: string, opts: RenderOptions): string {
  const t = opts.translation;
  const copy = t.codes[code] || t.fallback;
  const title = escapeHtml(copy.title);
  const body = escapeHtml(copy.body);
  const safeCode = escapeHtml(code);
  const safeMessage = escapeHtml(message);
  const safeLang = escapeHtml(opts.lang);
  const prefix = opts.testIdPrefix;
  const backLink = opts.backLink
    ? `<a class="back" href="${escapeHtml(opts.backLink.href)}" data-testid="${escapeHtml(opts.backLink.testId ?? "link-back")}">${escapeHtml(t.backLabel)}</a>`
    : "";

  return `<!DOCTYPE html>
<html lang="${safeLang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>${title} · ${escapeHtml(t.pageTitleSuffix)}</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #f6f7f9;
      color: #1a1a1a;
      padding: 24px;
    }
    @media (prefers-color-scheme: dark) {
      body { background: #0d1117; color: #e6edf3; }
      .card { background: #161b22; border-color: #30363d; }
      .meta { color: #8b949e; }
      .back { background: #238636; color: #fff; }
      .back:hover { background: #2ea043; }
    }
    .card {
      max-width: 480px;
      width: 100%;
      background: #fff;
      border: 1px solid #e1e4e8;
      border-radius: 12px;
      padding: 32px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.06);
    }
    h1 {
      margin: 0 0 12px;
      font-size: 22px;
      line-height: 1.3;
    }
    p {
      margin: 0 0 20px;
      font-size: 15px;
      line-height: 1.55;
    }
    .back {
      display: inline-block;
      padding: 10px 18px;
      background: #1f6feb;
      color: #fff;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      font-size: 14px;
    }
    .back:hover { background: #388bfd; }
    .meta {
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid #e1e4e8;
      font-size: 12px;
      color: #6e7781;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    @media (prefers-color-scheme: dark) {
      .meta { border-top-color: #30363d; }
    }
  </style>
</head>
<body>
  <main class="card" role="alert" data-testid="${escapeHtml(prefix)}-card">
    <h1 data-testid="text-${escapeHtml(prefix)}-title">${title}</h1>
    <p data-testid="text-${escapeHtml(prefix)}-body">${body}</p>
    ${backLink}
    <div class="meta" data-testid="text-${escapeHtml(prefix)}-meta">
      ${escapeHtml(t.errorCodeLabel)}: ${safeCode}<br />
      ${safeMessage}
    </div>
  </main>
</body>
</html>`;
}

export interface RenderSsoErrorPageOptions {
  acceptLanguage?: string;
  langOverride?: string;
}

export function renderSsoErrorPage(
  code: string,
  message: string,
  operatorOsBaseUrl?: string,
  opts: RenderSsoErrorPageOptions = {},
): string {
  const lang = pickLanguage(opts.acceptLanguage, opts.langOverride, Object.keys(SSO_TRANSLATIONS));
  return renderPage(code, message, {
    translation: SSO_TRANSLATIONS[lang],
    lang,
    testIdPrefix: "sso-error",
    backLink: operatorOsBaseUrl
      ? { href: operatorOsBaseUrl, testId: "link-back-to-operatoros" }
      : undefined,
  });
}

export function ssoErrorPageOptionsFromRequest(req: Request): RenderSsoErrorPageOptions {
  const acceptLanguage =
    typeof req.headers["accept-language"] === "string"
      ? (req.headers["accept-language"] as string)
      : undefined;
  const langQuery = req.query?.lang;
  const langOverride = typeof langQuery === "string" ? langQuery : undefined;
  return { acceptLanguage, langOverride };
}

export function renderAuthErrorPage(code: string, message: string): string {
  const lang = DEFAULT_LANG;
  return renderPage(code, message, {
    translation: AUTH_TRANSLATIONS[lang],
    lang,
    testIdPrefix: "auth-error",
    backLink: { href: operatorOsAuthUrl(), testId: "link-back-to-operatoros" },
  });
}

/**
 * Content-negotiated error responder for `/api/auth/*` and related auth
 * endpoints. Browser clients (Accept: text/html) get a styled error page;
 * API clients (default, or Accept: application/json) keep getting the
 * existing `{ message }` JSON contract.
 */
export function sendAuthError(
  req: Request,
  res: Response,
  status: number,
  code: string,
  message: string,
): void {
  if (wantsHtml(req)) {
    const html = renderAuthErrorPage(code, message);
    res.status(status).type("html").send(html);
    return;
  }
  res.status(status).json({ message, code });
}
