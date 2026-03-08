const PREFETCH_LIMIT = 30;
const OBSERVED_LINK_LIMIT = 250;
const ROOT_MARGIN = "240px 0px";
const VISIBILITY_THRESHOLD = 0.25;
const PREFETCH_TIMEOUT_MS = 1500;
const PREFETCH_DATA_ATTRIBUTE = "data-taplink-prefetch";

type ConnectionLike = {
  effectiveType?: string;
  saveData?: boolean;
};

type IdleCallback = (deadline: IdleDeadline) => void;

type WindowWithIdleCallback = Window &
  typeof globalThis & {
    cancelIdleCallback?: (handle: number) => void;
    requestIdleCallback?: (
      callback: IdleCallback,
      options?: { timeout?: number },
    ) => number;
  };

let intersectionObserver: IntersectionObserver | null = null;
let mutationObserver: MutationObserver | null = null;
let observedAnchors = new WeakSet<HTMLAnchorElement>();
let observedAnchorCount = 0;
let started = false;
const prefetchedUrls = new Set<string>();
const scheduledUrls = new Set<string>();
const idleHandles = new Set<number>();

const windowWithIdleCallback = () => window as WindowWithIdleCallback;

const getConnection = (): ConnectionLike | undefined => {
  return (navigator as Navigator & { connection?: ConnectionLike }).connection;
};

export const isConstrainedConnection = (
  connection: ConnectionLike | undefined = getConnection(),
) => {
  if (!connection) return false;

  return Boolean(
    connection.saveData ||
      connection.effectiveType === "slow-2g" ||
      connection.effectiveType === "2g",
  );
};

const supportsHttpUrl = (url: URL) => {
  return url.protocol === "http:" || url.protocol === "https:";
};

const isSameDocumentNavigation = (candidate: URL, current: URL) => {
  return (
    candidate.origin === current.origin &&
    candidate.pathname === current.pathname &&
    candidate.search === current.search
  );
};

const getSafeUrl = (value: string, baseHref: string) => {
  try {
    return new URL(value, baseHref);
  } catch {
    return null;
  }
};

export const shouldPrefetchAnchor = (
  anchor: HTMLAnchorElement,
  currentLocation: Location = window.location,
  connection: ConnectionLike | undefined = getConnection(),
) => {
  if (isConstrainedConnection(connection)) return false;
  if (!anchor.href) return false;
  if (anchor.dataset.taplinkIgnore !== undefined) return false;
  if (anchor.hasAttribute("download")) return false;

  const target = anchor.getAttribute("target");
  if (target && target !== "_self") return false;

  const rel = (anchor.getAttribute("rel") ?? "").toLowerCase();
  if (rel.includes("external") || rel.includes("nofollow")) return false;

  const candidate = getSafeUrl(anchor.href, currentLocation.href);
  const current = getSafeUrl(currentLocation.href, currentLocation.href);
  if (!candidate || !current) return false;
  if (!supportsHttpUrl(candidate)) return false;
  if (candidate.origin !== current.origin) return false;
  if (candidate.href === current.href) return false;
  if (isSameDocumentNavigation(candidate, current)) return false;

  return true;
};

const runWhenIdle = (task: () => void) => {
  const idleWindow = windowWithIdleCallback();

  if (typeof idleWindow.requestIdleCallback === "function") {
    let handle = 0;
    let completed = false;

    handle = idleWindow.requestIdleCallback(
      () => {
        completed = true;
        idleHandles.delete(handle);
        task();
      },
      { timeout: PREFETCH_TIMEOUT_MS },
    );

    if (!completed) {
      idleHandles.add(handle);
    }

    return;
  }

  const handle = window.setTimeout(() => {
    idleHandles.delete(handle);
    task();
  }, 250);
  idleHandles.add(handle);
};

const clearIdleHandles = () => {
  const idleWindow = windowWithIdleCallback();

  for (const handle of idleHandles) {
    if (typeof idleWindow.cancelIdleCallback === "function") {
      idleWindow.cancelIdleCallback(handle);
    } else {
      window.clearTimeout(handle);
    }
  }

  idleHandles.clear();
};

const hasExistingPrefetchLink = (href: string) => {
  return Array.from(document.querySelectorAll("link[rel='prefetch']")).some(
    (node) => (node as HTMLLinkElement).href === href,
  );
};

export const prefetchUrl = (href: string) => {
  if (prefetchedUrls.has(href) || scheduledUrls.has(href)) return false;
  if (prefetchedUrls.size >= PREFETCH_LIMIT) return false;

  scheduledUrls.add(href);

  runWhenIdle(() => {
    scheduledUrls.delete(href);

    if (prefetchedUrls.has(href)) return;
    if (prefetchedUrls.size >= PREFETCH_LIMIT) return;

    const container = document.head ?? document.documentElement;
    if (!container) return;

    if (hasExistingPrefetchLink(href)) {
      prefetchedUrls.add(href);
      return;
    }

    const link = document.createElement("link");
    link.rel = "prefetch";
    link.as = "document";
    link.href = href;
    link.setAttribute(PREFETCH_DATA_ATTRIBUTE, "true");

    if ("fetchPriority" in link) {
      link.fetchPriority = "low";
    }

    container.appendChild(link);
    prefetchedUrls.add(href);
  });

  return true;
};

const queueAnchorPrefetch = (anchor: HTMLAnchorElement) => {
  if (!shouldPrefetchAnchor(anchor)) return;
  void prefetchUrl(anchor.href);
};

const observeAnchor = (anchor: HTMLAnchorElement) => {
  if (!intersectionObserver) return;
  if (observedAnchors.has(anchor)) return;
  if (observedAnchorCount >= OBSERVED_LINK_LIMIT) return;
  if (!shouldPrefetchAnchor(anchor)) return;

  observedAnchors.add(anchor);
  observedAnchorCount += 1;
  intersectionObserver.observe(anchor);
};

const extractAnchors = (node: Node) => {
  if (!(node instanceof Element)) return [] as HTMLAnchorElement[];

  if (node instanceof HTMLAnchorElement) {
    return [node];
  }

  return Array.from(node.querySelectorAll<HTMLAnchorElement>("a[href]"));
};

export const scanLinks = (root: ParentNode = document) => {
  if (!("querySelectorAll" in root)) return;

  const anchors = Array.from(root.querySelectorAll("a[href]"));
  for (const anchor of anchors) {
    observeAnchor(anchor as HTMLAnchorElement);
  }
};

const handleIntersection = (entries: IntersectionObserverEntry[]) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;

    const anchor = entry.target as HTMLAnchorElement;
    intersectionObserver?.unobserve(anchor);
    queueAnchorPrefetch(anchor);
  }
};

const handlePointerIntent = (event: Event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const anchor = target.closest("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) return;

  queueAnchorPrefetch(anchor);
};

const handleMutations = (records: MutationRecord[]) => {
  for (const record of records) {
    for (const node of record.addedNodes) {
      const anchors = extractAnchors(node);
      for (const anchor of anchors) {
        observeAnchor(anchor);
      }
    }
  }
};

export const startTaplink = () => {
  if (started) return;
  if (
    window.location.protocol !== "http:" &&
    window.location.protocol !== "https:"
  ) {
    return;
  }
  if (isConstrainedConnection()) return;

  started = true;
  intersectionObserver = new IntersectionObserver(handleIntersection, {
    rootMargin: ROOT_MARGIN,
    threshold: VISIBILITY_THRESHOLD,
  });
  mutationObserver = new MutationObserver(handleMutations);

  const observationRoot = document.body ?? document.documentElement;
  if (observationRoot) {
    mutationObserver.observe(observationRoot, {
      childList: true,
      subtree: true,
    });
  }

  document.addEventListener("pointerenter", handlePointerIntent, true);
  document.addEventListener("touchstart", handlePointerIntent, true);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  scanLinks(document);
};

const handleVisibilityChange = () => {
  if (document.visibilityState === "visible") {
    scanLinks(document);
  }
};

export const cleanupTaplink = () => {
  mutationObserver?.disconnect();
  mutationObserver = null;

  intersectionObserver?.disconnect();
  intersectionObserver = null;

  document.removeEventListener("pointerenter", handlePointerIntent, true);
  document.removeEventListener("touchstart", handlePointerIntent, true);
  document.removeEventListener("visibilitychange", handleVisibilityChange);

  clearIdleHandles();
  scheduledUrls.clear();
  prefetchedUrls.clear();
  observedAnchors = new WeakSet<HTMLAnchorElement>();
  observedAnchorCount = 0;
  started = false;
};
