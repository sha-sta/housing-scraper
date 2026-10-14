const STORAGE_KEY = "housing.pipelinePassed";

/**
 * Passed is where listings go to be forgotten, so the column starts folded away and only
 * an explicit open reopens it on the next visit.
 */
export function readPassedOpen(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "open";
  } catch {
    return false;
  }
}

export function writePassedOpen(open: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, open ? "open" : "closed");
  } catch {
    // A browser with storage blocked still works. The column just folds away again.
  }
}
