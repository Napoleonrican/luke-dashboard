import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Reset DOM and per-device persistence between tests so each starts clean.
afterEach(() => {
  cleanup();
  localStorage.clear();
});

// jsdom doesn't implement scrollTo / matchMedia; stub the ones the app may touch.
if (!window.matchMedia) {
  window.matchMedia = () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  });
}
