import React from 'react';
import TablesList from '../(couple)/TablesList';

// Admin wrapper to render the couple tables list screen *inside* the /(admin) layout.
// This avoids the /(couple) web layout redirect that sends admins to admin-events.
export default function AdminTablesListWrapper() {
  return <TablesList />;
}

