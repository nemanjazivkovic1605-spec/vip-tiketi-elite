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
  {
    name: 'Marko P.',
    rating: 5,
    text: 'Najviše mi odgovara što mogu da proverim kompletnu istoriju tiketa. Retko se viđa tolika transparentnost.',
    date: '2026-01-12',
  },
  {
    name: 'Nikola S.',
    rating: 5,
    text: 'Pratim tipove nekoliko nedelja. Sviđa mi se pregled statistike i jednostavan prikaz rezultata.',
    date: '2026-01-28',
  },
  {
    name: 'Stefan M.',
    rating: 4,
    text: 'Dobar koncept i pregledan sajt. Voleo bih da ima još analiza za pojedine mečeve.',
    date: '2026-02-17',
  },
  {
    name: 'Aleksandar K.',
    rating: 5,
    text: 'Safe Pick sekcija mi je posebno korisna jer ne jurim velike kvote.',
    date: '2026-03-03',
  },
  {
    name: 'Milan D.',
    rating: 4,
    text: 'Sajt izgleda profesionalno i lako se pronalaze informacije.',
    date: '2026-03-21',
  },
  {
    name: 'Jovan R.',
    rating: 5,
    text: 'Veliki plus za javnu istoriju i statistiku. Sve može da se proveri.',
    date: '2026-04-08',
  },
  {
    name: 'Nenad V.',
    rating: 5,
    text: 'Dopada mi se što se ne forsiraju nerealne priče. Rezultati su prikazani jasno, i dobici i promašaji.',
    date: '2026-04-26',
  },
  {
    name: 'Vladimir T.',
    rating: 4,
    text: 'Koristim uglavnom manje uloge i zato mi odgovara units pristup. Pregled je čist i razumljiv.',
    date: '2026-05-14',
  },
  {
    name: 'Ivan Ž.',
    rating: 5,
    text: 'Istorija po mesecima mi je najvažniji deo sajta. Lako vidim kako se platforma pokazala kroz duži period.',
    date: '2026-05-29',
  },
  {
    name: 'Darko N.',
    rating: 5,
    text: 'Gold paket mi je za sada sasvim korektan. Najviše cenim što se tipovi objavljuju pregledno.',
    date: '2026-06-02',
  },
  {
    name: 'Dejan P.',
    rating: 5,
    text: 'Transparentnost je ono zbog čega sam nastavio da pratim. Nema skrivanja kada tiket ne prođe.',
    date: '2026-02-05',
  },
  {
    name: 'Goran M.',
    rating: 4,
    text: 'Dobar sistem za praćenje rezultata. Mobilni prikaz mi je posebno praktičan.',
    date: '2026-04-15',
  },
  {
    name: 'Bojan S.',
    rating: 5,
    text: 'Kratko, jasno i korisno.',
    date: '2026-03-10',
  },
  {
    name: 'Nemanja R.',
    rating: 5,
    text: 'VIP analize često skrenu pažnju na detalje koje bih preskočio kada gledam samo kvotu.',
    date: '2026-05-06',
  },
  {
    name: 'Luka J.',
    rating: 5,
    text: 'Ozbiljan pristup.',
    date: '2026-01-19',
  },
  {
    name: 'Petar K.',
    rating: 5,
    text: 'Sviđa mi se balans između Safe Pick-a i jačih tiketa. Nije sve napravljeno samo da izgleda atraktivno.',
    date: '2026-06-05',
  },
].map((review, index) => ({
  id: `seed-review-${index + 1}`,
  userId: 'seed',
  name: review.name,
  rating: review.rating,
  text: review.text,
  status: 'approved',
  createdAt: `${review.date}T12:00:00.000Z`,
  approvedAt: `${review.date}T12:00:00.000Z`,
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
