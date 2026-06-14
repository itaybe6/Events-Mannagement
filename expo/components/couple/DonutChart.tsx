import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

export type DonutSegment = {
  value: number;
  color: string;
};

type DonutChartProps = {
  segments: DonutSegment[];
  size?: number;
  stroke?: number;
  children?: React.ReactNode;
};

export function DonutChart({ segments, size = 150, stroke = 14, children }: DonutChartProps) {
  const { circles, cx, cy } = useMemo(() => {
    const total = segments.reduce((sum, seg) => sum + Math.max(0, seg.value), 0);
    const r = (size - stroke) / 2;
    const center = size / 2;
    const circumference = 2 * Math.PI * r;

    if (total <= 0) {
      return {
        cx: center,
        cy: center,
        circles: [
          <Circle
            key="empty"
            cx={center}
            cy={center}
            r={r}
            stroke="rgba(255,255,255,0.12)"
            strokeWidth={stroke}
            fill="transparent"
          />,
        ],
      };
    }

    let offset = 0;
    const rendered = segments
      .filter((seg) => seg.value > 0)
      .map((seg, index) => {
        const dash = (seg.value / total) * circumference;
        const el = (
          <Circle
            key={`${seg.color}-${index}`}
            cx={center}
            cy={center}
            r={r}
            stroke={seg.color}
            strokeWidth={stroke}
            fill="transparent"
            strokeDasharray={`${dash} ${Math.max(0, circumference - dash)}`}
            strokeDashoffset={-offset}
          />
        );
        offset += dash;
        return el;
      });

    return { cx: center, cy: center, circles: rendered };
  }, [segments, size, stroke]);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <G rotation="-90" origin={`${cx}, ${cy}`}>
          {circles}
        </G>
      </Svg>
      {children ? <View style={styles.center}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
