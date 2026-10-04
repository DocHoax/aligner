/**
 * IndexedDB Storage Provider
 * High-performance browser-native document persistence with autosave support and localStorage fallback.
 */
import { CanvasDocument, DocumentMeta } from '@alignify/shared-types';

const DB_NAME = 'alignify_workspace_db';
const DB_VERSION = 1;
const STORE_NAME = 'documents';
const FALLBACK_KEY_PREFIX = 'alignify_doc_';
const FALLBACK_INDEX_KEY = 'alignify_doc_index';

export class IndexedDBStorage {
  private dbPromise: Promise<IDBDatabase | null>;

  constructor() {
    this.dbPromise = this.initDB();
  }

  private async initDB(): Promise<IDBDatabase | null> {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return null;
    }

    return new Promise((resolve) => {
      try {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            store.createIndex('updatedAt', 'updatedAt', { unique: false });
          }
        };

        request.onsuccess = () => {
          resolve(request.result);
        };

        request.onerror = (err) => {
          console.warn('[IndexedDBStorage] Failed to open IndexedDB, falling back to localStorage', err);
          resolve(null);
        };
      } catch (err) {
        console.warn('[IndexedDBStorage] IndexedDB initialization error', err);
        resolve(null);
      }
    });
  }

  async saveDocument(doc: CanvasDocument): Promise<void> {
    const db = await this.dbPromise;

    if (db) {
      return new Promise((resolve, reject) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const request = store.put(doc);

          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        } catch (err) {
          this.fallbackSave(doc);
          resolve();
        }
      });
    } else {
      this.fallbackSave(doc);
    }
  }

  async loadDocument(id: string): Promise<CanvasDocument | null> {
    const db = await this.dbPromise;

    if (db) {
      return new Promise((resolve, reject) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const request = store.get(id);

          request.onsuccess = () => {
            resolve((request.result as CanvasDocument) || null);
          };
          request.onerror = () => reject(request.error);
        } catch (err) {
          resolve(this.fallbackLoad(id));
        }
      });
    }

    return this.fallbackLoad(id);
  }

  async listDocuments(): Promise<DocumentMeta[]> {
    const db = await this.dbPromise;

    if (db) {
      return new Promise((resolve, reject) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const request = store.getAll();

          request.onsuccess = () => {
            const docs = (request.result as CanvasDocument[]) || [];
            const metas: DocumentMeta[] = docs
              .map((d) => ({
                id: d.id,
                name: d.name,
                createdAt: d.createdAt,
                updatedAt: d.updatedAt,
                objectCount: d.objects ? d.objects.length : 0
              }))
              .sort((a, b) => b.updatedAt - a.updatedAt);
            resolve(metas);
          };
          request.onerror = () => reject(request.error);
        } catch (err) {
          resolve(this.fallbackList());
        }
      });
    }

    return this.fallbackList();
  }

  async deleteDocument(id: string): Promise<void> {
    const db = await this.dbPromise;

    if (db) {
      return new Promise((resolve, reject) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const request = store.delete(id);

          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        } catch (err) {
          this.fallbackDelete(id);
          resolve();
        }
      });
    }

    this.fallbackDelete(id);
  }

  async loadLastModifiedDocument(): Promise<CanvasDocument | null> {
    const list = await this.listDocuments();
    if (list.length === 0) return null;
    return this.loadDocument(list[0]!.id);
  }

  // LocalStorage Fallbacks
  private fallbackSave(doc: CanvasDocument): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      localStorage.setItem(FALLBACK_KEY_PREFIX + doc.id, JSON.stringify(doc));
      const indexStr = localStorage.getItem(FALLBACK_INDEX_KEY);
      const index: string[] = indexStr ? JSON.parse(indexStr) : [];
      if (!index.includes(doc.id)) {
        index.push(doc.id);
        localStorage.setItem(FALLBACK_INDEX_KEY, JSON.stringify(index));
      }
    } catch (e) {
      console.error('[IndexedDBStorage] LocalStorage save quota exceeded', e);
    }
  }

  private fallbackLoad(id: string): CanvasDocument | null {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    try {
      const data = localStorage.getItem(FALLBACK_KEY_PREFIX + id);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  private fallbackList(): DocumentMeta[] {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    try {
      const indexStr = localStorage.getItem(FALLBACK_INDEX_KEY);
      const index: string[] = indexStr ? JSON.parse(indexStr) : [];
      const metas: DocumentMeta[] = [];
      for (const id of index) {
        const doc = this.fallbackLoad(id);
        if (doc) {
          metas.push({
            id: doc.id,
            name: doc.name,
            createdAt: typeof doc.createdAt === 'number' ? doc.createdAt : Date.now(),
            updatedAt: typeof doc.updatedAt === 'number' ? doc.updatedAt : Date.now(),
            objectCount: doc.objects ? doc.objects.length : 0
          });
        }
      }
      return metas.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch {
      return [];
    }
  }

  private fallbackDelete(id: string): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      localStorage.removeItem(FALLBACK_KEY_PREFIX + id);
      const indexStr = localStorage.getItem(FALLBACK_INDEX_KEY);
      const index: string[] = indexStr ? JSON.parse(indexStr) : [];
      const filtered = index.filter((i) => i !== id);
      localStorage.setItem(FALLBACK_INDEX_KEY, JSON.stringify(filtered));
    } catch {
      // Ignore
    }
  }
}
