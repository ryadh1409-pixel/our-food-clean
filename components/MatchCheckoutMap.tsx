import SafeMap, { Marker, Polyline } from '@/components/SafeMap';
import React from 'react';

export type MapPoint = { latitude: number; longitude: number };

type MatchCheckoutMapProps = {
  restaurant: MapPoint;
  userA: MapPoint;
  userB: MapPoint;
  height?: number;
};

export default function MatchCheckoutMap({
  restaurant,
  userA,
  userB,
  height = 200,
}: MatchCheckoutMapProps) {
  const points = [restaurant, userA, userB];
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const midLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
  const delta =
    Math.max(
      0.01,
      Math.abs(Math.max(...lats) - Math.min(...lats)),
      Math.abs(Math.max(...lngs) - Math.min(...lngs)),
    ) * 1.5;

  return (
    <SafeMap
      style={{ height, borderRadius: 12 }}
      initialRegion={{
        latitude: midLat,
        longitude: midLng,
        latitudeDelta: delta,
        longitudeDelta: delta,
      }}
    >
      <Marker coordinate={restaurant} title="Restaurant" pinColor="#FFD700" />
      <Marker coordinate={userA} title="You" pinColor="#34C759" />
      <Marker coordinate={userB} title="Match" pinColor="#007AFF" />
      <Polyline
        coordinates={[userA, restaurant, userB]}
        strokeColor="rgba(255, 215, 0, 0.6)"
        strokeWidth={2}
      />
    </SafeMap>
  );
}
