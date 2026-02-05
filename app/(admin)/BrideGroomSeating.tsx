import React from 'react';
import BrideGroomSeating from '../(couple)/BrideGroomSeating';

// Admin wrapper to render the same seating screen inside the /(admin) Tabs layout.
// This ensures the admin bottom tab bar remains visible when navigating from admin screens.
export default function AdminBrideGroomSeatingWrapper() {
  return <BrideGroomSeating />;
}

