import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Wrench, CarFront, Radio } from 'lucide-react';
import { toast } from 'sonner';
import { sendSOS, reportBreakdown, reportAccident, notifyControlRoom } from '@/services/alertService';
import { ActionConfirmDialog } from '@/components/ActionConfirmDialog';

interface EmergencyActionsProps {
  busNumber: string;
  driverId: string;
  driverName: string;
  routeId?: string;
}

type EmergencyActionType = 'sos' | 'breakdown' | 'accident' | 'control_room' | null;

export function EmergencyActions({ busNumber, driverId, driverName, routeId }: EmergencyActionsProps) {
  const base = { busNumber, driverId, driverName, routeId };
  const [activeAction, setActiveAction] = useState<EmergencyActionType>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const executeSOS = async () => {
    setIsSubmitting(true);
    try {
      await sendSOS(base);
      toast.error('Emergency SOS sent', { description: 'Control room has been notified.' });
    } catch {
      toast.error('Failed to send SOS');
    } finally {
      setIsSubmitting(false);
    }
  };

  const executeBreakdown = async () => {
    setIsSubmitting(true);
    try {
      await reportBreakdown(base);
      toast.warning('Breakdown reported', { description: 'Maintenance team notified.' });
    } catch {
      toast.error('Failed to report breakdown');
    } finally {
      setIsSubmitting(false);
    }
  };

  const executeAccident = async () => {
    setIsSubmitting(true);
    try {
      await reportAccident(base);
      toast.error('Accident reported', { description: 'Emergency services alerted.' });
    } catch {
      toast.error('Failed to report accident');
    } finally {
      setIsSubmitting(false);
    }
  };

  const executeControlRoom = async () => {
    setIsSubmitting(true);
    try {
      await notifyControlRoom({
        ...base,
        type: 'control_room',
        message: 'Driver requested control room assistance',
      });
      toast.info('Control room notified');
    } catch {
      toast.error('Failed to notify control room');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getDialogConfig = () => {
    switch (activeAction) {
      case 'sos':
        return {
          title: 'Send Emergency SOS?',
          description:
            'This will immediately send a high-priority emergency distress alarm to the control room and authorities.',
          highlightText: `⚠️ Bus ${busNumber} • Driver: ${driverName}`,
          highlightNote: 'Use only in genuine emergency situations.',
          confirmText: 'Yes, Send SOS Alert',
          variant: 'destructive' as const,
          icon: <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />,
          onConfirm: executeSOS,
        };
      case 'breakdown':
        return {
          title: 'Report Bus Breakdown?',
          description:
            'This will alert fleet maintenance and operations team to dispatch technical support.',
          highlightText: `🔧 Bus ${busNumber} • Driver: ${driverName}`,
          confirmText: 'Report Breakdown',
          variant: 'warning' as const,
          icon: <Wrench className="w-6 h-6 text-amber-600 dark:text-amber-400" />,
          onConfirm: executeBreakdown,
        };
      case 'accident':
        return {
          title: 'Report Vehicle Accident?',
          description:
            'This will notify emergency services and the central control room for rapid assistance.',
          highlightText: `🚨 Bus ${busNumber} • Driver: ${driverName}`,
          highlightNote: 'Emergency support teams will be dispatched immediately.',
          confirmText: 'Report Accident',
          variant: 'destructive' as const,
          icon: <CarFront className="w-6 h-6 text-red-600 dark:text-red-400" />,
          onConfirm: executeAccident,
        };
      case 'control_room':
        return {
          title: 'Contact Control Room?',
          description:
            'Send an urgent notification requesting the fleet control room operator to contact you.',
          highlightText: `📻 Bus ${busNumber} • Driver: ${driverName}`,
          confirmText: 'Notify Control Room',
          variant: 'primary' as const,
          icon: <Radio className="w-6 h-6 text-primary" />,
          onConfirm: executeControlRoom,
        };
      default:
        return null;
    }
  };

  const dialogConfig = getDialogConfig();

  return (
    <>
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
        <p className="text-xs font-semibold text-destructive uppercase tracking-wide">
          Emergency & Reports
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="destructive"
            size="sm"
            className="h-10"
            onClick={() => setActiveAction('sos')}
          >
            <AlertTriangle className="w-4 h-4 mr-1" /> SOS
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-10 border-warning text-warning hover:bg-warning/10"
            onClick={() => setActiveAction('breakdown')}
          >
            <Wrench className="w-4 h-4 mr-1" /> Breakdown
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-10 border-destructive/40 text-destructive hover:bg-destructive/10"
            onClick={() => setActiveAction('accident')}
          >
            <CarFront className="w-4 h-4 mr-1" /> Accident
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-10"
            onClick={() => setActiveAction('control_room')}
          >
            <Radio className="w-4 h-4 mr-1" /> Control Room
          </Button>
        </div>
      </div>

      {dialogConfig && (
        <ActionConfirmDialog
          open={activeAction !== null}
          onOpenChange={(open) => !open && setActiveAction(null)}
          title={dialogConfig.title}
          description={dialogConfig.description}
          highlightText={dialogConfig.highlightText}
          highlightNote={dialogConfig.highlightNote}
          confirmText={dialogConfig.confirmText}
          cancelText="Cancel"
          variant={dialogConfig.variant}
          icon={dialogConfig.icon}
          isLoading={isSubmitting}
          onConfirm={dialogConfig.onConfirm}
        />
      )}
    </>
  );
}

