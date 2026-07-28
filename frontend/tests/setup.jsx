import "@testing-library/jest-dom";

// jsdom lacks matchMedia; components that probe prefers-color-scheme crash
// without this stub.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// IntersectionObserver / ResizeObserver are used by IdeaGraph and others —
// provide inert no-ops so rendering doesn't throw in jsdom.
class MockIO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
class MockRO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.IntersectionObserver = MockIO;
window.ResizeObserver = MockRO;
