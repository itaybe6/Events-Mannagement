import React, { ReactNode } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '@/constants/colors';
import { softTileShadow } from '@/lib/platformShadow';

interface CardProps {
  children: ReactNode;
  style?: ViewStyle;
  /** Kept for API compatibility; Android uses softTileShadow (no heavy elevation). */
  elevation?: number;
}

export const Card: React.FC<CardProps> = ({ 
  children, 
  style,
}) => {
  return (
    <View style={[styles.card, style]}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    ...softTileShadow({ opacity: 0.1, radius: 4, y: 2 }),
  },
});
