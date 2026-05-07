import React from 'react';
import GuestsScreen from '../(couple)/guests';

// Admin wrapper to render the couple guests screen *inside* the /(admin) layout.
// This avoids the /(couple) web layout redirect that sends admins to admin-events.
export default function AdminGuestsWrapper() {
  return <GuestsScreen />;
}

