import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Share, Alert } from 'react-native';
import { useEventStore } from '@/store/eventStore';
import { colors } from '@/constants/colors';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { CountdownTimer } from '@/components/CountdownTimer';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';

export default function ProfileShareScreen() {
  const { currentEvent } = useEventStore();
  const [copied, setCopied] = useState(false);

  if (!currentEvent) {
    return (
      <View style={styles.container}>
        <Text style={styles.headerText}>אין אירוע פעיל</Text>
      </View>
    );
  }

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('he-IL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleShare = async () => {
    try {
      const result = await Share.share({
        message: `הוזמנת לאירוע: ${currentEvent.title}
תאריך: ${formatDate(currentEvent.date)}
מקום: ${currentEvent.location}

לפרטים נוספים ואישור הגעה, לחץ על הקישור: https://easy2give.com/event/${currentEvent.id}`,
      });
    } catch (error) {
      Alert.alert('שגיאה', 'לא ניתן לשתף את האירוע כרגע');
    }
  };

  const handleCopyLink = () => {
    // In a real app, you would use Clipboard.setString
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    Alert.alert('הקישור הועתק', 'קישור לאירוע הועתק ללוח');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.previewContainer}>
        <Text style={styles.previewTitle}>תצוגה מקדימה</Text>
        <Text style={styles.previewSubtitle}>כך ייראה עמוד האירוע שלך</Text>
        
        <Card style={styles.profileCard}>
          <Image
            source={{ uri: currentEvent.image }}
            style={styles.coverImage}
          />
          
          <View style={styles.profileContent}>
            <Text style={styles.eventTitle}>{currentEvent.title}</Text>
            
            <View style={styles.eventDetails}>
              <View style={styles.eventDetail}>
                <Calendar size={16} color={colors.primary} />
                <Text style={styles.eventDetailText}>{formatDate(currentEvent.date)}</Text>
              </View>
              <View style={styles.eventDetail}>
                <MapPin size={16} color={colors.primary} />
                <Text style={styles.eventDetailText}>{currentEvent.location}</Text>
              </View>
            </View>
            
            <View style={styles.countdownContainer}>
              <Text style={styles.countdownTitle}>הזמן שנותר לאירוע</Text>
              <CountdownTimer targetDate={currentEvent.date} />
            </View>
            
            {currentEvent.story && (
              <View style={styles.storyContainer}>
                <View style={styles.storyHeader}>
                  <Heart size={16} color={colors.secondary} />
                  <Text style={styles.storyTitle}>הסיפור שלנו</Text>
                </View>
                <Text style={styles.storyText}>{currentEvent.story}</Text>
              </View>
            )}
            
            <Button
              title="אישור הגעה"
              onPress={() => {}}
              style={styles.rsvpButton}
              fullWidth
            />
            
            <Button
              title="שליחת מתנה"
              onPress={() => {}}
              variant="outline"
              style={styles.giftButton}
              fullWidth
            />
          </View>
        </Card>
      </View>
      
      <View style={styles.shareSection}>
        <Text style={styles.shareTitle}>שיתוף האירוע</Text>
        <Text style={styles.shareSubtitle}>שתף את האירוע שלך עם האורחים</Text>
        
        <View style={styles.shareOptions}>
          <TouchableOpacity style={styles.shareOption} onPress={handleShare}>
            <View style={[styles.shareIconContainer, { backgroundColor: `${colors.primary}20` }]}>
              <Ionicons name="share-outline" size={24} color={colors.primary} />
            </View>
            <Text style={styles.shareOptionText}>שיתוף</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.shareOption} onPress={handleCopyLink}>
            <View style={[styles.shareIconContainer, { backgroundColor: `${colors.secondary}20` }]}>
              <Ionicons name="copy-outline" size={24} color={colors.secondary} />
            </View>
            <Text style={styles.shareOptionText}>
              {copied ? 'הועתק!' : 'העתק קישור'}
            </Text>
          </TouchableOpacity>
        </View>
        
        <Card style={styles.linkCard}>
          <Text style={styles.linkTitle}>קישור לאירוע</Text>
          <View style={styles.linkContainer}>
            <Text style={styles.link} numberOfLines={1}>
              https://easy2give.com/event/{currentEvent.id}
            </Text>
            <TouchableOpacity style={styles.copyButton} onPress={handleCopyLink}>
              <Ionicons name="copy-outline" size={16} color={colors.white} />
            </TouchableOpacity>
          </View>
        </Card>
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
  headerText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
    marginTop: 20,
  },
  previewContainer: {
    marginBottom: 24,
  },
  previewTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
  },
  previewSubtitle: {
    fontSize: 14,
    color: colors.gray[600],
    textAlign: 'center',
    marginBottom: 16,
  },
  profileCard: {
    padding: 0,
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: 200,
  },
  profileContent: {
    padding: 16,
  },
  eventTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  eventDetails: {
    alignItems: 'center',
    marginBottom: 16,
  },
  eventDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  eventDetailText: {
    fontSize: 14,
    color: colors.textLight,
    marginRight: 6,
  },
  countdownContainer: {
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: colors.gray[100],
    borderRadius: 8,
    padding: 12,
  },
  countdownTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  storyContainer: {
    marginBottom: 16,
    backgroundColor: colors.gray[100],
    borderRadius: 8,
    padding: 12,
  },
  storyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  storyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginRight: 6,
  },
  storyText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    textAlign: 'right',
  },
  rsvpButton: {
    marginBottom: 8,
  },
  giftButton: {
    marginBottom: 8,
  },
  shareSection: {
    marginBottom: 24,
  },
  shareTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
  },
  shareSubtitle: {
    fontSize: 14,
    color: colors.gray[600],
    textAlign: 'center',
    marginBottom: 16,
  },
  shareOptions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  shareOption: {
    alignItems: 'center',
  },
  shareIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  shareOptionText: {
    fontSize: 14,
    color: colors.text,
  },
  linkCard: {
    marginBottom: 16,
  },
  linkTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  linkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray[100],
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  link: {
    flex: 1,
    fontSize: 14,
    color: colors.primary,
    marginRight: 8,
  },
  copyButton: {
    backgroundColor: colors.primary,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
});