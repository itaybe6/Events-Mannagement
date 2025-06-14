import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Image } from 'react-native';
import { router } from 'expo-router';
import { useEventStore } from '@/store/eventStore';
import { colors } from '@/constants/colors';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Card } from '@/components/Card';
import { Gift, Camera, X } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

export default function GiftPaymentScreen() {
  const { currentEvent, addGift } = useEventStore();
  const [guestName, setGuestName] = useState('');
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [errors, setErrors] = useState<{
    guestName?: string;
    amount?: string;
  }>({});
  const [step, setStep] = useState(1);

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
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  const validateStep1 = () => {
    const newErrors: {
      guestName?: string;
      amount?: string;
    } = {};

    if (!guestName.trim()) {
      newErrors.guestName = 'נא להזין שם';
    }

    if (!amount.trim()) {
      newErrors.amount = 'נא להזין סכום';
    } else if (isNaN(Number(amount)) || Number(amount) <= 0) {
      newErrors.amount = 'נא להזין סכום תקין';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNextStep = () => {
    if (validateStep1()) {
      setStep(2);
    }
  };

  const handleSubmit = () => {
    const newGift = {
      id: Date.now().toString(),
      guestName,
      amount: Number(amount),
      message,
      date: new Date(),
      status: 'בתהליך' as const,
    };

    addGift(newGift);
    router.push('/gift/confirmation');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {step === 1 ? (
        <>
          <View style={styles.header}>
            <Text style={styles.title}>מתנה לאירוע</Text>
            <Text style={styles.subtitle}>{currentEvent.title}</Text>
          </View>

          <Card style={styles.formCard}>
            <Input
              label="שם מלא"
              value={guestName}
              onChangeText={setGuestName}
              placeholder="הזן את שמך המלא"
              error={errors.guestName}
            />

            <Input
              label="סכום המתנה (₪)"
              value={amount}
              onChangeText={(text) => setAmount(text.replace(/[^0-9]/g, ''))}
              placeholder="הזן סכום"
              keyboardType="numeric"
              error={errors.amount}
            />

            <View style={styles.messageContainer}>
              <Text style={styles.label}>ברכה אישית (אופציונלי)</Text>
              <TextInput
                style={styles.messageInput}
                value={message}
                onChangeText={setMessage}
                placeholder="הוסף ברכה אישית לזוג..."
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                placeholderTextColor={colors.gray[500]}
              />
            </View>

            <View style={styles.imageSection}>
              <Text style={styles.label}>הוסף תמונה (אופציונלי)</Text>
              
              {image ? (
                <View style={styles.selectedImageContainer}>
                  <Image source={{ uri: image }} style={styles.selectedImage} />
                  <TouchableOpacity 
                    style={styles.removeImageButton}
                    onPress={() => setImage(null)}
                  >
                    <X size={16} color={colors.white} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.imagePickerButton} onPress={pickImage}>
                  <Camera size={24} color={colors.gray[500]} />
                  <Text style={styles.imagePickerText}>לחץ להוספת תמונה</Text>
                </TouchableOpacity>
              )}
            </View>
          </Card>

          <Button
            title="המשך לתשלום"
            onPress={handleNextStep}
            style={styles.submitButton}
            fullWidth
          />
        </>
      ) : (
        <>
          <View style={styles.header}>
            <Text style={styles.title}>פרטי תשלום</Text>
            <Text style={styles.subtitle}>מתנה לאירוע {currentEvent.title}</Text>
          </View>

          <Card style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>שם:</Text>
              <Text style={styles.summaryValue}>{guestName}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>סכום:</Text>
              <Text style={styles.summaryValue}>₪{Number(amount).toLocaleString()}</Text>
            </View>
            {message && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>ברכה:</Text>
                <Text style={styles.summaryValue}>{message}</Text>
              </View>
            )}
          </Card>

          <Card style={styles.paymentCard}>
            <Text style={styles.paymentTitle}>פרטי כרטיס אשראי</Text>
            
            <Input
              label="מספר כרטיס"
              placeholder="XXXX XXXX XXXX XXXX"
              keyboardType="numeric"
            />
            
            <View style={styles.cardDetailsRow}>
              <Input
                label="תוקף"
                placeholder="MM/YY"
                containerStyle={{ flex: 1, marginRight: 8 }}
              />
              <Input
                label="CVV"
                placeholder="XXX"
                keyboardType="numeric"
                containerStyle={{ flex: 1, marginLeft: 8 }}
              />
            </View>
            
            <Input
              label="שם בעל הכרטיס"
              placeholder="הזן את השם כפי שמופיע על הכרטיס"
            />
            
            <Input
              label="תעודת זהות"
              placeholder="הזן מספר תעודת זהות"
              keyboardType="numeric"
            />
          </Card>

          <View style={styles.actionsContainer}>
            <Button
              title="חזרה"
              onPress={() => setStep(1)}
              variant="outline"
              style={styles.backButton}
            />
            <Button
              title="אישור תשלום"
              onPress={handleSubmit}
              style={styles.confirmButton}
            />
          </View>
        </>
      )}
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
  header: {
    alignItems: 'center',
    marginBottom: 24,
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
  formCard: {
    marginBottom: 24,
  },
  messageContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
    color: colors.text,
    textAlign: 'right',
  },
  messageInput: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[300],
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: colors.text,
    textAlign: 'right',
    minHeight: 100,
  },
  imageSection: {
    marginBottom: 16,
  },
  imagePickerButton: {
    backgroundColor: colors.gray[200],
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.gray[300],
    borderStyle: 'dashed',
    height: 120,
  },
  imagePickerText: {
    color: colors.gray[600],
    marginTop: 8,
    fontSize: 14,
  },
  selectedImageContainer: {
    position: 'relative',
    borderRadius: 8,
    overflow: 'hidden',
    height: 200,
  },
  selectedImage: {
    width: '100%',
    height: '100%',
  },
  removeImageButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitButton: {
    marginTop: 8,
  },
  summaryCard: {
    marginBottom: 24,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 16,
    color: colors.gray[600],
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    textAlign: 'right',
  },
  paymentCard: {
    marginBottom: 24,
  },
  paymentTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  cardDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  backButton: {
    flex: 1,
    marginRight: 8,
  },
  confirmButton: {
    flex: 1,
    marginLeft: 8,
  },
});