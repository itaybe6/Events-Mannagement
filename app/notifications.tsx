import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { colors } from '@/constants/colors';
import { Card } from '@/components/Card';
import { Ionicons } from '@expo/vector-icons';

export default function NotificationsScreen() {
  const notifications = [
    {
      id: '1',
      title: 'אורח חדש אישר הגעה',
      message: 'יוסי כהן אישר הגעה לאירוע',
      time: '5 דקות',
      read: false,
      type: 'guest'
    },
    {
      id: '2', 
      title: 'תזכורת משימה',
      message: 'יש להזמין פרחים עד מחר',
      time: '2 שעות',
      read: false,
      type: 'task'
    },
    {
      id: '3',
      title: 'מתנה חדשה התקבלה',
      message: 'התקבלה מתנה בסך 500₪',
      time: 'אתמול',
      read: true,
      type: 'gift'
    }
  ];

  const getIconName = (type: string) => {
    switch (type) {
      case 'guest': return 'people';
      case 'task': return 'calendar';
      case 'gift': return 'gift';
      default: return 'notifications';
    }
  };

  const getIconColor = (type: string) => {
    switch (type) {
      case 'guest': return colors.primary;
      case 'task': return colors.warning;
      case 'gift': return colors.secondary;
      default: return colors.gray[500];
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-forward" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>התראות</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content}>
        {notifications.map((notification) => (
          <Card key={notification.id} style={styles.notificationCard}>
            <View style={styles.notificationContent}>
              <View style={[
                styles.iconContainer,
                { backgroundColor: `${getIconColor(notification.type)}20` }
              ]}>
                <Ionicons 
                  name={getIconName(notification.type)} 
                  size={20} 
                  color={getIconColor(notification.type)} 
                />
              </View>
              
              <View style={styles.textContainer}>
                <Text style={[
                  styles.notificationTitle,
                  !notification.read && styles.unreadTitle
                ]}>
                  {notification.title}
                </Text>
                <Text style={styles.notificationMessage}>
                  {notification.message}
                </Text>
                <Text style={styles.notificationTime}>
                  {notification.time}
                </Text>
              </View>
              
              {!notification.read && <View style={styles.unreadDot} />}
            </View>
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray[100],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: colors.white,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.gray[100],
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  notificationCard: {
    marginBottom: 12,
  },
  notificationContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  textContainer: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  unreadTitle: {
    fontWeight: 'bold',
  },
  notificationMessage: {
    fontSize: 14,
    color: colors.gray[600],
    marginBottom: 8,
  },
  notificationTime: {
    fontSize: 12,
    color: colors.gray[500],
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginTop: 8,
  },
}); 