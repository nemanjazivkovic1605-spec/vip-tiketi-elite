import { User, MembershipStatus } from '../types';
import { DEMO_USERS } from '../lib/demoData';

const AUTH_KEY = 'elite_tips_auth_user';

const USERS_KEY = 'elite_tips_users';

export const mockAuthService = {
  getUsers: (): User[] => {
    const stored = localStorage.getItem(USERS_KEY);
    if (stored) return JSON.parse(stored);
    localStorage.setItem(USERS_KEY, JSON.stringify(DEMO_USERS));
    return DEMO_USERS;
  },

  getCurrentUser: (): User | null => {
    const stored = localStorage.getItem(AUTH_KEY);
    return stored ? JSON.parse(stored) : null;
  },

  login: async (email: string, password: string): Promise<User> => {
    console.log('Logging in...', email);
    await new Promise(resolve => setTimeout(resolve, 800));

    const users = mockAuthService.getUsers();
    const user = users.find(u => u.email === email);
    
    if (!user) {
      throw new Error('Korisnik nije pronađen');
    }

    localStorage.setItem(AUTH_KEY, JSON.stringify(user));
    return user;
  },

  register: async (email: string, password: string): Promise<User> => {
    console.log('Registering...', email);
    await new Promise(resolve => setTimeout(resolve, 1000));

    const users = mockAuthService.getUsers();
    if (users.some(u => u.email === email)) {
      throw new Error('Email je već u upotrebi');
    }

    const newUser: User = {
      id: Math.random().toString(36).substr(2, 9),
      email,
      emailVerified: false,
      membershipStatus: MembershipStatus.PENDING,
      isAdmin: false,
      registeredAt: new Date().toISOString().split('T')[0],
      displayName: email.split('@')[0]
    };

    const updatedUsers = [...users, newUser];
    localStorage.setItem(USERS_KEY, JSON.stringify(updatedUsers));
    localStorage.setItem(AUTH_KEY, JSON.stringify(newUser));
    return newUser;
  },

  logout: () => {
    localStorage.removeItem(AUTH_KEY);
    window.location.href = '/';
  },

  sendVerificationEmail: async () => {
    console.log('Sending verification email...');
    await new Promise(resolve => setTimeout(resolve, 500));
    const user = mockAuthService.getCurrentUser();
    if (user) {
      user.emailVerified = true;
      mockAuthService.updateUser(user);
      localStorage.setItem(AUTH_KEY, JSON.stringify(user));
    }
  },

  // Admin helpers
  updateUser: (updatedUser: User) => {
    const users = mockAuthService.getUsers();
    const index = users.findIndex(u => u.id === updatedUser.id);
    if (index !== -1) {
      users[index] = updatedUser;
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
      
      // Update current user if it's the same
      const current = mockAuthService.getCurrentUser();
      if (current && current.id === updatedUser.id) {
        localStorage.setItem(AUTH_KEY, JSON.stringify(updatedUser));
      }
    }
  },

  deleteUser: (userId: string) => {
    const users = mockAuthService.getUsers();
    const updated = users.filter(u => u.id !== userId);
    localStorage.setItem(USERS_KEY, JSON.stringify(updated));
  },

  resetUsers: () => {
    localStorage.setItem(USERS_KEY, JSON.stringify(DEMO_USERS));
  }
};
