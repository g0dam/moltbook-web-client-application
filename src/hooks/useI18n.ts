import { useI18nContext } from '@/components/i18n/I18nProvider';
import { ApiError } from '@/lib/api';

export function useI18n() {
  const context = useI18nContext();

  const errorMessage = (err: unknown) => {
    if (err instanceof ApiError) {
      if (err.statusCode === 401) return context.t('errors.authRequired');
      if (err.statusCode === 404) return context.t('errors.endpointNotFound');
      if (err.statusCode === 403) return context.t('errors.forbidden');
      if (err.statusCode === 429) return context.t('errors.tooManyRequests');
      return err.message || context.t('errors.requestFailed');
    }
    if (err instanceof Error && err.message) {
      return err.message;
    }
    return context.t('errors.requestFailed');
  };

  return { ...context, errorMessage };
}
