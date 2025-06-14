import React from 'react';
import { View, Text, StyleSheet, Image, ScrollView } from 'react-native';
import { colors } from '@/constants/colors';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Box, Star, Bell } from 'lucide-react-native';

export default function ThreeDSeatingScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <Box size={40} color={colors.primary} />
        </View>
        <Text style={styles.title}>סידור ישיבה תלת-ממדי</Text>
        <Text style={styles.subtitle}>פיצ'ר חדש בקרוב!</Text>
      </View>

      <Card style={styles.featureCard}>
        <View style={styles.featureHeader}>
          <Star size={20} color={colors.warning} />
          <Text style={styles.featureTitle}>תכונות עיקריות</Text>
        </View>
        
        <View style={styles.featureItem}>
          <View style={styles.featureBullet} />
          <Text style={styles.featureText}>תצוגה תלת-ממדית של האולם</Text>
        </View>
        <View style={styles.featureItem}>
          <View style={styles.featureBullet} />
          <Text style={styles.featureText}>סידור שולחנות בגרירה</Text>
        </View>
        <View style={styles.featureItem}>
          <View style={styles.featureBullet} />
          <Text style={styles.featureText}>תצוגת מבט-על ומבט ממקום הישיבה</Text>
        </View>
        <View style={styles.featureItem}>
          <View style={styles.featureBullet} />
          <Text style={styles.featureText}>שיתוף תוכנית הישיבה עם האורחים</Text>
        </View>
        <View style={styles.featureItem}>
          <View style={styles.featureBullet} />
          <Text style={styles.featureText}>התאמה אישית של צורת השולחנות</Text>
        </View>
      </Card>

      <View style={styles.imageContainer}>
        <Image
          source={{ uri: 'https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80' }}
          style={styles.previewImage}
          resizeMode="cover"
        />
        <View style={styles.imageOverlay}>
          <Text style={styles.comingSoonText}>בקרוב</Text>
        </View>
      </View>

      <Card style={styles.notificationCard}>
        <View style={styles.notificationHeader}>
          <Bell size={20} color={colors.primary} />
          <Text style={styles.notificationTitle}>קבל עדכון כשהפיצ'ר יהיה זמין</Text>
        </View>
        
        <Text style={styles.notificationText}>
          אנחנו עובדים על פיצ'ר סידור הישיבה התלת-ממדי. השאר את הפרטים שלך ונעדכן אותך ברגע שהוא יהיה זמין.
        </Text>
        
        <Button
          title="קבל עדכון"
          onPress={() => {}}
          style={styles.notificationButton}
          fullWidth
        />
      </Card>

      <Text style={styles.releaseText}>תאריך שחרור משוער: רבעון 3, 2025</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray[100],
  },
  contentContainer: {
    padding: 16,
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${colors.primary}20`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: colors.primary,
  },
  featureCard: {
    width: '100%',
    marginBottom: 24,
  },
  featureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  featureTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginRight: 8,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureBullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginLeft: 8,
  },
  featureText: {
    fontSize: 14,
    color: colors.text,
  },
  imageContainer: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 24,
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  imageOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  comingSoonText: {
    color: colors.white,
    fontSize: 24,
    fontWeight: 'bold',
  },
  notificationCard: {
    width: '100%',
    marginBottom: 16,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginRight: 8,
  },
  notificationText: {
    fontSize: 14,
    color: colors.gray[700],
    marginBottom: 16,
    textAlign: 'right',
  },
  notificationButton: {
    marginTop: 8,
  },
  releaseText: {
    fontSize: 14,
    color: colors.gray[600],
    marginTop: 8,
    marginBottom: 24,
  },
});