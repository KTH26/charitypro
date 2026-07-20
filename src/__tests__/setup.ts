import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock IndexedDB because jsdom doesn't support it natively
class IDBFactoryMock {}
class IDBDatabaseMock {}
class IDBObjectStoreMock {}
class IDBTransactionMock {}

global.indexedDB = new IDBFactoryMock() as any;

// Mock fetch globally
global.fetch = vi.fn();
