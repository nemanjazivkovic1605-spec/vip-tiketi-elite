import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import fallbackFirebaseConfig from '../../firebase-applet-config.json';

type EliteFirebaseConfig = FirebaseOptions & {
  firestoreDatabaseId?: string;
};

const getEnvValue = (key: keyof ImportMetaEnv) => {
  const value = import.meta.env[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const firebaseConfig: EliteFirebaseConfig = {
  apiKey: getEnvValue('VITE_FIREBASE_API_KEY') || fallbackFirebaseConfig.apiKey,
  authDomain: getEnvValue('VITE_FIREBASE_AUTH_DOMAIN') || fallbackFirebaseConfig.authDomain,
  projectId: getEnvValue('VITE_FIREBASE_PROJECT_ID') || fallbackFirebaseConfig.projectId,
  appId: getEnvValue('VITE_FIREBASE_APP_ID') || fallbackFirebaseConfig.appId,
  storageBucket: getEnvValue('VITE_FIREBASE_STORAGE_BUCKET') || fallbackFirebaseConfig.storageBucket,
  messagingSenderId: getEnvValue('VITE_FIREBASE_MESSAGING_SENDER_ID') || fallbackFirebaseConfig.messagingSenderId,
  measurementId: getEnvValue('VITE_FIREBASE_MEASUREMENT_ID') || fallbackFirebaseConfig.measurementId,
  firestoreDatabaseId: getEnvValue('VITE_FIRESTORE_DATABASE_ID') || fallbackFirebaseConfig.firestoreDatabaseId,
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
