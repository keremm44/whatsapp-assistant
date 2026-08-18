export type WorkbenchNavigationMemory = {
  scrollTop: number;
  viewportY: number | null;
};

type NavigationStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem" | "key" | "length"
>;

const STORAGE_PREFIX = "seller-workbench-navigation";

const isNonNegativeFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

export const workbenchNavigationStoragePrefix = (namespace: string): string =>
  `${STORAGE_PREFIX}:${namespace}:`;

export const workbenchNavigationStorageKey = (
  namespace: string,
  context: string,
): string => `${workbenchNavigationStoragePrefix(namespace)}${context}`;

const normalizedSearchEntries = (
  url: URL,
  omittedParam: string,
): string[] => {
  const entries: string[] = [];
  for (const [key, value] of url.searchParams.entries()) {
    if (key !== omittedParam) {
      entries.push(`${key}=${value}`);
    }
  }
  return entries.sort();
};

/**
 * Returns true when navigation only adds/removes/changes a selected-record
 * query param while keeping the list/filter context identical.
 */
export const isSelectionOnlyWorkbenchNavigation = (
  currentHref: string,
  destinationHref: string,
  selectionParam: string,
): boolean => {
  const current = new URL(currentHref);
  const destination = new URL(destinationHref, current);
  if (current.pathname !== destination.pathname) return false;

  return (
    JSON.stringify(normalizedSearchEntries(current, selectionParam)) ===
    JSON.stringify(normalizedSearchEntries(destination, selectionParam))
  );
};

export const readWorkbenchNavigationMemory = (
  storage: NavigationStorage,
  key: string,
): WorkbenchNavigationMemory | null => {
  const raw = storage.getItem(key);
  if (raw === null) return null;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!isNonNegativeFiniteNumber(parsed.scrollTop)) return null;
    if (
      parsed.viewportY !== null &&
      !isNonNegativeFiniteNumber(parsed.viewportY)
    ) {
      return null;
    }
    return {
      scrollTop: parsed.scrollTop,
      viewportY: parsed.viewportY as number | null,
    };
  } catch {
    return null;
  }
};

export const writeWorkbenchNavigationMemory = (
  storage: NavigationStorage,
  key: string,
  memory: WorkbenchNavigationMemory,
): void => {
  storage.setItem(key, JSON.stringify(memory));
};

export const clearWorkbenchNavigationNamespace = (
  storage: NavigationStorage,
  namespace: string,
): void => {
  const prefix = workbenchNavigationStoragePrefix(namespace);
  const keys: string[] = [];

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(prefix)) keys.push(key);
  }

  for (const key of keys) storage.removeItem(key);
};
