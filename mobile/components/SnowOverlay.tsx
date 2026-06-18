import React, { useEffect, useRef, useMemo } from 'react';
import { Animated, Dimensions, StyleSheet, View } from 'react-native';

const { width: W, height: H } = Dimensions.get('window');
const FLAKE_COUNT = 40;

type Flake = {
  x: number;
  size: number;
  duration: number;
  delay: number;
  drift: number; // horizontal drift in px
  y: Animated.Value;
  opacity: Animated.Value;
};

function makeFlakes(): Flake[] {
  return Array.from({ length: FLAKE_COUNT }, () => {
    const size = 3 + Math.random() * 7;
    return {
      x: Math.random() * W,
      size,
      duration: 4000 + Math.random() * 8000,
      delay: Math.random() * 10000,
      drift: (Math.random() - 0.5) * 60,
      y: new Animated.Value(-20),
      opacity: new Animated.Value(0),
    };
  });
}

export default function SnowOverlay() {
  const flakes = useMemo(makeFlakes, []);

  useEffect(() => {
    flakes.forEach((flake: Flake) => {
      const loop = () => {
        flake.y.setValue(-20);
        flake.opacity.setValue(0);
        Animated.sequence([
          Animated.delay(flake.delay),
          Animated.parallel([
            Animated.timing(flake.y, {
              toValue: H + 20,
              duration: flake.duration,
              useNativeDriver: true,
            }),
            Animated.sequence([
              Animated.timing(flake.opacity, {
                toValue: 0.85,
                duration: 600,
                useNativeDriver: true,
              }),
              Animated.delay(flake.duration - 1200),
              Animated.timing(flake.opacity, {
                toValue: 0,
                duration: 600,
                useNativeDriver: true,
              }),
            ]),
          ]),
        ]).start(() => loop());
      };
      loop();
    });
  }, [flakes]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {flakes.map((flake: Flake, i: number) => (
        <Animated.View
          key={i}
          style={[
            styles.flake,
            {
              width: flake.size,
              height: flake.size,
              borderRadius: flake.size / 2,
              left: flake.x,
              opacity: flake.opacity,
              transform: [
                { translateY: flake.y },
                {
                  translateX: flake.y.interpolate({
                    inputRange: [-20, H + 20],
                    outputRange: [0, flake.drift],
                  }),
                },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flake: {
    position: 'absolute',
    top: 0,
    backgroundColor: '#ffffff',
  },
});
