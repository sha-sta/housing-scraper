import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import type {
  CampusPreset,
  Draft,
  DraftStatus,
  ListingPage,
  ListingQuery,
  ListingState,
  ListingView,
  NetworkInfo,
  Notification,
  Profile,
  ProfilePreview,
  ProfileWrite,
  ServerEvent,
  Settings,
  SourceStatus,
  Stats,
  Template,
} from "@housing/shared";
import { api } from "./api.ts";

export const keys = {
  stats: ["stats"] as const,
  campuses: ["campuses"] as const,
  network: ["network"] as const,
  settings: ["settings"] as const,
  profiles: ["profiles"] as const,
  listings: ["listings"] as const,
  listingList: (query: Partial<ListingQuery>) => ["listings", query] as const,
  listing: (id: string) => ["listing", id] as const,
  drafts: ["drafts"] as const,
  draftList: (status?: DraftStatus) => ["drafts", status ?? "any"] as const,
  draft: (id: string) => ["draft", id] as const,
  templates: ["templates"] as const,
  notifications: ["notifications"] as const,
  notificationList: (unread?: boolean) => ["notifications", unread ?? false] as const,
  sources: ["sources"] as const,
};

export function useStats(): UseQueryResult<Stats> {
  return useQuery({ queryKey: keys.stats, queryFn: api.stats });
}

export function useCampuses(): UseQueryResult<CampusPreset[]> {
  return useQuery({ queryKey: keys.campuses, queryFn: api.campuses, staleTime: Infinity });
}

/** Short lived: Tailscale can start after the server, and the card has a Check again button. */
export function useNetwork(): UseQueryResult<NetworkInfo> {
  return useQuery({ queryKey: keys.network, queryFn: api.network, staleTime: 15_000 });
}

export function useSettings(): UseQueryResult<Settings> {
  return useQuery({ queryKey: keys.settings, queryFn: api.settings });
}

export function useProfiles(): UseQueryResult<Profile[]> {
  return useQuery({ queryKey: keys.profiles, queryFn: api.profiles });
}

export function useListings(query: Partial<ListingQuery>): UseQueryResult<ListingPage> {
  return useQuery({
    queryKey: keys.listingList(query),
    queryFn: () => api.listings(query),
    placeholderData: (previous) => previous,
  });
}

export function useListing(id: string | undefined): UseQueryResult<ListingView> {
  return useQuery({
    queryKey: keys.listing(id ?? ""),
    queryFn: () => api.listing(id ?? ""),
    enabled: Boolean(id),
  });
}

export function useDrafts(status?: DraftStatus): UseQueryResult<Draft[]> {
  return useQuery({ queryKey: keys.draftList(status), queryFn: () => api.drafts(status) });
}

export function useTemplates(): UseQueryResult<Template[]> {
  return useQuery({ queryKey: keys.templates, queryFn: api.templates });
}

export function useNotifications(unread?: boolean): UseQueryResult<Notification[]> {
  return useQuery({
    queryKey: keys.notificationList(unread),
    queryFn: () => api.notifications(unread),
  });
}

export function useSources(): UseQueryResult<SourceStatus[]> {
  return useQuery({ queryKey: keys.sources, queryFn: api.sources });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Settings>) => api.patchSettings(patch),
    onSuccess: (settings) => {
      qc.setQueryData(keys.settings, settings);
      void qc.invalidateQueries({ queryKey: keys.listings });
    },
  });
}

export function useSaveProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, write }: { id: string | null; write: ProfileWrite }) =>
      id === null ? api.createProfile(write) : api.updateProfile(id, write),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.profiles });
      void qc.invalidateQueries({ queryKey: keys.listings });
      void qc.invalidateQueries({ queryKey: keys.stats });
    },
  });
}

export function useDeleteProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteProfile(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.profiles });
      void qc.invalidateQueries({ queryKey: keys.listings });
    },
  });
}

export function usePreviewProfile() {
  return useMutation<ProfilePreview, Error, ProfileWrite>({
    mutationFn: (write: ProfileWrite) => api.previewProfile(write),
  });
}

export function useListingState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<ListingState> }) =>
      api.patchListingState(id, patch),
    onSuccess: (view) => {
      qc.setQueryData(keys.listing(view.listing.id), view);
      void qc.invalidateQueries({ queryKey: keys.listings });
      void qc.invalidateQueries({ queryKey: keys.stats });
    },
  });
}

export function useDraftMutations() {
  const qc = useQueryClient();
  const touch = (draft: Draft) => {
    qc.setQueryData(keys.draft(draft.id), draft);
    void qc.invalidateQueries({ queryKey: keys.drafts });
    void qc.invalidateQueries({ queryKey: keys.listing(draft.listingId) });
    void qc.invalidateQueries({ queryKey: keys.listings });
    void qc.invalidateQueries({ queryKey: keys.stats });
  };

  return {
    save: useMutation({
      mutationFn: ({
        id,
        patch,
      }: {
        id: string;
        patch: { to?: string | null; subject?: string; body?: string };
      }) => api.patchDraft(id, patch),
      onSuccess: touch,
    }),
    regenerate: useMutation({
      mutationFn: ({ listingId, profileId }: { listingId: string; profileId: string }) =>
        api.createDraft(listingId, profileId),
      onSuccess: touch,
    }),
    send: useMutation({
      mutationFn: (id: string) => api.sendDraft(id),
      onSuccess: touch,
    }),
    markSent: useMutation({
      mutationFn: (id: string) => api.markDraftSent(id),
      onSuccess: touch,
    }),
    discard: useMutation({
      mutationFn: ({ id }: { id: string; listingId: string }) => api.discardDraft(id),
      onSuccess: (_result, variables) => {
        void qc.invalidateQueries({ queryKey: keys.drafts });
        void qc.invalidateQueries({ queryKey: keys.listing(variables.listingId) });
        void qc.invalidateQueries({ queryKey: keys.stats });
      },
    }),
  };
}

export function useSourceMutations() {
  const qc = useQueryClient();
  const touch = (source: SourceStatus) => {
    qc.setQueryData(keys.sources, (previous: SourceStatus[] | undefined) =>
      previous?.map((item) => (item.id === source.id ? source : item)),
    );
    void qc.invalidateQueries({ queryKey: keys.sources });
  };
  return {
    patch: useMutation({
      mutationFn: ({
        id,
        patch,
      }: {
        id: string;
        patch: { enabled?: boolean; intervalSec?: number; config?: Record<string, unknown> };
      }) => api.patchSource(id, patch),
      // The enable switch has to move under the finger, not after the round trip.
      onMutate: ({ id, patch }) => {
        qc.setQueryData(keys.sources, (previous: SourceStatus[] | undefined) =>
          previous?.map((item) => (item.id === id ? { ...item, ...patch } : item)),
        );
      },
      onSuccess: touch,
      onError: () => {
        void qc.invalidateQueries({ queryKey: keys.sources });
      },
    }),
    run: useMutation({ mutationFn: (id: string) => api.runSource(id), onSuccess: touch }),
  };
}

export function useTemplateMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: keys.templates });
  };
  return {
    save: useMutation({
      mutationFn: ({ id, write }: { id: string | null; write: Omit<Template, "id"> }) =>
        id === null ? api.createTemplate(write) : api.updateTemplate(id, write),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: (id: string) => api.deleteTemplate(id), onSuccess: refresh }),
  };
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) => api.markRead(ids),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.notifications });
      void qc.invalidateQueries({ queryKey: keys.stats });
    },
  });
}

/** One place that decides which cached queries a server event makes stale. */
export function applyServerEvent(qc: QueryClient, event: ServerEvent): void {
  switch (event.type) {
    case "listing.upserted":
      void qc.invalidateQueries({ queryKey: keys.listings });
      void qc.invalidateQueries({ queryKey: keys.listing(event.listingId) });
      void qc.invalidateQueries({ queryKey: keys.stats });
      return;
    case "listing.state":
      void qc.invalidateQueries({ queryKey: keys.listings });
      void qc.invalidateQueries({ queryKey: keys.listing(event.listingId) });
      void qc.invalidateQueries({ queryKey: keys.stats });
      return;
    case "draft.changed":
      void qc.invalidateQueries({ queryKey: keys.drafts });
      void qc.invalidateQueries({ queryKey: keys.draft(event.draftId) });
      void qc.invalidateQueries({ queryKey: keys.listing(event.listingId) });
      void qc.invalidateQueries({ queryKey: keys.stats });
      return;
    case "notification.created":
      void qc.invalidateQueries({ queryKey: keys.notifications });
      void qc.invalidateQueries({ queryKey: keys.stats });
      return;
    case "source.status":
      void qc.invalidateQueries({ queryKey: keys.sources });
      void qc.invalidateQueries({ queryKey: keys.stats });
      return;
    case "profiles.changed":
      void qc.invalidateQueries({ queryKey: keys.profiles });
      void qc.invalidateQueries({ queryKey: keys.listings });
      void qc.invalidateQueries({ queryKey: keys.stats });
      return;
  }
}
