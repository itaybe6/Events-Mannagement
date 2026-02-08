import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/constants/colors';

interface CountdownTimerProps {
  targetDate: Date;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export const CountdownTimer: React.FC<CountdownTimerProps> = ({ targetDate }) => {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  const pad2 = (value: number) => String(value).padStart(2, '0');

  useEffect(() => {
    const calculateTimeLeft = () => {
      const difference = +new Date(targetDate) - +new Date();
      
      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / 1000 / 60) % 60),
          seconds: Math.floor((difference / 1000) % 60),
        });
      } else {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      }
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(timer);
  }, [targetDate]);

  return (
    <View style={styles.container}>
      <View style={styles.timerContainer}>
        <View style={styles.timeUnit}>
          <Text style={styles.timeValue}>{pad2(timeLeft.days)}</Text>
          <Text style={styles.timeLabel}>ימים</Text>
        </View>
        <Text style={styles.separator}>:</Text>
        <View style={styles.timeUnit}>
          <Text style={styles.timeValue}>{pad2(timeLeft.hours)}</Text>
          <Text style={styles.timeLabel}>שעות</Text>
        </View>
        <Text style={styles.separator}>:</Text>
        <View style={styles.timeUnit}>
          <Text style={styles.timeValue}>{pad2(timeLeft.minutes)}</Text>
          <Text style={styles.timeLabel}>דקות</Text>
        </View>
        <Text style={styles.separator}>:</Text>
        <View style={styles.timeUnit}>
          <Text style={styles.timeValue}>{pad2(timeLeft.seconds)}</Text>
          <Text style={styles.timeLabel}>שניות</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeUnit: {
    alignItems: 'center',
    marginHorizontal: 6,
  },
  timeValue: {
    fontSize: 40,
    fontWeight: '300',
    color: colors.text,
    letterSpacing: -1.2,
    // "tabular numbers" feel (best-effort)
    fontVariant: ['tabular-nums'],
  },
  timeLabel: {
    fontSize: 11,
    color: colors.gray[500],
    marginTop: 6,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  separator: {
    fontSize: 24,
    fontWeight: '300',
    color: colors.gray[300],
    marginHorizontal: 2,
    marginBottom: 18,
  },
});