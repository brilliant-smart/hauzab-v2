import { createContext, useContext, useEffect, useState } from "react";
import { AuthState, User } from "./types";
import { tokenStorage } from "./token";
import * as authService from "./authService";
import axios from "axios";

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const USER_KEY = 'hauzab_user';

function persistUser(user: User | null) {
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(USER_KEY);
  }
}

function loadCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: tokenStorage.get(),
    isAuthenticated: false,
  });

  const [loading, setLoading] = useState(true);

  // Restore auth on refresh — resilient to transient network errors
  useEffect(() => {
    const restoreAuth = async () => {
      const token = tokenStorage.get();

      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const user: User = await authService.me();
        persistUser(user);

        setState({
          user,
          token,
          isAuthenticated: true,
        });
      } catch (error: any) {
        // Only clear auth on 401 (token genuinely invalid/expired)
        // Network errors, timeouts, 5xx — keep cached session and retry later
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          tokenStorage.clear();
          persistUser(null);
          setState({
            user: null,
            token: null,
            isAuthenticated: false,
          });
        } else {
          // Transient failure — use cached user data if available
          const cachedUser = loadCachedUser();
          if (cachedUser) {
            setState({
              user: cachedUser,
              token,
              isAuthenticated: true,
            });
          } else {
            // No cached data and can't reach server — clear auth
            tokenStorage.clear();
            persistUser(null);
            setState({
              user: null,
              token: null,
              isAuthenticated: false,
            });
          }
        }
      } finally {
        setLoading(false);
      }
    };

    restoreAuth();
  }, []);

  const login = async (email: string, password: string): Promise<User> => {
    const { token, user } = await authService.login(email, password);

    tokenStorage.set(token);
    persistUser(user);

    setState({
      user,
      token,
      isAuthenticated: true,
    });

    return user;
  };

  const logout = async () => {
    await authService.logout();
    tokenStorage.clear();
    persistUser(null);

    setState({
      user: null,
      token: null,
      isAuthenticated: false,
    });
  };

  return (
    <AuthContext.Provider value={{ ...state, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return ctx;
}