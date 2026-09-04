import React from 'react';
import { View, ViewStyle } from 'react-native';
import Wordmark from '../../assets/ZoinkWordmark.svg';

type ZoinkFullLogoProps = {
  width?: number;
  height?: number;
  style?: ViewStyle;
};

export default function ZoinkFullLogo({
  width = 200,
  height = 60,
  style,
}: ZoinkFullLogoProps) {
  return (
    <View style={[{ width, height }, style]}>
      <Wordmark width="100%" height="100%" />
    </View>
  );
}
