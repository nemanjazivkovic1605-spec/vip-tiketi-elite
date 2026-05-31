import {
  deleteDoc,
  getDoc,
  setDoc,
  type DocumentData,
  type DocumentReference,
} from 'firebase/firestore';

const toComparableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(toComparableValue);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    if ('toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
      return (value as { toDate: () => Date }).toDate().toISOString();
    }

    return Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((result, [key, entry]) => {
        if (entry !== undefined) result[key] = toComparableValue(entry);
        return result;
      }, {});
  }

  return value;
};

const stableStringify = (value: unknown) => JSON.stringify(toComparableValue(value));

export const setDocIfChanged = async (
  reference: DocumentReference,
  data: DocumentData,
): Promise<boolean> => {
  const snapshot = await getDoc(reference);
  if (snapshot.exists() && stableStringify(snapshot.data()) === stableStringify(data)) {
    return false;
  }

  await setDoc(reference, data);
  return true;
};

export const deleteDocIfExists = async (reference: DocumentReference): Promise<boolean> => {
  const snapshot = await getDoc(reference);
  if (!snapshot.exists()) return false;

  await deleteDoc(reference);
  return true;
};
