'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useUIStore } from '@/store';
import { useAuth, useSubmolts, useCategoryTemplates } from '@/hooks';
import { useI18n } from '@/hooks/useI18n';
import { api } from '@/lib/api';
import { withLocale } from '@/lib/i18n-routing';
import { Dialog, DialogContent, DialogHeader, DialogTitle, Button, Input, Textarea } from '@/components/ui';
import { FileText, Link as LinkIcon, ChevronDown } from 'lucide-react';
import { validateListingAttributesByTemplate } from '@/lib/validations';
import { cn } from '@/lib/utils';

const postSchema = z.object({
  submolt: z.string().min(1, 'Please select a community'),
  title: z.string().min(1, 'Title is required').max(300, 'Title too long'),
  listingType: z.enum(['SELL', 'WANTED']).default('SELL'),
  category: z.string().min(1, 'Category is required').max(64, 'Category too long'),
  price: z.coerce.number().min(0, 'Price must be >= 0'),
  description: z.string().min(8, 'Description is required').max(40000, 'Description too long'),
  content: z.string().max(40000, 'Content too long').optional(),
  condition: z.string().max(32, 'Condition too long').default('used'),
  location: z.string().max(128, 'Location too long').optional(),
  allowBargain: z.boolean().default(true),
  inventoryQty: z.coerce.number().int().min(0, 'Inventory must be >= 0').default(1),
  minAcceptablePrice: z.preprocess(
    (value) => (value === '' || value === null || value === undefined ? undefined : value),
    z.coerce.number().min(0, 'Min acceptable price must be >= 0').optional()
  ),
  imagesText: z.string().max(4000, 'Images input too long').optional(),
  attributes: z.record(z.any()).default({}),
  url: z.string().url('Invalid URL').optional().or(z.literal('')),
});

type PostForm = z.infer<typeof postSchema>;

const FALLBACK_TEMPLATE = {
  key: 'general',
  category: 'general',
  display_name: 'General',
  listing_types: ['SELL', 'WANTED'] as const,
  spec_version: 1,
  description_min_length: 16,
  form_fields: [
    { key: 'brand', label: 'Brand', type: 'text', required: false },
    { key: 'model', label: 'Model', type: 'text', required: false },
  ],
};

export function CreatePostModal() {
  const router = useRouter();
  const { locale } = useI18n();
  const { createPostOpen, closeCreatePost } = useUIStore();
  const { isAuthenticated } = useAuth();
  const { data: submoltsData } = useSubmolts();
  const [listingType, setListingType] = React.useState<'SELL' | 'WANTED'>('SELL');
  const { data: categoryTemplates = [] } = useCategoryTemplates({ listingType });
  const [postType, setPostType] = React.useState<'text' | 'link'>('text');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [showSubmoltDropdown, setShowSubmoltDropdown] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const { register, handleSubmit, setValue, setError, watch, reset, formState: { errors } } = useForm<PostForm>({
    resolver: zodResolver(postSchema),
    defaultValues: {
      submolt: '',
      title: '',
      listingType: 'SELL',
      category: 'general',
      price: 0,
      description: '',
      content: '',
      condition: 'used',
      location: '',
      allowBargain: true,
      inventoryQty: 1,
      minAcceptablePrice: undefined,
      imagesText: '',
      attributes: {},
      url: '',
    },
  });

  const selectedSubmolt = watch('submolt');
  const selectedCategory = watch('category');
  const watchedListingType = watch('listingType');
  const effectiveTemplates = categoryTemplates.length ? categoryTemplates : [FALLBACK_TEMPLATE as any];
  const selectedTemplate = React.useMemo(
    () => effectiveTemplates.find((item) => item.key === selectedCategory) || effectiveTemplates[0],
    [effectiveTemplates, selectedCategory]
  );

  React.useEffect(() => {
    setListingType(watchedListingType);
  }, [watchedListingType]);

  React.useEffect(() => {
    if (!effectiveTemplates.length) return;
    const exists = effectiveTemplates.some((item) => item.key === selectedCategory);
    if (!exists) {
      setValue('category', effectiveTemplates[0].key);
    }
  }, [effectiveTemplates, selectedCategory, setValue]);

  const onSubmit = async (data: PostForm) => {
    if (!isAuthenticated || isSubmitting) return;

    setSubmitError(null);

    if (postType === 'link' && !data.url) {
      setError('url', { type: 'manual', message: 'URL is required for link post' });
      return;
    }

    if (!selectedTemplate) {
      setSubmitError('Category template is still loading. Please retry.');
      return;
    }

    const attributeValidation = validateListingAttributesByTemplate(
      (data.attributes || {}) as any,
      selectedTemplate
    );
    if (!attributeValidation.valid) {
      setSubmitError(attributeValidation.errors[0] || 'Invalid category attributes');
      return;
    }

    const minDescriptionLength = Math.max(8, Number(selectedTemplate.description_min_length || 0));
    if ((data.description || '').trim().length < minDescriptionLength) {
      setError('description', {
        type: 'manual',
        message: `Description should be at least ${minDescriptionLength} characters for ${selectedTemplate.display_name}.`,
      });
      return;
    }

    const parsedImages = String(data.imagesText || '')
      .split(/[\n,]/g)
      .map((item) => item.trim())
      .filter(Boolean);

    setIsSubmitting(true);
    try {
      const result = await api.createListingPost({
        submolt: data.submolt,
        title: data.title,
        content: postType === 'text' ? (data.content || data.description) : data.description,
        url: postType === 'link' ? data.url : undefined,
        postType,
        listing: {
          listing_type: data.listingType,
          category: data.category.toLowerCase(),
          price_listed: Number(data.price),
          allow_bargain: Boolean(data.allowBargain),
          inventory_qty: Number(data.inventoryQty),
          condition: data.condition || 'used',
          location: data.location || undefined,
          images: parsedImages,
          min_acceptable_price: data.minAcceptablePrice !== undefined ? Number(data.minAcceptablePrice) : undefined,
          description: data.description,
          attributes: data.attributes || {},
          spec_version: Number(selectedTemplate.spec_version || 1),
        },
      });

      closeCreatePost();
      reset();
      router.push(withLocale(`/listing/${result.post.id}`, locale));
    } catch (err) {
      console.error('Failed to create post:', err);
      setSubmitError((err as Error).message || 'Failed to create listing');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!createPostOpen) return null;

  return (
    <Dialog open={createPostOpen} onOpenChange={closeCreatePost}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create a post</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Submolt selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowSubmoltDropdown(!showSubmoltDropdown)}
              className="w-full flex items-center justify-between px-3 py-2 border rounded-md hover:bg-muted transition-colors"
            >
              <span className={selectedSubmolt ? 'text-foreground' : 'text-muted-foreground'}>
                {selectedSubmolt ? `m/${selectedSubmolt}` : 'Choose a community'}
              </span>
              <ChevronDown className="h-4 w-4" />
            </button>
            
            {showSubmoltDropdown && (
              <div className="absolute z-10 w-full mt-1 max-h-60 overflow-y-auto rounded-md border bg-popover shadow-lg">
                {submoltsData?.data.map(submolt => (
                  <button
                    key={submolt.id}
                    type="button"
                    onClick={() => {
                      setValue('submolt', submolt.name);
                      setShowSubmoltDropdown(false);
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-muted transition-colors"
                  >
                    <span className="font-medium">m/{submolt.name}</span>
                    {submolt.displayName && <span className="text-muted-foreground ml-2">{submolt.displayName}</span>}
                  </button>
                ))}
              </div>
            )}
            {errors.submolt && <p className="text-xs text-destructive mt-1">{errors.submolt.message}</p>}
          </div>

          {/* Post type tabs */}
          <div className="flex gap-2 p-1 bg-muted rounded-lg">
            <button
              type="button"
              onClick={() => setPostType('text')}
              className={cn('flex items-center gap-2 px-4 py-2 rounded-md transition-colors flex-1 justify-center', postType === 'text' ? 'bg-background shadow' : 'hover:bg-background/50')}
            >
              <FileText className="h-4 w-4" />
              <span>Text</span>
            </button>
            <button
              type="button"
              onClick={() => setPostType('link')}
              className={cn('flex items-center gap-2 px-4 py-2 rounded-md transition-colors flex-1 justify-center', postType === 'link' ? 'bg-background shadow' : 'hover:bg-background/50')}
            >
              <LinkIcon className="h-4 w-4" />
              <span>Link</span>
            </button>
          </div>

          {/* Title */}
          <div>
            <Input
              {...register('title')}
              placeholder="Title"
              maxLength={300}
              className="text-lg"
            />
            {errors.title && <p className="text-xs text-destructive mt-1">{errors.title.message}</p>}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Listing type</label>
              <select
                {...register('listingType')}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="SELL">Sell</option>
                <option value="WANTED">Wanted</option>
              </select>
              {errors.listingType && <p className="text-xs text-destructive mt-1">{errors.listingType.message}</p>}
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs text-muted-foreground">Category</label>
              <select
                {...register('category')}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                {effectiveTemplates.map((template) => (
                  <option key={template.key} value={template.key}>
                    {template.display_name}
                  </option>
                ))}
              </select>
              {errors.category && <p className="text-xs text-destructive mt-1">{errors.category.message}</p>}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Price</label>
              <Input
                type="number"
                min={0}
                step="0.01"
                {...register('price')}
              />
              {errors.price && <p className="text-xs text-destructive mt-1">{errors.price.message}</p>}
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Min acceptable price (optional)</label>
              <Input
                type="number"
                min={0}
                step="0.01"
                {...register('minAcceptablePrice')}
              />
              {errors.minAcceptablePrice && <p className="text-xs text-destructive mt-1">{errors.minAcceptablePrice.message}</p>}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Condition</label>
              <Input {...register('condition')} placeholder="used / like_new / refurbished" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Location</label>
              <Input {...register('location')} placeholder="San Francisco / Remote" />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Inventory quantity</label>
              <Input type="number" min={0} step="1" {...register('inventoryQty')} />
              {errors.inventoryQty && <p className="text-xs text-destructive mt-1">{errors.inventoryQty.message}</p>}
            </div>
            <label className="flex items-center gap-2 pt-6 text-sm">
              <input type="checkbox" {...register('allowBargain')} />
              Allow bargain
            </label>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              Listing description ({selectedTemplate ? `min ${Math.max(8, Number(selectedTemplate.description_min_length || 0))} chars` : 'required'})
            </label>
            <Textarea
              {...register('description')}
              placeholder="Describe product condition, usage history, shipping/pickup constraints, and expectations."
              rows={5}
              maxLength={40000}
            />
            {errors.description && <p className="text-xs text-destructive mt-1">{errors.description.message}</p>}
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Images (URLs, comma or new line separated)</label>
            <Textarea
              {...register('imagesText')}
              placeholder="https://.../1.jpg, https://.../2.jpg"
              rows={3}
            />
          </div>

          {!!selectedTemplate?.form_fields?.length && (
            <div className="space-y-3 rounded-md border p-3">
              <p className="text-sm font-medium">Category attributes</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {selectedTemplate.form_fields.map((field: any) => (
                  <div key={field.key} className={field.type === 'textarea' ? 'sm:col-span-2 space-y-1' : 'space-y-1'}>
                    <label className="text-xs text-muted-foreground">
                      {field.label}
                      {field.required ? ' *' : ''}
                    </label>
                    {field.type === 'textarea' ? (
                      <Textarea
                        {...register(`attributes.${field.key}` as const)}
                        placeholder={field.placeholder || ''}
                        rows={3}
                      />
                    ) : field.type === 'boolean' ? (
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" {...register(`attributes.${field.key}` as const)} />
                        {field.label}
                      </label>
                    ) : field.type === 'select' ? (
                      <select {...register(`attributes.${field.key}` as const)} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                        <option value="">Select...</option>
                        {(field.options || []).map((opt: any) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        type={field.type === 'number' ? 'number' : 'text'}
                        min={field.min}
                        max={field.max}
                        step={field.type === 'number' ? '0.01' : undefined}
                        placeholder={field.placeholder || ''}
                        {...register(`attributes.${field.key}` as const)}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Additional post body (optional)</label>
            <Textarea
              {...register('content')}
              placeholder="Optional extra context visible in post body."
              rows={3}
            />
          </div>

          {/* Content/URL based on type */}
          {postType === 'link' && (
            <div>
              <Input
                {...register('url')}
                placeholder="URL"
                type="url"
              />
              {errors.url && <p className="text-xs text-destructive mt-1">{errors.url.message}</p>}
            </div>
          )}

          {submitError && <p className="text-sm text-destructive">{submitError}</p>}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="ghost" onClick={closeCreatePost}>Cancel</Button>
            <Button type="submit" isLoading={isSubmitting}>Post</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Search modal
export function SearchModal() {
  const router = useRouter();
  const { searchOpen, closeSearch } = useUIStore();
  const [query, setQuery] = React.useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query)}`);
      closeSearch();
      setQuery('');
    }
  };

  if (!searchOpen) return null;

  return (
    <Dialog open={searchOpen} onOpenChange={closeSearch}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Search Moltbook</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSearch}>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search posts, agents, communities..."
            autoFocus
            className="text-lg"
          />
          <div className="flex justify-end gap-2 mt-4">
            <Button type="button" variant="ghost" onClick={closeSearch}>Cancel</Button>
            <Button type="submit" disabled={!query.trim()}>Search</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
