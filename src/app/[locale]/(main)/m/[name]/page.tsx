'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { PageContainer } from '@/components/layout';
import { Card, Button } from '@/components/ui';
import { LocalizedLink } from '@/components/i18n/LocalizedLink';
import { GuestGateCard } from '@/components/auth/GuestGateCard';
import { useAuth, useSubmolt } from '@/hooks';
import { useI18n } from '@/hooks/useI18n';
import { api } from '@/lib/api';

export default function SubmoltPage() {
  const params = useParams<{ name: string }>();
  const submoltName = params?.name ?? '';
  const { t, errorMessage } = useI18n();
  const { isAuthenticated } = useAuth();
  const { data: submolt, isLoading: submoltLoading, error: submoltError } = useSubmolt(submoltName);
  const [posts, setPosts] = useState<any[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);
  const [postsError, setPostsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!isAuthenticated || !submoltName) {
      setPosts([]);
      setPostsError(null);
      return () => {
        cancelled = true;
      };
    }

    const load = async () => {
      setIsLoadingPosts(true);
      setPostsError(null);
      try {
        const response = await api.getSubmoltFeed(submoltName, { sort: 'new', limit: 25, offset: 0 });
        if (!cancelled) {
          setPosts(response.data || []);
        }
      } catch (err) {
        if (!cancelled) {
          setPostsError(errorMessage(err));
        }
      } finally {
        if (!cancelled) {
          setIsLoadingPosts(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, submoltName]);

  return (
    <PageContainer>
      <div className="max-w-5xl mx-auto space-y-4">
        {!isAuthenticated ? (
          <GuestGateCard />
        ) : (
          <>
            <Card className="p-5 border-white/10 bg-white/[0.04]">
              {submoltLoading && <p>{t('common.loading')}</p>}
              {submoltError && <p className="text-destructive">{errorMessage(submoltError)}</p>}
              {!submoltLoading && !submoltError && submolt && (
                <>
                  <h1 className="text-2xl font-bold">m/{submolt.name}</h1>
                  <p className="mt-2 text-sm text-white/65">{submolt.description || t('common.noData')}</p>
                </>
              )}
            </Card>

            {isLoadingPosts && <Card className="p-4">{t('common.loading')}</Card>}
            {postsError && <Card className="p-4 border-destructive/40 bg-destructive/10">{postsError}</Card>}

            {!isLoadingPosts && !postsError && (
              <div className="space-y-3">
                {posts.map((post) => (
                  <Card key={post.id} className="p-4 border-white/10 bg-white/[0.03]">
                    <LocalizedLink href={`/listing/${post.id}`} className="font-semibold hover:text-market-200 transition-colors">
                      {post.title}
                    </LocalizedLink>
                    <p className="mt-2 text-sm text-white/65">{post.content || t('common.noData')}</p>
                    <div className="mt-3">
                      <LocalizedLink href={`/listing/${post.id}`}>
                        <Button size="sm" variant="marketGhost">
                          {t('actions.viewDetail')}
                        </Button>
                      </LocalizedLink>
                    </div>
                  </Card>
                ))}
                {posts.length === 0 && <Card className="p-4">{t('pages.home.empty')}</Card>}
              </div>
            )}
          </>
        )}
      </div>
    </PageContainer>
  );
}
