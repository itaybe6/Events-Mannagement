import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { NavyCardBackground } from '@/components/couple/NavyCardBackground';
import { SeatingViewHeader, type SeatingViewMode } from '@/components/couple/SeatingViewHeader';

export default function TogglePreview() {
  const [mode, setMode] = useState<SeatingViewMode>('grid');
  return (
    <View style={{ flex: 1, backgroundColor: '#F7FAFF' }}>
      <View style={styles.shell}>
        <NavyCardBackground variant="compact" />
        <View style={styles.inner}>
          <View style={{ height: 44 }} />
          <SeatingViewHeader
            flush
            viewMode={mode}
            onChangeViewMode={setMode}
            seatedPercent={95}
            tablesCount={44}
            fullTablesCount={34}
            waitingCount={42}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: 'relative',
    overflow: 'hidden',
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    backgroundColor: '#152949',
  },
  inner: { position: 'relative', zIndex: 2, paddingHorizontal: 0 },
});
