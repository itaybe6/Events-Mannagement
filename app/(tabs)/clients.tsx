import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert, Modal, TextInput, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useUserStore } from '@/store/userStore';
import { colors } from '@/constants/colors';
import { Card } from '@/components/Card';
import { Ionicons } from '@expo/vector-icons';
import { userService, UserWithMetadata } from '@/lib/services/userService';

export default function ClientsScreen() {
  const { isLoggedIn, userType } = useUserStore();
  const router = useRouter();
  const [clients, setClients] = useState<UserWithMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewClient, setViewClient] = useState<UserWithMetadata | null>(null);
  const [editClient, setEditClient] = useState<UserWithMetadata | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', user_type: 'couple' });
  const [editLoading, setEditLoading] = useState(false);

  useEffect(() => {
    if (!isLoggedIn || userType !== 'admin') {
      router.replace('/login');
      return;
    }
    loadClients();
  }, [isLoggedIn, userType, router]);

  const loadClients = async () => {
    try {
      setLoading(true);
      const clientsData = await userService.getClients();
      setClients(clientsData);
    } catch (error) {
      setClients([]); // Clear clients list on error
      
      // Show detailed error message
      let errorMessage = 'לא ניתן לטעון את רשימת הלקוחות מהדאטאבייס';
      if (error instanceof Error) {
        errorMessage += `\n\nפרטי השגיאה: ${error.message}`;
      }
      
      Alert.alert(
        'שגיאה בחיבור לדאטאבייס', 
        errorMessage,
        [
          { text: 'אישור', style: 'default' },
          { 
            text: 'נסה שוב', 
            style: 'default',
            onPress: () => loadClients()
          }
        ]
      );
    } finally {
      setLoading(false);
    }
  };

  const openViewModal = (client: UserWithMetadata) => setViewClient(client);
  const closeViewModal = () => setViewClient(null);

  const openEditModal = (client: UserWithMetadata) => {
    setEditClient(client);
    setEditForm({ name: client.name, email: client.email, user_type: client.userType });
  };
  const closeEditModal = () => {
    setEditClient(null);
    setEditForm({ name: '', email: '', user_type: 'couple' });
  };

  const handleEditSave = async () => {
    if (!editClient) return;
    setEditLoading(true);
    try {
      // עדכן ב-DB (userService.updateUser)
      await userService.updateUser(editClient.id, editForm.name, editForm.email, editForm.user_type);
      // טען מחדש
      await loadClients();
      closeEditModal();
    } catch (error) {
      Alert.alert('שגיאה', 'לא ניתן לעדכן את פרטי הלקוח');
    } finally {
      setEditLoading(false);
    }
  };

  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('he-IL');

  const handleCreateEvent = (client: UserWithMetadata) => {
    Alert.alert('צור אירוע', `יצירת אירוע חדש עבור ${client.name}`);
    // כאן תוכל להחליף לניווט/Modal אמיתי
  };

  const renderClientCard = (client: UserWithMetadata) => (
    <View key={client.id} style={styles.clientCard}>
      <View style={styles.clientHeaderRow}>
        <View style={styles.clientActions}>
          {client.events_count === 0 && (
            <TouchableOpacity style={styles.createEventButton} onPress={() => handleCreateEvent(client)}>
              <Ionicons name="calendar-outline" size={18} color={colors.primary} />
              <Text style={styles.createEventButtonText}>צור אירוע</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.actionButton} onPress={() => openViewModal(client)}>
            <Ionicons name="eye" size={20} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => openEditModal(client)}>
            <Ionicons name="create" size={20} color={colors.warning} />
          </TouchableOpacity>
        </View>
        <View style={styles.clientInfo}>
          <Text style={styles.clientName}>{client.name}</Text>
          <Text style={styles.clientEmail}>{client.email}</Text>
        </View>
      </View>
      <View style={styles.clientStatsRow}>
        <View style={styles.stat}><Ionicons name="calendar" size={16} color={colors.primary} /><Text style={styles.statText}>{client.events_count || 0} אירועים</Text></View>
        <View style={styles.stat}><Ionicons name="time" size={16} color={colors.gray[500]} /><Text style={styles.statText}>נרשם: {formatDate(client.created_at)}</Text></View>
        <View style={styles.stat}><Ionicons name="log-in" size={16} color={colors.success} /><Text style={styles.statText}>התחבר: {client.last_login ? formatDate(client.last_login) : 'מעולם לא'}</Text></View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadClients} />}
      >
        <View style={styles.header}>
          <Text style={styles.title}>רשימת לקוחות</Text>
          <Text style={styles.subtitle}>סה"כ {clients.length} לקוחות במערכת</Text>
          <View style={styles.databaseInfo}>
            <Ionicons name="cloud" size={16} color={colors.success} />
            <Text style={styles.databaseText}>מחובר לדאטאבייס Supabase</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={() => router.push('/(tabs)/users')}>
          <Ionicons name="person-add" size={20} color={colors.white} />
          <Text style={styles.addButtonText}>הוסף לקוח חדש</Text>
        </TouchableOpacity>
        <View style={styles.clientsList}>
          {clients.length > 0 ? (
            clients.map(renderClientCard)
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={60} color={colors.gray[400]} />
              <Text style={styles.emptyStateTitle}>אין לקוחות במערכת</Text>
              <Text style={styles.emptyStateText}>התחל בהוספת לקוח ראשון למערכת</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Modal צפייה בלקוח */}
      <Modal visible={!!viewClient} transparent animationType="slide" onRequestClose={closeViewModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>פרטי לקוח</Text>
            {viewClient && (
              <>
                <Text style={styles.modalLabel}>שם:</Text>
                <Text style={styles.modalValue}>{viewClient.name}</Text>
                <Text style={styles.modalLabel}>אימייל:</Text>
                <Text style={styles.modalValue}>{viewClient.email}</Text>
                <Text style={styles.modalLabel}>סוג משתמש:</Text>
                <Text style={styles.modalValue}>{viewClient.userType === 'admin' ? 'מנהל' : 'חתן/כלה'}</Text>
                <Text style={styles.modalLabel}>נוצר בתאריך:</Text>
                <Text style={styles.modalValue}>{formatDate(viewClient.created_at)}</Text>
                <Text style={styles.modalLabel}>עודכן לאחרונה:</Text>
                <Text style={styles.modalValue}>{formatDate(viewClient.updated_at)}</Text>
                <TouchableOpacity style={styles.closeModalButton} onPress={closeViewModal}>
                  <Text style={styles.closeModalButtonText}>סגור</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Modal עריכת לקוח */}
      <Modal visible={!!editClient} transparent animationType="slide" onRequestClose={closeEditModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>עריכת לקוח</Text>
            <Text style={styles.modalLabel}>שם:</Text>
            <TextInput
              style={styles.modalInput}
              value={editForm.name}
              onChangeText={v => setEditForm(f => ({ ...f, name: v }))}
              textAlign="right"
            />
            <Text style={styles.modalLabel}>אימייל:</Text>
            <TextInput
              style={styles.modalInput}
              value={editForm.email}
              onChangeText={v => setEditForm(f => ({ ...f, email: v }))}
              textAlign="right"
              keyboardType="email-address"
            />
            <Text style={styles.modalLabel}>סוג משתמש:</Text>
            <View style={styles.modalUserTypeRow}>
              <TouchableOpacity
                style={[styles.modalUserTypeButton, editForm.user_type === 'admin' && styles.modalUserTypeButtonActive]}
                onPress={() => setEditForm(f => ({ ...f, user_type: 'admin' }))}
              >
                <Text style={[styles.modalUserTypeText, editForm.user_type === 'admin' && styles.modalUserTypeTextActive]}>מנהל</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalUserTypeButton, editForm.user_type === 'couple' && styles.modalUserTypeButtonActive]}
                onPress={() => setEditForm(f => ({ ...f, user_type: 'couple' }))}
              >
                <Text style={[styles.modalUserTypeText, editForm.user_type === 'couple' && styles.modalUserTypeTextActive]}>חתן/כלה</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.saveModalButton} onPress={handleEditSave} disabled={editLoading}>
              {editLoading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveModalButtonText}>שמור</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeModalButton} onPress={closeEditModal}>
              <Text style={styles.closeModalButtonText}>ביטול</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray[100],
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  header: {
    marginBottom: 20,
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 4,
    textAlign: 'right',
  },
  subtitle: {
    fontSize: 16,
    color: colors.textLight,
    textAlign: 'right',
  },
  databaseInfo: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
    alignSelf: 'flex-end',
  },
  databaseText: {
    fontSize: 14,
    color: colors.success,
    fontWeight: '500',
    textAlign: 'right',
  },
  addButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    marginBottom: 20,
    paddingHorizontal: 24,
    alignSelf: 'flex-end',
  },
  addButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
    marginRight: 8,
    textAlign: 'right',
  },
  clientsList: {
    gap: 12,
    alignItems: 'flex-end',
  },
  clientCard: {
    width: '100%',
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 18,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.gray[200],
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    alignItems: 'flex-end',
  },
  clientHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 8,
  },
  clientInfo: {
    flex: 1,
    alignItems: 'flex-end',
  },
  clientName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'right',
    marginBottom: 2,
  },
  clientEmail: {
    fontSize: 14,
    color: colors.textLight,
    textAlign: 'right',
    marginBottom: 2,
  },
  clientActions: {
    flexDirection: 'row-reverse',
    gap: 8,
  },
  actionButton: {
    padding: 4,
    marginLeft: 8,
    backgroundColor: colors.gray[100],
    borderRadius: 18,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clientStatsRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 8,
    alignItems: 'flex-end',
  },
  stat: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 12,
    color: colors.textLight,
    textAlign: 'right',
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    color: colors.textLight,
    textAlign: 'center',
  },
  // --- Modal styles ---
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 24,
    width: '85%',
    alignItems: 'flex-end',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: 16,
    textAlign: 'right',
    alignSelf: 'flex-end',
  },
  modalLabel: {
    fontSize: 14,
    color: colors.text,
    marginTop: 8,
    textAlign: 'right',
    alignSelf: 'flex-end',
  },
  modalValue: {
    fontSize: 16,
    color: colors.textLight,
    textAlign: 'right',
    alignSelf: 'flex-end',
  },
  modalInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    color: colors.text,
    marginTop: 4,
    textAlign: 'right',
  },
  modalUserTypeRow: {
    flexDirection: 'row-reverse',
    gap: 8,
    marginTop: 8,
    marginBottom: 16,
  },
  modalUserTypeButton: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: colors.gray[200],
  },
  modalUserTypeButtonActive: {
    backgroundColor: colors.primary,
  },
  modalUserTypeText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'right',
  },
  modalUserTypeTextActive: {
    color: colors.white,
  },
  saveModalButton: {
    backgroundColor: colors.success,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
    width: '100%',
  },
  saveModalButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  closeModalButton: {
    backgroundColor: colors.gray[200],
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8,
    width: '100%',
  },
  closeModalButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '500',
  },
  createEventButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.gray[100],
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  createEventButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
    marginRight: 4,
    textAlign: 'right',
  },
}); 