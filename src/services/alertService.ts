import { ref, set, push } from 'firebase/database';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { database as rtdb, firestore } from '@/lib/firebase';

export type AlertType = 'sos' | 'breakdown' | 'accident' | 'control_room';

export async function notifyControlRoom(params: {
  busNumber: string;
  driverId: string;
  driverName: string;
  routeId?: string;
  type: AlertType;
  message: string;
}): Promise<void> {
  await addDoc(collection(firestore, 'maintenance'), {
    busNumber: params.busNumber,
    driverId: params.driverId,
    reportedBy: params.driverName,
    type: params.type,
    description: params.message,
    status: 'open',
    createdAt: Timestamp.now(),
  });

  await set(ref(rtdb, `buses/${params.busNumber}/alert`), {
    type: params.type,
    message: params.message,
    driverId: params.driverId,
    timestamp: Date.now(),
  });
}

export async function sendSOS(params: {
  busNumber: string;
  driverId: string;
  driverName: string;
  routeId?: string;
}): Promise<void> {
  await notifyControlRoom({
    ...params,
    type: 'sos',
    message: 'Emergency SOS activated by driver',
  });
}

export async function reportBreakdown(params: {
  busNumber: string;
  driverId: string;
  driverName: string;
  routeId?: string;
  details?: string;
}): Promise<void> {
  await notifyControlRoom({
    ...params,
    type: 'breakdown',
    message: params.details ?? 'Bus breakdown reported',
  });
}

export async function reportAccident(params: {
  busNumber: string;
  driverId: string;
  driverName: string;
  routeId?: string;
  details?: string;
}): Promise<void> {
  await notifyControlRoom({
    ...params,
    type: 'accident',
    message: params.details ?? 'Accident reported',
  });
}
