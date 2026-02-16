import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import SeatingTemplatesScreen from '../seating/templates';
import SeatingMapWebScreen from '../seating/web/SeatingMapWebScreen';

// Admin wrapper to render templates inside /(admin) Tabs layout (keeps admin tab bar).
export default function AdminSeatingTemplatesWrapper() {
  // Important: On web, `SeatingTemplatesScreen` redirects to `/seating/templatesWeb`,
  // which leaves the /(admin) layout and hides the sidebar. Render the web map directly
  // so we stay inside the admin layout and keep the side menu.
  if (Platform.OS === 'web') {
    return (
      <View style={styles.page}>
        <SeatingMapWebScreen />
      </View>
    );
  }

  return <SeatingTemplatesScreen />;
}

const styles = StyleSheet.create({
  page: { flex: 1 },
});

