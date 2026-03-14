import React from 'react';

const MapView = require('react-native-maps').default;
const Marker = require('react-native-maps').Marker;
const Polyline = require('react-native-maps').Polyline;

export { Marker, Polyline };

export default function SafeMap(props: {
  style?: object;
  initialRegion?: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
  showsUserLocation?: boolean;
  children?: React.ReactNode;
  [key: string]: unknown;
}) {
  const { children, ...rest } = props;
  return <MapView {...rest}>{children}</MapView>;
}
