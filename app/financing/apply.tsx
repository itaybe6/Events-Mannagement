import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useEventStore } from '@/store/eventStore';
import { colors } from '@/constants/colors';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { CreditCard, DollarSign, Calendar, CheckCircle } from 'lucide-react-native';

export default function FinancingApplyScreen() {
  const { currentEvent } = useEventStore();
  const [amount, setAmount] = useState('50000');
  const [months, setMonths] = useState('24');
  const [step, setStep] = useState(1);
  const [approved, setApproved] = useState(false);

  if (!currentEvent) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>אין אירוע פעיל</Text>
      </View>
    );
  }

  const calculateMonthlyPayment = () => {
    const principal = Number(amount);
    const interestRate = 0.039 / 12; // 3.9% annual interest rate
    const numberOfPayments = Number(months);
    
    const monthlyPayment = principal * interestRate * Math.pow(1 + interestRate, numberOfPayments) / 
                          (Math.pow(1 + interestRate, numberOfPayments) - 1);
    
    return Math.round(monthlyPayment);
  };

  const totalPayment = calculateMonthlyPayment() * Number(months);
  const totalInterest = totalPayment - Number(amount);

  const handleApply = () => {
    // Simulate approval process
    setTimeout(() => {
      setApproved(true);
      setStep(3);
    }, 1500);
  };

  const handleBackToHome = () => {
    // Reset state and navigate back
    setStep(1);
    setApproved(false);
    router.back();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {step === 1 && (
        <>
          <View style={styles.header}>
            <Text style={styles.title}>מימון האירוע</Text>
            <Text style={styles.subtitle}>קבל הלוואה לכיסוי הוצאות האירוע</Text>
          </View>

          <Card style={styles.infoCard}>
            <View style={styles.infoHeader}>
              <View style={styles.infoIconContainer}>
                <CreditCard size={24} color={colors.primary} />
              </View>
              <Text style={styles.infoTitle}>יתרונות המימון שלנו</Text>
            </View>
            
            <View style={styles.benefitItem}>
              <CheckCircle size={16} color={colors.success} style={styles.benefitIcon} />
              <Text style={styles.benefitText}>ריבית אטרקטיבית של 3.9% בלבד</Text>
            </View>
            <View style={styles.benefitItem}>
              <CheckCircle size={16} color={colors.success} style={styles.benefitIcon} />
              <Text style={styles.benefitText}>אישור מהיר תוך 24 שעות</Text>
            </View>
            <View style={styles.benefitItem}>
              <CheckCircle size={16} color={colors.success} style={styles.benefitIcon} />
              <Text style={styles.benefitText}>החזר חודשי נוח</Text>
            </View>
            <View style={styles.benefitItem}>
              <CheckCircle size={16} color={colors.success} style={styles.benefitIcon} />
              <Text style={styles.benefitText}>ללא עמלות הקמה או פירעון מוקדם</Text>
            </View>
            <View style={styles.benefitItem}>
              <CheckCircle size={16} color={colors.success} style={styles.benefitIcon} />
              <Text style={styles.benefitText}>הלוואה עד 100,000 ₪</Text>
            </View>
          </Card>

          <Button
            title="המשך לסימולציה"
            onPress={() => setStep(2)}
            style={styles.continueButton}
            fullWidth
          />
        </>
      )}

      {step === 2 && (
        <>
          <View style={styles.header}>
            <Text style={styles.title}>סימולציית הלוואה</Text>
            <Text style={styles.subtitle}>בדוק את תנאי ההלוואה לפני הגשת הבקשה</Text>
          </View>

          <Card style={styles.simulationCard}>
            <View style={styles.sliderContainer}>
              <View style={styles.sliderHeader}>
                <Text style={styles.sliderLabel}>סכום ההלוואה</Text>
                <Text style={styles.sliderValue}>₪{Number(amount).toLocaleString()}</Text>
              </View>
              <View style={styles.sliderTrack}>
                <View style={[styles.sliderFill, { width: `${(Number(amount) / 100000) * 100}%` }]} />
              </View>
              <View style={styles.sliderMarkers}>
                <Text style={styles.sliderMarker}>₪10,000</Text>
                <Text style={styles.sliderMarker}>₪100,000</Text>
              </View>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.amountInput}
                  value={amount}
                  onChangeText={(text) => setAmount(text.replace(/[^0-9]/g, ''))}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.sliderContainer}>
              <View style={styles.sliderHeader}>
                <Text style={styles.sliderLabel}>תקופת ההלוואה (חודשים)</Text>
                <Text style={styles.sliderValue}>{months}</Text>
              </View>
              <View style={styles.sliderTrack}>
                <View style={[styles.sliderFill, { width: `${(Number(months) / 60) * 100}%` }]} />
              </View>
              <View style={styles.sliderMarkers}>
                <Text style={styles.sliderMarker}>12</Text>
                <Text style={styles.sliderMarker}>60</Text>
              </View>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.amountInput}
                  value={months}
                  onChangeText={(text) => setMonths(text.replace(/[^0-9]/g, ''))}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.resultContainer}>
              <View style={styles.resultItem}>
                <Text style={styles.resultLabel}>תשלום חודשי:</Text>
                <Text style={styles.resultValue}>₪{calculateMonthlyPayment().toLocaleString()}</Text>
              </View>
              <View style={styles.resultItem}>
                <Text style={styles.resultLabel}>סך הכל לתשלום:</Text>
                <Text style={styles.resultValue}>₪{totalPayment.toLocaleString()}</Text>
              </View>
              <View style={styles.resultItem}>
                <Text style={styles.resultLabel}>סך הריבית:</Text>
                <Text style={styles.resultValue}>₪{totalInterest.toLocaleString()}</Text>
              </View>
              <View style={styles.resultItem}>
                <Text style={styles.resultLabel}>ריבית שנתית:</Text>
                <Text style={styles.resultValue}>3.9%</Text>
              </View>
            </View>
          </Card>

          <View style={styles.actionsContainer}>
            <Button
              title="חזרה"
              onPress={() => setStep(1)}
              variant="outline"
              style={styles.backButton}
            />
            <Button
              title="הגש בקשה"
              onPress={handleApply}
              style={styles.applyButton}
            />
          </View>
        </>
      )}

      {step === 3 && (
        <>
          <View style={styles.approvalContainer}>
            <View style={styles.approvalIconContainer}>
              <CheckCircle size={80} color={colors.success} />
            </View>
            
            <Text style={styles.approvalTitle}>בקשתך אושרה!</Text>
            <Text style={styles.approvalMessage}>
              אנו שמחים לבשר לך שבקשת ההלוואה שלך בסך {Number(amount).toLocaleString()} ₪ אושרה.
              נציג שלנו יצור איתך קשר בהקדם להשלמת התהליך.
            </Text>
            
            <Card style={styles.approvalDetailsCard}>
              <Text style={styles.approvalDetailsTitle}>פרטי ההלוואה</Text>
              
              <View style={styles.approvalDetail}>
                <View style={styles.approvalDetailIcon}>
                  <DollarSign size={20} color={colors.primary} />
                </View>
                <View style={styles.approvalDetailContent}>
                  <Text style={styles.approvalDetailLabel}>סכום ההלוואה</Text>
                  <Text style={styles.approvalDetailValue}>₪{Number(amount).toLocaleString()}</Text>
                </View>
              </View>
              
              <View style={styles.approvalDetail}>
                <View style={styles.approvalDetailIcon}>
                  <Calendar size={20} color={colors.primary} />
                </View>
                <View style={styles.approvalDetailContent}>
                  <Text style={styles.approvalDetailLabel}>תקופת ההלוואה</Text>
                  <Text style={styles.approvalDetailValue}>{months} חודשים</Text>
                </View>
              </View>
              
              <View style={styles.approvalDetail}>
                <View style={styles.approvalDetailIcon}>
                  <CreditCard size={20} color={colors.primary} />
                </View>
                <View style={styles.approvalDetailContent}>
                  <Text style={styles.approvalDetailLabel}>תשלום חודשי</Text>
                  <Text style={styles.approvalDetailValue}>₪{calculateMonthlyPayment().toLocaleString()}</Text>
                </View>
              </View>
            </Card>
            
            <Button
              title="חזרה לדף הבית"
              onPress={handleBackToHome}
              style={styles.homeButton}
              fullWidth
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
    textAlign: 'center',
  },
  infoCard: {
    marginBottom: 24,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  infoIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${colors.primary}20`,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  benefitIcon: {
    marginLeft: 8,
  },
  benefitText: {
    fontSize: 14,
    color: colors.text,
  },
  continueButton: {
    marginTop: 8,
  },
  simulationCard: {
    marginBottom: 24,
  },
  sliderContainer: {
    marginBottom: 24,
  },
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sliderLabel: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  sliderValue: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  sliderTrack: {
    height: 6,
    backgroundColor: colors.gray[300],
    borderRadius: 3,
    marginBottom: 8,
  },
  sliderFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  sliderMarkers: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sliderMarker: {
    fontSize: 12,
    color: colors.gray[600],
  },
  inputContainer: {
    alignItems: 'center',
  },
  amountInput: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[300],
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.text,
    textAlign: 'center',
    width: '50%',
  },
  resultContainer: {
    backgroundColor: colors.gray[100],
    borderRadius: 8,
    padding: 16,
  },
  resultItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  resultLabel: {
    fontSize: 14,
    color: colors.gray[700],
  },
  resultValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  backButton: {
    flex: 1,
    marginRight: 8,
  },
  applyButton: {
    flex: 1,
    marginLeft: 8,
  },
  approvalContainer: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 24,
  },
  approvalIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: `${colors.success}20`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  approvalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 16,
  },
  approvalMessage: {
    fontSize: 16,
    color: colors.gray[600],
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  approvalDetailsCard: {
    width: '100%',
    marginBottom: 24,
  },
  approvalDetailsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  approvalDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  approvalDetailIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${colors.primary}20`,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  approvalDetailContent: {
    flex: 1,
  },
  approvalDetailLabel: {
    fontSize: 14,
    color: colors.gray[600],
  },
  approvalDetailValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginTop: 2,
  },
  homeButton: {
    marginTop: 8,
  },
});