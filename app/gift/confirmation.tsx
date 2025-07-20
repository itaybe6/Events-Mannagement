import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { router } from 'expo-router';
import { colors } from '@/constants/colors';
import { Button } from '@/components/Button';
import { Ionicons } from '@expo/vector-icons';

export default function GiftConfirmationScreen() {
  useEffect(() => {
    // Since beforeNavigate is not available, we'll use a simpler approach
    // This won't prevent back navigation but will handle the return to home
    const unsubscribe = () => {
      // Cleanup function if needed
    };

    return unsubscribe;
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <CheckCircle size={80} color={colors.success} />
        </View>
        
        <Text style={styles.title}>התשלום התקבל בהצלחה!</Text>
        <Text style={styles.message}>
          תודה על המתנה הנדיבה שלך. המתנה תועבר לחשבון הזוג תוך 2 ימי עסקים.
        </Text>
        
        <View style={styles.receiptContainer}>
          <Text style={styles.receiptTitle}>פרטי העסקה</Text>
          <View style={styles.receiptRow}>
            <Text style={styles.receiptLabel}>מספר עסקה:</Text>
            <Text style={styles.receiptValue}>{Math.floor(Math.random() * 1000000)}</Text>
          </View>
          <View style={styles.receiptRow}>
            <Text style={styles.receiptLabel}>תאריך:</Text>
            <Text style={styles.receiptValue}>
              {new Date().toLocaleDateString('he-IL')}
            </Text>
          </View>
          <View style={styles.receiptRow}>
            <Text style={styles.receiptLabel}>שעה:</Text>
            <Text style={styles.receiptValue}>
              {new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
          <View style={styles.receiptDivider} />
          <View style={styles.receiptRow}>
            <Text style={styles.receiptLabel}>סטטוס:</Text>
            <Text style={[styles.receiptValue, styles.statusText]}>אושר</Text>
          </View>
        </View>
        
        <Text style={styles.thankYouMessage}>
          אישור התשלום נשלח לדואר האלקטרוני שלך.
        </Text>
      </View>
      
      <View style={styles.footer}>
        <Button
          title="חזרה לדף הבית"
          onPress={() => router.push('/')}
          fullWidth
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray[100],
    padding: 16,
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 40,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: `${colors.success}20`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: colors.gray[600],
    textAlign: 'center',
    marginBottom: 32,
    paddingHorizontal: 20,
  },
  receiptContainer: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 20,
    width: '100%',
    marginBottom: 24,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  receiptTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  receiptLabel: {
    fontSize: 14,
    color: colors.gray[600],
  },
  receiptValue: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  receiptDivider: {
    height: 1,
    backgroundColor: colors.gray[300],
    marginVertical: 12,
  },
  statusText: {
    color: colors.success,
    fontWeight: 'bold',
  },
  thankYouMessage: {
    fontSize: 14,
    color: colors.gray[600],
    textAlign: 'center',
  },
  footer: {
    width: '100%',
  },
});