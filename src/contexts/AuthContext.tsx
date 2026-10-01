/**
 * AuthContext.tsx - Context Quản lý Xác thực & Phân quyền (Firebase Auth & RBAC)
 * Hỗ trợ Đa trường học (Multi-tenant), Tự động đồng bộ tài khoản & Auth State Guard
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { UserProfile, School, RegisterSchoolPayload } from '../types/school';
import {
  loginWithFirebaseAuth,
  registerSchoolAccount,
  ensureAndSyncUserDocument,
  initializeSuperAdmin,
  initSuperAdminAccount,
  auth,
} from '../services/authService';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  checkSchoolAccess,
  getSchoolById,
  getAllSchools,
} from '../services/schoolService';
import {
  getSchoolRef as getSchoolRefHelper,
  getActiveSchoolId,
} from '../services/firebaseClient';
import { DocumentReference } from 'firebase/firestore';

export const AUTH_STORAGE_KEY = 'tkb_auth_session_user';
export const SCHOOL_STORAGE_KEY = 'tkb_auth_session_school';

interface AuthContextType {
  user: UserProfile | null;
  school: School | null;
  schoolId: string;
  isAuthenticated: boolean;
  isLoading: boolean;
  isSchoolBlocked: boolean;
  blockedReason: string | null;
  login: (credentials: {
    identifier?: string;
    username?: string;
    phone?: string;
    email?: string;
    password?: string;
  }) => Promise<{
    success: boolean;
    error?: string;
    isBlocked?: boolean;
    user?: UserProfile;
    school?: School;
  }>;
  register: (payload: RegisterSchoolPayload) => Promise<{
    success: boolean;
    error?: string;
    school?: School;
    user?: UserProfile;
    isTrial?: boolean;
  }>;
  logout: () => void;
  switchDemoUser: (targetUser: UserProfile, targetSchool?: School) => Promise<boolean>;
  verifyCurrentAccess: () => Promise<boolean>;
  setDirectSchool: (school: School) => void;
  getSchoolRef: (schoolId?: string) => DocumentReference;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(() => {
    // Luôn bắt đầu bằng màn hình đăng nhập khi mở app
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem(AUTH_STORAGE_KEY);
        localStorage.removeItem(AUTH_STORAGE_KEY);
        sessionStorage.removeItem(SCHOOL_STORAGE_KEY);
        localStorage.removeItem(SCHOOL_STORAGE_KEY);
      } catch (e) {
        // ignore
      }
    }
    return null;
  });

  const [school, setSchool] = useState<School | null>(() => {
    return null;
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSchoolBlocked, setIsSchoolBlocked] = useState<boolean>(false);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);

  // 1. TỰ ĐỘNG LẮNG NGHE LẦN ĐẦU & ĐỒNG BỘ AUTH STATE GUARD
  useEffect(() => {
    const isExplicitlyLoggedIn = sessionStorage.getItem('tkb_explicitly_logged_in') === 'true';
    if (!isExplicitlyLoggedIn) {
      signOut(auth).catch(() => {});
      setUser(null);
      setSchool(null);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser && isExplicitlyLoggedIn) {
        setIsLoading(true);
        try {
          // Bắt buộc gọi hàm kiểm tra / khởi tạo /users/{user.uid} trước
          const syncedProfile = await ensureAndSyncUserDocument(firebaseUser);
          
          setUser(syncedProfile);
          sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(syncedProfile));
          localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(syncedProfile));

          if (syncedProfile.role === 'super_admin') {
            setIsSchoolBlocked(false);
            setBlockedReason(null);
            setSchool(null);
            localStorage.removeItem(SCHOOL_STORAGE_KEY);
            sessionStorage.removeItem(SCHOOL_STORAGE_KEY);
          } else if (syncedProfile.schoolId) {
            const sc = await getSchoolById(syncedProfile.schoolId);
            if (sc) {
              setSchool(sc);
              sessionStorage.setItem(SCHOOL_STORAGE_KEY, JSON.stringify(sc));
              localStorage.setItem(SCHOOL_STORAGE_KEY, JSON.stringify(sc));
              
              const accessResult = await checkSchoolAccess(syncedProfile);
              if (!accessResult.allowed) {
                setIsSchoolBlocked(true);
                setBlockedReason(accessResult.reason || 'Tài khoản chưa được kích hoạt hoặc đã hết hạn.');
              } else {
                setIsSchoolBlocked(false);
                setBlockedReason(null);
              }
            }
          }
        } catch (err) {
          console.warn('Lỗi khi Auth State Guard kiểm tra /users:', err);
        } finally {
          setIsLoading(false);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // 2. Tự động kiểm tra tính hợp lệ của tài khoản khi F5
  const verifyCurrentAccess = useCallback(async (): Promise<boolean> => {
    if (!user) {
      setIsLoading(false);
      return false;
    }

    try {
      if (user.role === 'super_admin') {
        setIsSchoolBlocked(false);
        setBlockedReason(null);
        setSchool(null);
        localStorage.removeItem(SCHOOL_STORAGE_KEY);
        sessionStorage.removeItem(SCHOOL_STORAGE_KEY);
        setIsLoading(false);
        return true;
      }

      const accessResult = await checkSchoolAccess(user);
      if (!accessResult.allowed) {
        setIsSchoolBlocked(true);
        setBlockedReason(
          accessResult.reason ||
            'Tài khoản trường học của bạn chưa được kích hoạt hoặc đã hết hạn. Vui lòng liên hệ Admin.'
        );
        if (accessResult.school) {
          setSchool(accessResult.school);
          sessionStorage.setItem(SCHOOL_STORAGE_KEY, JSON.stringify(accessResult.school));
          localStorage.setItem(SCHOOL_STORAGE_KEY, JSON.stringify(accessResult.school));
        }
        setIsLoading(false);
        return false;
      }

      setIsSchoolBlocked(false);
      setBlockedReason(null);
      if (accessResult.school) {
        setSchool(accessResult.school);
        sessionStorage.setItem(SCHOOL_STORAGE_KEY, JSON.stringify(accessResult.school));
        localStorage.setItem(SCHOOL_STORAGE_KEY, JSON.stringify(accessResult.school));
      }
      setIsLoading(false);
      return true;
    } catch (error) {
      console.error('Lỗi khi verifyCurrentAccess:', error);
      setIsLoading(false);
      return true;
    }
  }, [user, school]);

  // Bổ sung EventListener lắng nghe sự kiện đồng bộ dữ liệu trường (ví dụ sau khi Super Admin duyệt gia hạn)
  useEffect(() => {
    const handleSchoolUpdated = () => {
      verifyCurrentAccess();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('school_data_updated', handleSchoolUpdated);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('school_data_updated', handleSchoolUpdated);
      }
    };
  }, [verifyCurrentAccess]);

  // Đăng nhập kết nối Firebase Auth / Username & Password / Phone
  const login = async (credentials: {
    identifier?: string;
    username?: string;
    phone?: string;
    email?: string;
    password?: string;
  }) => {
    setIsLoading(true);
    try {
      const result = await loginWithFirebaseAuth(credentials);
      if (result.success && result.user) {
        setUser(result.user);
        sessionStorage.setItem('tkb_explicitly_logged_in', 'true');
        sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(result.user));
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(result.user));

        if (result.school) {
          setSchool(result.school);
          sessionStorage.setItem(SCHOOL_STORAGE_KEY, JSON.stringify(result.school));
          localStorage.setItem(SCHOOL_STORAGE_KEY, JSON.stringify(result.school));
        } else if (result.user.role === 'super_admin') {
          const all = await getAllSchools();
          if (all.length > 0) {
            setSchool(all[0]);
            sessionStorage.setItem(SCHOOL_STORAGE_KEY, JSON.stringify(all[0]));
            localStorage.setItem(SCHOOL_STORAGE_KEY, JSON.stringify(all[0]));
          }
        }

        setIsSchoolBlocked(false);
        setBlockedReason(null);
        setIsLoading(false);
        return { success: true, user: result.user, school: result.school };
      } else if (result.isBlocked) {
        setIsSchoolBlocked(true);
        setBlockedReason(result.error || 'Tài khoản trường học đã bị tạm khóa hoặc hết hạn.');
        if (result.user) setUser(result.user);
        if (result.school) setSchool(result.school);
        setIsLoading(false);
        return {
          success: false,
          isBlocked: true,
          error: result.error,
          user: result.user,
          school: result.school,
        };
      } else {
        setIsLoading(false);
        return {
          success: false,
          error: result.error || 'Đăng nhập không thành công. Vui lòng thử lại!',
        };
      }
    } catch (err: any) {
      setIsLoading(false);
      return {
        success: false,
        error: err?.message || 'Có lỗi xảy ra trong quá trình xác thực. Vui lòng thử lại!',
      };
    }
  };

  // Đăng ký trường mới (Self-service)
  const register = async (payload: RegisterSchoolPayload) => {
    setIsLoading(true);
    try {
      const result = await registerSchoolAccount(payload);
      if (result.success && result.user && result.school) {
        setUser(result.user);
        setSchool(result.school);
        sessionStorage.setItem('tkb_explicitly_logged_in', 'true');
        sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(result.user));
        sessionStorage.setItem(SCHOOL_STORAGE_KEY, JSON.stringify(result.school));
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(result.user));
        localStorage.setItem(SCHOOL_STORAGE_KEY, JSON.stringify(result.school));

        setIsSchoolBlocked(false);
        setBlockedReason(null);
        setIsLoading(false);
        return {
          success: true,
          school: result.school,
          user: result.user,
          isTrial: result.isTrial,
        };
      } else {
        setIsLoading(false);
        return {
          success: false,
          error: result.error || 'Đăng ký không thành công. Vui lòng thử lại!',
        };
      }
    } catch (err: any) {
      setIsLoading(false);
      return {
        success: false,
        error: err?.message || 'Có lỗi xảy ra khi tạo tài khoản trường học.',
      };
    }
  };

  // Đăng xuất
  const logout = () => {
    setUser(null);
    setSchool(null);
    setIsSchoolBlocked(false);
    setBlockedReason(null);
    sessionStorage.removeItem('tkb_explicitly_logged_in');
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    sessionStorage.removeItem(SCHOOL_STORAGE_KEY);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(SCHOOL_STORAGE_KEY);
    signOut(auth).catch(() => {});
  };

  // Chuyển nhanh tài khoản demo (dành cho kiểm thử)
  const switchDemoUser = async (targetUser: UserProfile, targetSchool?: School): Promise<boolean> => {
    setIsLoading(true);
    
    // Tự động kiểm tra / khởi tạo document /users/{uid}
    await ensureAndSyncUserDocument(
      { uid: targetUser.uid, email: targetUser.email, displayName: targetUser.displayName },
      targetUser.schoolId
    );

    setUser(targetUser);
    sessionStorage.setItem('tkb_explicitly_logged_in', 'true');
    sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(targetUser));
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(targetUser));

    let matchedSchool = targetSchool;
    if (!matchedSchool && targetUser.schoolId) {
      matchedSchool = (await getSchoolById(targetUser.schoolId)) || undefined;
    }

    if (matchedSchool) {
      setSchool(matchedSchool);
      sessionStorage.setItem(SCHOOL_STORAGE_KEY, JSON.stringify(matchedSchool));
      localStorage.setItem(SCHOOL_STORAGE_KEY, JSON.stringify(matchedSchool));
    }

    const access = await checkSchoolAccess(targetUser);
    if (!access.allowed) {
      setIsSchoolBlocked(true);
      setBlockedReason(access.reason || 'Trường học chưa kích hoạt hoặc đã hết hạn.');
    } else {
      setIsSchoolBlocked(false);
      setBlockedReason(null);
    }

    setIsLoading(false);
    return access.allowed;
  };

  const setDirectSchool = (sc: School) => {
    setSchool(sc);
    sessionStorage.setItem(SCHOOL_STORAGE_KEY, JSON.stringify(sc));
    localStorage.setItem(SCHOOL_STORAGE_KEY, JSON.stringify(sc));
  };

  const currentSchoolId = user?.schoolId || school?.schoolId || getActiveSchoolId();

  const getSchoolRef = (explicitSchoolId?: string) => {
    return getSchoolRefHelper(explicitSchoolId || currentSchoolId);
  };

  const isAuthenticated = !!user;

  return (
    <AuthContext.Provider
      value={{
        user,
        school,
        schoolId: currentSchoolId,
        isAuthenticated,
        isLoading,
        isSchoolBlocked,
        blockedReason,
        login,
        register,
        logout,
        switchDemoUser,
        verifyCurrentAccess,
        setDirectSchool,
        getSchoolRef,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
