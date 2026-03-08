import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  cleanupTaplink,
  isConstrainedConnection,
  prefetchUrl,
  scanLinks,
  shouldPrefetchAnchor,
  startTaplink,
} from "../src/content-logic";

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];

  observed = new Set<Element>();
  callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }

  disconnect() {
    this.observed.clear();
  }

  observe(element: Element) {
    this.observed.add(element);
  }

  unobserve(element: Element) {
    this.observed.delete(element);
  }

  trigger(element: Element, isIntersecting = true) {
    this.callback(
      [
        {
          boundingClientRect: {} as DOMRectReadOnly,
          intersectionRatio: isIntersecting ? 1 : 0,
          intersectionRect: {} as DOMRectReadOnly,
          isIntersecting,
          rootBounds: null,
          target: element,
          time: 0,
        },
      ],
      this as unknown as IntersectionObserver,
    );
  }
}

const setLocation = (href: string) => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: new URL(href),
  });
};

const setConnection = (connection?: {
  effectiveType?: string;
  saveData?: boolean;
}) => {
  Object.defineProperty(navigator, "connection", {
    configurable: true,
    value: connection,
  });
};

describe("taplink content logic", () => {
  beforeEach(() => {
    MockIntersectionObserver.instances = [];
    vi.stubGlobal(
      "IntersectionObserver",
      MockIntersectionObserver as unknown as typeof IntersectionObserver,
    );
    vi.stubGlobal("requestIdleCallback", (callback: () => void) => {
      callback();
      return 1;
    });
    vi.stubGlobal("cancelIdleCallback", vi.fn());
    setLocation("https://example.com/current");
    setConnection(undefined);
  });

  it("detects constrained connections", () => {
    expect(isConstrainedConnection({ saveData: true })).toBe(true);
    expect(isConstrainedConnection({ effectiveType: "2g" })).toBe(true);
    expect(isConstrainedConnection({ effectiveType: "4g" })).toBe(false);
  });

  it("prefetches only eligible same-origin navigations", () => {
    const eligible = document.createElement("a");
    eligible.href = "https://example.com/next";

    const crossOrigin = document.createElement("a");
    crossOrigin.href = "https://other.example.com/next";

    const sameDocument = document.createElement("a");
    sameDocument.href = "https://example.com/current#details";

    const download = document.createElement("a");
    download.href = "https://example.com/archive.zip";
    download.setAttribute("download", "");

    expect(shouldPrefetchAnchor(eligible)).toBe(true);
    expect(shouldPrefetchAnchor(crossOrigin)).toBe(false);
    expect(shouldPrefetchAnchor(sameDocument)).toBe(false);
    expect(shouldPrefetchAnchor(download)).toBe(false);
  });

  it("appends a rel=prefetch link once", () => {
    expect(prefetchUrl("https://example.com/next")).toBe(true);
    expect(prefetchUrl("https://example.com/next")).toBe(false);

    const prefetchLinks = document.querySelectorAll("link[rel='prefetch']");
    expect(prefetchLinks).toHaveLength(1);
    expect((prefetchLinks[0] as HTMLLinkElement).href).toBe(
      "https://example.com/next",
    );
  });

  it("observes visible links and prefetches on intersection", () => {
    document.body.innerHTML = `
      <main>
        <a href="https://example.com/one">One</a>
        <a href="https://other.example.com/two">Two</a>
      </main>
    `;

    startTaplink();

    const observer = MockIntersectionObserver.instances[0];
    expect(observer).toBeDefined();
    expect(observer.observed.size).toBe(1);

    const anchor = document.querySelector("a") as HTMLAnchorElement;
    observer.trigger(anchor);

    const prefetchLinks = document.querySelectorAll("link[rel='prefetch']");
    expect(prefetchLinks).toHaveLength(1);
    expect((prefetchLinks[0] as HTMLLinkElement).href).toBe(anchor.href);
  });

  it("prefetches on pointer intent before intersection", () => {
    document.body.innerHTML = `<a href="https://example.com/hovered">Hovered</a>`;
    startTaplink();

    const anchor = document.querySelector("a") as HTMLAnchorElement;
    anchor.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));

    const prefetchLinks = document.querySelectorAll("link[rel='prefetch']");
    expect(prefetchLinks).toHaveLength(1);
    expect((prefetchLinks[0] as HTMLLinkElement).href).toBe(anchor.href);
  });

  it("observes anchors added after startup", () => {
    document.body.innerHTML = `<div id="root"></div>`;
    startTaplink();

    const observer = MockIntersectionObserver.instances[0];
    expect(observer.observed.size).toBe(0);

    const root = document.getElementById("root") as HTMLDivElement;
    root.innerHTML = `<a href="https://example.com/later">Later</a>`;

    scanLinks(root);

    expect(observer.observed.size).toBe(1);
  });

  it("does not start when save-data is enabled", () => {
    setConnection({ saveData: true });
    document.body.innerHTML = `<a href="https://example.com/next">Next</a>`;

    startTaplink();

    expect(MockIntersectionObserver.instances).toHaveLength(0);
  });

  it("cleans up observers and prefetch state", () => {
    document.body.innerHTML = `<a href="https://example.com/next">Next</a>`;
    startTaplink();
    prefetchUrl("https://example.com/next");

    cleanupTaplink();

    expect(document.querySelectorAll("link[rel='prefetch']")).toHaveLength(1);

    startTaplink();
    expect(MockIntersectionObserver.instances).toHaveLength(2);
  });
});
