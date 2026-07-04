import { Button } from '@/components/ui/button';
import { AlertTriangle, Wrench, CarFront, Radio } from 'lucide-react';
import { toast } from 'sonner';
import { sendSOS, reportBreakdown, reportAccident, notifyControlRoom } from '@/services/alertService';

interface EmergencyActionsProps {
  busNumber: string;
  driverId: string;
  driverName: string;
  routeId?: string;
}

export function EmergencyActions({ busNumber, driverId, driverName, routeId }: EmergencyActionsProps) {
  const base = { busNumber, driverId, driverName, routeId };

  const handleSOS = async () => {
    try {
      await sendSOS(base);
      toast.error('Emergency SOS sent', { description: 'Control room has been notified.' });
    } catch {
      toast.error('Failed to send SOS');
    }
  };

  const handleBreakdown = async () => {
    try {
      await reportBreakdown(base);
      toast.warning('Breakdown reported', { description: 'Maintenance team notified.' });
    } catch {
      toast.error('Failed to report breakdown');
    }
  };

  const handleAccident = async () => {
    try {
      await reportAccident(base);
      toast.error('Accident reported', { description: 'Emergency services alerted.' });
    } catch {
      toast.error('Failed to report accident');
    }
  };

  const handleControlRoom = async () => {
    try {
      await notifyControlRoom({
        ...base,
        type: 'control_room',
        message: 'Driver requested control room assistance',
      });
      toast.info('Control room notified');
    } catch {
      toast.error('Failed to notify control room');
    }
  };

  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
      <p className="text-xs font-semibold text-destructive uppercase tracking-wide">Emergency & Reports</p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="destructive" size="sm" className="h-10" onClick={handleSOS}>
          <AlertTriangle className="w-4 h-4 mr-1" /> SOS
        </Button>
        <Button variant="outline" size="sm" className="h-10 border-warning text-warning" onClick={handleBreakdown}>
          <Wrench className="w-4 h-4 mr-1" /> Breakdown
        </Button>
        <Button variant="outline" size="sm" className="h-10" onClick={handleAccident}>
          <CarFront className="w-4 h-4 mr-1" /> Accident
        </Button>
        <Button variant="outline" size="sm" className="h-10" onClick={handleControlRoom}>
          <Radio className="w-4 h-4 mr-1" /> Control Room
        </Button>
      </div>
    </div>
  );
}
