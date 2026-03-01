import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

export default function IndexScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
      <ActivityIndicator size="large" />
      <Text style={{ marginTop: 12, fontSize: 16 }}>טוען...</Text>
    </View>
  );
}

