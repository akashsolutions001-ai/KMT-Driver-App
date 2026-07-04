import { DriverInfo, Stop } from '@/types/driver';

const mockStops: Stop[] = [
  { id: '1', name: 'Central Station', status: 'pending', order: 1 },
  { id: '2', name: 'Market Square', status: 'pending', order: 2 },
  { id: '3', name: 'City Hall', status: 'pending', order: 3 },
  { id: '4', name: 'Rankala Chowk', status: 'pending', order: 4 },
  { id: '5', name: 'Sports Complex', status: 'pending', order: 5 },
  { id: '6', name: 'Shopping Mall', status: 'pending', order: 6 },
  { id: '7', name: 'Residential Park', status: 'pending', order: 7 },
  { id: '8', name: 'Terminal East', status: 'pending', order: 8 },
];

export const mockDriver: DriverInfo = {
  id: 'DRV-001',
  name: 'John Martinez',
  route: {
    id: 'RT-42',
    name: 'Downtown Express',
    busNumber: 'BUS-1542',
    stops: mockStops,
  },
};

// Simulates login validation
export function validateLogin(driverId: string, password: string): DriverInfo | null {
  // For demo purposes, accept any non-empty credentials
  // In production, this would call an API
  if (driverId.trim() && password.trim()) {
    return {
      ...mockDriver,
      id: driverId,
    };
  }
  return null;
}
