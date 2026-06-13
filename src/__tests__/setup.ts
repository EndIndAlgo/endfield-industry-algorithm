import '@testing-library/jest-dom/vitest';

// jsdom 缺少 ResizeObserver，Chakra UI (zag-js) 依赖它
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverMock as any;

// jsdom 缺少 scrollTo（Chakra Select 使用）
window.scrollTo = () => {};
