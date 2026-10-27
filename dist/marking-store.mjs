import {validateMarking} from './marking-model.mjs';
function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('atlas-marking-documents', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('documents', {keyPath: 'id'});
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function transaction(mode, run) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('documents', mode);
      let result, reason;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(reason || tx.error || Error('No se pudo guardar el documento.'));
      run(tx.objectStore('documents'), value => {result = value;}, message => {reason = Error(message); tx.abort();});
    });
  } finally { db.close(); }
}
export function readMarkings() {
  return transaction('readonly', (store, done) => {store.getAll().onsuccess = event => done(event.target.result);});
}
export function saveMarking(doc, expectedVersion) {
  validateMarking(doc);
  if (doc.version !== expectedVersion + 1) throw Error('Versión inválida.');
  return transaction('readwrite', (store, done, abort) => {
    store.get(doc.id).onsuccess = event => {
      if ((event.target.result?.version || 0) !== expectedVersion) return abort('El documento cambió en otra pestaña. Vuelve a abrirlo desde Documentos antes de continuar.');
      store.put(doc); done(doc);
    };
  });
}
export function importMarkings(backup) {
  if (backup?.format !== 'atlas-markings-v1' || !Array.isArray(backup.documents) || backup.documents.length > 1000) throw Error('Respaldo de marcados inválido.');
  backup.documents.forEach(validateMarking);
  if (new Set(backup.documents.map(doc => doc.id)).size !== backup.documents.length) throw Error('Documentos repetidos en el respaldo.');
  return transaction('readwrite', (store, done, abort) => {
    for (const doc of backup.documents) store.get(doc.id).onsuccess = event => {
      const existing = event.target.result;
      if (existing && JSON.stringify(existing) !== JSON.stringify(doc)) return abort('El respaldo contiene otra versión de un documento existente. No se reemplazó ningún documento.');
      if (!existing) store.add(doc);
    };
    done(backup.documents.length);
  });
}
