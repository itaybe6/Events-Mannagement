import React from 'react';
import BrideGroomSeating from '../(couple)/BrideGroomSeating';

// Admin wrapper to render the couple seating screen *inside* the /(admin) layout.
// On web, this will render `app/(couple)/BrideGroomSeating.web.tsx` without hitting
// the /(couple) layout redirect that sends admins back to admin-events.
export default function AdminBrideGroomSeatingWrapper() {
  return <BrideGroomSeating />;
}

