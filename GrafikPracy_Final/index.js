import React from 'react';
import {registerRootComponent} from 'expo';
import {Platform} from 'react-native';
import * as Notifications from 'expo-notifications';
import './LocationService';
import App from './App';

// Expo Notifications is native-only. Do not call its native handler setup in a browser.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false
    })
  });
}

registerRootComponent(App);
