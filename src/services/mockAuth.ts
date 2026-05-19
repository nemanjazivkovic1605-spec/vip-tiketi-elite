import { User, MembershipStatus } from '../types';
import { DEMO_USERS } from '../lib/demoData';

const AUTH_KEY = 'elite_tips_auth_user';
const USERS_KEY = 'elite_tips_users';
export const AUTH_UPDATED_EVENT = 'elite_auth_updated';

const TRUSTED_ADMIN_EMAILS = ['nemanjazivkovic1605@gmail.com'];

const isTrustedAdminEmail = (email?: string) =>
  TRUSTED_ADMIN_EMAILS.includes((email || '').trim().toLowerCase());

const createTrustedAdminUser = (email: string): User => ({
  id: 'trusted-admin-nemanja',
  email: email.toLowerCase(),
  emailVerified: true,
  membershipStatus: MembershipStatus.APPROVED,
  isAdmin: true,
  registeredAt: new Date().toISOString().split('T')[0],
  displayName: 'Nemanja Admin',
});

const normalizeUser = (user: User): User => {
  if (!isTrustedAdminEmail(user.email)) return user;

  return {
    ...user,
    email: user.email.toLowerCase(),
    emailVerified: true,
    membershipStatus: MembershipStatus.APPROVED,
    isAdmin: true,
    displayName: user.displayName || 'Nemanja Admin',
  };
};

const emitAuthUpdated = () => {
  window.dispatchEvent(new Event(AUTH_UPDATED_EVENT));
};

const persistUsers = (users: User[]) => {
  localStorage.setItem(USERS_KEY, JSON.stringify(users.map(normalizeUser)));
};

const ensureTrustedAdmins = (users: User[]) => {
  const normalizedUsers = users.map(normalizeUser);

  TRUSTED_ADMIN_EMAILS.forEach((email) => {
    if (!normalizedUsers.some((user) => user.email.toLowerCase() === email)) {
      normalizedUsers.push(createTrustedAdminUser(email));
    }
  });

  persistUsers(normalizedUsers);
  return normalizedUsers;
};

export const mockAuthService = {
  getUsers: (): User[] => {
    const stored = localStorage.getItem(USERS_KEY);
    const users = stored ? JSON.parse(stored) as User[] : DEMO_USERS;
    return ensureTrustedAdmins(users);
  },

  getCurrentUser: (): User | null => {
    const stored = localStorage.getItem(AUTH_KEY);
    if (!stored) return null;

    const user = normalizeUser(JSON.parse(stored));
    localStorage.setItem(AUTH_KEY, JSON.stringify(user));
    return user;
  },

  login: async (email: string, password: string): Promise<User> => {
    console.log('Logging in...', email);
    await new Promise(resolve => setTimeout(resolve, 800));

    const normalizedEmail = email.trim().toLowerCase();
    const users = mockAuthService.getUsers();
    const user = users.find(u => u.email.toLowerCase() === normalizedEmail);

    if (!user) {
      throw new Error('Korisnik nije pronadjen');
    }

    const normalizedUser = normalizeUser(user);
    localStorage.setItem(AUTH_KEY, JSON.stringify(normalizedUser));
    emitAuthUpdated();
    return normalizedUser;
  },

  register: async (email: string, password: string): Promise<User> => {
    console.log('Registering...', email);
    await new Promise(resolve => setTimeout(resolve, 1000));

    const normalizedEmail = email.trim().toLowerCase();
    const users = mockAuthService.getUsers();

    if (users.some(u => u.email.toLowerCase() === normalizedEmail)) {
      throw new Error('Email je vec u upotrebi');
    }

    const newUser: User = normalizeUser({
      id: Math.random().toString(36).substr(2, 9),
      email: normalizedEmail,
      emailVerified: isTrustedAdminEmail(normalizedEmail),
      membershipStatus: isTrustedAdminEmail(normalizedEmail) ? MembershipStatus.APPROVED : MembershipStatus.PENDING,
      isAdmin: isTrustedAdminEmail(normalizedEmail),
      registeredAt: new Date().toISOString().split('T')[0],
      displayName: normalizedEmail.split('@')[0],
    });

    persistUsers([...users, newUser]);
    localStorage.setItem(AUTH_KEY, JSON.stringify(newUser));
    emitAuthUpdated();
    return newUser;
  },

  logout: () => {
    localStorage.removeItem(AUTH_KEY);
    emitAuthUpdated();
    window.location.href = '/';
  },

  sendVerificationEmail: async () => {
    console.log('Sending verification email...');
    await new Promise(resolve => setTimeout(resolve, 500));

    const user = mockAuthService.getCurrentUser();
    if (user) {
      const updatedUser = normalizeUser({ ...user, emailVerified: true });
      mockAuthService.updateUser(updatedUser);
      localStorage.setItem(AUTH_KEY, JSON.stringify(updatedUser));
      emitAuthUpdated();
    }
  },

  updateUser: (updatedUser: User) => {
    const users = mockAuthService.getUsers();
    const normalizedUser = normalizeUser(updatedUser);
    const index = users.findIndex(u => u.id === normalizedUser.id || u.email.toLowerCase() === normalizedUser.email.toLowerCase());

    if (index !== -1) {
      users[index] = normalizedUser;
      persistUsers(users);

      const current = mockAuthService.getCurrentUser();
      if (current && (current.id === normalizedUser.id || current.email.toLowerCase() === normalizedUser.email.toLowerCase())) {
        localStorage.setItem(AUTH_KEY, JSON.stringify(normalizedUser));
      }

      emitAuthUpdated();
    }
  },

  deleteUser: (userId: string) => {
    const users = mockAuthService.getUsers();
    const user = users.find(u => u.id === userId);

    if (user && isTrustedAdminEmail(user.email)) {
      return;
    }

    persistUsers(users.filter(u => u.id !== userId));
    emitAuthUpdated();
  },

  resetUsers: () => {
    ensureTrustedAdmins(DEMO_USERS);
    emitAuthUpdated();
  },
};
