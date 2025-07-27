import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useUserStore } from '@/store/userStore';
import { useRouter } from 'expo-router';

export default function BrideGroomProfile() {
  const { userData, logout } = useUserStore();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>פרופיל משתמש</Text>
      <Text style={styles.info}>שם: {userData?.name}</Text>
      <Text style={styles.info}>אימייל: {userData?.email}</Text>
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutButtonText}>התנתק</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  info: { fontSize: 18, marginBottom: 10 },
  logoutButton: { backgroundColor: '#e57373', padding: 10, borderRadius: 5, marginTop: 20 },
  logoutButtonText: { color: '#fff', fontWeight: 'bold' },
}); 