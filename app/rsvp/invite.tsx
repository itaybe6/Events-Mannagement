import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { router } from 'expo-router';
import { useEventStore } from '@/store/eventStore';
import { colors } from '@/constants/colors';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Card } from '@/components/Card';
import { Send, Plus, Trash2, MessageSquare, Share2 } from 'lucide-react-native';
import { Platform } from 'react-native';

export default function InviteScreen() {
  const { currentEvent, addGuest, addMessage } = useEventStore();
  const [guests, setGuests] = useState<Array<{ name: string; phone: string }>>([
    { name: '', phone: '' }
  ]);
  const [messageText, setMessageText] = useState(
    `שלום!
אנחנו שמחים להזמין אותך לאירוע שלנו: ${currentEvent?.title}
תאריך: ${currentEvent ? new Date(currentEvent.date).toLocaleDateString('he-IL') : ''}
מקום: ${currentEvent?.location}

נשמח לראותך!
אנא אשר/י הגעה בהקדם.`
  );
  const [messageType, setMessageType] = useState<'SMS' | 'וואטסאפ'>('וואטסאפ');
  const [errors, setErrors] = useState<{[key: string]: {name?: string; phone?: string}}>({}); 

  if (!currentEvent) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>אין אירוע פעיל</Text>
      </View>
    );
  }

  const addGuestField = () => {
    setGuests([...guests, { name: '', phone: '' }]);
  };

  const removeGuestField = (index: number) => {
    if (guests.length > 1) {
      const newGuests = [...guests];
      newGuests.splice(index, 1);
      setGuests(newGuests);
      
      // Remove errors for this guest
      const newErrors = { ...errors };
      delete newErrors[index];
      setErrors(newErrors);
    }
  };

  const updateGuestField = (index: number, field: 'name' | 'phone', value: string) => {
    const newGuests = [...guests];
    newGuests[index][field] = value;
    setGuests(newGuests);
    
    // Clear error for this field if it exists
    if (errors[index] && errors[index][field]) {
      const newErrors = { ...errors };
      delete newErrors[index][field];
      if (Object.keys(newErrors[index]).length === 0) {
        delete newErrors[index];
      }
      setErrors(newErrors);
    }
  };

  const validateGuests = () => {
    const newErrors: {[key: string]: {name?: string; phone?: string}} = {};
    let isValid = true;
    
    guests.forEach((guest, index) => {
      const guestErrors: {name?: string; phone?: string} = {};
      
      if (!guest.name.trim()) {
        guestErrors.name = 'נא להזין שם';
        isValid = false;
      }
      
      if (!guest.phone.trim()) {
        guestErrors.phone = 'נא להזין מספר טלפון';
        isValid = false;
      } else if (!/^05\d{8}$/.test(guest.phone)) {
        guestErrors.phone = 'מספר טלפון לא תקין';
        isValid = false;
      }
      
      if (Object.keys(guestErrors).length > 0) {
        newErrors[index] = guestErrors;
      }
    });
    
    setErrors(newErrors);
    return isValid;
  };

  const handleSendInvitations = () => {
    if (!validateGuests()) {
      return;
    }
    
    // Add guests to store
    guests.forEach(guest => {
      const newGuest = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        name: guest.name,
        phone: guest.phone,
        status: 'ממתין' as const,
        tableId: null,
        gift: 0,
        message: '',
      };
      
      addGuest(newGuest);
      
      // Add message record
      const newMessage = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        type: messageType,
        recipient: guest.name,
        phone: guest.phone,
        sentDate: new Date(),
        status: 'נשלח',
      };
      
      addMessage(newMessage);
    });
    
    // Show success message
    Alert.alert(
      'הזמנות נשלחו בהצלחה',
      `נשלחו ${guests.length} הזמנות ל${messageType === 'SMS' ? 'SMS' : 'וואטסאפ'}`,
      [{ text: 'אישור', onPress: () => router.back() }]
    );
  };

  const shareInvitation = () => {
    Alert.alert(
      'שיתוף הזמנה',
      'קישור ההזמנה הועתק ללוח. כעת תוכל לשתף אותו בכל אפליקציה שתבחר.',
      [{ text: 'אישור' }]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <Text style={styles.title}>הזמנת אורחים</Text>
        <Text style={styles.subtitle}>הוסף אורחים ושלח להם הזמנות</Text>
      </View>

      <Card style={styles.guestsCard}>
        <Text style={styles.sectionTitle}>רשימת אורחים</Text>
        
        {guests.map((guest, index) => (
          <View key={index} style={styles.guestRow}>
            <View style={styles.guestFields}>
              <Input
                placeholder="שם האורח"
                value={guest.name}
                onChangeText={(value) => updateGuestField(index, 'name', value)}
                containerStyle={styles.nameInput}
                error={errors[index]?.name}
              />
              <Input
                placeholder="מספר טלפון"
                value={guest.phone}
                onChangeText={(value) => updateGuestField(index, 'phone', value)}
                keyboardType="phone-pad"
                containerStyle={styles.phoneInput}
                error={errors[index]?.phone}
              />
            </View>
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => removeGuestField(index)}
              disabled={guests.length === 1}
            >
              <Trash2 
                size={20} 
                color={guests.length === 1 ? colors.gray[400] : colors.error} 
              />
            </TouchableOpacity>
          </View>
        ))}
        
        <TouchableOpacity style={styles.addGuestButton} onPress={addGuestField}>
          <Plus size={16} color={colors.primary} />
          <Text style={styles.addGuestText}>הוסף אורח</Text>
        </TouchableOpacity>
      </Card>

      <Card style={styles.messageCard}>
        <Text style={styles.sectionTitle}>הודעת הזמנה</Text>
        
        <View style={styles.messageTypeContainer}>
          <TouchableOpacity
            style={[
              styles.messageTypeButton,
              messageType === 'וואטסאפ' && styles.activeMessageType,
            ]}
            onPress={() => setMessageType('וואטסאפ')}
          >
            <Text
              style={[
                styles.messageTypeText,
                messageType === 'וואטסאפ' && styles.activeMessageTypeText,
              ]}
            >
              וואטסאפ
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.messageTypeButton,
              messageType === 'SMS' && styles.activeMessageType,
            ]}
            onPress={() => setMessageType('SMS')}
          >
            <Text
              style={[
                styles.messageTypeText,
                messageType === 'SMS' && styles.activeMessageTypeText,
              ]}
            >
              SMS
            </Text>
          </TouchableOpacity>
        </View>
        
        <TextInput
          style={styles.messageInput}
          value={messageText}
          onChangeText={setMessageText}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
          placeholderTextColor={colors.gray[500]}
        />
      </Card>

      <View style={styles.actionsContainer}>
        <View style={styles.sendButtonContainer}>
          <Button
            title="שלח הזמנות"
            onPress={handleSendInvitations}
            style={styles.sendButton}
            fullWidth
          />
          <View style={styles.sendIconContainer}>
            <Send size={16} color={colors.white} />
          </View>
        </View>
        
        <Text style={styles.orText}>- או -</Text>
        
        <View style={styles.shareButtonContainer}>
          <Button
            title="שתף קישור הזמנה"
            onPress={shareInvitation}
            variant="outline"
            style={styles.shareButton}
            fullWidth
          />
          <View style={styles.shareIconContainer}>
            <Share2 size={16} color={colors.primary} />
          </View>
        </View>
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
  guestsCard: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
    textAlign: 'right',
  },
  guestRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  guestFields: {
    flex: 1,
    flexDirection: 'row',
  },
  nameInput: {
    flex: 1,
    marginRight: 8,
  },
  phoneInput: {
    flex: 1,
    marginLeft: 8,
  },
  removeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.gray[200],
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    marginTop: 4,
  },
  addGuestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
    borderStyle: 'dashed',
  },
  addGuestText: {
    color: colors.primary,
    fontWeight: '500',
    marginLeft: 8,
  },
  messageCard: {
    marginBottom: 24,
  },
  messageTypeContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    backgroundColor: colors.gray[200],
    borderRadius: 8,
    padding: 4,
  },
  messageTypeButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  activeMessageType: {
    backgroundColor: colors.white,
  },
  messageTypeText: {
    fontSize: 14,
    color: colors.gray[600],
  },
  activeMessageTypeText: {
    color: colors.primary,
    fontWeight: '600',
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
    minHeight: 120,
  },
  actionsContainer: {
    alignItems: 'center',
  },
  sendButtonContainer: {
    width: '100%',
    position: 'relative',
    marginBottom: 16,
  },
  sendButton: {
    marginBottom: 16,
  },
  sendIconContainer: {
    position: 'absolute',
    left: 16,
    top: '50%',
    transform: [{ translateY: -8 }],
  },
  orText: {
    fontSize: 14,
    color: colors.gray[600],
    marginVertical: 8,
  },
  shareButtonContainer: {
    width: '100%',
    position: 'relative',
  },
  shareButton: {
    marginTop: 8,
  },
  shareIconContainer: {
    position: 'absolute',
    left: 16,
    top: '50%',
    transform: [{ translateY: -8 }],
  },
});