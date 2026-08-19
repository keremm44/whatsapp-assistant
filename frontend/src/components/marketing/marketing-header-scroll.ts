export const MARKETING_HEADER_OPEN_REGION = 72;
export const MARKETING_HEADER_DIRECTION_THRESHOLD = 10;

export type MarketingHeaderDirection = "up" | "down" | null;

export type MarketingHeaderScrollState = {
  lastScrollY: number;
  directionAnchorY: number;
  direction: MarketingHeaderDirection;
  hidden: boolean;
};

export function createMarketingHeaderScrollState(
  scrollY = 0,
): MarketingHeaderScrollState {
  const normalized = Math.max(scrollY, 0);
  return {
    lastScrollY: normalized,
    directionAnchorY: normalized,
    direction: null,
    hidden: false,
  };
}

/**
 * Pure direction tracker shared by the public header and its regression
 * tests. Tiny trackpad reversals do not toggle the rail. Anchor navigation
 * may temporarily suppress downward hiding so a deliberate section jump
 * does not immediately make the navigation disappear.
 */
export function advanceMarketingHeaderScroll(
  current: MarketingHeaderScrollState,
  nextScrollY: number,
  options: { suppressDownwardHide?: boolean } = {},
): MarketingHeaderScrollState {
  const nextY = Math.max(nextScrollY, 0);

  if (nextY < MARKETING_HEADER_OPEN_REGION) {
    return {
      lastScrollY: nextY,
      directionAnchorY: nextY,
      direction: null,
      hidden: false,
    };
  }

  if (nextY === current.lastScrollY) {
    return current;
  }

  const nextDirection: Exclude<MarketingHeaderDirection, null> =
    nextY > current.lastScrollY ? "down" : "up";
  const directionChanged = current.direction !== nextDirection;
  const directionAnchorY = directionChanged
    ? current.lastScrollY
    : current.directionAnchorY;
  const distance = Math.abs(nextY - directionAnchorY);
  let hidden = current.hidden;

  if (distance >= MARKETING_HEADER_DIRECTION_THRESHOLD) {
    hidden =
      nextDirection === "down"
        ? !options.suppressDownwardHide
        : false;
  }

  return {
    lastScrollY: nextY,
    directionAnchorY,
    direction: nextDirection,
    hidden,
  };
}
