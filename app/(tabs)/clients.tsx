import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert } from 'react-native';
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
      console.log('📋 Loading clients from Supabase via userService...');
      const clientsData = await userService.getClients();
      console.log('📋 Loaded clients successfully:', clientsData);
      setClients(clientsData);
    } catch (error) {
      console.error('❌ Error loading clients from Supabase:', error);
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('he-IL');
  };

  const renderClientCard = (client: UserWithMetadata) => (
    <Card key={client.id} style={styles.clientCard}>
      <View style={styles.clientHeader}>
        <View style={styles.clientInfo}>
          <Text style={styles.clientName}>{client.name}</Text>
          <Text style={styles.clientEmail}>{client.email}</Text>
        </View>
        <View style={styles.clientActions}>
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => {/* TODO: Navigate to client details */}}
          >
            <Ionicons name="eye" size={20} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => {/* TODO: Edit client */}}
          >
            <Ionicons name="create" size={20} color={colors.warning} />
          </TouchableOpacity>
        </View>
      </View>
      
      <View style={styles.clientStats}>
        <View style={styles.stat}>
          <Ionicons name="calendar" size={16} color={colors.primary} />
          <Text style={styles.statText}>{client.events_count || 0} אירועים</Text>
        </View>
        <View style={styles.stat}>
          <Ionicons name="time" size={16} color={colors.gray[500]} />
          <Text style={styles.statText}>
            נרשם: {formatDate(client.created_at)}
          </Text>
        </View>
        <View style={styles.stat}>
          <Ionicons name="log-in" size={16} color={colors.success} />
          <Text style={styles.statText}>
            התחבר: {client.last_login ? formatDate(client.last_login) : 'מעולם לא'}
          </Text>
        </View>
      </View>
    </Card>
  );

  return (
    <View style={styles.container}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={loadClients} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>רשימת לקוחות</Text>
          <Text style={styles.subtitle}>
            סה"כ {clients.length} לקוחות במערכת
          </Text>
          <View style={styles.databaseInfo}>
            <Ionicons name="cloud" size={16} color={colors.success} />
            <Text style={styles.databaseText}>מחובר לדאטאבייס Supabase</Text>
          </View>
        </View>

        <TouchableOpacity 
          style={styles.addButton}
          onPress={() => router.push('/(tabs)/users')}
        >
          <Ionicons name="person-add" size={20} color={colors.white} />
          <Text style={styles.addButtonText}>הוסף לקוח חדש</Text>
        </TouchableOpacity>

        <View style={styles.clientsList}>
          {clients.length > 0 ? (
            clients.map(renderClientCard)
          ) : (
            <Card style={styles.emptyState}>
              <Ionicons name="people-outline" size={60} color={colors.gray[400]} />
              <Text style={styles.emptyStateTitle}>אין לקוחות במערכת</Text>
              <Text style={styles.emptyStateText}>
                התחל בהוספת לקוח ראשון למערכת
              </Text>
            </Card>
          )}
        </View>
      </ScrollView>
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
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textLight,
  },
  databaseInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  databaseText: {
    fontSize: 14,
    color: colors.success,
    fontWeight: '500',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    marginBottom: 20,
  },
  addButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  clientsList: {
    gap: 12,
  },
  clientCard: {
    padding: 16,
  },
  clientHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  clientInfo: {
    flex: 1,
  },
  clientName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  clientEmail: {
    fontSize: 14,
    color: colors.textLight,
  },
  clientActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.gray[100],
    justifyContent: 'center',
    alignItems: 'center',
  },
  clientStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 12,
    color: colors.textLight,
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
  },
  emptyStateText: {
    fontSize: 14,
    color: colors.textLight,
    textAlign: 'center',
  },
}); 