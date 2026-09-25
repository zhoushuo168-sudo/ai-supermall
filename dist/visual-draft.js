/* Browser-only draft storage for an unfinished Visuals & posters workspace.
   IndexedDB keeps File/Blob objects across the sign-in round trip without
   putting private image data in localStorage or the URL. */
(() => {
  const database = 'ai-supermall-visual-drafts';
  const store = 'drafts';
  const key = 'current';

  const open = () => new Promise((resolve, reject) => {
    const request = indexedDB.open(database, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Draft storage is unavailable.'));
  });

  const useStore = (mode, value) => new Promise(async (resolve, reject) => {
    try {
      const db = await open();
      const transaction = db.transaction(store, mode === 'read' ? 'readonly' : 'readwrite');
      const request = mode === 'read' ? transaction.objectStore(store).get(key) : mode === 'write' ? transaction.objectStore(store).put(value, key) : transaction.objectStore(store).delete(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Draft storage request failed.'));
      transaction.oncomplete = () => db.close();
      transaction.onerror = () => { db.close(); reject(transaction.error || new Error('Draft storage transaction failed.')); };
    } catch (error) { reject(error); }
  });

  window.AISuperMallVisualDraft = {
    save: draft => useStore('write', draft),
    load: () => useStore('read'),
    clear: () => useStore('delete')
  };
})();
