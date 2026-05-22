import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
  type Timestamp,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { VIP_PACKAGES } from '../lib/demoData';
import { MembershipStatus, type AdminNotification, type User, type VipPackage } from '../types';

export const SELECTED_PLAN_STORAGE_KEY = 'elite_selected_vip_plan';
const TRUSTED_ADMIN_EMAILS = ['nemanjazivkovic1605@gmail.com'];

export type RegisterPayload = {
  email: string;
  password: string;
  displayName?: string;
  selectedPlan: string;
};

export type PlanId = 'free' | 'silver_7' | 'gold_30' | 'elite_90';

export const getFirebaseErrorDetails = (error: unknown) => {
  if (error instanceof FirebaseError) {
    const friendlyByCode: Record<string, string> = {
      'auth/email-already-in-use': 'Email adresa je već registrovana.',
      'auth/invalid-email': 'Email adresa nije validna.',
      'auth/weak-password': 'Lozinka mora imati najmanje 6 karaktera.',
      'auth/operation-not-allowed': 'Email/Password provider nije uključen u Firebase Auth.',
      'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'Firebase API key nije validan.',
      'auth/invalid-api-key': 'Firebase API key nije validan.',
      'auth/network-request-failed': 'Mrežna greška pri povezivanju sa Firebase Auth.',
      'auth/unauthorized-domain': 'Domen nije dodat u Firebase Auth Authorized domains.',
      'permission-denied': 'Firestore pravila su odbila upis korisničkog profila.',
    };

    return {
      code: error.code,
      message: friendlyByCode[error.code] || error.message,
      rawMessage: error.message,
    };
  }

  if (error instanceof Error) {
    return {
      code: 'unknown',
      message: error.message,
      rawMessage: error.message,
    };
  }

  return {
    code: 'unknown',
    message: String(error),
    rawMessage: String(error),
  };
};

const createDetailedError = (stage: string, error: unknown) => {
  const details = getFirebaseErrorDetails(error);
  const detailedError = new Error(`${stage}: ${details.message} (${details.code})`);
  detailedError.name = details.code;
  return detailedError;
};

const normalizeEmail = (email?: string | null) => (email || '').trim().toLowerCase();

export const isTrustedAdminEmail = (email?: string | null) =>
  TRUSTED_ADMIN_EMAILS.includes(normalizeEmail(email));

export const getPlanById = (planId?: string | null): VipPackage =>
  VIP_PACKAGES.find((plan) => plan.id === planId) || VIP_PACKAGES[1];

export const saveSelectedPlan = (planId: string) => {
  sessionStorage.setItem(SELECTED_PLAN_STORAGE_KEY, planId);
};

export const getSavedSelectedPlan = () => {
  return sessionStorage.getItem(SELECTED_PLAN_STORAGE_KEY) || VIP_PACKAGES[1].id;
};

const toIsoString = (value: unknown): string | undefined => {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && 'toDate' in value && typeof (value as Timestamp).toDate === 'function') {
    return (value as Timestamp).toDate().toISOString();
  }
  return undefined;
};

const isFutureDate = (value?: string | null) => {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time > Date.now();
};

const getExpiryDate = (durationDays: number, fromDate = new Date()) => {
  const expiresAt = new Date(fromDate);
  expiresAt.setDate(expiresAt.getDate() + durationDays);
  return expiresAt;
};

const getVipExpiresAt = (data: DocumentData) =>
  toIsoString(data.vipExpiresAt) || toIsoString(data.vip_expires_at);

const isMembershipValue = (value: unknown): value is MembershipStatus =>
  typeof value === 'string' && Object.values(MembershipStatus).includes(value as MembershipStatus);

const getMembershipStatus = (data: DocumentData, isAdmin: boolean, vipExpiresAt?: string) => {
  const rawMembership = data.membershipStatus || (isMembershipValue(data.status) ? data.status : undefined) || MembershipStatus.FREE;

  if (!isAdmin && rawMembership === MembershipStatus.APPROVED && !isFutureDate(vipExpiresAt)) {
    return MembershipStatus.EXPIRED;
  }

  return rawMembership as MembershipStatus;
};

const mapUserDoc = (firebaseUser: FirebaseUser | null, data: DocumentData, uid: string): User => {
  const email = normalizeEmail(data.email || firebaseUser?.email);
  const vipExpiresAt = getVipExpiresAt(data);
  const createdAt = toIsoString(data.createdAt) || new Date().toISOString();
  const role = data.role === 'admin' || isTrustedAdminEmail(email) ? 'admin' : 'user';
  const isAdmin = role === 'admin';
  const accountStatus = data.status === 'blocked' || data.accountStatus === 'blocked' ? 'blocked' : 'active';
  const computedStatus = accountStatus === 'blocked'
    ? MembershipStatus.BLOCKED
    : getMembershipStatus(data, isAdmin, vipExpiresAt);
  const vipAccess = isAdmin || (accountStatus === 'active' && computedStatus === MembershipStatus.APPROVED && isFutureDate(vipExpiresAt));

  return {
    id: uid,
    uid,
    email,
    displayName: data.displayName || firebaseUser?.displayName || email.split('@')[0],
    emailVerified: isAdmin || firebaseUser?.emailVerified === true || data.emailVerified === true,
    membershipStatus: computedStatus as MembershipStatus,
    status: accountStatus,
    accountStatus,
    role,
    isAdmin,
    registeredAt: createdAt.split('T')[0],
    selectedPlan: data.selectedPlan || data.plan || 'free',
    plan: data.plan || data.selectedPlan || 'free',
    planName: data.planName,
    planDurationDays: data.planDurationDays,
    membershipExpDate: vipExpiresAt?.split('T')[0],
    vipAccess,
    vipExpiresAt: vipExpiresAt || null,
    vip_expires_at: vipExpiresAt || null,
    approvedAt: toIsoString(data.approvedAt) || null,
    approvedBy: data.approvedBy || null,
    adminNote: data.adminNote || '',
  };
};

const createInitialUserDocument = async (firebaseUser: FirebaseUser, selectedPlanId?: string) => {
  const email = normalizeEmail(firebaseUser.email);
  const isAdmin = isTrustedAdminEmail(email);
  const plan = getPlanById(selectedPlanId);

  const payload = {
    uid: firebaseUser.uid,
    email,
    displayName: firebaseUser.displayName || email.split('@')[0],
    selectedPlan: plan.id,
    plan: isAdmin ? 'elite_90' : 'free',
    planName: plan.name,
    planDurationDays: plan.durationDays,
    role: isAdmin ? 'admin' : 'user',
    status: 'active',
    membershipStatus: isAdmin ? MembershipStatus.APPROVED : MembershipStatus.FREE,
    vipAccess: isAdmin,
    vipExpiresAt: isAdmin ? getExpiryDate(3650) : null,
    vip_expires_at: isAdmin ? getExpiryDate(3650) : null,
    approvedAt: isAdmin ? serverTimestamp() : null,
    approvedBy: isAdmin ? email : null,
    adminNote: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(db, 'users', firebaseUser.uid), payload, { merge: true });
};

export const authService = {
  onUserChanged: (callback: (user: User | null) => void) => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        callback(null);
        return;
      }

      try {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const snapshot = await getDoc(userRef);

        if (!snapshot.exists()) {
          await createInitialUserDocument(firebaseUser);
          const createdSnapshot = await getDoc(userRef);
          callback(mapUserDoc(firebaseUser, createdSnapshot.data() || {}, firebaseUser.uid));
          return;
        }

        callback(mapUserDoc(firebaseUser, snapshot.data(), firebaseUser.uid));
      } catch (error) {
        console.error('Firebase user profile error:', error);
        callback(mapUserDoc(firebaseUser, {}, firebaseUser.uid));
      }
    });
  },

  login: async (email: string, password: string): Promise<User> => {
    const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
    const userRef = doc(db, 'users', credential.user.uid);
    const snapshot = await getDoc(userRef);

    if (!snapshot.exists()) {
      await createInitialUserDocument(credential.user);
      const createdSnapshot = await getDoc(userRef);
      return mapUserDoc(credential.user, createdSnapshot.data() || {}, credential.user.uid);
    }

    return mapUserDoc(credential.user, snapshot.data(), credential.user.uid);
  },

  register: async ({ email, password, displayName, selectedPlan }: RegisterPayload): Promise<User> => {
    const plan = getPlanById(selectedPlan);
    let credential;

    try {
      credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
    } catch (error) {
      throw createDetailedError('Firebase Auth registracija nije uspela', error);
    }

    try {
      if (displayName?.trim()) {
        await updateProfile(credential.user, { displayName: displayName.trim() });
      }
    } catch (error) {
      console.error('Firebase profile update error:', getFirebaseErrorDetails(error));
    }

    const normalizedEmail = normalizeEmail(credential.user.email);
    const isAdmin = isTrustedAdminEmail(normalizedEmail);
    const payload = {
      uid: credential.user.uid,
      email: normalizedEmail,
      displayName: displayName?.trim() || normalizedEmail.split('@')[0],
      selectedPlan: plan.id,
      planName: plan.name,
      planDurationDays: plan.durationDays,
      role: isAdmin ? 'admin' : 'user',
      status: 'active',
      membershipStatus: isAdmin ? MembershipStatus.APPROVED : (plan.id === 'free' ? MembershipStatus.FREE : MembershipStatus.PENDING),
      plan: isAdmin ? 'elite_90' : 'free',
      vipAccess: isAdmin,
      vipExpiresAt: isAdmin ? getExpiryDate(3650) : null,
      vip_expires_at: isAdmin ? getExpiryDate(3650) : null,
      approvedAt: isAdmin ? serverTimestamp() : null,
      approvedBy: isAdmin ? normalizedEmail : null,
      adminNote: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'users', credential.user.uid), payload);
      batch.set(doc(collection(db, 'adminNotifications')), {
        type: 'new_user_registration',
        userEmail: normalizedEmail,
        username: payload.displayName,
        selectedPlan: plan.id,
        createdAt: serverTimestamp(),
        read: false,
      });
      await batch.commit();
    } catch (error) {
      throw createDetailedError('Firestore users profil nije upisan', error);
    }

    sessionStorage.removeItem(SELECTED_PLAN_STORAGE_KEY);

    return mapUserDoc(credential.user, payload, credential.user.uid);
  },

  logout: () => signOut(auth),

  getUsers: async (): Promise<User[]> => {
    const snapshot = await getDocs(collection(db, 'users'));
    return snapshot.docs
      .map((userDoc) => mapUserDoc(null, userDoc.data(), userDoc.id))
      .sort((a, b) => (b.registeredAt || '').localeCompare(a.registeredAt || ''));
  },

  activatePlan: async (user: User, planId: PlanId, adminEmail?: string | null) => {
    const plan = getPlanById(planId);
    await updateDoc(doc(db, 'users', user.id), {
      membershipStatus: MembershipStatus.APPROVED,
      plan: plan.id,
      selectedPlan: plan.id,
      planName: plan.name,
      planDurationDays: plan.durationDays,
      status: 'active',
      vipAccess: true,
      vipExpiresAt: getExpiryDate(plan.durationDays),
      vip_expires_at: getExpiryDate(plan.durationDays),
      approvedAt: serverTimestamp(),
      approvedBy: adminEmail || auth.currentUser?.email || null,
      updatedAt: serverTimestamp(),
    });
  },

  approveUser: async (user: User, adminEmail?: string | null) => {
    const planId = (user.selectedPlan && user.selectedPlan !== 'free' ? user.selectedPlan : 'gold_30') as PlanId;
    await authService.activatePlan(user, planId, adminEmail);
  },

  rejectUser: async (userId: string) => {
    await updateDoc(doc(db, 'users', userId), {
      membershipStatus: MembershipStatus.REMOVED,
      plan: 'free',
      selectedPlan: 'free',
      vipAccess: false,
      vipExpiresAt: null,
      vip_expires_at: null,
      updatedAt: serverTimestamp(),
    });
  },

  extendUser: async (user: User, days?: number) => {
    const duration = days || user.planDurationDays || getPlanById(user.selectedPlan).durationDays || 7;
    const base = user.vip_expires_at && isFutureDate(user.vip_expires_at)
      ? new Date(user.vip_expires_at)
      : new Date();

    await updateDoc(doc(db, 'users', user.id), {
      membershipStatus: MembershipStatus.APPROVED,
      status: 'active',
      vipAccess: true,
      vipExpiresAt: getExpiryDate(duration, base),
      vip_expires_at: getExpiryDate(duration, base),
      updatedAt: serverTimestamp(),
    });
  },

  removeVip: async (userId: string) => {
    await updateDoc(doc(db, 'users', userId), {
      membershipStatus: MembershipStatus.REMOVED,
      plan: 'free',
      selectedPlan: 'free',
      vipAccess: false,
      vipExpiresAt: null,
      vip_expires_at: null,
      updatedAt: serverTimestamp(),
    });
  },

  blockUser: async (userId: string) => {
    await updateDoc(doc(db, 'users', userId), {
      status: 'blocked',
      membershipStatus: MembershipStatus.BLOCKED,
      vipAccess: false,
      updatedAt: serverTimestamp(),
    });
  },

  unblockUser: async (userId: string) => {
    await updateDoc(doc(db, 'users', userId), {
      status: 'active',
      membershipStatus: MembershipStatus.FREE,
      plan: 'free',
      selectedPlan: 'free',
      vipAccess: false,
      vipExpiresAt: null,
      vip_expires_at: null,
      updatedAt: serverTimestamp(),
    });
  },

  updateAdminNote: async (userId: string, adminNote: string) => {
    await updateDoc(doc(db, 'users', userId), {
      adminNote,
      updatedAt: serverTimestamp(),
    });
  },

  getAdminNotifications: async (): Promise<AdminNotification[]> => {
    const snapshot = await getDocs(collection(db, 'adminNotifications'));
    return snapshot.docs
      .map((notificationDoc) => {
        const data = notificationDoc.data();
        return {
          id: notificationDoc.id,
          type: data.type || 'new_user_registration',
          userEmail: data.userEmail || '',
          username: data.username || '',
          selectedPlan: data.selectedPlan || 'free',
          createdAt: toIsoString(data.createdAt) || new Date().toISOString(),
          read: data.read === true,
        } as AdminNotification;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  subscribeAdminNotifications: (callback: (notifications: AdminNotification[]) => void) => {
    return onSnapshot(collection(db, 'adminNotifications'), (snapshot) => {
      callback(snapshot.docs
        .map((notificationDoc) => {
          const data = notificationDoc.data();
          return {
            id: notificationDoc.id,
            type: data.type || 'new_user_registration',
            userEmail: data.userEmail || '',
            username: data.username || '',
            selectedPlan: data.selectedPlan || 'free',
            createdAt: toIsoString(data.createdAt) || new Date().toISOString(),
            read: data.read === true,
          } as AdminNotification;
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    });
  },

  markNotificationRead: async (notificationId: string) => {
    await updateDoc(doc(db, 'adminNotifications', notificationId), {
      read: true,
      updatedAt: serverTimestamp(),
    });
  },

  deleteUser: async (user: User) => {
    if (isTrustedAdminEmail(user.email)) return;
    await deleteDoc(doc(db, 'users', user.id));
  },
};
