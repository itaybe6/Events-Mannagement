/*
    Inspiration: https://dribbble.com/shots/6558740-Add-Button-Interaction
*/
import { Feather } from "@expo/vector-icons";
import { MotiImage, MotiText, MotiView } from "moti";
import { useState } from "react";
import {
  Dimensions,
  Pressable,
  SafeAreaView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Easing } from "react-native-reanimated";
const { width } = Dimensions.get("screen");

const _spacing = 20;
const _icons = 60;
const _movingSize = _icons + _spacing * 2;
const _borderRadius = _icons / 2;
const _sideIconSize = _icons * 0.9;

export default function AddButtonDrawer() {
  const [isVisible, setIsVisible] = useState(false);
  return (
    <View style={{ flex: 1 }}>
      <SafeAreaView
        style={[StyleSheet.absoluteFillObject, { backgroundColor: "#371853" }]}>
        <View style={{ flex: 1 }}>
          <View
            style={{
              width: _icons,
              flex: 1,
              alignSelf: "flex-end",
              alignItems: "center",
              margin: _spacing,
              justifyContent: "flex-end",
            }}>
            {[...Array(5).keys()].map((i) => (
              <Pressable
                key={i}
                onPress={() => {
                  alert(`Pressed image ${i}`);
                }}>
                <MotiImage
                  source={{
                    uri: "https://www.fidoo.com/wp-content/uploads/2020/02/placeholder.png",
                  }}
                  style={{
                    borderRadius: _borderRadius / 2,
                    width: _sideIconSize,
                    height: _sideIconSize,
                    marginTop: _spacing,
                    opacity: 0.4,
                  }}
                />
              </Pressable>
            ))}

            <Pressable
              onPress={() => {
                alert(`Pressed camera`);
              }}>
              <View
                style={{
                  borderRadius: _borderRadius / 2,
                  backgroundColor: "rgba(255,255,255,0.2)",
                  height: _sideIconSize,
                  width: _sideIconSize,
                  justifyContent: "center",
                  alignItems: "center",
                  marginTop: _spacing,
                }}>
                <Feather
                  name='camera'
                  size={24}
                  color='#fff'
                  style={{ opacity: 0.5 }}
                />
              </View>
            </Pressable>
            <Pressable
              onPress={() => {
                alert(`Pressed settings`);
              }}>
              <View
                style={{
                  borderRadius: _borderRadius / 2,
                  backgroundColor: "rgba(255,255,255,0.2)",
                  height: _sideIconSize,
                  width: _sideIconSize,
                  justifyContent: "center",
                  alignItems: "center",
                  marginTop: _spacing,
                }}>
                <Feather
                  name='settings'
                  size={24}
                  color='#fff'
                  style={{ opacity: 0.5 }}
                />
              </View>
            </Pressable>
          </View>
        </View>
        <View
          style={{
            paddingHorizontal: _spacing,
            width: width - _movingSize,
            justifyContent: "center",
            // marginBottom: _icons - _spacing,
          }}>
          <View
            style={{
              backgroundColor: "rgba(255,255,255,0.2)",
              borderRadius: 20,
              height: _icons - _spacing,
              justifyContent: "center",
              padding: _spacing / 2,
            }}>
            <View
              style={{
                backgroundColor: "#fff",
                opacity: 0.2,
                borderRadius: 20,
                height: _icons - _spacing * 2,
                width: "30%",
              }}></View>
          </View>
        </View>
      </SafeAreaView>
      <View style={{ flex: 1 }}>
        <MotiView
          from={{
            translateY: 0,
            translateX: 0,
          }}
          animate={{
            translateX: isVisible ? -_movingSize : 0,
            translateY: isVisible ? -_movingSize : 0,
          }}
          transition={{
            type: "timing",
            duration: 600,
            easing: Easing.elastic(1.1),
          }}
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#5C3281",
            borderRadius: _borderRadius,
          }}>
          <MotiText style={{ fontSize: 42, color: "#fff", opacity: 0.5 }}>
            Content
          </MotiText>
        </MotiView>
        <TouchableOpacity
          onPress={() => {
            setIsVisible((isVisible) => !isVisible);
          }}>
          <>
            <MotiView
              animate={{
                scale: isVisible ? [2, 0] : 0,
                opacity: isVisible ? 0 : 1,
              }}
              transition={{
                type: "timing",
                duration: 300,
              }}
              style={{
                position: "absolute",
                width: _icons,
                height: _icons,
                borderRadius: _icons,
                backgroundColor: "#FE2A6B",
                alignItems: "center",
                justifyContent: "center",
                position: "absolute",
                right: _spacing,
                bottom: _spacing,
              }}
            />
            <MotiView
              animate={{
                rotate: isVisible ? "90deg" : "0deg",
              }}
              transition={{
                type: "timing",
                duration: 300,
              }}
              style={{
                width: _icons,
                height: _icons,
                borderRadius: _icons,
                backgroundColor: "#FE2A6B",
                alignItems: "center",
                justifyContent: "center",
                position: "absolute",
                right: _spacing,
                bottom: _spacing,
              }}>
              <Feather name='plus' size={24} color='#fff' />
            </MotiView>
          </>
        </TouchableOpacity>
      </View>
    </View>
  );
}
