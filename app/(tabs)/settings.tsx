import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { Link } from 'expo-router';
import { useEventStore } from '@/store/eventStore';
import { colors } from '@/constants/colors';
import { Card } from '@/components/Card';
import { 
  User, 
  Calendar, 
  MapPin, 
  Share2, 
  CreditCard, 
  Users, 
  Gift, 
  Settings, 
  ChevronLeft,
  Box
} from 'lucide-react-native';

export default function SettingsScreen() {
  const { currentEvent } = useEventStore();

  if (!currentEvent) {
    return (
      <View style={styles.container}>
        <Text style={styles.headerTitle}>אין אירוע פעיל</Text>
      </View>
    );
  }

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('he-IL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.profileSection}>
        <Image
          source={{ uri: currentEvent.image }}
          style={styles.profileImage}
        />
        <Text style={styles.profileName}>{currentEvent.title}</Text>
        <View style={styles.profileDetails}>
          <View style={styles.profileDetail}>
            <Calendar size={16} color={colors.primary} />
            <Text style={styles.profileDetailText}>{formatDate(currentEvent.date)}</Text>
          </View>
          <View style={styles.profileDetail}>
            <MapPin size={16} color={colors.primary} />
            <Text style={styles.profileDetailText}>{currentEvent.location}</Text>
          </View>
        </View>
        <Link href="/profile/edit" asChild>
          <TouchableOpacity style={styles.editProfileButton}>
            <Text style={styles.editProfileText}>עריכת פרופיל</Text>
          </TouchableOpacity>
        </Link>
      </View>

      <Text style={styles.sectionTitle}>ניהול אירוע</Text>
      <Card style={styles.menuCard}>
        <Link href="/profile/share" asChild>
          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemContent}>
              <Text style={styles.menuItemText}>שיתוף פרופיל האירוע</Text>
              <View style={[styles.menuItemIcon, { backgroundColor: `${colors.primary}20` }]}>
                <Share2 size={20} color={colors.primary} />
              </View>
            </View>
            <ChevronLeft size={20} color={colors.gray[400]} />
          </TouchableOpacity>
        </Link>
        <Link href="/financing/apply" asChild>
          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemContent}>
              <Text style={styles.menuItemText}>מימון אירוע</Text>
              <View style={[styles.menuItemIcon, { backgroundColor: `${colors.success}20` }]}>
                <CreditCard size={20} color={colors.success} />
              </View>
            </View>
            <ChevronLeft size={20} color={colors.gray[400]} />
          </TouchableOpacity>
        </Link>
        <Link href="/rsvp/invite" asChild>
          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemContent}>
              <Text style={styles.menuItemText}>ניהול הזמנות</Text>
              <View style={[styles.menuItemIcon, { backgroundColor: `${colors.info}20` }]}>
                <Users size={20} color={colors.info} />
              </View>
            </View>
            <ChevronLeft size={20} color={colors.gray[400]} />
          </TouchableOpacity>
        </Link>
        <Link href="/gift/payment" asChild>
          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemContent}>
              <Text style={styles.menuItemText}>הוספת מתנה</Text>
              <View style={[styles.menuItemIcon, { backgroundColor: `${colors.secondary}20` }]}>
                <Gift size={20} color={colors.secondary} />
              </View>
            </View>
            <ChevronLeft size={20} color={colors.gray[400]} />
          </TouchableOpacity>
        </Link>
      </Card>

      <Text style={styles.sectionTitle}>פיצ'רים מתקדמים</Text>
      <Card style={styles.menuCard}>
        <Link href="/seating/edit" asChild>
          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemContent}>
              <Text style={styles.menuItemText}>סידור ישיבה</Text>
              <View style={[styles.menuItemIcon, { backgroundColor: `${colors.warning}20` }]}>
                <Users size={20} color={colors.warning} />
              </View>
            </View>
            <ChevronLeft size={20} color={colors.gray[400]} />
          </TouchableOpacity>
        </Link>
        <Link href="/3d-seating" asChild>
          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemContent}>
              <Text style={styles.menuItemText}>סידור ישיבה תלת-ממדי</Text>
              <View style={[styles.menuItemIcon, { backgroundColor: `${colors.info}20` }]}>
                <Box size={20} color={colors.info} />
              </View>
            </View>
            <ChevronLeft size={20} color={colors.gray[400]} />
            <View style={styles.comingSoonBadge}>
              <Text style={styles.comingSoonText}>בקרוב</Text>
            </View>
          </TouchableOpacity>
        </Link>
      </Card>

      <Text style={styles.sectionTitle}>הגדרות</Text>
      <Card style={styles.menuCard}>
        <TouchableOpacity style={styles.menuItem}>
          <View style={styles.menuItemContent}>
            <Text style={styles.menuItemText}>הגדרות אפליקציה</Text>
            <View style={[styles.menuItemIcon, { backgroundColor: `${colors.gray[500]}20` }]}>
              <Settings size={20} color={colors.gray[500]} />
            </View>
          </View>
          <ChevronLeft size={20} color={colors.gray[400]} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem}>
          <View style={styles.menuItemContent}>
            <Text style={styles.menuItemText}>פרטי חשבון</Text>
            <View style={[styles.menuItemIcon, { backgroundColor: `${colors.gray[500]}20` }]}>
              <User size={20} color={colors.gray[500]} />
            </View>
          </View>
          <ChevronLeft size={20} color={colors.gray[400]} />
        </TouchableOpacity>
      </Card>

      <View style={styles.footer}>
        <Text style={styles.footerText}>גרסה 1.0.0</Text>
        <Text style={styles.footerText}>© 2025 Easy2Give</Text>
      </View>
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
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
    marginTop: 20,
  },
  profileSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 12,
  },
  profileName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  profileDetails: {
    alignItems: 'center',
    marginBottom: 16,
  },
  profileDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  profileDetailText: {
    fontSize: 14,
    color: colors.textLight,
    marginRight: 6,
  },
  editProfileButton: {
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  editProfileText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
    marginTop: 8,
    textAlign: 'right',
  },
  menuCard: {
    padding: 0,
    marginBottom: 24,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  menuItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  menuItemText: {
    fontSize: 16,
    color: colors.text,
    marginRight: 8,
  },
  comingSoonBadge: {
    position: 'absolute',
    right: 40,
    backgroundColor: colors.info,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  comingSoonText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '500',
  },
  footer: {
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 32,
  },
  footerText: {
    fontSize: 12,
    color: colors.gray[500],
    marginVertical: 2,
  },
});