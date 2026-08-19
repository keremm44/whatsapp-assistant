import assert from "node:assert/strict";
import { test } from "node:test";

import {
  advanceMarketingHeaderScroll,
  createMarketingHeaderScrollState,
  revealMarketingHeaderScroll,
} from "./marketing-header-scroll.ts";

test("header stays visible inside the opening region", () => {
  let state = createMarketingHeaderScrollState(0);
  state = advanceMarketingHeaderScroll(state, 60);
  assert.equal(state.hidden, false);
  assert.equal(state.direction, null);
});

test("small direction jitter does not toggle the header", () => {
  let state = createMarketingHeaderScrollState(100);
  state = advanceMarketingHeaderScroll(state, 106);
  assert.equal(state.hidden, false);
  state = advanceMarketingHeaderScroll(state, 101);
  assert.equal(state.hidden, false);
});

test("downward movement past the threshold hides and upward movement reveals", () => {
  let state = createMarketingHeaderScrollState(100);
  state = advanceMarketingHeaderScroll(state, 112);
  assert.equal(state.hidden, true);

  state = advanceMarketingHeaderScroll(state, 108);
  assert.equal(state.hidden, true);
  state = advanceMarketingHeaderScroll(state, 97);
  assert.equal(state.hidden, false);
});

test("anchor navigation can suppress a downward hide without changing the direction model", () => {
  let state = createMarketingHeaderScrollState(100);
  state = advanceMarketingHeaderScroll(state, 600, {
    suppressDownwardHide: true,
  });

  assert.equal(state.hidden, false);
  assert.equal(state.direction, "down");

  state = advanceMarketingHeaderScroll(state, 612);
  assert.equal(state.hidden, true);
});

test("explicit focus or anchor reveal clears stale hidden state and resets the movement anchor", () => {
  let state = createMarketingHeaderScrollState(100);
  state = advanceMarketingHeaderScroll(state, 120);
  assert.equal(state.hidden, true);

  state = revealMarketingHeaderScroll(state);
  assert.equal(state.hidden, false);
  assert.equal(state.directionAnchorY, state.lastScrollY);

  state = advanceMarketingHeaderScroll(state, 125);
  assert.equal(state.hidden, false);
});
