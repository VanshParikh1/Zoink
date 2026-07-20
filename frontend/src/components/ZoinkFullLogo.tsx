import React from 'react';
import { Image, ImageStyle } from 'react-native';

type ZoinkFullLogoProps = {
  width?: number;
  height?: number;
  style?: ImageStyle;
};

export default function ZoinkFullLogo({
  width = 200,
  height = 60,
  style,
}: ZoinkFullLogoProps) {
  return (
    <Image
      source={require('../../assets/ZoinkTransparent.png')}
      style={[{ width, height }, style]}
      resizeMode="contain"
    />
  );
}