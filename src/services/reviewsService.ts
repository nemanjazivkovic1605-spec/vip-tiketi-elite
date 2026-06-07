import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { type Review, type ReviewStatus } from '../types';

const REVIEWS_COLLECTION = 'reviews';

const seedReviews: Review[] = [
  ['Marko P.', 'Pratim tipove već mesec dana. Odlična statistika i transparentan rad.'],
  ['Nikola S.', 'Najviše mi se sviđa što je istorija potpuno javna i sve može da se proveri.'],
  ['Stefan M.', 'VIP tiket dana mi je doneo nekoliko lepih prolaza. Zadovoljan.'],
  ['Aleksandar K.', 'Bez lažnih obećanja i nerealnih kvota. Ozbiljan pristup.'],
  ['Milan D.', 'Analize su kratke i jasne. Tačno ono što treba.'],
  ['Jovan R.', 'Najpregledniji tipsterski sajt koji sam koristio.'],
  ['Nenad V.', 'Odlična komunikacija i redovna objava tipova.'],
  ['Vladimir T.', 'Safe Pick opcija je odlična za opreznije igrače.'],
  ['Ivan Ž.', 'Statistika i istorija ulivaju poverenje.'],
  ['Darko N.', 'Koristim Gold paket i za sada sam veoma zadovoljan.'],
  ['Dejan P.', 'Veliki plus za transparentnost i javne rezultate.'],
  ['Goran M.', 'Prvi put sam našao sajt gde se vide i promašaji.'],
  ['Bojan S.', 'Odličan odnos cene i kvaliteta.'],
  ['Nemanja R.', 'VIP analize često ukažu na detalje koje nisam primetio.'],
  ['Luka J.', 'Profesionalan izgled sajta i ozbiljan pristup.'],
  ['Petar K.', 'Prijatno iznenađenje. Nastavljam da pratim tipove.'],
].map(([name, text], index) => ({
  id: `seed-review-${index + 1}`,
  userId: 'seed',
  name,
  rating: 5,
  text,
  status: 'approved',
  createdAt: `2026-05-${String(16 + index).padStart(2, '0')}T12:00:00.000Z`,
  approvedAt: `2026-05-${String(16 + index).padStart(2, '0')}T12:00:00.000Z`,
}));

const reviewsCollection = () => collection(db, REVIEWS_COLLECTION);
const reviewDoc = (id: string) => doc(db, REVIEWS_COLLECTION, id);

const toIsoString = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return new Date().toISOString();
};

const normalizeReview = (id: string, data: DocumentData): Review => ({
  id,
  userId: typeof data.userId === 'string' ? data.userId : '',
  name: typeof data.name === 'string' ? data.name : 'Korisnik',
  rating: Math.min(5, Math.max(1, Number(data.rating) || 5)),
  text: typeof data.text === 'string' ? data.text : '',
  status: ['pending', 'approved', 'rejected'].includes(String(data.status)) ? data.status as ReviewStatus : 'pending',
  createdAt: toIsoString(data.createdAt),
  approvedAt: data.approvedAt ? toIsoString(data.approvedAt) : null,
});

const sortReviews = (reviews: Review[]) =>
  [...reviews].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export const reviewsService = {
  getApprovedReviews: async (): Promise<Review[]> => {
    try {
      const snapshot = await getDocs(query(
        reviewsCollection(),
        where('status', '==', 'approved'),
        orderBy('createdAt', 'desc'),
      ));
      const firestoreReviews = snapshot.docs.map((review) => normalizeReview(review.id, review.data()));
      return sortReviews([...firestoreReviews, ...seedReviews]);
    } catch (error) {
      console.warn('Approved reviews load failed. Using bundled reviews.', error);
      return sortReviews(seedReviews);
    }
  },

  getAllReviews: async (): Promise<Review[]> => {
    const snapshot = await getDocs(query(reviewsCollection(), orderBy('createdAt', 'desc')));
    return snapshot.docs.map((review) => normalizeReview(review.id, review.data()));
  },

  submitReview: async (payload: { userId: string; name: string; rating: number; text: string }): Promise<void> => {
    await addDoc(reviewsCollection(), {
      userId: payload.userId,
      name: payload.name.trim(),
      rating: Math.min(5, Math.max(1, Number(payload.rating) || 5)),
      text: payload.text.trim(),
      status: 'pending',
      createdAt: new Date().toISOString(),
      approvedAt: null,
    });
  },

  approveReview: async (id: string): Promise<void> => {
    await updateDoc(reviewDoc(id), {
      status: 'approved',
      approvedAt: new Date().toISOString(),
    });
  },

  rejectReview: async (id: string): Promise<void> => {
    await updateDoc(reviewDoc(id), {
      status: 'rejected',
      approvedAt: null,
    });
  },

  deleteReview: async (id: string): Promise<void> => {
    await deleteDoc(reviewDoc(id));
  },
};
