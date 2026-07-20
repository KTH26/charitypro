import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Use a deterministic in-memory replacement for the small idb-keyval surface
// used by the application. jsdom does not provide a complete IndexedDB API.
const indexedDbValues = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => indexedDbValues.get(key)),
  set: vi.fn(async (key: string, value: unknown) => { indexedDbValues.set(key, value); }),
  del: vi.fn(async (key: string) => { indexedDbValues.delete(key); }),
  clear: vi.fn(async () => { indexedDbValues.clear(); })
}));

// Mock fetch globally
global.fetch = vi.fn();
