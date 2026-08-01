import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

export type DonutSegment = {
  key: string;
  value: number;
  color: string;
};

type RsvpDonutProps = {
  segments: DonutSegment[];
  size?: number;
  strokeWidth?: number;
  centerValue: string;
  centerLabel: string;
  centerColor?: string;
  labelColor?: string;
  trackColor?: string;
};

export default function RsvpDonut({
  segments,
  size = 156,
  strokeWidth = 13,
  centerValue,
  centerLabel,
  centerColor = '#06173e',
  labelColor = 'rgba(6,23,62,0.52)',
  trackColor = 'rgba(6,23,62,0.06)',
}: RsvpDonutProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const visible = segments.filter((segment) => segment.value > 0);
  const total = visible.reduce((sum, segment) => sum + segment.value, 0);

  // Round caps bleed half a stroke past each dash end, so the gap has to absorb
  // that before it reads as breathing room between segments.
  const gap = visible.length > 1 ? strokeWidth + 5 : 0;

  let cursor = 0;
  const arcs = visible.map((segment) => {
    const rawLength = total > 0 ? circumference * (segment.value / total) : 0;
    const arc = {
      key: segment.key,
      color: segment.color,
      length: Math.max(rawLength - gap, 0.6),
      offset: cursor,
    };
    cursor += rawLength;
    return arc;
  });

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <G rotation={-90} originX={size / 2} originY={size / 2}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={trackColor}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {arcs.map((arc) => (
            <Circle
              key={arc.key}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={arc.color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={`${arc.length} ${Math.max(circumference - arc.length, 0.01)}`}
              strokeDashoffset={-arc.offset}
              fill="none"
            />
          ))}
        </G>
      </Svg>

      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
        <Text style={[styles.value, { color: centerColor }]} numberOfLines={1} adjustsFontSizeToFit>
          {centerValue}
        </Text>
        <Text style={[styles.label, { color: labelColor }]} numberOfLines={1}>
          {centerLabel}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  value: {
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: -1.4,
    textAlign: 'center',
  },
  label: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
});
