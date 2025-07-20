import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { router } from 'expo-router';
import { useEventStore } from '@/store/eventStore';
import { colors } from '@/constants/colors';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Card } from '@/components/Card';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

export default function ProfileEditScreen() {
  const { currentEvent, updateEvent } = useEventStore();
  
  const [title, setTitle] = useState(currentEvent?.title || '');
  const [location, setLocation] = useState(currentEvent?.location || '');
  const [story, setStory] = useState(currentEvent?.story || '');
  const [image, setImage] = useState(currentEvent?.image || '');
  const [date, setDate] = useState(currentEvent ? new Date(currentEvent.date) : new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  
  if (!currentEvent) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>אין אירוע פעיל</Text>
      </View>
    );
  }

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  console.log(123);
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('he-IL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('he-IL', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleSave = () => {
    if (title.trim()) {
      updateEvent({
        title,
        location,
        story,
        image,
        date,
      });
      router.back();
    }
  };

  // Mock date and time pickers for simplicity
  // In a real app, you would use proper date/time pickers
  const DatePickerMock = () => (
    <TouchableOpacity 
      style={styles.datePickerButton}
      onPress={() => setShowDatePicker(!showDatePicker)}
    >
      <Calendar size={20} color={colors.primary} />
      <Text style={styles.datePickerText}>{formatDate(date)}</Text>
    </TouchableOpacity>
  );

  const TimePickerMock = () => (
    <TouchableOpacity 
      style={styles.datePickerButton}
      onPress={() => setShowTimePicker(!showTimePicker)}
    >
      <Clock size={20} color={colors.primary} />
      <Text style={styles.datePickerText}>{formatTime(date)}</Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <Text style={styles.title}>עריכת פרופיל האירוע</Text>
      </View>

      <View style={styles.imageSection}>
        <TouchableOpacity style={styles.imageContainer} onPress={pickImage}>
          {image ? (
            <Image source={{ uri: image }} style={styles.profileImage} />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Camera size={40} color={colors.gray[500]} />
            </View>
          )}
          <View style={styles.editImageButton}>
            <Camera size={16} color={colors.white} />
          </View>
        </TouchableOpacity>
      </View>

      <Card style={styles.formCard}>
        <Input
          label="שם האירוע"
          value={title}
          onChangeText={setTitle}
          placeholder="הזן את שם האירוע"
        />

        <Input
          label="מיקום"
          value={location}
          onChangeText={setLocation}
          placeholder="הזן את מיקום האירוע"
        />

        <View style={styles.dateTimeContainer}>
          <View style={styles.datePickerContainer}>
            <Text style={styles.label}>תאריך</Text>
            <DatePickerMock />
          </View>
          <View style={styles.datePickerContainer}>
            <Text style={styles.label}>שעה</Text>
            <TimePickerMock />
          </View>
        </View>

        <View style={styles.storyContainer}>
          <Text style={styles.label}>סיפור האירוע</Text>
          <TextInput
            style={styles.storyInput}
            value={story}
            onChangeText={setStory}
            placeholder="ספר לאורחים קצת על האירוע שלך..."
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            placeholderTextColor={colors.gray[500]}
          />
        </View>
      </Card>

      <View style={styles.actionsContainer}>
        <Button
          title="ביטול"
          onPress={() => router.back()}
          variant="outline"
          style={styles.cancelButton}
        />
        <Button
          title="שמירה"
          onPress={handleSave}
          style={styles.saveButton}
        />
      </View>
    </ScrollView>
  );
}

// For simplicity, we're using a TextInput directly here
// In a real app, you would import it from react-native
const TextInput = ({ style, value, onChangeText, placeholder, multiline, numberOfLines, textAlignVertical, placeholderTextColor }: any) => {
  return (
    <View style={[{ 
      borderWidth: 1, 
      borderColor: colors.gray[300], 
      borderRadius: 8, 
      padding: 12,
      backgroundColor: colors.white,
      minHeight: multiline ? 120 : undefined
    }, style]}>
      <Text style={{ color: value ? colors.text : placeholderTextColor, textAlign: 'right' }}>
        {value || placeholder}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray[100],
  },
  contentContainer: {
    padding: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
  },
  imageSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  imageContainer: {
    position: 'relative',
  },
  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  imagePlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.gray[300],
    justifyContent: 'center',
    alignItems: 'center',
  },
  editImageButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.white,
  },
  formCard: {
    marginBottom: 24,
  },
  dateTimeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  datePickerContainer: {
    width: '48%',
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
    color: colors.text,
    textAlign: 'right',
  },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[300],
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  datePickerText: {
    fontSize: 14,
    color: colors.text,
    marginRight: 8,
  },
  storyContainer: {
    marginTop: 16,
  },
  storyInput: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[300],
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: colors.text,
    textAlign: 'right',
    minHeight: 120,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cancelButton: {
    flex: 1,
    marginRight: 8,
  },
  saveButton: {
    flex: 1,
    marginLeft: 8,
  },
});