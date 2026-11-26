'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState } from 'react'
import { CheckIcon as Check,
  ArrowClockwiseIcon as RefreshCw,
  MagnifyingGlassIcon as Search } from '@phosphor-icons/react'
import { MediaFrame } from '@/shared/components/media-frame'
import { Alert,
  Button,
  Dialog,
  EmptyState,
  Input,
  SkeletonTile,
  iconSize,
} from '@/shared/components/ui'
import { libraryPageItems, useLibraryInfiniteQuery } from '@/shared/hooks/useLibrary'
import { api } from '@/shared/services/api'
import { isReferenceEligibleAsset } from '@/shared/lib/reference-upload'
import { assetPlaybackUrl, assetPreviewUrl } from '@/shared/types'
import { cn } from '@/shared/lib/cn'
import type { Asset } from '@/shared/types'

/** Same page size the gallery grid uses, so both surfaces walk the library alike. */
const PAGE_SIZE = 30
const SEARCH_DEBOUNCE_MS = 300

/** Placeholder cells for the first page: the grid is 4-up on a wide picker, so
 *  eight tiles reserve roughly two rows and nothing shifts when the real rows
 *  replace them. */
const PLACEHOLDER_TILES = 8

/** Assets whose preview already failed and was re-signed once. Module scope, so
 *  closing and reopening the picker cannot restart an error→sign→error loop. */
const alreadyResigned = new Set<string>()

export interface GalleryImagePickerProps {
  open: boolean
  onClose: () => void
  /** Called only from 「使用此图片」, so a click never closes the dialog by surprise. */
  onSelect: (asset: Asset) => void
  /** Images already staged: the same asset twice would occupy two slots with one
   *  picture, and the server refuses it anyway. */
  excludedAssetIds?: readonly string[]
  /** Explains in the header what the pick is for, in the page's own words. */
  noun?: string
}

/**
 * Pick one existing image from the user's own gallery instead of uploading a file.
 *
 * Reads the same `GET /api/library` endpoint, cursor and cache entry as the gallery
 * page — there is no second image source here. Selecting a tile only marks it; the
 * pick becomes an input when the user confirms, and the caller receives the `Asset`
 * itself so nothing is downloaded or re-uploaded afterwards.
 *
 * Rendered on the shared `Dialog`, so portal, focus trap, scroll lock, the inert
 * background and the enter/exit pair are all inherited rather than re-implemented.
 * That is also what makes nesting inside the reference panel safe: opening this one
 * puts the outer panel inert, and Escape unwinds the inner layer first.
 */
export function GalleryImagePicker({
  open,
  onClose,
  onSelect,
  excludedAssetIds = [],
  noun = 'reference image',
}: GalleryImagePickerProps) {
  const [searchDraft, setSearchDraft] = useState('')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [resignedUrls, setResignedUrls] = useState<Record<string, string>>({})

  // Debounced so typing a keyword is not one request per keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchDraft.trim()), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [searchDraft])

  const { data, isLoading, isError, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useLibraryInfiniteQuery(
      { limit: PAGE_SIZE, eligible: true, ...(search ? { q: search } : {}) },
      { enabled: open },
    )

  const assets = useMemo(() => libraryPageItems(data), [data])
  const excluded = useMemo(() => new Set(excludedAssetIds), [excludedAssetIds])
  // Resolved from the fetched rows on every render rather than stored, so a refetch or
  // a library delete can only close the confirmation, never leave a stale tile armed.
  const selected = assets.find((asset) => asset.id === selectedId) ?? null

  const total = data?.pages[0]?.total ?? assets.length

  // A new search or a reopen starts from no selection: confirming an image that is no
  // longer on screen would be worse than pressing the button again.
  useEffect(() => {
    if (!open) setSelectedId(null)
  }, [open])
  useEffect(() => setSelectedId(null), [search])

  /** Signed URLs expire; re-ask for this one asset, once, and let the new `src` reset
   *  the frame's own load cycle. */
  const resignPreview = useCallback(async (asset: Asset) => {
    if (alreadyResigned.has(asset.id)) return
    alreadyResigned.add(asset.id)
    const res = await api.getAssetDownloadUrl(asset.id)
    const url = res.success ? res.data?.url : undefined
    if (url) {
      setResignedUrls((current) => ({ ...current, [asset.id]: url }))
      return
    }
    alreadyResigned.delete(asset.id)
  }, [])

  const confirm = useCallback(() => {
    if (!selected) return
    onSelect(selected)
  }, [onSelect, selected])

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="wide"
      title="Choose from gallery"
      // A picker is content-first: the search field is the fastest way in, and the
      // grid stays reachable with Tab from there.
      initialFocus="first-input"
      closeLabel="Close gallery picker"
      description={`Use an existing work directly as the ${noun} — no re-upload, no duplicate file.`}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-xs tabular-nums text-muted-foreground">
            Loaded {assets.length} / {total} images
            {search ? ` · Keyword "${search}"` : ''}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={confirm}
              disabled={!selected}
              icon={<Check weight="bold" aria-hidden="true" />}
            >
              Use this image
            </Button>
          </div>
        </div>
      }
    >
      <p className="sr-only" role="status" aria-live="polite">
        {isLoading
          ? 'Reading gallery'
          : isError
            ? 'Gallery failed to load'
            : `Gallery has ${total} images, ${assets.length} loaded${selected ? ', 1 selected' : ''}`}
      </p>

      <label className="relative flex items-center">
        <span className="sr-only">Search gallery images by prompt</span>
        <Search weight="bold"
          aria-hidden="true"
          className={`pointer-events-none absolute left-3 ${iconSize.sm} text-muted-foreground`}
        />
        <Input
          type="search"
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.target.value)}
          placeholder="Search image prompts…"
          maxLength={100}
          className="pl-9"
        />
      </label>

      {isLoading ? (
        <div
          aria-busy="true"
          className="grid min-h-[16rem] grid-cols-3 content-start gap-3 md:grid-cols-4"
        >
          {Array.from({ length: PLACEHOLDER_TILES }, (_, index) => (
            <SkeletonTile key={index} />
          ))}
        </div>
      ) : isError ? (
        <Alert
          tone="danger"
          role="alert"
          title="Could not load gallery"
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void refetch()}
              icon={<RefreshCw weight="bold" aria-hidden="true" />}
            >
              Retry
            </Button>
          }
        >
          {error?.message || 'Something went wrong while loading the gallery. Check your connection and try again.'}
        </Alert>
      ) : assets.length === 0 ? (
        <EmptyState
          variant={search ? 'no-results' : 'first-use'}
          objectName="gallery images"
          keyword={search || undefined}
          density="compact"
          title={search ? `No gallery images found for "${search}"` : 'The gallery has no images available yet'}
          description={
            search
              ? 'Try checking the spelling, or use a broader search term.'
              : 'Only image works in the gallery (PNG or JPEG) can be used as input references. Generate a few images first, then come back to choose.'
          }
          action={
            search ? (
              <Button variant="secondary" onClick={() => setSearchDraft('')}>
                Clear search
              </Button>
            ) : null
          }
        />
      ) : (
        <ul className="grid grid-cols-3 gap-3 md:grid-cols-4">
          {assets.map((asset) => {
            const isSelected = asset.id === selectedId
            // Defence in depth, not a permission check: the server already scoped
            // this list to the signed-in user and to PNG/JPEG images. An
            // ineligible row can only come from a cache entry taken elsewhere.
            const unsupported = !isReferenceEligibleAsset(asset)
            const alreadyAdded = excluded.has(asset.id)
            const disabled = unsupported || alreadyAdded
            const reason = unsupported ? 'Format not supported as a reference image' : alreadyAdded ? 'Already in the list' : ''
            const refreshed = resignedUrls[asset.id]
            return (
              <li key={asset.id}>
                <button
                  type="button"
                  disabled={disabled}
                  aria-pressed={isSelected}
                  aria-label={
                    reason
                      ? `${asset.prompt || 'Gallery image'}, ${reason}`
                      : `Choose gallery image: ${asset.prompt || 'Untitled'}`
                  }
                  onClick={() => setSelectedId(isSelected ? null : asset.id)}
                  className={cn(
                    'relative block w-full overflow-hidden rounded-control transition-colors',
                    // Selection is ink, never brand green: the ring plus the filled
                    // check are the same signal a 3px primary bar carries elsewhere.
                    isSelected
                      ? 'border-2 border-primary'
                      : disabled
                        ? 'is-disabled border border-border'
                        : 'border border-border hover:border-border-control',
                  )}
                >
                  <MediaFrame
                    src={refreshed ?? assetPlaybackUrl(asset)}
                    previewSrc={refreshed ? undefined : assetPreviewUrl(asset)}
                    kind="image"
                    alt={asset.prompt || 'Gallery image'}
                    layout="tile"
                    width={asset.width}
                    height={asset.height}
                    onMediaError={() => void resignPreview(asset)}
                  />
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-pill border-2',
                      isSelected
                        ? 'border-primary bg-primary text-on-primary'
                        : 'border-border-control bg-surface',
                    )}
                  >
                    {isSelected ? <Check weight="fill" className={iconSize.xs} /> : null}
                  </span>
                  {reason ? (
                    <span className="media-scrim absolute inset-x-0 bottom-0 px-2 py-1 text-center text-xs leading-[1.5] text-foreground-inverse">
                      {reason}
                    </span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {hasNextPage && !isLoading && !isError ? (
        <div className="flex items-center justify-center">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void fetchNextPage()}
            loading={isFetchingNextPage}
            icon={<RefreshCw weight="bold" aria-hidden="true" />}
          >
            Load more
          </Button>
        </div>
      ) : null}
    </Dialog>
  )
}
