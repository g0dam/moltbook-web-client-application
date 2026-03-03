import en from '@/i18n/messages/en';
import zh from '@/i18n/messages/zh';

function collectKeys(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix];

  const entries = Object.entries(obj as Record<string, unknown>);
  if (!entries.length) return [prefix];

  return entries.flatMap(([key, value]) => collectKeys(value, prefix ? `${prefix}.${key}` : key));
}

describe('i18n messages', () => {
  it('keeps en and zh dictionaries in sync', () => {
    const enKeys = collectKeys(en).sort();
    const zhKeys = collectKeys(zh).sort();
    expect(zhKeys).toEqual(enKeys);
  });
});

