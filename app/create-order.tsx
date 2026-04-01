import React from 'react';
import { Redirect } from 'expo-router';

export default function CreateOrderRedirect() {
  return <Redirect href="/(tabs)/index" />;
}
