import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
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
import { sendWelcomeEmail } from './welcomeEmailService';
import { resendEmailService } from './resendEmailService';

const TRUSTED_ADMIN_EMAILS = ['nemanjazivkovic1605@gmail.com'];

export type RegisterPayload = {
  email: string;
  password: string;
  displayName?: string;
};

export type PlanId = 'free' | 'silver_7' | 'gold_30' | 'elite_90';

export const getFirebaseErrorDetails = (error: unknown) => {
  if (error instanceof FirebaseError) {
    const friendlyByCode: Record<string, string> = {
      'auth/email-already-in-use': 'Email adresa je već registrovana.',
      'auth/invalid-email': 'Email adresa nije validna.',
      'auth/invalid-credential': 'Neispravna email adresa ili lozinka. Ako nalog jos nije kreiran, prvo se registrujte.',
      'auth/user-not-found': 'Nalog sa ovom email adresom ne postoji. Prvo se registrujte.',
      'auth/wrong-password': 'Lozinka nije ispravna.',
      'auth/weak-password': 'Lozinka mora imati najmanje 6 karaktera.',
      'auth/too-many-requests': 'Previše pokušaja. Sačekajte nekoliko minuta ili resetujte lozinku.',
      'auth/operation-not-allowed': 'Email/Password provider nije uključen u Firebase Auth.',
      'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'Firebase API key nije validan.',
      'auth/invalid-api-key': 'Firebase API key nije validan.',
      'auth/network-request-failed': 'Mrežna greška pri povezivanju sa Firebase Auth.',
      'auth/unauthorized-domain': 'Domen za email verifikaciju nije dodat u Firebase Authorized domains.',
      'auth/unauthorized-continue-uri': 'Domen za email verifikaciju nije dodat u Firebase Authorized domains.',
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
  VIP_PACKAGES.find((plan) => plan.id === planId) || VIP_PACKAGES.find((plan) => plan.id === 'free') || VIP_PACKAGES[0];

const ADMIN_PLAN_ID: PlanId = 'elite_90';

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
  const role = data.role === 'admin' || data.isAdmin === true || isTrustedAdminEmail(email) ? 'admin' : 'user';
  const isAdmin = role === 'admin';
  const accountStatus = data.status === 'blocked' || data.accountStatus === 'blocked' ? 'blocked' : 'active';
  const emailVerified = isAdmin || firebaseUser?.emailVerified === true || data.emailVerified === true || data.verified === true;
  const rawMembership = getMembershipStatus(data, isAdmin, vipExpiresAt);
  const hasActiveVipEntitlement = accountStatus === 'active'
    && (data.vipApproved === true || data.vipAccess === true)
    && rawMembership === MembershipStatus.APPROVED
    && isFutureDate(vipExpiresAt);
  const hasActiveVip = emailVerified && hasActiveVipEntitlement;
  const computedStatus = accountStatus === 'blocked'
    ? MembershipStatus.BLOCKED
    : isAdmin || hasActiveVip
      ? MembershipStatus.APPROVED
      : rawMembership === MembershipStatus.PENDING
        ? MembershipStatus.PENDING
      : emailVerified
        ? MembershipStatus.FREE
        : rawMembership;
  const vipApproved = isAdmin || hasActiveVipEntitlement;
  const vipAccess = isAdmin || hasActiveVip;

  return {
    id: uid,
    uid,
    email,
    displayName: data.displayName || firebaseUser?.displayName || email.split('@')[0],
    emailVerified,
    verified: emailVerified,
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
    vipApproved,
    vipStatus: data.vipStatus || (isAdmin || hasActiveVip ? 'approved' : accountStatus === 'blocked' ? 'blocked' : 'inactive'),
    approved: isAdmin || data.approved === true || hasActiveVip,
    vipExpiresAt: vipExpiresAt || null,
    vip_expires_at: vipExpiresAt || null,
    approvedAt: toIsoString(data.approvedAt) || null,
    approvedBy: data.approvedBy || null,
    adminNote: data.adminNote || '',
  };
};

const getFreePlanPayload = () => {
  const freePlan = getPlanById('free');
  return {
    membershipStatus: MembershipStatus.FREE,
    plan: freePlan.id,
    planName: freePlan.name,
    planDurationDays: freePlan.durationDays,
    vipAccess: false,
    vipApproved: false,
    vipStatus: 'inactive',
    approved: false,
    vipExpiresAt: null,
    vip_expires_at: null,
  };
};

const getAccessNormalizationPayload = (firebaseUser: FirebaseUser, data: DocumentData) => {
  const email = normalizeEmail(data.email || firebaseUser.email);
  const isAdmin = isTrustedAdminEmail(email) || data.role === 'admin' || data.isAdmin === true;
  if (isAdmin) return null;

  const emailVerified = firebaseUser.emailVerified === true || data.emailVerified === true || data.verified === true;
  const accountStatus = data.status === 'blocked' || data.accountStatus === 'blocked' ? 'blocked' : 'active';
  const vipExpiresAt = getVipExpiresAt(data);
  const hasActiveVip = accountStatus === 'active'
    && data.membershipStatus === MembershipStatus.APPROVED
    && (data.vipApproved === true || data.vipAccess === true)
    && isFutureDate(vipExpiresAt);
  const hasPendingVipRequest = emailVerified
    && data.membershipStatus === MembershipStatus.PENDING
    && data.selectedPlan
    && data.selectedPlan !== 'free';

  if (accountStatus === 'blocked') {
    return {
      emailVerified,
      vipAccess: false,
      vipApproved: false,
      updatedAt: serverTimestamp(),
    };
  }

  if (hasActiveVip) {
    return {
      emailVerified,
      membershipStatus: MembershipStatus.APPROVED,
      status: 'active',
      accountStatus: 'active',
      vipAccess: true,
      vipApproved: true,
      updatedAt: serverTimestamp(),
    };
  }

  if (hasPendingVipRequest) {
    return {
      emailVerified: true,
      verified: true,
      status: 'active',
      accountStatus: 'active',
      membershipStatus: MembershipStatus.PENDING,
      vipAccess: false,
      vipApproved: false,
      vipStatus: 'pending',
      approved: false,
      vipExpiresAt: null,
      vip_expires_at: null,
      updatedAt: serverTimestamp(),
    };
  }

  if (emailVerified) {
    return {
      emailVerified: true,
      verified: true,
      status: 'active',
      accountStatus: 'active',
      ...getFreePlanPayload(),
      updatedAt: serverTimestamp(),
    };
  }

  return {
    emailVerified: false,
    verified: false,
    updatedAt: serverTimestamp(),
  };
};

const createInitialUserDocument = async (firebaseUser: FirebaseUser) => {
  const email = normalizeEmail(firebaseUser.email);
  const isAdmin = isTrustedAdminEmail(email);
  const activePlan = isAdmin ? getPlanById(ADMIN_PLAN_ID) : getPlanById('free');

  const payload = {
    uid: firebaseUser.uid,
    email,
    displayName: firebaseUser.displayName || email.split('@')[0],
    selectedPlan: activePlan.id,
    plan: isAdmin ? ADMIN_PLAN_ID : 'free',
    planName: activePlan.name,
    planDurationDays: activePlan.durationDays,
    role: isAdmin ? 'admin' : 'user',
    isAdmin,
    status: 'active',
    membershipStatus: isAdmin ? MembershipStatus.APPROVED : MembershipStatus.FREE,
    vipAccess: isAdmin,
    vipApproved: isAdmin,
    vipStatus: isAdmin ? 'approved' : 'inactive',
    approved: isAdmin,
    emailVerified: isAdmin || firebaseUser.emailVerified,
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

const bootstrapAdminUserDocument = async (firebaseUser: FirebaseUser) => {
  const email = normalizeEmail(firebaseUser.email);
  if (!isTrustedAdminEmail(email)) return;

  const adminPlan = getPlanById(ADMIN_PLAN_ID);
  await setDoc(doc(db, 'users', firebaseUser.uid), {
    uid: firebaseUser.uid,
    email,
    displayName: firebaseUser.displayName || email.split('@')[0],
    selectedPlan: adminPlan.id,
    plan: adminPlan.id,
    planName: adminPlan.name,
    planDurationDays: adminPlan.durationDays,
    role: 'admin',
    isAdmin: true,
    status: 'active',
    accountStatus: 'active',
    membershipStatus: MembershipStatus.APPROVED,
    vipAccess: true,
    vipApproved: true,
    vipStatus: 'approved',
    approved: true,
    emailVerified: true,
    vipExpiresAt: getExpiryDate(3650),
    vip_expires_at: getExpiryDate(3650),
    approvedAt: serverTimestamp(),
    approvedBy: email,
    updatedAt: serverTimestamp(),
  }, { merge: true });
};

const ensureUserDocument = async (firebaseUser: FirebaseUser): Promise<User> => {
  await reload(firebaseUser);
  await firebaseUser.getIdToken(true);
  const userRef = doc(db, 'users', firebaseUser.uid);
  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) {
    await createInitialUserDocument(firebaseUser);
  }

  await bootstrapAdminUserDocument(firebaseUser);

  const latestSnapshot = await getDoc(userRef);
  const normalizationPayload = getAccessNormalizationPayload(firebaseUser, latestSnapshot.data() || {});

  await setDoc(userRef, {
    emailVerified: isTrustedAdminEmail(firebaseUser.email) || firebaseUser.emailVerified || latestSnapshot.data()?.emailVerified === true,
    ...(normalizationPayload || {}),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  const ensuredSnapshot = await getDoc(userRef);
  return mapUserDoc(firebaseUser, ensuredSnapshot.data() || {}, firebaseUser.uid);
};

export const authService = {
  onUserChanged: (callback: (user: User | null) => void) => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        callback(null);
        return;
      }

      try {
        callback(await ensureUserDocument(firebaseUser));
      } catch (error) {
        console.error('Firebase user profile error:', error);
        callback(mapUserDoc(firebaseUser, {}, firebaseUser.uid));
      }
    });
  },

  login: async (email: string, password: string): Promise<User> => {
    const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
    return ensureUserDocument(credential.user);
  },

  register: async ({ email, password, displayName }: RegisterPayload): Promise<User> => {
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
    const activePlan = isAdmin ? getPlanById(ADMIN_PLAN_ID) : getPlanById('free');
    const payload = {
      uid: credential.user.uid,
      email: normalizedEmail,
      displayName: displayName?.trim() || normalizedEmail.split('@')[0],
      selectedPlan: activePlan.id,
      planName: activePlan.name,
      planDurationDays: activePlan.durationDays,
      role: isAdmin ? 'admin' : 'user',
      isAdmin,
      status: 'active',
      membershipStatus: isAdmin ? MembershipStatus.APPROVED : MembershipStatus.FREE,
      plan: isAdmin ? ADMIN_PLAN_ID : 'free',
      vipAccess: isAdmin,
      vipApproved: isAdmin,
      vipStatus: isAdmin ? 'approved' : 'inactive',
      approved: isAdmin,
      emailVerified: isAdmin || credential.user.emailVerified,
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
        selectedPlan: activePlan.id,
        createdAt: serverTimestamp(),
        read: false,
      });
      await batch.commit();
    } catch (error) {
      throw createDetailedError('Firestore users profil nije upisan', error);
    }

    try {
      if (!isAdmin && !credential.user.emailVerified && credential.user.email) {
        const token = await credential.user.getIdToken();
        await resendEmailService.sendVerificationEmail(credential.user.email, token);
      }
    } catch (error) {
      throw createDetailedError('Slanje verifikacionog emaila nije uspelo', error);
    }

    sendWelcomeEmail({
      email: normalizedEmail,
      name: payload.displayName,
      planName: activePlan.name,
    }).catch((error) => {
      console.error('Welcome email failed:', getFirebaseErrorDetails(error));
    });

    return mapUserDoc(credential.user, payload, credential.user.uid);
  },

  logout: () => signOut(auth),

  resendVerificationEmail: async () => {
    if (!auth.currentUser?.email) {
      throw new Error('Morate biti prijavljeni da biste poslali verifikacioni email.');
    }

    try {
      await reload(auth.currentUser);
      const token = await auth.currentUser.getIdToken(true);
      if (!auth.currentUser.emailVerified) {
        await resendEmailService.sendVerificationEmail(auth.currentUser.email, token);
      }
    } catch (error) {
      throw createDetailedError('Slanje verifikacionog emaila nije uspelo', error);
    }
  },

  refreshCurrentUser: async (): Promise<User | null> => {
    if (!auth.currentUser) return null;
    return ensureUserDocument(auth.currentUser);
  },

  resetPassword: async (email: string) => {
    try {
      await resendEmailService.sendPasswordResetEmail(email.trim());
    } catch (error) {
      throw createDetailedError('Reset lozinke nije uspeo', error);
    }
  },

  getUsers: async (): Promise<User[]> => {
    const snapshot = await getDocs(collection(db, 'users'));
    return snapshot.docs
      .map((userDoc) => mapUserDoc(null, userDoc.data(), userDoc.id))
      .sort((a, b) => (b.registeredAt || '').localeCompare(a.registeredAt || ''));
  },

  requestVipPlan: async (user: User, planId: Exclude<PlanId, 'free'>) => {
    const plan = getPlanById(planId);
    if (plan.id === 'free') {
      throw new Error('Izaberite VIP paket.');
    }

    const batch = writeBatch(db);
    batch.update(doc(db, 'users', user.id), {
      selectedPlan: plan.id,
      planName: plan.name,
      planDurationDays: plan.durationDays,
      membershipStatus: MembershipStatus.PENDING,
      plan: 'free',
      vipAccess: false,
      vipApproved: false,
      vipStatus: 'pending',
      approved: false,
      vipExpiresAt: null,
      vip_expires_at: null,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(collection(db, 'adminNotifications')), {
      type: 'vip_plan_request',
      userEmail: user.email,
      username: user.displayName || user.email,
      selectedPlan: plan.id,
      createdAt: serverTimestamp(),
      read: false,
    });
    await batch.commit();
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
      vipApproved: true,
      vipStatus: 'approved',
      approved: true,
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

  verifyUser: async (user: User) => {
    const hasActiveVip = user.membershipStatus === MembershipStatus.APPROVED && isFutureDate(user.vipExpiresAt || user.vip_expires_at);
    await updateDoc(doc(db, 'users', user.id), {
      emailVerified: true,
      verified: true,
      status: 'active',
      accountStatus: 'active',
      ...(hasActiveVip ? {} : getFreePlanPayload()),
      updatedAt: serverTimestamp(),
    });
  },

  setFreeUser: async (user: User) => {
    await updateDoc(doc(db, 'users', user.id), {
      status: 'active',
      accountStatus: 'active',
      ...getFreePlanPayload(),
      updatedAt: serverTimestamp(),
    });
  },

  rejectUser: async (userId: string) => {
    await updateDoc(doc(db, 'users', userId), {
      membershipStatus: MembershipStatus.REMOVED,
      plan: 'free',
      selectedPlan: 'free',
      vipAccess: false,
      vipApproved: false,
      vipStatus: 'removed',
      approved: false,
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
      vipApproved: true,
      vipStatus: 'approved',
      approved: true,
      vipExpiresAt: getExpiryDate(duration, base),
      vip_expires_at: getExpiryDate(duration, base),
      updatedAt: serverTimestamp(),
    });
  },

  removeVip: async (userId: string) => {
    await updateDoc(doc(db, 'users', userId), {
      status: 'active',
      accountStatus: 'active',
      membershipStatus: MembershipStatus.REMOVED,
      plan: 'free',
      selectedPlan: 'free',
      vipAccess: false,
      vipApproved: false,
      vipStatus: 'removed',
      approved: false,
      vipExpiresAt: null,
      vip_expires_at: null,
      updatedAt: serverTimestamp(),
    });
  },

  blockUser: async (userId: string) => {
    await updateDoc(doc(db, 'users', userId), {
      status: 'blocked',
      accountStatus: 'blocked',
      membershipStatus: MembershipStatus.BLOCKED,
      vipAccess: false,
      vipApproved: false,
      vipStatus: 'blocked',
      approved: false,
      updatedAt: serverTimestamp(),
    });
  },

  unblockUser: async (userId: string) => {
    await updateDoc(doc(db, 'users', userId), {
      status: 'active',
      accountStatus: 'active',
      membershipStatus: MembershipStatus.FREE,
      plan: 'free',
      selectedPlan: 'free',
      vipAccess: false,
      vipApproved: false,
      vipStatus: 'inactive',
      approved: false,
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
