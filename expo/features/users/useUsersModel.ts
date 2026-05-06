import { useCallback, useMemo, useState } from 'react';
import { Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { authService } from '@/lib/services/authService';
import { userService, type UserWithMetadata } from '@/lib/services/userService';
import { avatarService } from '@/lib/services/avatarService';
import { ensurePhotoLibraryPermission } from '@/lib/permissions';

export type UserFilter = 'all' | 'admin' | 'event_owner' | 'employee';

export type UsersModel = {
  users: UserWithMetadata[];
  setUsers: React.Dispatch<React.SetStateAction<UserWithMetadata[]>>;
  loading: boolean;
  isDemoMode: boolean;
  userFilter: UserFilter;
  setUserFilter: (v: UserFilter) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  filteredUsers: UserWithMetadata[];

  selectedUser: UserWithMetadata | null;
  setSelectedUser: (u: UserWithMetadata | null) => void;
  showUserModal: boolean;
  setShowUserModal: (v: boolean) => void;

  avatarUploading: boolean;
  avatarLoadErrors: Record<string, boolean>;
  setAvatarLoadErrors: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  pickAvatarForSelectedUser: () => Promise<void>;

  testConnection: () => Promise<void>;
  refreshUsers: () => Promise<void>;
  deleteUserNow: (u: UserWithMetadata) => Promise<void>;
};

export function useUsersModel(opts: { demoUsers: UserWithMetadata[] }) {
  const [users, setUsers] = useState<UserWithMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);

  const [userFilter, setUserFilter] = useState<UserFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedUser, setSelectedUser] = useState<UserWithMetadata | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarLoadErrors, setAvatarLoadErrors] = useState<Record<string, boolean>>({});

  const testConnection = useCallback(async () => {
    try {
      const connectionResult = await authService.testConnection();
      if (!connectionResult.success) {
        setIsDemoMode(true);
        // On web, blocking alerts can feel like the UI "froze".
        if (Platform.OS !== 'web') {
          Alert.alert('אבחון בעיות דאטאבייס', connectionResult.message, [{ text: 'הבנתי' }]);
        }
      } else {
        setIsDemoMode(false);
      }
    } catch {
      setIsDemoMode(true);
    }
  }, []);

  const refreshUsers = useCallback(async () => {
    try {
      setLoading(true);
      const usersData = await userService.getAllUsers();
      setUsers(usersData);
      setIsDemoMode(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const isNetworkError =
        message.includes('Network') || message.includes('fetch') || message.includes('Failed to fetch');
      const isAbortLike =
        message.includes('AbortError') || message.toLowerCase().includes('aborted') || message.toLowerCase().includes('cancel');

      // If navigation happens mid-request (or the browser cancels it), don't wipe the UI.
      if (isAbortLike) {
        return;
      }

      if (isNetworkError) {
        setIsDemoMode(true);
        setUsers(opts.demoUsers);
        // Avoid blocking alert on web; the screen already renders the demo state.
        if (Platform.OS !== 'web') {
          Alert.alert(
            '🌐 מצב דמו',
            'לא ניתן להתחבר לדאטאבייס. האפליקציה פועלת במצב דמו עם נתונים לדוגמה.\n\nתוכל לנסות שוב מאוחר יותר כשהחיבור יחזור.',
            [{ text: 'הבנתי', style: 'default' }]
          );
        }
      } else {
        // Don't clear the list on non-network errors; it looks like "all users were deleted".
        // Keep the previous list if we have one, otherwise fall back to demo users.
        setIsDemoMode(true);
        setUsers((prev) => (prev.length > 0 ? prev : opts.demoUsers));
        let errorMessage = 'לא ניתן לטעון את רשימת המשתמשים מהדאטאבייס';
        if (message) errorMessage += `\n\nפרטי השגיאה: ${message}`;

        if (Platform.OS !== 'web') {
          Alert.alert('שגיאה בחיבור לדאטאבייס', errorMessage, [{ text: 'אישור', style: 'default' }]);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [opts.demoUsers]);

  const deleteUserNow = useCallback(
    async (u: UserWithMetadata) => {
      if (!u?.id) return;
      if (!isDemoMode) {
        await userService.deleteUser(u.id);
      }
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      setSelectedUser((prev) => (prev?.id === u.id ? null : prev));
      setShowUserModal(false);
    },
    [isDemoMode]
  );

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch = !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
      const matchesFilter = userFilter === 'all' || u.userType === userFilter;
      return matchesSearch && matchesFilter;
    });
  }, [users, searchQuery, userFilter]);

  const pickAvatarForSelectedUser = useCallback(async () => {
    if (!selectedUser) return;
    try {
      const permission = await ensurePhotoLibraryPermission({ purpose: 'profile' });
      if (!permission.granted) return;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
        base64: true,
      });

      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];

      setAvatarUploading(true);

      // Demo mode: keep locally (won't persist to DB)
      if (isDemoMode) {
        setUsers((prev) => prev.map((u) => (u.id === selectedUser.id ? { ...u, avatar_url: asset.uri } : u)));
        setSelectedUser((prev) => (prev ? { ...prev, avatar_url: asset.uri } : prev));
        setAvatarLoadErrors((prev) => ({ ...prev, [selectedUser.id]: false }));
        Alert.alert('הועלה בהצלחה', 'התמונה עודכנה מקומית (מצב דמו).', [{ text: 'אישור' }]);
        return;
      }

      const publicUrl = await avatarService.uploadUserAvatar(selectedUser.id, {
        uri: asset.uri,
        fileName: asset.fileName ?? undefined,
        mimeType: asset.mimeType ?? undefined,
        file: (asset as any)?.file,
        base64: asset.base64,
      });

      setUsers((prev) => prev.map((u) => (u.id === selectedUser.id ? { ...u, avatar_url: publicUrl } : u)));
      setSelectedUser((prev) => (prev ? { ...prev, avatar_url: publicUrl } : prev));
      setAvatarLoadErrors((prev) => ({ ...prev, [selectedUser.id]: false }));
      Alert.alert('הועלה בהצלחה', 'תמונת הפרופיל עודכנה.', [{ text: 'אישור' }]);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'שגיאה לא ידועה';
      Alert.alert('שגיאה', `לא ניתן להעלות תמונה.\n\n${message}`);
    } finally {
      setAvatarUploading(false);
    }
  }, [selectedUser, isDemoMode]);

  return {
    users,
    setUsers,
    loading,
    isDemoMode,
    userFilter,
    setUserFilter,
    searchQuery,
    setSearchQuery,
    filteredUsers,
    selectedUser,
    setSelectedUser,
    showUserModal,
    setShowUserModal,
    avatarUploading,
    avatarLoadErrors,
    setAvatarLoadErrors,
    pickAvatarForSelectedUser,
    testConnection,
    refreshUsers,
    deleteUserNow,
  } satisfies UsersModel;
}

