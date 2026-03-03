import { withLocale, stripLocale, switchLocale, localeFromPathname } from '@/lib/i18n-routing';

describe('i18n routing helpers', () => {
  it('prefixes locale for plain paths', () => {
    expect(withLocale('/search', 'en')).toBe('/en/search');
    expect(withLocale('/search?q=test', 'zh')).toBe('/zh/search?q=test');
  });

  it('replaces existing locale prefix', () => {
    expect(withLocale('/en/orders', 'zh')).toBe('/zh/orders');
    expect(withLocale('/zh/wallet', 'en')).toBe('/en/wallet');
  });

  it('keeps root correctly localized', () => {
    expect(withLocale('/', 'en')).toBe('/en');
    expect(withLocale('/zh', 'en')).toBe('/en');
  });

  it('strips locale prefix from pathname', () => {
    expect(stripLocale('/en/search')).toBe('/search');
    expect(stripLocale('/zh')).toBe('/');
    expect(stripLocale('/orders')).toBe('/orders');
  });

  it('switches locale while preserving path', () => {
    expect(switchLocale('/en/listing/123?from=feed', 'zh')).toBe('/zh/listing/123?from=feed');
  });

  it('extracts locale from pathname', () => {
    expect(localeFromPathname('/zh/orders')).toBe('zh');
    expect(localeFromPathname('/orders')).toBe('en');
  });
});

