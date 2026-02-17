import React from 'react';
import AutomaticNotifications from '../(couple)/automatic-notifications';

// Admin wrapper to render the couple automatic notifications screen *inside* the /(admin) layout.
// This avoids the /(couple) web layout redirect that sends admins to admin-events.
export default function AdminAutomaticNotificationsWrapper() {
  return <AutomaticNotifications />;
}

