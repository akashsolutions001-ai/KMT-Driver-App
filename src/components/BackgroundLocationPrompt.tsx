import { useState, useEffect, useCallback } from 'react';
import { MapPin, Settings, AlertTriangle, ExternalLink, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { openAppLocationSettings, getLocationPermissionLevel } from '@/utils/permissions';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

interface BackgroundLocationPromptProps {
    onDismiss?: () => void;
    onPermissionGranted?: () => void;
    forceShow?: boolean;
}

/**
 * Professional popup that shows when user grants "Only while using app" permission
 * but not "Allow all the time". Redirects to app settings like Uber, Swiggy, etc.
 */
export function BackgroundLocationPrompt({
    onDismiss,
    onPermissionGranted,
    forceShow = false
}: BackgroundLocationPromptProps) {
    const [isVisible, setIsVisible] = useState(false);
    const [isOpening, setIsOpening] = useState(false);

    const checkPermissionLevel = useCallback(async () => {
        if (!Capacitor.isNativePlatform()) {
            setIsVisible(false);
            return;
        }

        try {
            const level = await getLocationPermissionLevel();
            console.log('[BackgroundLocationPrompt] Permission level:', level);

            // Show prompt if user has foreground but not background (while_using)
            if (level.level === 'while_using' || forceShow) {
                setIsVisible(true);
            } else if (level.level === 'always') {
                setIsVisible(false);
                onPermissionGranted?.();
            }
        } catch (error) {
            console.error('[BackgroundLocationPrompt] Error checking permission:', error);
        }
    }, [forceShow, onPermissionGranted]);

    useEffect(() => {
        checkPermissionLevel();

        // Listen for app resume to re-check permissions
        let appResumeListener: any;

        if (Capacitor.isNativePlatform()) {
            App.addListener('appStateChange', ({ isActive }) => {
                if (isActive) {
                    console.log('[BackgroundLocationPrompt] App resumed, re-checking permissions');
                    checkPermissionLevel();
                }
            }).then(listener => {
                appResumeListener = listener;
            });
        }

        return () => {
            if (appResumeListener) {
                appResumeListener.remove();
            }
        };
    }, [checkPermissionLevel]);

    const handleOpenSettings = async () => {
        setIsOpening(true);
        try {
            await openAppLocationSettings();
            // Don't dismiss, wait for app resume to re-check
        } catch (error) {
            console.error('[BackgroundLocationPrompt] Error opening settings:', error);
        } finally {
            setIsOpening(false);
        }
    };

    const handleDismiss = () => {
        setIsVisible(false);
        onDismiss?.();
    };

    if (!isVisible) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-card border border-border rounded-2xl max-w-md w-full shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300">
                {/* Header */}
                <div className="relative p-6 pb-4">
                    <button
                        onClick={handleDismiss}
                        className="absolute top-4 right-4 p-2 rounded-full hover:bg-secondary/80 transition-colors"
                        aria-label="Close"
                    >
                        <X className="w-5 h-5 text-muted-foreground" />
                    </button>

                    <div className="flex flex-col items-center text-center space-y-3">
                        <div className="relative">
                            <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center">
                                <MapPin className="w-8 h-8 text-amber-500" />
                            </div>
                            <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center">
                                <AlertTriangle className="w-4 h-4 text-white" />
                            </div>
                        </div>

                        <h2 className="text-xl font-bold text-foreground">
                            Background Location Required
                        </h2>
                    </div>
                </div>

                {/* Content */}
                <div className="px-6 pb-4 space-y-4">
                    <p className="text-sm text-muted-foreground text-center leading-relaxed">
                        For continuous bus tracking, we need location access <strong className="text-foreground">"Allow all the time"</strong>.
                        This ensures passengers can see your real-time location even when the app is minimized.
                    </p>

                    {/* Steps Card */}
                    <div className="bg-secondary/50 rounded-xl p-4 space-y-3">
                        <div className="text-sm font-medium text-foreground flex items-center gap-2">
                            <Settings className="w-4 h-4 text-primary" />
                            Follow these steps:
                        </div>
                        <ol className="space-y-2 text-sm text-muted-foreground ml-6">
                            <li className="flex items-start gap-2">
                                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold">1</span>
                                <span>Tap <strong className="text-foreground">"Open Settings"</strong> below</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold">2</span>
                                <span>Tap <strong className="text-foreground">"Permissions"</strong></span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold">3</span>
                                <span>Tap <strong className="text-foreground">"Location"</strong></span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold">4</span>
                                <span>Select <strong className="text-foreground">"Allow all the time"</strong></span>
                            </li>
                        </ol>
                    </div>

                    {/* Why needed info */}
                    <div className="flex items-start gap-3 p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                        <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-blue-500 text-xs">i</span>
                        </div>
                        <p className="text-xs text-blue-400 leading-relaxed">
                            This is how professional apps like Uber, Swiggy, and Zomato work.
                            Location is only used while a trip is active.
                        </p>
                    </div>
                </div>

                {/* Actions */}
                <div className="p-6 pt-2 space-y-3">
                    <Button
                        onClick={handleOpenSettings}
                        disabled={isOpening}
                        className="w-full h-12 text-base font-semibold bg-primary hover:bg-primary/90"
                    >
                        {isOpening ? (
                            'Opening Settings...'
                        ) : (
                            <>
                                <ExternalLink className="w-5 h-5 mr-2" />
                                Open Settings
                            </>
                        )}
                    </Button>

                    <button
                        onClick={handleDismiss}
                        className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
                    >
                        I'll do this later
                    </button>
                </div>
            </div>
        </div>
    );
}

export default BackgroundLocationPrompt;
