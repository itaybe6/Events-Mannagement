import React from "react";
import Svg, { Path } from "react-native-svg";

interface InboxProps {
  size?: number;
  color?: string;
  fill?: boolean;
}

const Inbox = ({ size = 24, color = "#000", fill = false, ...props }: InboxProps) => (
  <Svg width={size} height={size} fill="none" viewBox="0 0 24 24" {...props}>
    {fill ? (
      <>
        <Path fill={color} d="M16 12h6v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6h6l2 3h4l2-3Z" />
        <Path
          fill={color}
          d="M22 12h1a1 1 0 0 0-.106-.448L22 12Zm-6 0v-1h-.535l-.297.445L16 12Zm-2 3v1h.535l.297-.445L14 15Zm-4 0-.832.555.297.445H10v-1Zm-2-3 .832-.555L8.535 11H8v1Zm-6 0-.894-.448A1 1 0 0 0 1 12h1Zm.586 7.414.707-.707-.707.707ZM18.55 5.11l-.896.445.002.003.894-.448ZM16.76 4V3v1ZM7.24 4V3v1ZM5.45 5.11l.894.448.002-.003-.896-.445ZM22 12v-1h-6v2h6v-1Zm-6 0-.832-.555-2 3L14 15l.832.555 2-3L16 12Zm-6 3 .832-.555-2-3L8 12l-.832.555 2 3L10 15Zm-2-3v-1H2v2h6v-1Zm-6 0H1v6h2v-6H2Zm0 6H1a3 3 0 0 0 .879 2.121l.707-.707.707-.707A1 1 0 0 1 3 18H2Zm.586 1.414-.707.707A3 3 0 0 0 4 21v-2a1 1 0 0 1-.707-.293l-.707.707ZM4 20v1h16v-2H4v1Zm16 0v1a3 3 0 0 0 2.121-.879l-.707-.707-.707-.707A1 1 0 0 1 20 19v1Zm1.414-.586.707.707A3 3 0 0 0 23 18h-2a1 1 0 0 1-.293.707l.707.707ZM22 18h1v-6h-2v6h1Zm0-6 .894-.448-3.45-6.89-.894.448-.894.448 3.45 6.89L22 12Zm-3.45-6.89.895-.445A3 3 0 0 0 18.34 3.45l-.527.85-.527.85a1 1 0 0 1 .368.405l.896-.445Zm-.737-.81.527-.85A3 3 0 0 0 16.76 3v2a1 1 0 0 1 .526.15l.527-.85ZM16.76 4V3H7.24v2h9.52V4ZM7.24 4V3a3 3 0 0 0-1.58.45l.527.85.527.85A1 1 0 0 1 7.241 5L7.24 4Zm-1.053.3-.527-.85a3 3 0 0 0-1.106 1.215l.896.445.896.445a1 1 0 0 1 .368-.405l-.527-.85ZM10 15v1h4v-2h-4v1Zm-8-3 .894.448 3.45-6.89-.894-.448-.894-.448-3.45 6.89L2 12Z"
        />
      </>
    ) : (
      <>
        <Path
          stroke={color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M22 12h-6l-2 3h-4l-2-3H2"
        />
        <Path
          stroke={color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"
        />
      </>
    )}
  </Svg>
);

export default Inbox;
