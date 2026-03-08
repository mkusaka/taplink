import "@testing-library/jest-dom";
import { fakeBrowser } from "@webext-core/fake-browser";
import { afterEach, beforeEach } from "vitest";
import { cleanupTaplink } from "../src/content-logic";

(global as typeof globalThis & { chrome: typeof fakeBrowser }).chrome =
  fakeBrowser;

beforeEach(() => {
  fakeBrowser.reset();
});

afterEach(() => {
  cleanupTaplink();
  fakeBrowser.reset();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});
