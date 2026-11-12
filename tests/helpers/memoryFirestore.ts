import assert from 'node:assert/strict';

export class MemoryFirestore {
  documents = new Map<string, any>();
  private queue = Promise.resolve();
  doc(path: string): any {
    return { path, id: path.split('/').at(-1), get: async () => this.snapshot({ path }),
      set: async (data: any, options?: any) => this.documents.set(path, options?.merge ? { ...this.documents.get(path), ...data } : data) };
  }
  collection(name: string): any {
    const query = (filters: any[] = [], maximum = Infinity, cursor = ''): any => ({
      collection: name, filters, maximum, cursor,
      doc: (id: string) => this.doc(`${name}/${id}`),
      where: (field: string, op: string, value: any) => query([...filters, { field, op, value }], maximum, cursor),
      limit: (limit: number) => query(filters, limit, cursor), orderBy: () => query(filters, maximum, cursor),
      startAfter: (id: string) => query(filters, maximum, id),
      get: async () => this.snapshot({ collection: name, filters, maximum, cursor }),
    });
    return query();
  }
  snapshot(ref: any): any {
    if (ref.collection) {
      const docs = [...this.documents].filter(([path, data]) => path.startsWith(`${ref.collection}/`)
        && (!ref.cursor || path.split('/')[1] > ref.cursor)
        && (ref.filters || []).every(({ field, op, value }: any) => op === 'in' ? value.includes(data[field])
          : op === '>=' ? data[field] >= value : data[field] === value))
        .sort(([a], [b]) => a.localeCompare(b)).slice(0, ref.maximum ?? Infinity)
        .map(([path, data]) => ({ id: path.split('/')[1], ref: this.doc(path), exists: true, data: () => data }));
      return { docs, size: docs.length, empty: !docs.length };
    }
    const data = this.documents.get(ref.path);
    return { id: ref.path.split('/').at(-1), exists: data !== undefined, data: () => data };
  }
  runTransaction<T>(run: (transaction: any) => Promise<T>): Promise<T> {
    const task = this.queue.then(async () => {
      const writes: Array<() => void> = [];
      const read = (ref: any) => { assert.equal(writes.length, 0, 'Firestore transactions require all reads before writes'); return this.snapshot(ref); };
      const result = await run({
        get: async (ref: any) => read(ref), getAll: async (...refs: any[]) => refs.map(read),
        create: (ref: any, data: any) => { assert.equal(this.documents.has(ref.path), false); writes.push(() => this.documents.set(ref.path, data)); },
        set: (ref: any, data: any, options?: any) => writes.push(() => this.documents.set(ref.path, options?.merge ? { ...this.documents.get(ref.path), ...data } : data)),
        update: (ref: any, data: any) => { assert.equal(this.documents.has(ref.path), true); writes.push(() => this.documents.set(ref.path, { ...this.documents.get(ref.path), ...data })); },
        delete: (ref: any) => writes.push(() => { this.documents.delete(ref.path); }),
      });
      writes.forEach(write => write());
      return result;
    });
    this.queue = task.then(() => undefined, () => undefined);
    return task;
  }
}
