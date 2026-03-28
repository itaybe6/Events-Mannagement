import React from "react";
import Svg, { Path } from "react-native-svg";

interface TagProps {
  size?: number;
  color?: string;
  fill?: boolean;
}

const Tag: React.FC<TagProps> = ({ size = 24, color = "#000", fill = false, ...props }) => (
  <Svg width={size} height={size} fill="none" viewBox="0 0 24 24" {...props}>
    {fill && (
      <>
        <Path
          fill={color}
          stroke={color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M11.413 2.586A2 2 0 0 1 12.827 2h7.172a2 2 0 0 1 2 2v7.172a2 2 0 0 1-.586 1.414l-8.704 8.704a2.426 2.426 0 0 1-3.42 0l-6.58-6.58a2.426 2.426 0 0 1 0-3.42l8.704-8.704Z"
        />
        <Path
          fill="#fff"
          stroke="#fff"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={4}
          d="M16.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"
        />
      </>
    )}
    <>
      <Path
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M11.413 2.586A2 2 0 0 1 12.827 2h7.172a2 2 0 0 1 2 2v7.172a2 2 0 0 1-.586 1.414l-8.704 8.704a2.426 2.426 0 0 1-3.42 0l-6.58-6.58a2.426 2.426 0 0 1 0-3.42l8.704-8.704Z"
      />
      <Path
        fill={color}
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M16.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"
      />
    </>
  </Svg>
);

export default Tag;
