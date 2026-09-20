import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Profile } from "@housing/shared";
import { useProfiles } from "./queries.ts";

const STORAGE_KEY = "housing.profile";

interface SelectionValue {
  profiles: Profile[];
  profileId: string | null;
  profile: Profile | null;
  select: (id: string) => void;
}

const SelectionContext = createContext<SelectionValue>({
  profiles: [],
  profileId: null,
  profile: null,
  select: () => {},
});

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** The chosen profile follows the reader across the feed, the map and the pipeline. */
export function SelectionProvider({ children }: { children: React.ReactNode }) {
  const { data: profiles } = useProfiles();
  const [profileId, setProfileId] = useState<string | null>(() => readStored());

  const list = useMemo(() => profiles ?? [], [profiles]);

  useEffect(() => {
    if (list.length === 0) return;
    const stillThere = profileId !== null && list.some((p) => p.id === profileId);
    if (stillThere) return;
    const fallback = list.find((p) => p.enabled) ?? list[0];
    if (fallback) setProfileId(fallback.id);
  }, [list, profileId]);

  const value = useMemo<SelectionValue>(
    () => ({
      profiles: list,
      profileId,
      profile: list.find((p) => p.id === profileId) ?? null,
      select: (id: string) => {
        setProfileId(id);
        try {
          window.localStorage.setItem(STORAGE_KEY, id);
        } catch {
          // A browser with storage blocked still works, it just forgets the choice.
        }
      },
    }),
    [list, profileId],
  );

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useSelection(): SelectionValue {
  return useContext(SelectionContext);
}
