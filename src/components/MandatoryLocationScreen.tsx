import { MapPin, Navigation, Settings, AlertTriangle, ExternalLink, RefreshCw, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MandatoryLocationStatus } from '@/utils/permissions';

interface MandatoryLocationScreenProps {
  status: MandatoryLocationStatus;
  isChecking: boolean;
  isRequesting: boolean;
  denialCount: number;
  onRequestPermission: () => Promise<void>;
  onOpenSettings: () => Promise<void>;
  onOpenGpsSettings: () => Promise<void>;
  onCheckAgain: () => Promise<any>;
}

export function MandatoryLocationScreen({
  status,
  isChecking,
  isRequesting,
  denialCount,
  onRequestPermission,
  onOpenSettings,
  onOpenGpsSettings,
  onCheckAgain,
}: MandatoryLocationScreenProps) {
  const isGpsDisabled = status.reason === 'gps_disabled';
  const isBackgroundMissing = status.reason === 'needs_background';
  const isForegroundMissing = status.reason === 'needs_foreground';

  // If user previously denied more than once in-app or Android won't show dialog, route directly to Settings
  const shouldOpenSettingsForForeground = isForegroundMissing && denialCount > 1;

  let title = 'Location Required';
  let description =
    'Location permission is required to use the KMT Driver App. Your location is required for continuous bus tracking.';

  if (isGpsDisabled) {
    title = 'Device Location Turned Off';
    description = 'Device location is turned off. Please enable Location in your device settings to continue.';
  } else if (isBackgroundMissing) {
    title = 'Background Location Required';
    description =
      'Background location is required for tracking when the phone is locked or the app is minimized. Passengers rely on your live bus location.';
  } else if (shouldOpenSettingsForForeground) {
    title = 'Location Permission Blocked';
    description =
      'Location permission was previously denied. Please open Android Settings to manually enable location permissions.';
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-between bg-slate-950 text-white p-6 overflow-y-auto">
      {/* Top Bar / Branding */}
      <div className="w-full flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#005BAC] flex items-center justify-center font-bold text-white text-sm">
            KMT
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-wide uppercase text-slate-300">Driver Command</h1>
            <p className="text-[11px] text-slate-500">Fleet Operations</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isChecking ? (
            <span className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Verifying
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-full border border-rose-500/20">
              <ShieldAlert className="w-3 h-3" />
              Access Blocked
            </span>
          )}
        </div>
      </div>

      {/* Main Focus Area */}
      <div className="my-auto py-6 max-w-md mx-auto w-full space-y-6">
        {/* Animated Radar Icon */}
        <div className="flex justify-center">
          <div className="relative">
            {/* Pulsing radar ripples */}
            <div className="absolute inset-0 rounded-full bg-[#005BAC]/20 animate-ping" />
            <div className="relative w-24 h-24 rounded-full bg-slate-900 border-2 border-slate-700 flex items-center justify-center shadow-2xl">
              {isGpsDisabled ? (
                <AlertTriangle className="w-12 h-12 text-rose-500 animate-bounce" />
              ) : isBackgroundMissing ? (
                <Navigation className="w-12 h-12 text-amber-400" />
              ) : (
                <MapPin className="w-12 h-12 text-[#005BAC]" />
              )}
            </div>
          </div>
        </div>

        {/* Title and Description */}
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold tracking-tight text-white">{title}</h2>
          <p className="text-sm text-slate-400 leading-relaxed max-w-sm mx-auto">{description}</p>
        </div>

        {/* Current Permission Status Summary Cards */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Required Permissions</p>

          <div className="space-y-2 text-xs">
            {/* Foreground Location Status */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/60">
              <span className="flex items-center gap-2 text-slate-300">
                <MapPin className="w-4 h-4 text-slate-400" />
                Precise Location (GPS)
              </span>
              {status.hasForeground ? (
                <span className="flex items-center gap-1 text-emerald-400 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Granted
                </span>
              ) : (
                <span className="flex items-center gap-1 text-rose-400 font-medium">
                  <AlertTriangle className="w-3.5 h-3.5" /> Missing
                </span>
              )}
            </div>

            {/* Background Location Status */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/60">
              <span className="flex items-center gap-2 text-slate-300">
                <Navigation className="w-4 h-4 text-slate-400" />
                "Allow all the time"
              </span>
              {status.hasBackground ? (
                <span className="flex items-center gap-1 text-emerald-400 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Granted
                </span>
              ) : (
                <span className="flex items-center gap-1 text-amber-400 font-medium">
                  <AlertTriangle className="w-3.5 h-3.5" /> Required
                </span>
              )}
            </div>

            {/* Device GPS Toggle Status */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/60">
              <span className="flex items-center gap-2 text-slate-300">
                <Settings className="w-4 h-4 text-slate-400" />
                Device Location Hardware
              </span>
              {status.isGpsEnabled ? (
                <span className="flex items-center gap-1 text-emerald-400 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Active
                </span>
              ) : (
                <span className="flex items-center gap-1 text-rose-400 font-medium">
                  <AlertTriangle className="w-3.5 h-3.5" /> Turned Off
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Step-by-Step Instructions Card (when Background Location or App Settings is required) */}
        {(isBackgroundMissing || shouldOpenSettingsForForeground) && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 space-y-3">
            <div className="text-xs font-semibold text-amber-400 flex items-center gap-1.5 uppercase tracking-wide">
              <Settings className="w-4 h-4" />
              Follow these steps to enable "Allow all the time":
            </div>
            <ol className="space-y-1.5 text-xs text-slate-300">
              <li className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center font-bold text-[10px]">
                  1
                </span>
                <span>Tap <strong className="text-white">Allow "All the time" in Settings</strong> below</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center font-bold text-[10px]">
                  2
                </span>
                <span>Select <strong className="text-white">Change in settings</strong> (or Permissions → Location)</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center font-bold text-[10px]">
                  3
                </span>
                <span>Select <strong className="text-amber-300">Allow all the time</strong></span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center font-bold text-[10px]">
                  4
                </span>
                <span>Return to this app — it will unlock automatically</span>
              </li>
            </ol>
            <p className="text-[11px] text-slate-400 pt-1 border-t border-amber-500/20">
              Passenger live tracking requires continuous background GPS.
            </p>
          </div>
        )}
      </div>

      {/* Bottom Actions Area */}
      <div className="w-full max-w-md mx-auto space-y-3 pt-4">
        {/* Primary Action Button */}
        {isGpsDisabled ? (
          <Button
            onClick={onOpenGpsSettings}
            disabled={isChecking || isRequesting}
            className="w-full h-13 text-base font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-900/30"
          >
            <ExternalLink className="w-5 h-5 mr-2" />
            Turn On Device Location
          </Button>
        ) : isBackgroundMissing || shouldOpenSettingsForForeground ? (
          <Button
            onClick={onRequestPermission}
            disabled={isChecking || isRequesting}
            className="w-full h-13 text-base font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-900/30"
          >
            {isRequesting ? (
              <>
                <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                Redirecting to Permission...
              </>
            ) : (
              <>
                <Navigation className="w-5 h-5 mr-2" />
                Allow "All the time" in Settings
              </>
            )}
          </Button>
        ) : (
          <Button
            onClick={onRequestPermission}
            disabled={isChecking || isRequesting}
            className="w-full h-13 text-base font-semibold bg-[#005BAC] hover:bg-[#004889] text-white shadow-lg shadow-blue-900/30"
          >
            {isRequesting ? (
              <>
                <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                Redirecting to Permission...
              </>
            ) : (
              <>
                <MapPin className="w-5 h-5 mr-2" />
                Allow Location Permission
              </>
            )}
          </Button>
        )}

        {/* Secondary Retry / Check Again Button */}
        <Button
          variant="outline"
          onClick={onCheckAgain}
          disabled={isChecking || isRequesting}
          className="w-full h-11 border-slate-700 text-slate-300 hover:bg-slate-900 hover:text-white"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isChecking ? 'animate-spin' : ''}`} />
          {isChecking ? 'Checking Status...' : 'Check Status Again'}
        </Button>

        <p className="text-[11px] text-center text-slate-500">
          Kolhapur Municipal Transport — Continuous GPS Telemetry Enforcement
        </p>
      </div>
    </div>
  );
}

export default MandatoryLocationScreen;
