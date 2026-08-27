import type { PdfAnnotationRecord, PdfDocumentRecord } from "../pdf";

const DATABASE_NAME = "note-taking-app-pdfs";
const DATABASE_VERSION = 1;
const DOCUMENTS = "documents";
const ANNOTATIONS = "annotations";

interface LocalPdfDocument extends PdfDocumentRecord {
  blob: Blob;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function openDatabase() {
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(DOCUMENTS)) {
      database.createObjectStore(DOCUMENTS, { keyPath: "id" });
    }
    if (!database.objectStoreNames.contains(ANNOTATIONS)) {
      database.createObjectStore(ANNOTATIONS, {
        keyPath: ["documentId", "pageNumber"],
      });
    }
  };
  return requestResult(request);
}

export async function listGuestPdfDocuments(): Promise<PdfDocumentRecord[]> {
  const database = await openDatabase();
  const transaction = database.transaction(DOCUMENTS, "readonly");
  const rows = await requestResult(
    transaction.objectStore(DOCUMENTS).getAll() as IDBRequest<
      LocalPdfDocument[]
    >,
  );
  database.close();
  return rows
    .map(({ blob: _blob, ...document }) => document)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function createGuestPdfDocument(
  document: PdfDocumentRecord,
  blob: Blob,
) {
  const database = await openDatabase();
  const transaction = database.transaction(DOCUMENTS, "readwrite");
  transaction.objectStore(DOCUMENTS).put({ ...document, blob });
  await transactionDone(transaction);
  database.close();
}

export async function getGuestPdfBlob(id: string) {
  const database = await openDatabase();
  const transaction = database.transaction(DOCUMENTS, "readonly");
  const row = await requestResult(
    transaction.objectStore(DOCUMENTS).get(id) as IDBRequest<
      LocalPdfDocument | undefined
    >,
  );
  database.close();
  return row?.blob ?? null;
}

export async function renameGuestPdfDocument(id: string, title: string) {
  const database = await openDatabase();
  const transaction = database.transaction(DOCUMENTS, "readwrite");
  const store = transaction.objectStore(DOCUMENTS);
  const row = await requestResult(
    store.get(id) as IDBRequest<LocalPdfDocument | undefined>,
  );
  if (row) store.put({ ...row, title, updatedAt: Date.now() });
  await transactionDone(transaction);
  database.close();
}

export async function deleteGuestPdfDocument(id: string) {
  const database = await openDatabase();
  const transaction = database.transaction(
    [DOCUMENTS, ANNOTATIONS],
    "readwrite",
  );
  transaction.objectStore(DOCUMENTS).delete(id);
  const annotationStore = transaction.objectStore(ANNOTATIONS);
  const range = IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]);
  annotationStore.delete(range);
  await transactionDone(transaction);
  database.close();
}

export async function listGuestPdfAnnotations(documentId: string) {
  const database = await openDatabase();
  const transaction = database.transaction(ANNOTATIONS, "readonly");
  const range = IDBKeyRange.bound(
    [documentId, 0],
    [documentId, Number.MAX_SAFE_INTEGER],
  );
  const rows = await requestResult(
    transaction.objectStore(ANNOTATIONS).getAll(range) as IDBRequest<
      Array<PdfAnnotationRecord & { documentId: string }>
    >,
  );
  database.close();
  return rows.map(({ documentId: _documentId, ...annotation }) => annotation);
}

export async function saveGuestPdfAnnotation(
  documentId: string,
  pageNumber: number,
  scene: string,
) {
  const database = await openDatabase();
  const transaction = database.transaction(ANNOTATIONS, "readwrite");
  const store = transaction.objectStore(ANNOTATIONS);
  const existing = await requestResult(
    store.get([documentId, pageNumber]) as IDBRequest<
      (PdfAnnotationRecord & { documentId: string }) | undefined
    >,
  );
  store.put({
    documentId,
    pageNumber,
    scene,
    revision: (existing?.revision ?? 0) + 1,
    updatedAt: Date.now(),
  });
  await transactionDone(transaction);
  database.close();
}
