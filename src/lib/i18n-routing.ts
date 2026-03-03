import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from '@/i18n/config';

const EXTERNAL_URL_PATTERN = /^(https?:\/\/|mailto:|tel:|#)/i;

export function extractLocale(pathname: string): Locale | null {
  const segments = pathname.split('/').filter(Boolean);
  const maybeLocale = segments[0];
  return SUPPORTED_LOCALES.includes(maybeLocale as Locale) ? (maybeLocale as Locale) : null;
}

export function stripLocale(pathname: string): string {
  if (!pathname) return '/';
  const [pathWithoutHash] = pathname.split('#');
  const [pathPart] = pathWithoutHash.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  const first = segments[0];
  if (SUPPORTED_LOCALES.includes(first as Locale)) {
    const rest = segments.slice(1).join('/');
    return rest ? `/${rest}` : '/';
  }
  return pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
}

export function withLocale(path: string, locale: Locale = DEFAULT_LOCALE): string {
  if (!path) return `/${locale}`;
  if (EXTERNAL_URL_PATTERN.test(path)) return path;

  const hashIndex = path.indexOf('#');
  const queryIndex = path.indexOf('?');
  const splitIndex =
    hashIndex === -1
      ? queryIndex
      : queryIndex === -1
      ? hashIndex
      : Math.min(hashIndex, queryIndex);

  const pathPart = splitIndex === -1 ? path : path.slice(0, splitIndex);
  const suffix = splitIndex === -1 ? '' : path.slice(splitIndex);
  const normalizedPath = stripLocale(pathPart);

  return normalizedPath === '/' ? `/${locale}${suffix}` : `/${locale}${normalizedPath}${suffix}`;
}

export function switchLocale(pathname: string, targetLocale: Locale): string {
  return withLocale(pathname, targetLocale);
}

export function localeFromPathname(pathname: string): Locale {
  return extractLocale(pathname) || DEFAULT_LOCALE;
}

