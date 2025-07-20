import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors } from '@/constants/colors';
import { Card } from '@/components/Card';
import { LottieAnimation } from '@/components/LottieAnimation';

export default function ExampleAnimationScreen() {
  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>דוגמאות לאנימציות Lottie</Text>
      
      {/* דוגמה 1: אנימציה בסיסית */}
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>אנימציה בסיסית</Text>
        <LottieAnimation
          source={require('../assets/animations/83J2Ko52jU.json')} // שם הקובץ שלך
          style={styles.animation}
          autoPlay={true}
          loop={true}
        />
      </Card>

      {/* דוגמה 2: אנימציה עם שליטה */}
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>אנימציה מהירה יותר</Text>
        <LottieAnimation
          source={require('../assets/animations/83J2Ko52jU.json')}
          style={styles.smallAnimation}
          autoPlay={true}
          loop={true}
          speed={1.5}
        />
      </Card>

      {/* דוגמה 3: אנימציה חד פעמית */}
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>אנימציה חד פעמית</Text>
        <LottieAnimation
          source={require('../assets/animations/83J2Ko52jU.json')}
          style={styles.smallAnimation}
          autoPlay={true}
          loop={false}
          onAnimationFinish={() => console.log('אנימציה הסתיימה!')}
        />
      </Card>

      <View style={styles.instructions}>
        <Text style={styles.instructionsTitle}>איך להשתמש:</Text>
        <Text style={styles.instructionsText}>
          1. שים את קובץ ה-JSON שלך בתיקיה: assets/animations/
        </Text>
        <Text style={styles.instructionsText}>
          2. ייבא את הרכיב: {`import { LottieAnimation } from '@/components/LottieAnimation'`}
        </Text>
        <Text style={styles.instructionsText}>
          3. השתמש כך: {`<LottieAnimation source={require('path/to/your/file.json')} />`}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray[100],
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 20,
  },
  card: {
    marginBottom: 16,
    padding: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  animation: {
    width: 200,
    height: 200,
    alignSelf: 'center',
  },
  smallAnimation: {
    width: 150,
    height: 150,
    alignSelf: 'center',
  },
  instructions: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
  },
  instructionsText: {
    fontSize: 14,
    color: colors.gray[600],
    marginBottom: 8,
    textAlign: 'right',
  },
}); 